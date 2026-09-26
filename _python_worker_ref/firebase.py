import json
import os
import re
import requests
from datetime import datetime
from pathlib import Path


# ============================================================
# CONFIG
# ============================================================

CONFIG_FILE = Path(__file__).with_name("worker_config.json")


def load_config():
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(
            f"Missing config file: {CONFIG_FILE}"
        )

    with CONFIG_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


CONFIG = load_config()

FIREBASE_DATABASES = CONFIG.get(
    "firebase_databases",
    []
)

POLL_INTERVAL_SECONDS = CONFIG.get(
    "poll_interval_seconds",
    10
)

AUTO_STOP_WHEN_EMPTY = CONFIG.get(
    "auto_stop_when_empty",
    False
)


if not FIREBASE_DATABASES:
    env_db = os.getenv("FIREBASE_DATABASE_URL", "").strip()
    if env_db:
        FIREBASE_DATABASES = [env_db]
    else:
        print("⚠️ Warning: No Firebase databases configured in worker_config.json or .env.")
        print("Please add your Firebase database URL in the Web UI or worker_config.json.")


print("=" * 60)
print("FIREBASE CONFIG LOADED")
print(
    f"Databases configured: "
    f"{len(FIREBASE_DATABASES)}"
)
print(
    f"Poll interval: "
    f"{POLL_INTERVAL_SECONDS}s"
)
print(
    f"Auto stop when empty: "
    f"{AUTO_STOP_WHEN_EMPTY}"
)
print("=" * 60)


# ============================================================
# BASIC FIREBASE REQUESTS
# ============================================================

def clean_url(url):
    return url.rstrip("/")


def firebase_request(
    base_url,
    method,
    path="",
    data=None,
):
    url = f"{clean_url(base_url)}/{path}.json"

    response = requests.request(
        method,
        url,
        json=data,
        timeout=15,
    )

    # Only log errors or important state writes (jobs, numbers, auth) to keep logs clean
    if response.status_code >= 400:
        print(f"[{method}] {url} -> HTTP {response.status_code}")
    elif method in ("PUT", "PATCH", "DELETE") and ("jobs" in path or "numbers" in path or "auth" in path):
        print(f"[{method}] {path} -> HTTP {response.status_code}")

    response.raise_for_status()

    if not response.content:
        return None

    return response.json()


def firebase_get(base_url, path=""):
    return firebase_request(
        base_url,
        "GET",
        path,
    )


def firebase_update(base_url, path, data):
    return firebase_request(
        base_url,
        "PATCH",
        path,
        data,
    )


def firebase_set(base_url, path, data):
    return firebase_request(
        base_url,
        "PUT",
        path,
        data,
    )


def firebase_delete(base_url, path):
    return firebase_request(
        base_url,
        "DELETE",
        path,
    )


# ============================================================
# QUEUE / JOBS
# ============================================================

# QUEUE / JOBS
# ============================================================

def _fetch_db_queued_jobs(database):
    try:
        url = f"{clean_url(database)}/automation/jobs.json"
        resp = requests.get(url, timeout=3)
        if not resp.content:
            return []
        jobs_dict = resp.json()
        if not isinstance(jobs_dict, dict):
            return []

        now_ts = datetime.utcnow().timestamp()
        found = []
        for job_id, job in jobs_dict.items():
            if not isinstance(job, dict):
                continue
            if job.get("status") != "queued":
                continue

            # Ignore stale jobs older than 180 seconds to avoid claiming dead abandoned jobs
            created_at_str = job.get("createdAt", "")
            created_ts = 0
            if created_at_str:
                try:
                    created_ts = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")).timestamp()
                except Exception:
                    pass
            if created_ts > 0 and (now_ts - created_ts) > 180:
                continue

            number = str(job.get("number", "")).strip()
            found.append({
                "source": database,
                "database": database,
                "jobId": str(job_id),
                "number": number,
                "job": job,
                "created_ts": created_ts,
            })
        return found
    except Exception:
        return []


def get_all_queued_jobs(preferred_db=None):
    all_dbs = get_firebase_databases()
    if not preferred_db and all_dbs:
        preferred_db = all_dbs[0]

    # 1. Check preferred DB (auth_db / primary DB) first for instant response (<200ms)
    if preferred_db:
        quick = _fetch_db_queued_jobs(preferred_db)
        if quick:
            quick.sort(key=lambda j: j.get("created_ts", 0), reverse=True)
            return quick

    # 2. Check remaining databases concurrently
    from concurrent.futures import ThreadPoolExecutor, as_completed

    combined = []
    max_workers = min(15, max(2, len(all_dbs)))
    dbs_to_check = [d for d in all_dbs if not preferred_db or d != preferred_db]

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_fetch_db_queued_jobs, database)
            for database in dbs_to_check
        ]
        for future in as_completed(futures):
            try:
                res = future.result()
                if res:
                    combined.extend(res)
            except Exception:
                pass

    # Sort newest first
    combined.sort(key=lambda j: j.get("created_ts", 0), reverse=True)
    return combined


def get_next_queued_job(preferred_db=None):

    jobs = get_all_queued_jobs(preferred_db)

    if not jobs:
        return None

    return jobs[0]


def update_job_status(
    job_info,
    status,
    error="",
):
    if not isinstance(job_info, dict):
        return None

    database = job_info.get("database")
    device_database = job_info.get("device_database")
    job_id = job_info.get("jobId") or job_info.get("id")

    if not job_id:
        return None

    data = {
        "status": status,
        "error": error,
        "updatedAt": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        ),
    }

    res = None
    if database:
        try:
            res = firebase_update(
                database,
                f"automation/jobs/{job_id}",
                data,
            )
        except Exception:
            pass

    if device_database and device_database != database:
        try:
            firebase_update(
                device_database,
                f"automation/jobs/{job_id}",
                data,
            )
        except Exception:
            pass

    return res



def update_worker_status(
    database,
    status,
    current_job="",
    last_error="",
    latest_bot_message="",
    phone="",
    device_id="",
    device_database="",
):

    data = {
        "status": status,
        "currentJob": current_job,
        "phone": str(phone or ""),
        "deviceId": str(device_id or ""),
        "database": str(device_database or database or ""),
        "lastError": last_error,
        "lastUpdate": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        ),
    }

    if latest_bot_message:
        data["latestBotMessage"] = str(latest_bot_message)[:300]

    return firebase_update(
        database,
        "automation/worker",
        data,
    )


# ============================================================
# DEVICE HELPERS
# ============================================================

def normalize_phone(value):
    """
    Convert a phone value to a 10-digit number.

    Supported examples:

        +919876543210 -> 9876543210
        919876543210  -> 9876543210
        09876543210   -> 9876543210
        9876543210    -> 9876543210
    """

    if value is None:
        return ""

    value = str(value).strip()

    digits = re.sub(
        r"\D",
        "",
        value,
    )

    if (
        digits.startswith("91")
        and len(digits) == 12
    ):
        digits = digits[2:]

    elif (
        digits.startswith("0")
        and len(digits) == 11
    ):
        digits = digits[1:]

    if len(digits) != 10:
        return ""

    if digits[0] not in "6789":
        return ""

    return digits


# Phone-number field names are checked in priority order.
# Nested objects are also searched, so a number can be found at paths such as:
#   info.phone
#   device.details.mobile
#   metadata.account.number
PHONE_FIELD_PRIORITY = [
    "phonenumber",
    "phone_number",
    "phone",
    "mobile",
    "mobile_number",
    "mobno",
    "mob_no",
    "number",
]


def _normalized_key(key):
    """Normalize a Firebase field name for comparison."""
    return re.sub(r"[^a-z0-9]", "", str(key or "").lower())


def _phone_from_value(value):
    """Return a validated 10-digit Indian mobile number, or empty string."""
    return normalize_phone(value)


def _deep_phone_candidates(value, path=""):
    """
    Recursively inspect dictionaries/lists and return:
        (priority, path, normalized_number)

    Lower priority number means a stronger/safer field-name match.
    """
    found = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            key_norm = _normalized_key(key)

            # Strong field-name matches first.
            if key_norm in PHONE_FIELD_PRIORITY:
                number = _phone_from_value(child)
                if number:
                    priority = PHONE_FIELD_PRIORITY.index(key_norm)
                    found.append((priority, child_path, number))

            # Continue into nested objects/lists.
            found.extend(_deep_phone_candidates(child, child_path))

    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f"{path}[{index}]"
            found.extend(_deep_phone_candidates(child, child_path))

    return found


def get_device_phone_details(device):
    """
    Deep-search a device record for a phone number.

    Returns:
        {
            "phone": "9876543210",
            "phone_source": "info.phone"
        }

    The search is field-name based; arbitrary numeric values are NOT
    interpreted as phone numbers. This prevents IDs/timestamps from
    being mistaken for device numbers.
    """
    if not isinstance(device, dict):
        return {
            "phone": "",
            "phone_source": "",
        }

    candidates = _deep_phone_candidates(device)

    if not candidates:
        return {
            "phone": "",
            "phone_source": "",
        }

    # Prefer the strongest field-name match. For equal priority,
    # keep the first occurrence encountered in Firebase order.
    candidates.sort(key=lambda item: item[0])
    _, path, number = candidates[0]

    return {
        "phone": number,
        "phone_source": path,
    }


def get_device_phone(device):
    """Backward-compatible helper returning only the normalized number."""
    return get_device_phone_details(device)["phone"]


def is_device_online(device):

    if not isinstance(device, dict):
        return False

    status = device.get("status")

    if status is True:
        return True

    if isinstance(status, str):

        value = status.strip().lower()

        if value in {
            "online",
            "connected",
            "true",
        }:
            return True

        if value in {
            "offline",
            "disconnected",
            "false",
        }:
            return False

    connection_status = device.get(
        "connectionStatus"
    )

    if isinstance(connection_status, str):

        value = (
            connection_status
            .strip()
            .lower()
        )

        if value in {
            "online",
            "connected",
        }:
            return True

    if device.get("isOnline") is True:
        return True

    if device.get("online") is True:
        return True

    return False


def extract_devices_from_database(
    database,
    root_data,
):

    devices = []

    if not isinstance(root_data, dict):
        return devices

    clients = root_data.get("clients")

    if not isinstance(clients, dict):
        return devices

    for device_id, device in clients.items():

        if not isinstance(device, dict):
            continue

        phone_details = get_device_phone_details(device)

        online = is_device_online(device)

        devices.append({
            "device_id": str(device_id),
            "database": database,
            "online": online,
            "phone": phone_details["phone"],
            "phone_source": phone_details["phone_source"],
            "raw": device,
        })

    return devices


def get_all_devices():

    combined = []

    print()
    print("=" * 60)
    print("POLLING ALL FIREBASE DATABASES FOR DEVICES")
    print("=" * 60)

    for index, database in enumerate(
        get_firebase_databases(),
        start=1,
    ):

        try:

            print()
            print(
                f"[firebase-{index}] "
                f"Reading devices..."
            )

            root_data = firebase_get(
                database
            )

            devices = (
                extract_devices_from_database(
                    database,
                    root_data,
                )
            )

            print(
                f"[firebase-{index}] "
                f"Devices found: "
                f"{len(devices)}"
            )

            combined.extend(devices)

        except Exception as e:

            print(
                f"[firebase-{index}] "
                f"ERROR: {e}"
            )

    return combined


def get_online_devices():

    devices = get_all_devices()

    online = [
        device
        for device in devices
        if device["online"]
    ]

    print()
    print(
        "Combined devices:",
        len(devices),
    )

    print(
        "Online devices:",
        len(online),
    )

    return online


def get_online_devices_with_numbers():

    online_devices = (
        get_online_devices()
    )

    available = [
        device
        for device in online_devices
        if device["phone"]
    ]

    print(
        "Online devices with numbers:",
        len(available),
    )

    return available


def get_next_available_device(
    used_device_ids=None,
):

    if used_device_ids is None:
        used_device_ids = set()

    devices = (
        get_online_devices_with_numbers()
    )

    for device in devices:

        device_id = device["device_id"]

        if device_id in used_device_ids:
            continue

        return device

    return None


# ============================================================
# CONFIG HELPERS
# ============================================================

def get_firebase_databases():
    global FIREBASE_DATABASES
    try:
        cfg = load_config()
        dbs = cfg.get("firebase_databases", [])
        if dbs:
            FIREBASE_DATABASES = list(dbs)
            return list(dbs)
    except Exception:
        pass
    env_db = os.getenv("FIREBASE_DATABASE_URL", "").strip()
    if env_db:
        FIREBASE_DATABASES = [env_db]
        return [env_db]
    return list(FIREBASE_DATABASES)


def get_poll_interval():
    return POLL_INTERVAL_SECONDS


def should_auto_stop_when_empty():
    return AUTO_STOP_WHEN_EMPTY
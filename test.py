#!/usr/bin/env python3
"""
OTP Session Exporter

Sends an OTP, verifies it, and exports the authenticated session
information to session.json.

This script only handles authentication/session export.
It does not call offer/coupon endpoints or perform repeated claims.
"""

import json
import secrets
from pathlib import Path

import requests

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text

    console = Console()
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    console = None


SMS_OTP_URL = "https://profile.swiggy.com/api/v3/app/sms_otp"
VERIFY_URL = "https://profile.swiggy.com/api/v3/app/login/verify"

DEVICE_ID = secrets.token_hex(8)

# Local-only identity rotation for testing/session labeling.
# This is deliberately NOT sent to Swiggy and does not alter the normal
# authentication/device fingerprint used by the API requests.
LOCAL_IDENTITY_COUNTER = 0


def new_local_identity():
    """Create a unique LOCAL test identity for traceability.

    These values are intentionally never sent to Swiggy. They exist only
    to distinguish test runs/accounts in the local exporter output.
    """
    global LOCAL_IDENTITY_COUNTER
    LOCAL_IDENTITY_COUNTER += 1

    android_id = secrets.token_hex(8)
    device_id = f"test-device-{LOCAL_IDENTITY_COUNTER:04d}-{secrets.token_hex(4)}"
    fingerprint = (
        f"test/{secrets.token_hex(6)};"
        f"android-{secrets.choice([9, 10, 11, 12, 13, 14, 15])};"
        f"{secrets.choice(['Pixel-Test', 'Galaxy-Test', 'OnePlus-Test', 'Mock-Android'])}"
    )

    return {
        "localIdentityId": f"local-{LOCAL_IDENTITY_COUNTER:04d}-{secrets.token_hex(4)}",
        "androidId": android_id,
        "deviceId": device_id,
        "fingerprint": fingerprint,
    }



LOGIN_HEADERS = {
    "Accept": "application/json; charset=utf-8",
    "app-version": "4.106.1",
    "category": "food",
    "deviceId": DEVICE_ID,
    "swuid": DEVICE_ID,
    "os-version": "9",
    "pl-version": "131",
    "User-Agent": "Swiggy-Android",
    "version-code": "1716",
    "x-channel": "swiggy",
}


class APIError(Exception):
    """Friendly API error carrying status information."""

    def __init__(self, message, status_code=None, status_message=None, details=None):
        super().__init__(message)
        self.status_code = status_code
        self.status_message = status_message
        self.details = details


def checked(response):
    try:
        data = response.json()
    except ValueError:
        data = None

    if response.status_code >= 400:
        status_message = None
        if isinstance(data, dict):
            status_message = (
                data.get("statusMessage")
                or data.get("message")
                or data.get("error")
            )

        message = status_message or (
            f"HTTP {response.status_code}: {response.reason}"
        )

        raise APIError(
            message,
            status_code=response.status_code,
            status_message=status_message,
            details=data,
        )

    if data is None:
        raise APIError(
            f"Server returned an invalid response (HTTP {response.status_code}).",
            status_code=response.status_code,
        )

    status_code = data.get("statusCode")
    status_message = data.get("statusMessage") or data.get("message")

    if status_code not in (None, 0):
        raise APIError(
            status_message or f"API returned statusCode {status_code}.",
            status_code=status_code,
            status_message=status_message,
            details=data,
        )

    if data.get("status") in ("FAILURE", "FAILED", "ERROR"):
        raise APIError(
            status_message or "The API reported an error.",
            status_code=status_code,
            status_message=status_message,
            details=data,
        )

    return data



def send_otp(mobile10):
    response = requests.get(
        f"{SMS_OTP_URL}?mobile={mobile10}",
        headers=LOGIN_HEADERS,
        timeout=30,
    )
    return checked(response)


def verify_otp(mobile10, otp, tid, sid):
    # This matches the authentication request structure used by the
    # original uploaded script.
    headers = {
        **LOGIN_HEADERS,
        "sid": sid,
        "Tid": tid,
        "Content-Type": "application/json; charset=utf-8",
    }

    payload = {
        "cloningSignalsData": {
            "appFilesDirPathInvalid": 0,
            "developerModeEnabled": 1,
            "deviceModelVmos": 0,
            "emulatorStatus": 0,
            "packageName": "in.swiggy.android",
            "workProfileEnabled": 0,
        },
        "otp": otp,
    }

    response = requests.post(
        f"{VERIFY_URL}?otp_source=Sms-automatic",
        headers=headers,
        json=payload,
        timeout=30,
    )

    return checked(response)


def jwt_payload(token):
    """Decode the payload portion of a JWT without verifying its signature."""
    import base64

    parts = token.split(".")
    if len(parts) != 3:
        return {}

    raw = parts[1]
    raw += "=" * (-len(raw) % 4)

    try:
        return json.loads(base64.urlsafe_b64decode(raw).decode("utf-8"))
    except Exception:
        return {}


def build_session(response_data):
    """
    Extract tid, sid, token and customer/user ID from the verification
    response. The response structure can vary, so common locations are
    checked.
    """
    data = response_data.get("data", response_data)

    if not isinstance(data, dict):
        raise RuntimeError("Unexpected verification response format.")

    tid = data.get("tid") or response_data.get("tid") or ""
    sid = data.get("sid") or response_data.get("sid") or ""

    token = (
        data.get("token")
        or data.get("accessToken")
        or data.get("refreshToken")
        or response_data.get("token")
        or response_data.get("accessToken")
        or ""
    )

    customer_id = (
        data.get("customerId")
        or data.get("customerID")
        or data.get("userid")
        or data.get("userId")
        or ""
    )

    if not customer_id and tid:
        claims = jwt_payload(tid)
        customer_id = (
            claims.get("userid")
            or claims.get("userId")
            or claims.get("customerId")
            or claims.get("customer_id")
            or ""
        )

    return {
        "token": token,
        "sid": sid,
        "tid": tid,
        "userid": str(customer_id),
    }


def extract_device_id(response_data):
    """Use a deviceId returned by the API when available."""
    data = response_data.get("data", response_data)

    if isinstance(data, dict):
        value = data.get("deviceId")
        if value:
            return str(value)

    value = response_data.get("deviceId")
    if value:
        return str(value)

    return DEVICE_ID


def load_sessions():
    """Load the shared sessions.json array."""
    output = Path("sessions.json")

    if not output.exists():
        return []

    try:
        data = json.loads(output.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"{output} contains invalid JSON: {exc}"
        ) from exc

    if not isinstance(data, list):
        raise RuntimeError(
            f"{output} must contain a JSON array."
        )

    return data


def atomic_save_sessions(sessions):
    """Write sessions safely through a temporary file."""
    output = Path("sessions.json")
    temp = output.with_suffix(".json.tmp")

    temp.write_text(
        json.dumps(sessions, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    temp.replace(output)

    try:
        output.chmod(0o600)
    except OSError:
        pass

    return output


def make_session_id(existing):
    """Create a unique local ID for the saved record."""
    import uuid

    used = {
        str(item.get("sessionId"))
        for item in existing
        if isinstance(item, dict)
    }

    while True:
        value = uuid.uuid4().hex
        if value not in used:
            return value


def add_session(session, mobile10, response_data, local_identity=None):
    """Add a new account without duplicating an existing mobile number."""
    sessions = load_sessions()

    normalized_mobile = mobile10.strip()

    for item in sessions:
        if (
            isinstance(item, dict)
            and str(item.get("mobile", "")).strip() == normalized_mobile
        ):
            return False, item, sessions, Path("sessions.json")

    exported = {
        "sessionId": make_session_id(sessions),
        "mobile": normalized_mobile,
        "token": session.get("token", ""),
        "sid": session.get("sid", ""),
        "tid": session.get("tid", ""),
        "deviceId": extract_device_id(response_data),
        "customerId": session.get("userid", ""),
        # Local-only test metadata; never sent to the authentication API.
        "testIdentity": local_identity or {},
    }

    sessions.append(exported)
    output = atomic_save_sessions(sessions)

    return True, exported, sessions, output


def show_header():
    title = "OTP SESSION EXPORTER"
    subtitle = "Authentication & session export"
    if RICH_AVAILABLE:
        console.print(
            Panel.fit(
                f"[bold cyan]{title}[/bold cyan]\n[dim]{subtitle}[/dim]",
                border_style="cyan",
            )
        )
    else:
        print("=" * 60)
        print(title)
        print(subtitle)
        print("=" * 60)


def info(message):
    if RICH_AVAILABLE:
        console.print(f"[cyan]INFO[/cyan] {message}")
    else:
        print(f"[INFO] {message}")


def success(message):
    if RICH_AVAILABLE:
        console.print(f"[bold green]SUCCESS[/bold green] {message}")
    else:
        print(f"[SUCCESS] {message}")


def warning(message):
    if RICH_AVAILABLE:
        console.print(f"[bold yellow]WARNING[/bold yellow] {message}")
    else:
        print(f"[WARNING] {message}")


def show_api_error(exc):
    if RICH_AVAILABLE:
        console.print()
        body = exc.status_message or str(exc)
        if exc.details and not exc.status_message:
            body += "\n\nServer response:\n" + json.dumps(
                exc.details, indent=2, ensure_ascii=False
            )

        console.print(
            Panel(
                Text(body, style="bold red"),
                title=f"[bold red]Request Failed"
                       + (f" • HTTP {exc.status_code}" if exc.status_code else "")
                       + "[/bold red]",
                border_style="red",
                padding=(1, 2),
            )
        )

        if exc.status_code == 999:
            console.print(
                "[yellow]Account status:[/yellow] "
                "The server says this account is suspended."
            )
            console.print(
                "[dim]Use Swiggy's official support channel to resolve the "
                "account status. The exporter cannot override this response.[/dim]"
            )
    else:
        print()
        print("!" * 60)
        print("REQUEST FAILED")
        if exc.status_code:
            print(f"Status code: {exc.status_code}")
        print(f"Message: {exc.status_message or exc}")
        if exc.status_code == 999:
            print(
                "Account status: The server says this account is suspended."
            )
            print(
                "Use Swiggy's official support channel to resolve the account status."
            )
        print("!" * 60)


def show_connection_error(exc):
    if RICH_AVAILABLE:
        console.print(
            Panel(
                f"[bold red]Could not reach the server.[/bold red]\n\n"
                f"{exc}\n\n"
                "[dim]Check your internet connection and try again.[/dim]",
                title="[bold red]Connection Error[/bold red]",
                border_style="red",
            )
        )
    else:
        print(f"\n[CONNECTION ERROR] {exc}")
        print("Check your internet connection and try again.")



def mask_value(value, visible=4):
    value = str(value or "")
    if not value:
        return "-"
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]


def list_accounts():
    try:
        sessions = load_sessions()
    except RuntimeError as exc:
        warning(str(exc))
        return

    if not sessions:
        info("No saved accounts yet.")
        return

    if RICH_AVAILABLE:
        table = Table(title=f"Saved Accounts ({len(sessions)})")
        table.add_column("#", style="cyan")
        table.add_column("Mobile")
        table.add_column("Customer ID")
        table.add_column("Session ID")
        table.add_column("Device ID")

        for index, item in enumerate(sessions, 1):
            table.add_row(
                str(index),
                str(item.get("mobile", "-")),
                str(item.get("customerId", "-")),
                mask_value(item.get("sessionId"), 6),
                mask_value(item.get("deviceId"), 6),
            )

        console.print(table)
    else:
        print()
        print(f"Saved accounts: {len(sessions)}")
        for index, item in enumerate(sessions, 1):
            print(
                f"{index}. "
                f"{item.get('mobile', '-')}"
                f" | Customer: {item.get('customerId', '-')}"
                f" | Session: {mask_value(item.get('sessionId'), 6)}"
            )


def login_account_once():
    # Rotate a local-only identity for each new mobile-number attempt.
    # It is displayed for traceability but is never inserted into Swiggy
    # authentication headers or request payloads.
    local_identity = new_local_identity()
    info(
        "Local test identity: "
        f"{local_identity['localIdentityId']} • "
        f"fingerprint={mask_value(local_identity['fingerprint'], 10)}"
    )
    """
    Run exactly one login attempt.

    Returns:
        True  -> account was saved successfully.
        False -> the attempt failed/cancelled; caller should prompt for
                 another mobile number.
    """
    while True:
        mobile = input("Mobile number (10 digits, or Q to quit): ").strip()

        if mobile.lower() == "q":
            return None

        if not mobile.isdigit() or len(mobile) != 10:
            warning("Please enter exactly 10 digits.")
            continue

        try:
            existing = load_sessions()
        except RuntimeError as exc:
            warning(str(exc))
            return False

        if any(
            isinstance(item, dict)
            and str(item.get("mobile", "")).strip() == mobile
            for item in existing
        ):
            warning("This mobile number is already saved.")
            info("Enter a different mobile number.")
            continue

        # OTP request.
        try:
            info(f"Sending OTP to {mobile[:2]}******{mobile[-2:]}...")
            otp_response = send_otp(mobile)
            success("OTP request accepted.")
        except APIError as exc:
            show_api_error(exc)
            warning("OTP request failed. Please enter another mobile number.")
            return False
        except requests.RequestException as exc:
            show_connection_error(exc)
            warning("OTP request failed. Please enter another mobile number.")
            return False

        data = otp_response.get("data", {})
        if not isinstance(data, dict):
            data = {}

        tid = data.get("tid") or otp_response.get("tid") or ""
        sid = data.get("sid") or otp_response.get("sid") or ""

        if not tid or not sid:
            warning("OTP response did not contain the required session IDs.")
            warning("Please enter another mobile number.")
            return False

        # OTP input.
        otp = input("Enter OTP (or Q to try another number): ").strip()

        if otp.lower() == "q":
            return False

        if not otp:
            warning("OTP cannot be empty.")
            warning("Please enter another mobile number.")
            return False

        # OTP verification.
        try:
            info("Verifying OTP...")
            verify_response = verify_otp(mobile, otp, tid, sid)
            success("OTP verified.")
        except APIError as exc:
            show_api_error(exc)
            warning("Login failed. Please enter another mobile number.")
            return False
        except requests.RequestException as exc:
            show_connection_error(exc)
            warning("Login failed. Please enter another mobile number.")
            return False

        try:
            session = build_session(verify_response)
        except Exception as exc:
            warning(f"Could not parse the login response: {exc}")
            warning("Please enter another mobile number.")
            return False

        if not session["token"]:
            warning("Login response did not contain an authentication token.")
            warning("Please enter another mobile number.")
            return False

        try:
            added, saved, sessions, output = add_session(
                session,
                mobile,
                verify_response,
                local_identity,
            )
        except RuntimeError as exc:
            warning(str(exc))
            warning("Please enter another mobile number.")
            return False

        if not added:
            warning("This account was already saved.")
            warning("Please enter another mobile number.")
            return False

        if RICH_AVAILABLE:
            table = Table(title="Account Added")
            table.add_column("Field", style="cyan")
            table.add_column("Value")
            table.add_row("Mobile", saved["mobile"])
            table.add_row("Customer ID", saved["customerId"] or "-")
            table.add_row("Local Session ID", saved["sessionId"])
            table.add_row("Device ID", saved["deviceId"])
            table.add_row(
                "Test Fingerprint",
                mask_value(saved.get("testIdentity", {}).get("fingerprint"), 10),
            )
            table.add_row("Authentication", "Token / TID / SID saved")
            console.print(table)
            success(
                f"Saved to {output.resolve()} • "
                f"{len(sessions)} account(s) stored"
            )
        else:
            success(f"Account added. {len(sessions)} account(s) stored.")
            print(f"Session ID: {saved['sessionId']}")
            print(f"File: {output.resolve()}")

        return True


def continuous_login():
    """
    Keep asking for accounts until the user quits.

    Successful and failed attempts both return to the mobile-number prompt.
    There is intentionally no numbered menu.
    """
    try:
        sessions = load_sessions()
    except RuntimeError as exc:
        warning(str(exc))
        sessions = []

    if RICH_AVAILABLE:
        console.print(
            Panel(
                "[bold cyan]Continuous login mode[/bold cyan]\n"
                "Enter a mobile number, complete OTP verification, and the "
                "session will be saved automatically.\n\n"
                "[dim]After success or failure, the script asks for the next "
                "mobile number. Enter Q at the mobile prompt to exit.[/dim]",
                title="[bold cyan]READY[/bold cyan]",
                border_style="cyan",
                padding=(1, 2),
            )
        )
        if sessions:
            info(f"{len(sessions)} account(s) already saved in sessions.json.")
    else:
        print("\nContinuous login mode")
        print("Mobile -> OTP -> save -> next mobile.")
        print("Enter Q at the mobile prompt to exit.")
        if sessions:
            print(f"{len(sessions)} account(s) already saved in sessions.json.")

    while True:
        result = login_account_once()

        if result is None:
            info("Goodbye.")
            return

        if result:
            success("Ready for the next mobile number.")
        else:
            info("Ready for the next mobile number.")

def main():
    show_header()

    if RICH_AVAILABLE:
        console.print(
            "[dim]A normal device identity is used for this session. "
            "The script does not spoof or rotate device fingerprints.[/dim]"
        )
    else:
        print(
            "A normal device identity is used for this session. "
            "Device fingerprints are not spoofed or rotated."
        )

    continuous_login()

if __name__ == "__main__":
    main()

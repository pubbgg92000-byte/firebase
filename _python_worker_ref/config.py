import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# WORKER CONFIG FILE (runtime credentials from UI or manual)
# ============================================================

WORKER_CONFIG_FILE = Path(__file__).with_name("worker_config.json")


def load_config_data():
    """Read the latest worker_config.json contents from disk."""
    if WORKER_CONFIG_FILE.exists():
        try:
            with WORKER_CONFIG_FILE.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def get_telegram_config():
    """
    Return Telegram configuration dictionary.
    Priority: worker_config.json ['telegram'] > .env > defaults.
    """
    cfg = load_config_data()
    tg = cfg.get("telegram", {}) if isinstance(cfg, dict) else {}

    raw_api_id = tg.get("api_id")
    if not raw_api_id:
        raw_api_id = os.getenv("TELEGRAM_API_ID", "0")
    try:
        api_id = int(str(raw_api_id).strip() or "0")
    except (ValueError, TypeError):
        api_id = 0

    api_hash = str(tg.get("api_hash") or os.getenv("TELEGRAM_API_HASH", "")).strip()
    bot_username = str(tg.get("bot_username") or os.getenv("BOT_USERNAME", "")).strip()
    if bot_username and not bot_username.startswith("@"):
        bot_username = f"@{bot_username}"

    phone = str(tg.get("phone") or os.getenv("TELEGRAM_PHONE", "")).strip()

    try:
        otp_timeout = int(tg.get("otp_timeout") or os.getenv("OTP_TIMEOUT_SECONDS", "60"))
    except (ValueError, TypeError):
        otp_timeout = 60

    keyword = str(
        tg.get("response_keyword") or os.getenv("RESPONSE_KEYWORD", "swiggy")
    ).strip().lower()

    return {
        "api_id": api_id,
        "api_hash": api_hash,
        "bot_username": bot_username,
        "phone": phone,
        "otp_timeout": otp_timeout,
        "response_keyword": keyword,
    }


def validate_telegram_config():
    """Verify that credentials required to connect are present."""
    cfg = get_telegram_config()
    if not cfg["api_id"]:
        raise RuntimeError(
            "TELEGRAM_API_ID is missing. Set it in UI Configuration or worker_config.json"
        )
    if not cfg["api_hash"]:
        raise RuntimeError(
            "TELEGRAM_API_HASH is missing. Set it in UI Configuration or worker_config.json"
        )
    if not cfg["bot_username"]:
        raise RuntimeError(
            "BOT_USERNAME is missing. Set it in UI Configuration or worker_config.json"
        )
    return cfg


# Module-level exports for backwards compatibility
_initial = get_telegram_config()
TELEGRAM_API_ID = _initial["api_id"]
TELEGRAM_API_HASH = _initial["api_hash"]
BOT_USERNAME = _initial["bot_username"]
TELEGRAM_PHONE = _initial["phone"]
OTP_TIMEOUT_SECONDS = _initial["otp_timeout"]
RESPONSE_KEYWORD = _initial["response_keyword"]

FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")
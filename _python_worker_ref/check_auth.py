from worker import _get_auth_db, get_firebase_databases, firebase_get
from config import TELEGRAM_PHONE, TELEGRAM_API_ID, TELEGRAM_API_HASH, get_telegram_config

print("TELEGRAM_API_ID:", repr(TELEGRAM_API_ID))
print("TELEGRAM_API_HASH:", repr(TELEGRAM_API_HASH))
print("TELEGRAM_PHONE:", repr(TELEGRAM_PHONE))
print("Telegram Config:", get_telegram_config())

dbs = get_firebase_databases()
print(f"Total databases: {len(dbs)}")
auth_db = _get_auth_db()
print("Auth DB:", auth_db)

if auth_db:
    try:
        data = firebase_get(auth_db, "automation/auth")
        print("automation/auth on Auth DB:", data)
    except Exception as e:
        print("Error fetching automation/auth:", e)

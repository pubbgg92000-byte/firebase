import os
import sys

try:
    import telethon  # noqa: F401
except ImportError:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidate_venvs = [
        os.path.join(script_dir, "..", ".venv"),
        os.path.join(script_dir, ".venv"),
    ]
    for candidate in candidate_venvs:
        py_bin = (
            os.path.join(candidate, "Scripts", "python.exe")
            if sys.platform == "win32"
            else os.path.join(candidate, "bin", "python")
        )
        if os.path.isfile(py_bin) and os.path.abspath(py_bin) != os.path.abspath(sys.executable):
            os.execv(py_bin, [py_bin] + sys.argv)
    raise

from telethon import TelegramClient

API_ID = 36120949
API_HASH = "9f430c68e4cb8d3d25a19ed4edee9b9f"

client = TelegramClient("my_telegram_session", API_ID, API_HASH)

async def main():
    me = await client.get_me()

    print("\nLogged in successfully!")
    print("Name:", me.first_name)
    print("Username:", me.username)
    print("User ID:", me.id)

with client:
    client.loop.run_until_complete(main())

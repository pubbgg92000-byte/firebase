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

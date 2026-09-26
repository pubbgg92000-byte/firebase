import asyncio
from telethon import TelegramClient, events

from config import (
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
    BOT_USERNAME,
)


client = TelegramClient(
    "my_telegram_session",
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
)


login_button_seen = False


@client.on(events.NewMessage(chats=BOT_USERNAME))
async def message_handler(event):

    global login_button_seen

    text = event.raw_text or ""

    print()
    print("=" * 60)
    print("BOT MESSAGE")
    print("=" * 60)
    print(text)

    if not event.message.buttons:
        return

    print()
    print("BUTTONS:")

    for row_index, row in enumerate(
        event.message.buttons
    ):

        for button_index, button in enumerate(row):

            print(
                f"[{row_index},{button_index}] "
                f"{button.text}"
            )

            if (
                button.text
                and "login via otp"
                in button.text.lower()
            ):

                login_button_seen = True

                print(
                    "LOGIN VIA OTP BUTTON DETECTED"
                )


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
            None
        ) or getattr(
            me,
            "first_name",
            "unknown"
        )
    )

    print(
        "Listening to:",
        BOT_USERNAME
    )

    print()
    print(
        "Send /start to your clone bot manually."
    )

    await client.run_until_disconnected()


if __name__ == "__main__":

    asyncio.run(main())
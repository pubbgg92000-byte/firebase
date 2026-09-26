from firebase import (
    get_online_devices_with_numbers,
)


print()
print("=" * 60)
print("DEVICE SELECTION TEST")
print("=" * 60)

devices = get_online_devices_with_numbers()

print()

if not devices:

    print(
        "No online devices with numbers found."
    )

else:

    for index, device in enumerate(
        devices,
        start=1,
    ):

        print(
            f"{index}. "
            f"device={device['device_id']} "
            f"number={device['phone']} "
            f"database={device['database']}"
        )

print()
print("=" * 60)
print(
    f"TOTAL AVAILABLE: {len(devices)}"
)
print("=" * 60)
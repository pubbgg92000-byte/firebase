from firebase import firebase_get, firebase_set

print("Reading existing Firebase path...")

data = firebase_get("037d2bb1fb40f0ad")

print("Read successful.")
print(data)

print("\nTesting automation path...")

firebase_set(
    "automation/worker",
    {
        "status": "connected",
        "test": True
    }
)

worker = firebase_get("automation/worker")

print("Automation path:")
print(worker)

print("\nFirebase test completed.")
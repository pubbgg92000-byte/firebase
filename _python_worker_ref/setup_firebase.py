from firebase import firebase_set, firebase_get


print("Creating automation structure...")


firebase_set(
    "automation/worker",
    {
        "status": "idle",
        "currentJob": "",
        "lastError": "",
        "lastUpdate": ""
    }
)


firebase_set(
    "automation/jobs",
    {}
)


print()
print("Firebase automation structure created.")
print()


worker = firebase_get(
    "automation/worker"
)

jobs = firebase_get(
    "automation/jobs"
)


print("WORKER:")
print(worker)

print()
print("JOBS:")
print(jobs)
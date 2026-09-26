from firebase import firebase_set, firebase_get


jobs = {
    "job-001": {
        "number": "9000000001",
        "status": "queued"
    },
    "job-002": {
        "number": "9000000002",
        "status": "queued"
    },
    "job-003": {
        "number": "9000000003",
        "status": "queued"
    }
}


print("Adding jobs...")


for job_id, job in jobs.items():

    firebase_set(
        f"automation/jobs/{job_id}",
        job
    )

    print(
        f"Added {job_id}: {job['number']}"
    )


print()
print("Current queue:")

current = firebase_get(
    "automation/jobs"
)

print(current)
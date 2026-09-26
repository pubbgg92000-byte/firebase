import requests
from datetime import datetime


import json
import os
from pathlib import Path

CONFIG_FILE = Path(__file__).with_name("worker_config.json")


def load_databases():
    if CONFIG_FILE.exists():
        try:
            with CONFIG_FILE.open("r", encoding="utf-8") as f:
                data = json.load(f)
                dbs = data.get("firebase_databases", [])
                if dbs:
                    return [d for d in dbs if d]
        except Exception:
            pass
    env_db = os.getenv("FIREBASE_DATABASE_URL", "").strip()
    return [env_db] if env_db else []


FIREBASE_DATABASES = load_databases()


# ============================================================
# COMMON HELPERS
# ============================================================

def clean_url(url):
    return url.rstrip("/")


def firebase_request(base_url, method, path="", data=None):
    base_url = clean_url(base_url)

    url = f"{base_url}/{path}.json"

    response = requests.request(
        method,
        url,
        json=data,
        timeout=15
    )

    print(f"{method} URL:", url)
    print("HTTP:", response.status_code)

    response.raise_for_status()

    if not response.content:
        return None

    return response.json()


# ============================================================
# SINGLE FIREBASE OPERATIONS
# ============================================================

def firebase_get(base_url, path=""):
    return firebase_request(
        base_url,
        "GET",
        path
    )


def firebase_set(base_url, path, data):
    return firebase_request(
        base_url,
        "PUT",
        path,
        data
    )


def firebase_update(base_url, path, data):
    return firebase_request(
        base_url,
        "PATCH",
        path,
        data
    )


def firebase_delete(base_url, path):
    return firebase_request(
        base_url,
        "DELETE",
        path
    )


# ============================================================
# COMBINED QUEUE
# ============================================================

def get_all_queued_jobs():
    """
    Read automation/jobs from every configured Firebase
    and combine all queued jobs into one list.
    """

    combined = []

    for index, database in enumerate(FIREBASE_DATABASES, start=1):

        source_name = f"firebase-{index}"

        try:
            jobs = firebase_get(
                database,
                "automation/jobs"
            )

            if not jobs:
                print(f"[{source_name}] No jobs")
                continue

            for job_id, job in jobs.items():

                if not isinstance(job, dict):
                    continue

                if job.get("status") != "queued":
                    continue

                combined.append({
                    "source": source_name,
                    "database": database,
                    "jobId": job_id,
                    "job": job
                })

            print(
                f"[{source_name}] "
                f"Queued jobs found: "
                f"{sum(1 for x in combined if x['source'] == source_name)}"
            )

        except Exception as e:

            print(
                f"[{source_name}] Firebase error:",
                e
            )

    return combined


# ============================================================
# GET FIRST QUEUED JOB
# ============================================================

def get_next_queued_job():

    jobs = get_all_queued_jobs()

    if not jobs:
        return None

    return jobs[0]


# ============================================================
# JOB STATUS UPDATE
# ============================================================

def update_job_status(
    job_info,
    status,
    error=""
):

    database = job_info["database"]
    job_id = job_info["jobId"]

    data = {
        "status": status,
        "error": error,
        "updatedAt": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    }

    return firebase_update(
        database,
        f"automation/jobs/{job_id}",
        data
    )


# ============================================================
# WORKER STATUS
# ============================================================

def update_worker_status(
    database,
    status,
    current_job="",
    last_error=""
):

    data = {
        "status": status,
        "currentJob": current_job,
        "lastError": last_error,
        "lastUpdate": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    }

    return firebase_update(
        database,
        "automation/worker",
        data
    )
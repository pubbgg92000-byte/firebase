import json
from firebase import get_firebase_databases, firebase_get

dbs = get_firebase_databases()
print(f"Total databases: {len(dbs)}")
for i, db in enumerate(dbs):
    try:
        data = firebase_get(db, "automation/auth")
        if data:
            print(f"[{i}] {db} -> automation/auth: {data}")
    except Exception as e:
        pass

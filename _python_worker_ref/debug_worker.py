import sys
import os

print("Step 1: start", flush=True)
try:
    import worker
    print("Step 2: imported worker successfully", flush=True)
except Exception as e:
    print(f"Import error: {e}", flush=True)
    import traceback
    traceback.print_exc()

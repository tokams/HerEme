"""Build operator-readable projections from committed SQLite transactions."""
import socketserver
import json
import re
import sqlite3
import time
from pathlib import Path



ROOT = Path("/views")
COMMUNITY = {
    "users": "id name created_at",
    "posts": "id author_id status type created_at",
    "comments": "id post_id parent_id author_id created_at",
    "votes": "post_id user_id value",
    "security_events": "event_id timestamp_utc event_type instance_id hostname source user_id username subject_user_id subject_username client_ip browser_family browser_version os_family os_version device_type device_model http_method status_code route_class request_id operation_id auth_method reason_code parser_version request_url request_path referrer_url",
    "security_event_raw": "event_id captured_at_utc schema_version raw_metadata_json",
}
PLATFORM = {"operators": "name", "audit": "id time actor action site detail"}
sources = {}
outputs = {}


def inventory():
    sites = json.loads(Path("/config/sites.json").read_text())
    ids = [s["id"] for s in sites]
    if len(set(["platform", *ids])) != len(ids) + 1 or any(
        not re.fullmatch(r"[a-z][a-z0-9_-]*", name) for name in ids
    ):
        raise ValueError("Invalid explorer database IDs")
    return {"platform": "registry.sqlite", **dict.fromkeys(ids, "hereme.sqlite")}


def refresh(name, filename):
    if name not in sources:
        connection = sqlite3.connect(f"file:/sources/{name}/{filename}?mode=ro", uri=True,
                                     check_same_thread=False)
        sources[name] = (connection, None)
    src, previous = sources[name]
    version = src.execute("PRAGMA data_version").fetchone()[0]
    if version == previous:
        return
    tables = PLATFORM if name == "platform" else COMMUNITY
    if name not in outputs:
        # Keep WAL and shared-memory files available to read-only Datasette connections.
        outputs[name] = sqlite3.connect(ROOT / f"{name}.db", check_same_thread=False)
    dest = outputs[name]
    try:
        dest.execute("PRAGMA journal_mode=WAL")
        dest.execute("BEGIN")
        deadline = time.monotonic() + 5
        src.set_progress_handler(lambda: time.monotonic() >= deadline, 1000)
        dest.set_progress_handler(lambda: time.monotonic() >= deadline, 1000)
        src.execute("BEGIN")
        for (old_table,) in dest.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            # Rebuilding also applies column and table removals from the access policy.
            dest.execute('DROP TABLE "' + old_table.replace('"', '""') + '"')
        for table, columns in tables.items():
            fields = columns.split()
            schema = {r[1]: r for r in src.execute(f'PRAGMA table_info("{table}")')}
            definitions = ", ".join(f'"{c}" {schema[c][2]}' for c in fields)
            keys = sorted((r[5], r[1]) for r in schema.values() if r[5])
            if keys and all(c in fields for _, c in keys):
                definitions += ", PRIMARY KEY (" + ", ".join(c for _, c in keys) + ")"
            dest.execute(f'CREATE TABLE "{table}" ({definitions})')
            rows = src.execute(f'SELECT {", ".join(fields)} FROM "{table}"')
            params = ", ".join("?" for _ in fields)
            dest.executemany(f'INSERT INTO "{table}" VALUES ({params})', rows)
        dest.commit()
        sources[name] = (src, version)
    finally:
        src.set_progress_handler(None, 0)
        dest.set_progress_handler(None, 0)
        src.rollback()
        dest.rollback()


def sync(name=None):
    for key, file in inventory().items():
        if name is None or key == name:
            refresh(key, file)



class Refresh(socketserver.StreamRequestHandler):
    def handle(self):
        name = self.rfile.readline(128).decode().strip()
        if name == "*" or name in inventory():
            sync(None if name == "*" else name)
            self.wfile.write(b"ok\n")


if __name__ == "__main__":
    socket_path = ROOT / "refresh.sock"
    socket_path.unlink(missing_ok=True)
    sync()
    with socketserver.UnixStreamServer(str(socket_path), Refresh) as server:
        server.serve_forever()

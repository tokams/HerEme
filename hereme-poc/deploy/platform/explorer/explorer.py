import asyncio
import hashlib
import json
import logging
import os
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs
from datasette import hookimpl

ROOT = Path("/views")


@hookimpl
def prepare_connection(conn, database):
    if database.startswith("_"):
        return
    conn.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
    conn.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1024 * 1024)
    conn.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 64 * 1024)
    conn.execute("PRAGMA query_only=ON")


@hookimpl
def asgi_wrapper(datasette):
    def wrap(app):
        async def handle(scope, receive, send):
            if scope["type"] == "http":
                path = scope["path"].removeprefix("/databases/").strip("/")
                name = path.split("/")[0].split(".")[0]
                # The gateway records operator attribution. Avoid logging SQL literals in URLs.
                logging.getLogger("uvicorn.access").disabled = True
                if name and name != "-" and (name.startswith("_") or name not in datasette.databases):
                    await send({"type": "http.response.start", "status": 404, "headers": []})
                    await send({"type": "http.response.body", "body": b"Unknown database"})
                    return
                if name != "-":
                    reader, writer = await asyncio.open_unix_connection(ROOT / "refresh.sock")
                    try:
                        writer.write(((name or "*") + "\n").encode())
                        await writer.drain()
                        if await asyncio.wait_for(reader.readline(), timeout=15) != b"ok\n":
                            raise RuntimeError("Database refresh failed")
                    finally:
                        writer.close()
                        await writer.wait_closed()
                sql = parse_qs(scope["query_string"].decode("ascii")).get("sql")
                if sql:
                    operator = dict(scope["headers"]).get(b"x-hereme-operator", b"").decode()
                    async def audit_response(message):
                        if message["type"] == "http.response.start":
                            print(json.dumps({"event": "explorer.query", "operator": operator,
                                              "database": name, "status": message["status"],
                                              "sha256": hashlib.sha256(sql[0].encode()).hexdigest()}),
                                  flush=True)
                        await send(message)
                    await app(scope, receive, audit_response)
                    return
            await app(scope, receive, send)
        return handle
    return wrap


if __name__ == "__main__":
    sites = json.loads(Path("/config/sites.json").read_text())
    files = [str(ROOT / (name + ".db")) for name in ["platform", *(s["id"] for s in sites)]]
    os.execvp("datasette", ["datasette", "serve", *files, "--host", "0.0.0.0", "--port", "8001",
              "--plugins-dir", "/plugins", "--setting", "base_url", "/databases/",
              "--setting", "allow_download", "off", "--setting", "allow_csv_stream", "off",
              "--setting", "max_returned_rows", "500", "--setting", "sql_time_limit_ms", "1000",
              "--setting", "default_cache_ttl", "0"])

"""Construct a disposable production-shaped predecessor in the rehearsal's own volume."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

os.umask(0o077)
base, prefix, phase = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
legacy = base / "legacy"
platform = base / "platform"


def run(*args, capture=False):
    return subprocess.run(list(map(str, args)), check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def stage(name):
    dest = base / name
    dest.mkdir()
    for item in ("package.json", "package-lock.json", "server", "scripts", "deploy", "public", "seed"):
        source = Path("/src") / item
        if source.is_dir():
            shutil.copytree(source, dest / item, ignore=shutil.ignore_patterns(".env", "__pycache__"))
        else:
            shutil.copy2(source, dest / item)
    return dest


if phase == "first":
    legacy.mkdir()
    # Match the production transport: private release directory, readable packaged source.
    mask = os.umask(0o022)
    try:
        run("tar", "-xf", "/baseline.tar", "-C", legacy)
    finally:
        os.umask(mask)
    assert (legacy / "package.json").stat().st_mode & 0o004
    config = legacy / "deploy/docker"
    path = config / "compose.yaml"
    cfg = path.read_text().replace("hereme-local-forum:latest", prefix + "-legacy:test")
    cfg = cfg.replace('"80:80"', '"127.0.0.1:18082:80"').replace('"443:443', '"127.0.0.1:18445:443')
    path.write_text(cfg)
    caddy = config / "Caddyfile"
    caddy.write_text("{\n local_certs\n}\n" + caddy.read_text())
    (config / ".env").write_text("HEREME_DOMAIN=hereme.no\nWEBAUTHN_ENABLED=true\n")
    stack = ["docker", "compose", "-p", prefix + "_legacy", "-f", path]
    run(*stack, "build", "app")
    tag = prefix + "-legacy:test"
    run("docker", "run", "--rm", "-v", str(config) + ":/settings", tag, "node", "scripts/configure-push-env.js", "/settings/.env", "hereme.no")
    run(*stack, "run", "--rm", "--no-deps", "-v", str(base) + ":/keys", "app", "node", "scripts/provision-staff.js", "/keys/main-staff.txt")
    run(*stack, "up", "-d", "--wait")
    run(*stack, "exec", "-T", "app", "node", "-e",
        """require('node:http').request({host:'127.0.0.1',port:3000,path:'/api/session',method:'POST',headers:{Host:'hereme.no',Origin:'https://hereme.no','Content-Type':'application/json'}},r=>{if(r.statusCode!==201)throw Error('fixture registration '+r.statusCode);require('fs').writeFileSync('/var/lib/hereme/fixture-session',r.headers['set-cookie'].map(c=>c.split(';')[0]).join('; '));r.resume()}).end(JSON.stringify({name:'BeforeCutover'}))""")
    run(*stack, "exec", "-T", "app", "node", "-e",
        """const cookie=require('fs').readFileSync('/var/lib/hereme/fixture-session','utf8');const csrf=/hereme_csrf=([^;]+)/.exec(cookie)[1];
require('node:http').request({host:'127.0.0.1',port:3000,path:'/api/posts',method:'POST',headers:{Host:'hereme.no',Origin:'https://hereme.no',Cookie:cookie,'x-csrf-token':csrf,'Content-Type':'application/json'}},r=>{if(r.statusCode!==201)throw Error('fixture post '+r.statusCode);r.resume()}).end(JSON.stringify({title:'Before cutover',category:'tip',type:'text'}))""")
release = stage(phase)
if phase == "rollback":
    # Valid Caddy config but an invalid sidecar executable triggers a real Compose activation failure.
    target = release / "deploy/platform/instance.compose.yaml"
    target.write_text(target.read_text().replace("  sidecar:\n", "  sidecar:\n    entrypoint: [/missing-rehearsal-binary]\n"))
run("python3", release / "deploy/platform/release.py", legacy, platform, {"first":"1","rollback":"2","second":"3"}[phase] * 40,
    "--rehearsal-prefix", prefix)

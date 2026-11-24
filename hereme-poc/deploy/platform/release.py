"""Operator-side cutover. Invoked from a fresh, committed release directory on the Docker host."""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

MAIN = "hereme.no"
COMMUNITY = "tanteulrikkesvei.hereme.no"
ADMIN = "admin.hereme.no"
SERVICES = ["app", "worker", "chat-worker", "content-git-worker", "push-worker"]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(*cmd, capture=False, env=None):
    return subprocess.run([str(arg) for arg in cmd], check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, env=env).stdout


def docker(*args, capture=False):
    # Compose gives shell variables precedence over --env-file. Never inherit a different
    # volume, image, host binding or project name from the SSH account's login environment.
    env = {key: os.environ[key] for key in ("PATH", "HOME", "USER", "LANG", "DOCKER_CONFIG") if key in os.environ}
    result = run("docker", "--host", "unix:///var/run/docker.sock", *args, capture=capture, env=env)
    return result.strip() if capture else None


def inspect(kind, name):
    return json.loads(docker(kind, "inspect", name, capture=True))[0]


def env_of(container):
    return dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)


def volume_at(container, target, expected):
    match = [m for m in container["Mounts"] if m["Destination"] == target]
    require(len(match) == 1 and match[0]["Type"] == "volume" and match[0]["Name"] == expected,
            f"Unexpected mount at {target} in {container['Name']}. Expected volume {expected}.")


def owned_resource(kind, name, owner):
    names = docker(kind, "ls", "--format", "{{.Name}}", capture=True).splitlines()
    if name not in names:
        args = []
        if kind == "network":
            # Ask Docker IPAM for an available pool. Reserve its upper half for dynamic
            # endpoints so an app starting before the gateway cannot claim the trusted IP.
            allocation = docker("network", "create", "--internal", "--label", "hereme.platform=" + owner,
                                name + "_allocation", capture=True)
            try:
                subnet = ipaddress.IPv4Network(inspect("network", allocation)["IPAM"]["Config"][0]["Subnet"])
                require(subnet.num_addresses >= 16, f"Ingress CIDR too small: {subnet}")
                dynamic = list(subnet.subnets(prefixlen_diff=1))[1]
            finally:
                docker("network", "rm", allocation)
            args = ["--internal", "--subnet", str(subnet), "--gateway", str(subnet.network_address + 1),
                    "--ip-range", str(dynamic)]
        docker(kind, "create", *args, "--label", "hereme.platform=" + owner, name)
    item = inspect(kind, name)
    require((item["Labels"] or {}).get("hereme.platform") == owner, f"Ownership mismatch for {name}")
    if kind == "network":
        require(item["Internal"], f"Ingress must be internal: {name}")
    return item


def write_env(path, values):
    # All values are operator-generated or validated, with Compose interpolation disabled by quoting.
    require(all(not re.search(r"['\r\n]", str(v)) for v in values.values()), "Invalid deployment setting")
    path.write_text("".join(f"{k}='{v}'\n" for k, v in values.items()))


def compose(release, stack, *args, capture=False):
    base = release / "deploy/platform"
    files = ["edge.compose.yaml", "management.compose.yaml"] if stack == "edge" else ["instance.compose.yaml", "policy.compose.yaml"]
    if stack == "edge" and (release / "development-ca.yaml").exists():
        files.append(str(release / "development-ca.yaml"))
    flags = [v for file in files for v in ("-f", base / file)]
    if stack == "edge" and (release / "explorer-mounts.json").is_file():
        flags.extend(["-f", release / "explorer-mounts.json"])
    return docker("compose", "--env-file", release / (stack + ".env"), *flags, *args, capture=capture)


def container(project, service):
    ids = docker("ps", "-q", "--filter", "label=com.docker.compose.project=" + project,
                 "--filter", "label=com.docker.compose.service=" + service, capture=True).splitlines()
    require(len(ids) == 1, f"Expected one running {project}/{service}. Check the active deployment.")
    return inspect("container", ids[0])


def job(image, args, mounts=(), environment=(), root=False, capture=False):
    flags = [v for mount in mounts for v in ("-v", mount)]
    flags.extend(v for entry in environment for v in ("-e", entry))
    return docker("run", "--rm", "--network", "none", *(["--user", "0"] if root else []),
                  *flags, image, *args, capture=capture)


def db_version(image, data):
    code = """const db=new(require('node:sqlite').DatabaseSync)('/db/hereme.sqlite',{readOnly:true});
console.log(db.prepare('SELECT MAX(version) AS n FROM schema_migrations').get().n);"""
    return job(image, ["node", "-e", code], [data + ":/db"], capture=True)


def check_backup_space(image, backup_root, volumes):
    sizes = []
    for data, archive in volumes:
        usage = job(image, ["sh", "-ec",
            'for p in /data/hereme.sqlite* /data/uploads /data/avatars /data/media /archive; do '
            'if [ -e "$p" ]; then du -sk "$p"; fi; done'],
            [data + ":/data:ro", archive + ":/archive:ro"], root=True, capture=True)
        sizes.append(sum(int(line.split()[0]) * 1024 for line in usage.splitlines()))
    # Budget retained copies plus one temporary clone and the app's existing disk reserve.
    reserve = 2 * 1024 ** 3
    required = sum(sizes) + max(sizes) + reserve
    require(shutil.disk_usage(backup_root).free >= required,
            f"Insufficient space for verified backups and a working clone. Need {required} bytes under {backup_root}.")
    available = job(image, ["node", "-e", "const s=require('fs').statfsSync('/tmp');console.log(s.bavail*s.bsize)"], capture=True)
    require(int(available) >= max(sizes) + reserve, "Insufficient Docker storage for a verified candidate clone")


def snapshot(old_image, data, archive, dest, candidate):
    dest.mkdir()
    # Backups are made by the running revision. Working storage stays on its original volumes.
    job(old_image, ["node", "-e", "require('./scripts/snapshot-data').snapshotData('/data','/copy/site').catch(e=>{console.error(e);process.exitCode=1})"],
        [data + ":/data", f"{dest}:/copy"])
    job(old_image, ["node", "scripts/verify-backup.js", "/copy/site"], [f"{dest}:/copy"], root=True)
    job(old_image, ["sh", "-ec", "tar czf /copy/archive.tgz -C /git . && tar tzf /copy/archive.tgz >/dev/null && cd /copy && sha256sum archive.tgz >archive.sha256"],
        [archive + ":/git:ro", f"{dest}:/copy"], root=True)
    # A copy exercises startup/backfill under the candidate without attaching its code to live data.
    job(candidate, ["node", "scripts/verify-release-clone.js", "/copy/site"], [f"{dest}:/copy:ro"], root=True)


def point(link, release):
    pending = link.with_name(link.name + "-" + release.name)
    pending.symlink_to(release, target_is_directory=True)
    pending.replace(link)


def start(release, stack):
    compose(release, stack, "up", "-d", "--force-recreate", "--wait", "--wait-timeout", "150")


def verify_image(project, services, candidate):
    for service in services:
        require(container(project, service)["Image"] == candidate, f"Image mismatch in {project}/{service}")


def probe(release, routes):
    # Member metadata is served by the application itself. HTTP Host, SNI and CA validation all apply.
    code = """(async()=>{for(const [host,route] of Object.entries(JSON.parse(process.argv[1]))){
      const r=await fetch('https://'+host+route,{redirect:'error',signal:AbortSignal.timeout(5000)});
      const v=await r.json();if(!r.ok||!(v.service==='hereme-platform'||v.ok===true))throw Error('Readiness failed for '+host)
    }})().catch(e=>{console.error(e.message);process.exitCode=1})"""
    for attempt in range(25):
        try:
            compose(release, "edge", "exec", "-T", "platform", "node", "-e", code, json.dumps(routes))
            return
        except subprocess.CalledProcessError:
            if attempt == 24:
                raise
            time.sleep(4)


def rolling_update(release, base, old_releases, sites, state, backup, candidate, edge, old_version):
    old_edge = old_releases["edge"]
    # Freeze only the control plane while copying the registry and registration settings.
    compose(old_edge, "edge", "stop", "platform")
    try:
        shutil.copytree(state, backup / "state")
    finally:
        compose(old_edge, "edge", "start", "--wait", "platform")
    for stack, previous in old_releases.items():
        shutil.copy2(previous / (stack + ".env"), backup)
    for stack, project, host, running, data, archive in sites:
        previous = old_releases[stack]
        print("Updating", host, flush=True)
        compose(previous, stack, "stop")
        try:
            snapshot(running["Image"], data, archive, backup / stack, candidate)
            start(release, stack)
            verify_image(project, SERVICES, candidate)
            probe(old_edge, {host: "/api/ready"})
            point(base / ("active-" + stack), release)
        except BaseException:
            compose(release, stack, "stop")
            require(db_version(running["Image"], data) == old_version, "Schema changed; hold this site for forward recovery")
            start(previous, stack)
            probe(old_edge, {host: "/api/ready"})
            raise
    try:
        start(release, "edge")
        verify_image(edge, ["platform"], candidate)
        probe(release, {MAIN: "/api/ready", COMMUNITY: "/api/ready", ADMIN: "/live"})
        point(base / "active-edge", release)
    except BaseException:
        start(old_edge, "edge")
        probe(old_edge, {MAIN: "/api/ready", COMMUNITY: "/api/ready", ADMIN: "/live"})
        raise
    point(base / "current", release)


def deploy(release, legacy, base, revision, prefix, development):
    os.umask(0o077)
    require(os.getuid() == 1000, "Run as the deployment account (uid 1000, matching the runtime image).")
    require(re.fullmatch("[a-f0-9]{40}", revision), "Expected a full Git revision")
    require(re.fullmatch("[a-z][a-z0-9]{1,32}", prefix), "Invalid project namespace")
    base.mkdir(parents=True, exist_ok=True)
    lock = (base / "deploy.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    state, current = base / "state", base / "current"
    previous = current.resolve(strict=True) if current.is_symlink() else None
    require(previous or not current.exists(), "Current release pointer is invalid")
    state.mkdir(exist_ok=True)
    legal_file = state / "legal.json"
    if development and not legal_file.exists():
        legal = {site: {"controller": "Rehearsal Operator", "contact": "operator@rehearsal.hereme.no",
                        "processors": "Rehearsal environment"} for site in ("main", "community")}
    else:
        require(legal_file.is_file(), f"Create reviewed per-instance legal settings at {legal_file} before release")
        legal = json.loads(legal_file.read_text())
    require(isinstance(legal, dict), "Legal settings must map each instance to its public details")
    for site in ("main", "community"):
        require(isinstance(legal.get(site), dict), f"Missing legal settings for {site}")
        details = legal[site]
        require(all(isinstance(details.get(key), str) and details[key].strip() for key in
                    ("controller", "contact", "processors")), f"Incomplete legal settings for {site}")
        require(re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", details["contact"]),
                f"Invalid legal contact for {site}")
        if not development:
            require(not re.search(r"\.(test|invalid|example)$", details["contact"], re.I) and
                    not re.search(r"replace with", details["processors"], re.I),
                    f"Replace example legal settings for {site} with verified values")
    legacy_name = prefix + "_legacy" if development else "docker"
    main, community, edge = [prefix + "_" + v for v in ("main", "community", "edge")]
    legacy_config = legacy / "deploy/docker/compose.yaml"

    def legacy_compose(*args):
        return docker("compose", "-p", legacy_name, "-f", legacy_config, *args)

    old = container(main if previous else legacy_name, "app")
    old_git = container(main if previous else legacy_name, "content-git-worker")
    proxy = container(edge if previous else legacy_name, "edge" if previous else "proxy")
    push = env_of(container(main if previous else legacy_name, "push-worker"))
    app = env_of(old)
    require(app["HEREME_PUBLIC_ORIGIN"] == "https://" + MAIN, "Existing main origin differs")
    data, archive, tls, config = [legacy_name + "_" + v for v in ("hereme-data", "hereme-content-git", "caddy-data", "caddy-config")]
    volume_at(old, "/var/lib/hereme", data)
    volume_at(old_git, "/var/lib/hereme-git", archive)
    volume_at(proxy, "/data", tls)
    volume_at(proxy, "/config", config)
    if not previous:
        require((legacy_config.parent / ".env").is_file(), "Legacy private environment missing")
    caddy = inspect("image", proxy["Image"])["RepoDigests"]
    require(caddy, "The live gateway needs a reproducible registry digest")
    tag = prefix + "-release:" + revision
    if tag not in docker("image", "ls", "--format", "{{.Repository}}:{{.Tag}}", capture=True).splitlines():
        docker("build", "--label", "org.opencontainers.image.revision=" + revision, "-t", tag,
               "-f", release / "deploy/docker/Dockerfile", release)
    image = inspect("image", tag)
    require(image["Config"]["Labels"].get("org.opencontainers.image.revision") == revision, "Release tag collision")
    candidate = image["Id"]
    common = {"APP_IMAGE_ID": candidate.removeprefix("sha256:"), "CADDY_IMAGE": caddy[0], "RELEASE_REVISION": revision}
    policies, registry, secrets = (state / name for name in ("sites", "registry", "secrets"))
    for path in (policies, registry, secrets):
        path.mkdir(exist_ok=True)
    inventory = policies / "sites.json"
    sites = json.loads((release / "deploy/platform/sites.json").read_text())
    prior_ids = {s["id"] for s in json.loads(inventory.read_text())} if inventory.exists() else set()
    require(all(re.fullmatch(r"[a-z][a-z0-9_-]*", s["id"]) and s["id"] != "platform"
                and re.fullmatch(r"(?:[a-z0-9-]+\.)?hereme\.no", s["hostname"])
                and s["hostname"] != ADMIN and isinstance(s["label"], str) for s in sites)
            and len({s["hostname"] for s in sites}) == len(sites), "Invalid registered community")
    registered = {s["id"]: s["hostname"] for s in sites}
    require(registered.get("main") == MAIN and registered.get("community") == COMMUNITY
            and len(registered) == len(sites), "Invalid managed site inventory")
    pending_inventory = policies / "sites.next"
    pending_inventory.write_text(json.dumps(sites) + "\n")
    pending_inventory.replace(inventory)
    for spec in sites:
        folder = policies / spec["id"]
        folder.mkdir(exist_ok=True)
        policy = folder / "policy.json"
        if not policy.exists():
            require(not previous or spec["id"] not in prior_ids, "Missing active policy for " + spec["id"])
            policy.write_text('{"registrationOpen":true}\n')
    staff_file = secrets / "tanteulrikkesvei-staff-credentials.txt"
    operator_file = secrets / "platform-operator.txt"
    database = registry / "registry.sqlite"
    if not database.exists() and not operator_file.exists() and not previous:
        job(candidate, ["node", "server/platform/operator.js", "/db/registry.sqlite", "/keys/" + operator_file.name],
            [f"{registry}:/db", f"{secrets}:/keys"])
    require(operator_file.is_file() and database.is_file(), "Incomplete operator bootstrap; inspect the registry and its credential file")
    job(candidate, ["node", "-e", "const db=new(require('node:sqlite').DatabaseSync)('/db/registry.sqlite',{readOnly:true});if(!db.prepare('select 1 from operators').get())throw Error('Missing platform operator')"], [f"{registry}:/db"])
    secondary_data, secondary_git = community + "_data", community + "_archive"
    if previous:
        secondary = container(community, "app")
        volume_at(secondary, "/var/lib/hereme", secondary_data)
        volume_at(container(community, "content-git-worker"), "/var/lib/hereme-git", secondary_git)
    for name in [secondary_data, secondary_git]:
        owned_resource("volume", name, prefix)
    if not staff_file.exists():
        require(not previous, "Missing community credential file; inspect the active community")
        job(candidate, ["sh", "-ec", 'test ! -e /var/lib/hereme/hereme.sqlite && exec node scripts/provision-staff.js "$1"', "bootstrap", "/keys/" + staff_file.name],
            [secondary_data + ":/var/lib/hereme", f"{secrets}:/keys"], ["HEREME_DATA_DIR=/var/lib/hereme", "HEREME_DATABASE_START=empty"])
    for volume in [data, secondary_data]:
        job(candidate, ["node", "-e", "const db=new(require('node:sqlite').DatabaseSync)('/db/hereme.sqlite',{readOnly:true});for(const r of ['admin','moderator'])if(!db.prepare('select 1 from user_roles where role=?').get(r))throw Error('Missing community staff role '+r)"], [volume + ":/db"])
    push_fields = ("WEB_PUSH_ENABLED", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "VAPID_SUBJECT", "HEREME_PUSH_POLL_MS")
    main_keys = {k: push[k] for k in push_fields if k in push}
    if push.get("WEB_PUSH_ENABLED") == "1":
        require(push.get("VAPID_PRIVATE_KEY") and push.get("VAPID_PUBLIC_KEY") == app.get("VAPID_PUBLIC_KEY"), "Main VAPID pair missing or inconsistent")
    community_keys = state / "community-push.json"
    if not community_keys.exists():
        require(not previous, "Missing community push configuration")
        pair = json.loads(job(candidate, ["node", "-p", "JSON.stringify(require('web-push').generateVAPIDKeys())"], capture=True))
        community_keys.write_text(json.dumps({"WEB_PUSH_ENABLED": "1", "VAPID_PRIVATE_KEY": pair["privateKey"],
            "VAPID_PUBLIC_KEY": pair["publicKey"], "VAPID_SUBJECT": "mailto:operator@" + COMMUNITY}))
    networks = {}
    for site, project, host, volumes, keys, passkeys in [
            ("main", main, MAIN, [data, archive], main_keys, app["WEBAUTHN_ENABLED"]),
            ("community", community, COMMUNITY, [secondary_data, secondary_git], json.loads(community_keys.read_text()), "true")]:
        network = owned_resource("network", project + "_ingress", prefix)
        peer = str(ipaddress.IPv4Address(network["IPAM"]["Config"][0]["Gateway"]) + 1)
        dynamic = network["IPAM"]["Config"][0].get("IPRange")
        require(dynamic and ipaddress.IPv4Address(peer) not in ipaddress.IPv4Network(dynamic),
                f"Trusted gateway address overlaps dynamic addresses on {project}")
        networks[site] = peer
        write_env(release / (site + ".env"), {**common, **keys,
            "HEREME_LEGAL_CONTROLLER": legal[site]["controller"], "HEREME_LEGAL_CONTACT": legal[site]["contact"],
            "HEREME_LEGAL_PROCESSORS": legal[site]["processors"],
            "INSTANCE_PROJECT": project, "INSTANCE_HOST": host,
            "DATA_VOLUME": volumes[0], "ARCHIVE_VOLUME": volumes[1], "EDGE_PEER": peer, "DATABASE_START": "existing",
            "POLICY_DIR": policies / site, "WEBAUTHN_ENABLED": passkeys})
    write_env(release / "edge.env", {**common, "MAIN_PROJECT": main, "COMMUNITY_PROJECT": community,
        "EDGE_PROJECT": edge, "MAIN_EDGE_PEER": networks["main"], "COMMUNITY_EDGE_PEER": networks["community"],
        "TLS_POLICY": "development" if development else "production", "HTTP_BIND": "127.0.0.1:18081" if development else "0.0.0.0:80",
        "HTTPS_BIND": "127.0.0.1:18444" if development else "0.0.0.0:443", "EDGE_DATA_VOLUME": tls,
        "EDGE_CONFIG_VOLUME": config, "REGISTRY_DIR": registry, "POLICIES_DIR": policies})
    mounts, volumes = [], {}
    for site in sites:
        key = site["id"]
        require(re.fullmatch(r"[a-z][a-z0-9_-]*", key) and key != "platform", "Invalid explorer database ID")
        volume = {"main": data, "community": secondary_data}.get(key, site.get("dataVolume"))
        require(volume and re.fullmatch(r"[A-Za-z0-9_-]+", volume), f"Set registered dataVolume for {key}")
        inspect("volume", volume)
        alias = "source_" + key
        volumes[alias] = {"external": True, "name": volume}
        mounts.append(f"{alias}:/sources/{key}:ro")
    (release / "explorer-mounts.json").write_text(json.dumps({
        "services": {"projector": {"volumes": mounts}}, "volumes": volumes}))
    if development:
        (release / "development-ca.yaml").write_text(f"services:\n  platform:\n    environment:\n      NODE_EXTRA_CA_CERTS: /public-ca/root.crt\n    volumes:\n      - {state}/ca:/public-ca:ro\n")
        (state / "ca").mkdir(exist_ok=True)
    for stack in ("edge", "main", "community"):
        compose(release, stack, "config", "--quiet")
    gateway_files = release / "deploy/platform"
    job(caddy[0], ["caddy", "validate", "--config", "/etc/caddy/Caddyfile"],
        [f"{gateway_files}/edge:/etc/caddy:ro", f"{gateway_files}/admin-route.caddy:/etc/hereme-extra/admin.caddy:ro"],
        ["TLS_POLICY=" + ("development" if development else "production"),
         "MAIN_UPSTREAM=" + main + "-http:8080", "COMMUNITY_UPSTREAM=" + community + "-http:8080"])
    backup = base / "backups" / release.name
    backup.mkdir(parents=True)
    check_backup_space(candidate, backup, [(data, archive), (secondary_data, secondary_git)])
    old_version = db_version(old["Image"], data)
    require(old_version in ("23", "24") if previous else old_version == "23",
            "Expected schema 23 for the initial cutover or schema 23/24 for an upgrade")
    if previous:
        require(db_version(secondary["Image"], secondary_data) == old_version, "Secondary schema differs")
    if previous:
        active = {stack: (base / ('active-' + stack)).resolve(strict=True) for stack in ("main", "community", "edge")}
        rolling_update(release, base, active, [
            ("main", main, MAIN, old, data, archive),
            ("community", community, COMMUNITY, secondary, secondary_data, secondary_git)
        ], state, backup, candidate, edge, old_version)
        print("Verified both communities and platform at", revision, "Backup:", backup)
        return
    activated = False
    try:
        legacy_compose("stop")
        # With all writers stopped, capture and verify both databases, media, Git archives and control state.
        snapshot(old["Image"], data, archive, backup / "main", candidate)
        snapshot(candidate, secondary_data, secondary_git, backup / "community", candidate)
        shutil.copytree(state, backup / "state")
        shutil.copy2(legacy_config.parent / ".env", backup / "production.env")
        activated = True
        compose(release, "edge", "up", "-d", "--no-deps", "--force-recreate", "edge")
        if development:
            docker("cp", container(edge, "edge")["Id"] + ":/data/caddy/pki/authorities/local/root.crt", state / "ca/root.crt")
        for stack in ("main", "community", "edge"):
            args = ["platform", "explorer"] if stack == "edge" else []
            compose(release, stack, "up", "-d", "--force-recreate", "--wait", "--wait-timeout", "150", *args)
        for project in (main, community):
            verify_image(project, SERVICES, candidate)
        verify_image(edge, ["platform"], candidate)
        probe(release, {MAIN: "/api/ready", COMMUNITY: "/api/ready", ADMIN: "/live"})
        for stack in ("main", "community", "edge"):
            point(base / ("active-" + stack), release)
        point(current, release)
    except BaseException:
        print("Cutover failed. Preserving volumes and backups at", backup, file=sys.stderr, flush=True)
        if activated:
            for stack in ("edge", "community", "main"):
                compose(release, stack, "stop")
            require(db_version(old["Image"], data) == old_version and db_version(candidate, secondary_data) == old_version,
                    "Schema changed; automatic code rollback stopped. Follow the recovery runbook.")
        legacy_compose("start", "--wait")
        raise
    print("Deployed", revision, "to both communities and the platform panel. Verified backup:", backup)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("legacy", type=Path)
    cli.add_argument("base", type=Path)
    cli.add_argument("revision")
    cli.add_argument("--rehearsal-prefix", help="Local disposable Docker projects and development TLS only")
    args = cli.parse_args()
    deploy(Path(__file__).resolve().parents[2], args.legacy.resolve(), args.base.resolve(), args.revision,
           args.rehearsal_prefix or "hereme", bool(args.rehearsal_prefix))

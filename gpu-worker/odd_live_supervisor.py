#!/usr/bin/env python3
"""Keep Diana's ODD Live worker and RTSP broadcaster under the website buttons.

The supervisor polls a narrow, authenticated desired-state endpoint. It can
only start or stop the two fixed ODD Live programs; it never accepts commands
or executable paths from the website.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path.home() / "odd-ai-humans"
CONFIG = Path.home() / ".config" / "odd-live" / "worker.env"
API_BASE = "https://www.onedailydrop.com"
CONTROL_PATH = "/api/odd-tv/worker/control"
HEARTBEAT_PATH = "/api/odd-tv/worker/heartbeat"
POLL_SECONDS = 5
RTSP_URL = "rtsp://127.0.0.1:8554/odd-live-smart"


def load_worker_config():
    if not CONFIG.is_file():
        raise RuntimeError("WORKER_CONFIG_MISSING")
    if CONFIG.stat().st_mode & 0o077:
        raise PermissionError("WORKER_CONFIG_MUST_BE_PRIVATE_CHMOD_600")
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name in {"ODD_LIVE_API_BASE", "ODD_LIVE_WORKER_KEY"} and value:
            os.environ.setdefault(name, value.strip())
    base = os.environ.get("ODD_LIVE_API_BASE", "").rstrip("/")
    key = os.environ.get("ODD_LIVE_WORKER_KEY", "")
    if not base.startswith("https://") or not key:
        raise RuntimeError("WORKER_CONFIG_INVALID")
    os.environ["ODD_LIVE_API_BASE"] = base
    os.environ["ODD_LIVE_WORKER_KEY"] = key
    return base, key


def post_json(base, path, key, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + path, data=data, method="POST",
        headers={"Content-Type": "application/json", "X-ODD-Worker-Key": key},
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def start_processes(log):
    scripts = {
        "worker": ROOT / "gpu-worker" / "odd_live_chloe_worker.py",
        "broadcaster": ROOT / "gpu-worker" / "odd_live_program.py",
    }
    missing = [name for name, path in scripts.items() if not path.is_file()]
    if missing:
        raise RuntimeError("ODD_LIVE_SCRIPTS_MISSING")
    env = os.environ.copy()
    worker = subprocess.Popen(
        [sys.executable, "-u", str(scripts["worker"]), "--watch"],
        cwd=str(ROOT), env=env, stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    broadcaster = subprocess.Popen(
        [sys.executable, "-u", str(scripts["broadcaster"]),
         "--rtsp", RTSP_URL, "--ack-delivered"],
        cwd=str(ROOT), env=env, stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    return {"worker": worker, "broadcaster": broadcaster}


def stop_processes(processes):
    for proc in processes.values():
        if proc.poll() is None:
            proc.terminate()
    for proc in processes.values():
        if proc.poll() is None:
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=3)


def main():
    base, key = load_worker_config()
    log_dir = ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    processes = {}
    last_restart = 0.0
    last_detail = ""
    print("ODD_LIVE_SUPERVISOR_READY", flush=True)
    try:
        while True:
            try:
                control = post_json(base, CONTROL_PATH, key, {})
                desired = control.get("desired_state")
                if desired == "running":
                    exited = [name for name, proc in processes.items() if proc.poll() is not None]
                    if exited:
                        last_detail = "Restarting stopped ODD Live process: " + ",".join(exited)
                        stop_processes(processes)
                        processes = {}
                    if not processes and time.monotonic() - last_restart >= 5:
                        log = open(log_dir / "odd-live-control.log", "ab", buffering=0)
                        processes = start_processes(log)
                        last_restart = time.monotonic()
                        last_detail = ""
                    alive = len(processes) == 2 and all(p.poll() is None for p in processes.values())
                    state = "running" if alive else "starting"
                elif desired == "stopped":
                    if processes:
                        stop_processes(processes)
                        processes = {}
                    state = "stopped"
                    last_detail = ""
                else:
                    state = "error"
                    last_detail = "SERVER_RETURNED_INVALID_DESIRED_STATE"
                post_json(base, HEARTBEAT_PATH, key, {"state": state, "detail": last_detail})
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                # Keep the last requested local state while the site is unreachable.
                print("ODD_LIVE_CONTROL_POLL_ERROR", type(exc).__name__, flush=True)
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("ODD_LIVE_SUPERVISOR_STOPPING", flush=True)
    finally:
        stop_processes(processes)


if __name__ == "__main__":
    main()

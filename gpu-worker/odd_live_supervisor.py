#!/usr/bin/env python3
"""Diana-side supervisor controlled by the authenticated ODD Live admin buttons.

Only starts/stops the fixed MediaMTX, Chloe worker, and RTSP broadcaster.
It never accepts shell commands or executable paths from the website.
"""
import json
import os
import signal
from pathlib import Path
import socket
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


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def stream_available():
    """Return true only when MediaMTX can describe the live RTSP path."""
    try:
        result = subprocess.run(
            ["ffprobe", "-rtsp_transport", "tcp", "-rw_timeout", "2000000",
             "-v", "error", "-show_entries", "stream=codec_name",
             "-of", "default=nw=1:nk=1", RTSP_URL],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, timeout=4, check=False,
        )
        return result.returncode == 0 and "h264" in result.stdout.split()
    except (OSError, subprocess.TimeoutExpired):
        return False


def start_broadcaster(log):
    return subprocess.Popen(
        [sys.executable, "-u", str(ROOT / "gpu-worker" / "odd_live_program.py"),
         "--rtsp", RTSP_URL, "--ack-delivered"],
        cwd=str(ROOT), env=os.environ.copy(), stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True,
    )


def start_processes(log):
    stream_dir = ROOT / "stream-server"
    media = stream_dir / "mediamtx"
    config = stream_dir / "mediamtx.yml"
    worker = ROOT / "gpu-worker" / "odd_live_chloe_worker.py"
    broadcaster = ROOT / "gpu-worker" / "odd_live_program.py"
    if not (media.is_file() and config.is_file() and worker.is_file() and broadcaster.is_file()):
        raise RuntimeError("ODD_LIVE_FILES_MISSING")
    processes = {}
    if port_open(8554):
        # A manually started MediaMTX is reused and will not be stopped by this service.
        processes["mediamtx"] = None
    else:
        processes["mediamtx"] = subprocess.Popen(
            [str(media), str(config)], cwd=str(stream_dir),
            env=os.environ.copy(), stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        for _ in range(40):
            if port_open(8554):
                break
            if processes["mediamtx"].poll() is not None:
                raise RuntimeError("MEDIAMTX_FAILED_TO_START")
            time.sleep(0.5)
        if not port_open(8554):
            raise RuntimeError("MEDIAMTX_START_TIMEOUT")
    processes["worker"] = subprocess.Popen(
        [sys.executable, "-u", str(worker), "--watch"],
        cwd=str(ROOT), env=os.environ.copy(), stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    processes["broadcaster"] = start_broadcaster(log)
    return processes


def stop_process_group(proc, timeout=8):
    """Stop a managed process and every child in its dedicated session."""
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait(timeout=3)


def stop_processes(processes):
    # Each managed service was started in its own session. Kill the whole
    # broadcaster group so FFmpeg cannot survive as an orphan RTSP publisher.
    for name in ("broadcaster", "worker", "mediamtx"):
        stop_process_group(processes.get(name), timeout=8)


def main():
    base, key = load_worker_config()
    log_dir = ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = open(log_dir / "odd-live-control.log", "ab", buffering=0)
    processes = {}
    last_restart = 0.0
    last_detail = ""
    publisher_started_at = 0.0
    last_stream_check = 0.0
    stream_missing_since = 0.0
    publisher_ok = False
    print("ODD_LIVE_SUPERVISOR_READY", flush=True)
    try:
        while True:
            try:
                control = post_json(base, CONTROL_PATH, key, {})
                desired = control.get("desired_state")
                if desired == "running":
                    exited = [name for name, proc in processes.items()
                              if proc is not None and proc.poll() is not None]
                    if exited:
                        last_detail = "Restarting stopped ODD Live process: " + ",".join(exited)
                        stop_processes(processes)
                        processes = {}
                    if not processes and time.monotonic() - last_restart >= 5:
                        try:
                            processes = start_processes(log)
                            last_restart = time.monotonic()
                            publisher_started_at = last_restart
                            last_stream_check = 0.0
                            stream_missing_since = 0.0
                            publisher_ok = False
                            last_detail = ""
                        except Exception as exc:
                            last_restart = time.monotonic()
                            last_detail = type(exc).__name__
                            stop_processes(processes)
                            processes = {}
                    alive = (
                        len(processes) == 3 and
                        all(proc is None or proc.poll() is None for proc in processes.values())
                    )
                    now_mono = time.monotonic()
                    if alive and now_mono - last_stream_check >= 10:
                        last_stream_check = now_mono
                        publisher_ok = stream_available()
                        if publisher_ok:
                            stream_missing_since = 0.0
                            if last_detail.startswith("RTSP publisher"):
                                last_detail = ""
                        elif now_mono - publisher_started_at >= 15:
                            if not stream_missing_since:
                                stream_missing_since = now_mono
                            elif now_mono - stream_missing_since >= 20:
                                last_detail = "RTSP publisher missing; restarting Chloe broadcaster"
                                print("ODD_LIVE_RTSP_MISSING_RESTARTING", flush=True)
                                old = processes.get("broadcaster")
                                stop_process_group(old, timeout=5)
                                processes["broadcaster"] = start_broadcaster(log)
                                publisher_started_at = now_mono
                                stream_missing_since = 0.0
                                publisher_ok = False
                    state = "running" if alive and publisher_ok else ("error" if last_detail else "starting")
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
        log.close()


if __name__ == "__main__":
    main()

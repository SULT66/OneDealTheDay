"""Compare warm MuseTalk throughput at two batch sizes without going live."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import time
import wave

ROOT = Path.home() / "odd-ai-humans"
HOST = ROOT / "output/odd-live-host"
MUSE = ROOT / "MuseTalk"
RENDERER = MUSE / "scripts/odd_live_stream.py"
CONFIG = HOST / "renderer/realtime.yaml"
FPS = 25


def check_idle():
    result = subprocess.run(["pgrep", "-f", r"odd_live_stream\.py.*--daemon"],
                            stdout=subprocess.DEVNULL, check=False)
    if result.returncode != 1:
        raise SystemExit("Stop the live pilot and wait for MuseTalk to exit before benchmarking.")


def select_audio():
    candidates = sorted(HOST.glob("turn-*/part-*/speech.wav"),
                        key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        with wave.open(str(path), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        if 4 <= duration <= 10:
            return path, duration
    raise SystemExit("No recent WAV between four and ten seconds was found.")


def request(process, queue, audio, job_id, log):
    target = queue / "inbox" / f"{job_id}.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps({"job_id": job_id, "audio_path": str(audio)}))
    temporary.replace(target)
    result_path = queue / "out" / target.name
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        if result_path.is_file():
            result = json.loads(result_path.read_text())
            if result.get("ok"):
                return float(result["elapsed_seconds"])
            raise RuntimeError(f"{job_id} failed: {result.get('error', 'unknown')}. Log: {log}")
        if process.poll() is not None:
            raise RuntimeError(f"MuseTalk exited early. Log: {log}")
        time.sleep(0.25)
    raise TimeoutError(f"{job_id} timed out. Log: {log}")


def measure(batch, audio, duration, directory, config):
    queue = directory / f"batch-{batch}"
    (queue / "inbox").mkdir(parents=True)
    (queue / "out").mkdir()
    log = HOST / "renderer" / f"benchmark-batch-{batch}-{os.getpid()}.log"
    env = dict(os.environ, TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD="1")
    env["PYTHONPATH"] = str(MUSE) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    import sys
    command = [
        sys.executable, "-u", str(RENDERER),
        "--inference_config", str(config),
        "--unet_model_path", "models/musetalkV15/unet.pth",
        "--unet_config", "models/musetalkV15/musetalk.json",
        "--version", "v15", "--fps", str(FPS), "--batch_size", str(batch),
        "--daemon", "--daemon-queue", str(queue),
    ]
    print(f"Testing batch={batch}, same {duration:.2f}s WAV. Log: {log}", flush=True)
    job_prefix = f"benchmark-{os.getpid()}-{batch}"
    with log.open("w") as stream:
        process = subprocess.Popen(command, cwd=MUSE, env=env, stdin=subprocess.DEVNULL,
                                   stdout=stream, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        try:
            cold = request(process, queue, audio, job_prefix + "-cold", log)
            warm = request(process, queue, audio, job_prefix + "-warm", log)
        finally:
            import signal
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
    print(f"BENCHMARK batch={batch} audio_s={duration:.2f} cold_s={cold:.2f} "
          f"warm_s={warm:.2f} render_to_audio={warm/duration:.2f}", flush=True)
    for line in log.read_text(errors="replace").splitlines():
        if line.startswith("LIVE_PROFILE"):
            print(line, flush=True)


def main():
    import yaml
    check_idle()
    if "DAEMON_DIRECT_ENCODE_V1" not in RENDERER.read_text():
        raise SystemExit("This benchmark expects the DIRECT_RENDER_SET patch.")
    audio, duration = select_audio()
    config = yaml.safe_load(CONFIG.read_text())
    if not isinstance(config, dict) or len(config) != 1:
        raise SystemExit("Expected the current one-avatar renderer configuration.")
    avatar, spec = next(iter(config.items()))
    cache = MUSE / "results/v15/avatars" / avatar
    for name in ("avator_info.json", "latents.pt", "coords.pkl", "mask_coords.pkl"):
        if not (cache / name).is_file():
            raise SystemExit(f"Prepared avatar cache is incomplete: {name}")
    if shutil.which("nvidia-smi"):
        subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used",
                        "--format=csv"], check=False)
    with TemporaryDirectory(prefix="musetalk-benchmark-", dir=HOST) as temp:
        directory = Path(temp)
        spec = dict(spec, preparation=False, audio_clips={})
        local_config = directory / "benchmark.yaml"
        local_config.write_text(yaml.safe_dump({avatar: spec}))
        for batch in (4, 8):
            check_idle()
            measure(batch, audio, duration, directory, local_config)


if __name__ == "__main__":
    main()

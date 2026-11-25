#!/usr/bin/env python3
"""Prepare and validate Diana's existing live avatar cache before airtime."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import mkdtemp
from uuid import uuid4

import yaml


ROOT = Path.home() / "odd-ai-humans"
MUSETALK = ROOT / "MuseTalk"
RENDERER = ROOT / "output" / "odd-live-host" / "renderer"
AVATARS = MUSETALK / "results" / "v15" / "avatars"
CACHE_FILES = ("avator_info.json", "latents.pt", "coords.pkl", "mask_coords.pkl")


def ensure_renderer_stopped():
    result = subprocess.run(
        ["pgrep", "-f", r"MuseTalk/scripts/odd_live_stream\.py.*--daemon"],
        capture_output=True, check=False,
    )
    if result.returncode == 0:
        raise RuntimeError("Stop ODD Live and wait for the MuseTalk daemon to exit.")
    if result.returncode != 1:
        raise RuntimeError("Could not check whether the MuseTalk daemon is running.")


def load_config():
    config = yaml.safe_load((RENDERER / "realtime.yaml").read_text(encoding="utf-8"))
    if not isinstance(config, dict) or len(config) != 1:
        raise ValueError("Expected the existing one-avatar Diana renderer configuration.")
    avatar_id, settings = next(iter(config.items()))
    if not isinstance(avatar_id, str) or not avatar_id.replace("_", "").replace("-", "").isalnum():
        raise ValueError("Unexpected avatar identifier.")
    if not isinstance(settings, dict):
        raise ValueError("Invalid avatar settings.")
    source = Path(settings["video_path"]).expanduser().resolve(strict=True)
    if not source.is_file():
        raise ValueError("Avatar source video is missing.")
    return avatar_id, {**settings, "video_path": str(source), "audio_clips": {}}


def run_renderer(config, path):
    path.write_text(yaml.safe_dump(config), encoding="utf-8")
    env = dict(os.environ, TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD="1")
    env["PYTHONPATH"] = str(MUSETALK) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    command = [
        sys.executable, "-u", str(MUSETALK / "scripts" / "odd_live_stream.py"),
        "--inference_config", str(path),
        "--unet_model_path", "models/musetalkV15/unet.pth",
        "--unet_config", "models/musetalkV15/musetalk.json",
        "--version", "v15", "--fps", "25", "--batch_size", "4",
    ]
    subprocess.run(command, cwd=MUSETALK, env=env, stdin=subprocess.DEVNULL,
                   check=True, timeout=600)


def check_cache(cache):
    for name in CACHE_FILES:
        if not (cache / name).is_file() or (cache / name).stat().st_size == 0:
            raise RuntimeError("Incomplete avatar cache: " + name)
    frames = {path.name for path in (cache / "full_imgs").glob("*.png")}
    masks = {path.name for path in (cache / "mask").glob("*.png")}
    if not frames or frames != masks:
        raise RuntimeError("Prepared avatar frames and masks do not match.")
    return len(frames)


def verify_render(avatar_id, settings, target, work):
    smoke_name = "prewarm-check-" + uuid4().hex[:8]
    audio = work / "check.wav"
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
        "sine=frequency=440:sample_rate=48000:duration=2", str(audio),
    ], check=True, timeout=15)
    try:
        run_renderer({avatar_id: {**settings, "preparation": False,
                                  "audio_clips": {smoke_name: str(audio)}}}, work / "verify.yaml")
        clip = target / "vid_output" / (smoke_name + ".mp4")
        tracks = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
            "-of", "default=noprint_wrappers=1:nokey=1", str(clip),
        ], text=True, timeout=15).splitlines()
        if not {"video", "audio"}.issubset(tracks):
            raise RuntimeError("Smoke test did not produce both video and audio.")
    finally:
        (target / "vid_output" / (smoke_name + ".mp4")).unlink(missing_ok=True)


def main():
    ensure_renderer_stopped()
    avatar_id, settings = load_config()
    candidate_id = f"{avatar_id}_warm_{uuid4().hex[:8]}"
    candidate = AVATARS / candidate_id
    target = AVATARS / avatar_id
    backup = AVATARS / f"{candidate_id}_previous"
    work = Path(mkdtemp(prefix="avatar-prewarm-", dir=RENDERER))
    source = work / "avatar-source.mp4"
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-i", settings["video_path"],
        "-t", "6", "-map", "0:v:0", "-an", "-vf", "fps=25",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, timeout=120)

    print(f"Preparing six seconds of {avatar_id} before the show.", flush=True)
    try:
        run_renderer({candidate_id: {**settings, "video_path": str(source), "preparation": True}},
                     work / "prepare.yaml")
        frame_count = check_cache(candidate)
        info_path = candidate / "avator_info.json"
        metadata = json.loads(info_path.read_text(encoding="utf-8"))
        metadata["avatar_id"] = avatar_id
        info_path.write_text(json.dumps(metadata), encoding="utf-8")

        ensure_renderer_stopped()
        if target.exists() or target.is_symlink():
            target.rename(backup)
        installed = False
        try:
            candidate.rename(target)
            installed = True
            print(f"Checking the {frame_count}-frame cache with a two-second audio sample.", flush=True)
            verify_render(avatar_id, settings, target, work)
        except BaseException:
            if installed:
                target.rename(candidate)
            if backup.exists() or backup.is_symlink():
                backup.rename(target)
            raise
    finally:
        if candidate.is_dir():
            shutil.rmtree(candidate)

    print(f"AVATAR_READY {avatar_id} frames={frame_count}", flush=True)
    if backup.exists() or backup.is_symlink():
        print(f"Previous cache saved at {backup}", flush=True)


if __name__ == "__main__":
    main()

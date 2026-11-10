#!/usr/bin/env python3
"""ODD Live GPU rehearsal worker: ONE authorized turn -> Azure Jenny WAV -> MuseTalk MP4.

Does NOT claim the question aired, and DOES NOT acknowledge it as delivered.
The live program compositor and publisher must first prove actual playback.
Run on Diana WSL2 in the existing odd-ai-test environment.
"""
import argparse
from datetime import datetime
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave

ROOT = Path.home() / "odd-ai-humans"
MUSETALK = ROOT / "MuseTalk"
OUTPUT = ROOT / "output" / "chloe-smart"
CONFIG = MUSETALK / "models" / "musetalkV15"
MODEL_AVATAR = "chloe_closeup_01"

def post_json(base, path, key, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=data, method="POST",
        headers={"Content-Type":"application/json", "X-ODD-Worker-Key":key},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

def synthesize_azure(text, dest):
    speech_key = os.environ["AZURE_SPEECH_KEY"]
    region = os.environ["AZURE_SPEECH_REGION"]
    if not region.replace("-","").isalnum():
        raise ValueError("INVALID_SPEECH_REGION")
    voice = os.environ.get("ODD_LIVE_VOICE", "en-US-JennyNeural")
    if not voice.startswith("en-US-"):
        raise ValueError("VOICE_MUST_BE_EN_US")
    safe = html.escape(text, quote=True)
    ssml = (
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
        "xml:lang='en-US'><voice name='" + html.escape(voice, quote=True) +
        "'><prosody rate='-3%'>" + safe + "</prosody></voice></speak>"
    )
    request = urllib.request.Request(
        "https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml.encode("utf-8"), method="POST",
        headers={
            "Ocp-Apim-Subscription-Key":speech_key,
            "Content-Type":"application/ssml+xml",
            "X-Microsoft-OutputFormat":"riff-48khz-16bit-mono-pcm",
            "User-Agent":"ODDLiveChloeWorker/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=40) as result:
        audio = result.read()
    if len(audio) < 1024 or not audio.startswith(b"RIFF"):
        raise RuntimeError("INVALID_AZURE_WAV")
    dest.write_bytes(audio)
    with wave.open(str(dest),"rb") as wav:
        if wav.getframerate()!=48000 or wav.getnchannels()!=1:
            raise RuntimeError("UNEXPECTED_SPEECH_FORMAT")

def render_musetalk(audio, jobdir, timeout_seconds=180):
    config_path = jobdir / "input.yaml"
    # Use path serialization: json strings are valid YAML scalars.
    config_path.write_text(
        MODEL_AVATAR + ":\n  preparation: False\n  bbox_shift: 0\n"
        "  video_path: " + json.dumps(str(ROOT / "avatars/chloe/closeup/source.mp4")) + "\n"
        "  audio_clips:\n    audio_0: " + json.dumps(str(audio)) + "\n",
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
    cmd = [
        sys.executable,"-m","scripts.odd_live_stream",
        "--inference_config",str(config_path),
        "--unet_model_path","models/musetalkV15/unet.pth",
        "--unet_config","models/musetalkV15/musetalk.json",
        "--version","v15","--fps","25","--batch_size","4",
    ]
    log = jobdir / "render.log"
    with log.open("wb") as handle:
        subprocess.run(cmd, cwd=str(MUSETALK), env=env, stdout=handle,
                       stderr=subprocess.STDOUT, timeout=timeout_seconds, check=True)
    generated = MUSETALK / ("results/v15/avatars/" + MODEL_AVATAR + "/vid_output/audio_0.mp4")
    if not generated.exists() or generated.stat().st_size < 4096:
        raise RuntimeError("MUSETALK_OUTPUT_MISSING")
    destination = jobdir / "chloe_reply.mp4"
    shutil.copy2(generated, destination)
    # Verify at least one video and one audio track.
    info = json.loads(subprocess.check_output([
        "ffprobe","-v","error","-show_streams","-of","json",str(destination)
    ], timeout=15))
    kinds = {s["codec_type"] for s in info.get("streams",[])}
    if not {"video","audio"}.issubset(kinds):
        raise RuntimeError("OUTPUT_MISSING_VIDEO_OR_AUDIO")
    return destination

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--once",action="store_true",required=True,
                   help="One rehearsal; never automatic unbounded spending.")
    p.add_argument("--market",default="us")
    args=p.parse_args()
    base=os.environ["ODD_LIVE_API_BASE"].rstrip("/")
    key=os.environ["ODD_LIVE_WORKER_KEY"]
    if not base.startswith("https://") and not base.startswith("http://127.0.0.1:"):
        raise ValueError("WORKER_API_MUST_USE_HTTPS")
    mode=os.getenv("ODD_LIVE_MODE","tv")
    if mode not in {"tv","drop"}: raise ValueError("INVALID_WORKER_MODE")
    path="/api/odd-tv/worker/next" if mode=="tv" else "/api/odd-live/worker/next"
    response=post_json(base,path,key,{"market":args.market})
    if response.get("kind") in {"busy","not_live"}:
        print("NO_TURN:",response["kind"])
        return
    if response.get("kind") not in {"presentation","question"}:
        raise RuntimeError("UNEXPECTED_WORKER_RESPONSE")
    speech=response.get("spoken_text","")
    if not isinstance(speech,str) or not (5<=len(speech)<=520):
        raise RuntimeError("INVALID_SPEECH_LENGTH")
    # Do not leak server credentials or secret lease tokens into logs.
    OUTPUT.mkdir(parents=True,exist_ok=True)
    jobdir=OUTPUT / ("turn-" + str(int(time.time())) + "-" + os.urandom(3).hex())
    jobdir.mkdir(mode=0o700)
    try:
        audio=jobdir / "jenny.wav"
        synthesize_azure(speech,audio)
        video=render_musetalk(audio,jobdir)
        (jobdir / "turn.json").write_text(json.dumps({
            "question_id": response.get("question_id"),
            "drop_key": response.get("drop_key"),
            "spoken_text":speech,
            "note":"REHEARSAL_ONLY_NOT_AIRED",
        },indent=2),encoding="utf-8")
        # Atomic handoff to the local compositor. The lease stays on disk with
        # restricted permissions; only the broadcaster may acknowledge delivery.
        ready=OUTPUT/"ready"
        ready.mkdir(mode=0o700,exist_ok=True)
        expires=response.get("lease_expires_at","")
        expiry=datetime.fromisoformat(expires.replace("Z","+00:00")).timestamp()
        meta={
            "video":str(video.resolve()),
            "drop_key":response["drop_key"],
            "question_id":response.get("question_id"),
            "lease_token":response["lease_token"],
            "lease_expires_at":expiry,
        }
        target=ready/(jobdir.name+".ready.json")
        temp=ready/(jobdir.name+".tmp")
        temp.write_text(json.dumps(meta),encoding="utf-8")
        temp.chmod(0o600)
        os.replace(temp,target)
        print("CHLOE_PREVIEW_READY:",video)
        print("LOCAL_CLIP_QUEUED:",target.name)
        print("NOT_ACKNOWLEDGED: delivery confirmation belongs to the broadcaster.")
    except Exception:
        print("REHEARSAL_FAILED; question stays queued. See per-turn render.log.",file=sys.stderr)
        raise

if __name__=="__main__":
    main()

"""Install prepared ODD Live TV playback into Diana's existing host worker."""
from datetime import datetime
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import wave


class ScriptLengthError(ValueError):
    pass


def fit_speech(parts, target_ms):
    """Fit the WAVs before lip sync so the renderer sees the exact audio that airs."""
    total_samples = sum(samples for _, samples in parts)
    total_frames = target_ms * 25 // 1000
    target_samples = total_frames * 1920
    rate = total_samples / target_samples
    if not 0.8 <= rate <= 1.25:
        raise ScriptLengthError(f"Recorded speech is {total_samples/48000:.1f}s; expected {target_ms/1000:.1f}s")
    fitted = []
    cumulative_samples = 0
    previous_frame = 0
    for wav, samples in parts:
        cumulative_samples += samples
        frame_edge = round(cumulative_samples * total_frames / total_samples)
        count = (frame_edge - previous_frame) * 1920
        if count <= 0:
            raise ScriptLengthError("A script part is too short to align")
        previous_frame = frame_edge
        synced = wav.with_name("synced.wav")
        subprocess.run([
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(wav),
            "-af", f"atempo={samples/count:.8f},apad,atrim=end_sample={count}",
            "-c:a", "pcm_s16le", str(synced),
        ], check=True, timeout=30)
        fitted.append((synced, count))
    return fitted


def verify_clip(clip, audio_seconds):
    streams = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time,duration,r_frame_rate",
        "-of", "json", str(clip),
    ], text=True, timeout=15))["streams"]
    tracks = {item["codec_type"]: item for item in streams}
    if (not {"audio", "video"} <= tracks.keys() or tracks["video"]["r_frame_rate"] != "25/1"
        or any(abs(float(tracks[kind]["duration"]) - audio_seconds) > 0.12
               or abs(float(tracks[kind]["start_time"])) > 0.04 for kind in ("audio", "video"))):
        raise ValueError("SCRIPT_CLIP_AUDIO_VIDEO_ALIGNMENT")


def prepare_presentation(worker, base, key, response):
    """Render every clip before releasing the scheduled opening to the public."""
    output = worker["OUTPUT"]
    post = worker["post_json"]
    lease = {name: response[name] for name in ("drop_key", "lease_token")}
    ready = output / "ready"
    ready.mkdir(parents=True, exist_ok=True, mode=0o700)
    job = Path(tempfile.mkdtemp(prefix=f"script-{response['show_id']}-", dir=output))
    staged = []
    published = []
    try:
        phrases = [
            phrase
            for paragraph in response["script_text"].splitlines()
            for phrase in textwrap.wrap(paragraph, width=190, break_long_words=False, break_on_hyphens=False)
        ]
        if not phrases or len(phrases) > 160:
            raise ValueError("SCRIPT_SEGMENT_LIMIT")
        speech = []
        duration = 0
        for index, phrase in enumerate(phrases):
            part = job / f"part-{index:03d}"
            part.mkdir(mode=0o700)
            wav = part / "speech.wav"
            worker["synthesize_azure"](phrase, wav)
            with wave.open(str(wav), "rb") as source:
                if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (48000, 1, 2):
                    raise ValueError("SCRIPT_AUDIO_FORMAT")
                speech.append((wav, source.getnframes()))
        target_ms = response.get("presentation_target_ms")
        if target_ms:
            speech = fit_speech(speech, target_ms)
        for index, (wav, samples) in enumerate(speech):
            seconds = samples / 48000
            if not 0 < seconds <= 30:
                raise ScriptLengthError("Script clip is outside the supported duration")
            clip = worker["render_musetalk"](wav, wav.parent, render_fps=25)
            verify_clip(clip, seconds)
            duration += seconds
            print("SCRIPTED_CLIP_READY", index + 1, len(phrases), flush=True)
            staged.append((clip, {"scripted_show": response["show_id"], "drop_key": lease["drop_key"], "lease_token": lease["lease_token"],
                                  "question_id": None, "final_segment": index == len(phrases) - 1}))

        timing = post(base, "/api/odd-tv/worker/prepared", key, {
            **lease, "presentation_duration_ms": round(duration * 1000),
        })
        start = datetime.fromisoformat(timing["play_after"].replace("Z", "+00:00")).timestamp()
        expires = datetime.fromisoformat(timing["qna_start_at"].replace("Z", "+00:00")).timestamp() + 30
        for index, (clip, metadata) in enumerate(staged):
            target = ready / f"{job.name}-part-{index:03d}.ready.json"
            staging = job / target.name
            staging.write_text(json.dumps({
                **metadata, "video": str(clip.resolve()), "play_after": start,
                "lease_expires_at": expires,
            }))
            staging.chmod(0o600)
            staging.replace(target)
            published.append(target)
        try:
            post(base, "/api/odd-tv/worker/queued", key, lease)
        except Exception:
            print("SCRIPTED_QUEUE_RELEASE_FAILED", flush=True)
        print("SCRIPTED_PRESENTATION_READY", response["show_id"], len(phrases), flush=True)
    except Exception as error:
        for target in published:
            target.unlink(missing_ok=True)
        try:
            post(base, "/api/odd-tv/worker/ack", key, {**lease, "aired": False,
                 "script_preparation_failed": True,
                 "script_error": "script_length" if isinstance(error, ScriptLengthError) else "render_failed"})
        except Exception:
            print("SCRIPTED_LEASE_RELEASE_FAILED", flush=True)
        raise


def active_scripted_show(show_id, environ):
    import urllib.request

    base = environ["ODD_LIVE_API_BASE"].rstrip("/")
    if not base.startswith("https://"):
        raise ValueError("SCRIPTED_CONTROL_REQUIRES_HTTPS")
    request = urllib.request.Request(
        base + "/api/odd-tv/worker/control", data=b"{}", method="POST",
        headers={"Content-Type": "application/json", "X-ODD-Worker-Key": environ["ODD_LIVE_WORKER_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=5) as connection:
        state = json.load(connection)
    return state.get("desired_state") == "running" and state.get("show_id") == show_id


def install():
    home = Path.home() / "odd-ai-humans"
    root = home / "gpu-worker"
    path = root / "odd_live_host_worker.py"
    program = root / "odd_live_program.py"
    module = root / "odd_live_scripted.py"
    renderer = home / "MuseTalk/scripts/odd_live_stream.py"
    source = path.read_text()
    play_source = program.read_text()
    render_source = renderer.read_text()
    marker = "from odd_live_scripted import prepare_presentation"
    if marker not in source:
        anchor = '    response=post_json(base,path,key,{"market":args.market})'
        if source.count(anchor) != 1:
            raise SystemExit("Unexpected Diana worker version. No files changed.")
        source = source.replace(anchor, '''    response=post_json(base,path,key,{"market":args.market,"scripted_presentation":True})
    if response.get("script_text"):
        from odd_live_scripted import prepare_presentation
        prepare_presentation(globals(),base,key,response)
        return''', 1)
    if '"scripted_render_version":2' not in source:
        anchor = '"scripted_presentation":True}'
        render_job = '"audio_path": str(audio.resolve()),'
        signature = 'def render_musetalk(audio, jobdir, timeout_seconds=300):'
        answer = 'video=render_musetalk(audio,partdir)'
        if any(source.count(item) != 1 for item in (anchor, render_job, signature, answer)):
            raise SystemExit("Unexpected Diana render worker version. No files changed.")
        source = source.replace(anchor, '"scripted_presentation":True,"scripted_render_version":2}', 1)
        source = source.replace(signature, 'def render_musetalk(audio, jobdir, timeout_seconds=300, *, render_fps=None):', 1)
        source = source.replace(render_job, render_job+'\n            "render_fps": render_fps,', 1)
        source = source.replace(answer, 'video=render_musetalk(audio,partdir,render_fps=25 if response.get("scripted_qna") else None)', 1)
    if 'request.get("render_fps")' not in render_source:
        anchor = 'encode_speech_clip(avatar, audio_path, generated_clip, args.fps)'
        if render_source.count(anchor) != 1:
            raise SystemExit("Expected Diana’s direct-encode MuseTalk renderer. No files changed.")
        render_source = render_source.replace(anchor, '''render_fps = request.get("render_fps")
                    if render_fps is not None and render_fps != 25:
                        raise ValueError("UNSUPPORTED_RENDER_FPS")
                    encode_speech_clip(avatar, audio_path, generated_clip, render_fps or args.fps)''', 1)
    qna_tag = '                "scripted_qna":response.get("scripted_qna") is True,\n'
    if qna_tag not in source:
        anchor = '                "final_segment":index==len(phrases)-1,\n'
        if source.count(anchor) != 1:
            raise SystemExit("Expected Diana's segmented worker. No files changed.")
        source = source.replace(anchor, anchor + qna_tag, 1)
    marker = 'if info.get("final_segment", True) and (args.ack_delivered or info.get("scripted_show") or info.get("scripted_qna")):'
    old_ack = 'if args.ack_delivered:'
    if marker not in play_source:
        if play_source.count(old_ack) != 1:
            raise SystemExit("Unexpected Diana player version. No files changed.")
        play_source = play_source.replace(old_ack, marker, 1)
    marker = 'from odd_live_scripted import active_scripted_show'
    if marker not in play_source:
        anchor = '            video=Path(info["video"]).resolve(strict=True)'
        if play_source.count(anchor) != 1:
            raise SystemExit("Unexpected Diana playlist reader. No files changed.")
        play_source = play_source.replace(anchor, '''            if info.get("scripted_show"):
                if time.time()+7<float(info.get("play_after",0)):
                    continue
                from odd_live_scripted import active_scripted_show
                try:
                    active=active_scripted_show(info["scripted_show"],os.environ)
                except (OSError, ValueError, KeyError):
                    continue
                if not active:
                    path.rename(path.with_suffix(".expired"))
                    continue
            video=Path(info["video"]).resolve(strict=True)''', 1)
    if 'prepared=decoded_jobs.get_nowait() if current is None else None' not in play_source:
        old_take = 'prepared=decoded_jobs.get_nowait()'
        old_poll = 'if current is None and time.monotonic()>=next_job_check:'
        if play_source.count(old_take) != 1 or play_source.count(old_poll) != 1:
            raise SystemExit("Unexpected Diana clip buffer. No files changed.")
        play_source = play_source.replace(old_take, old_take + ' if current is None else None', 1)
        play_source = play_source.replace(old_poll, 'if decoded_jobs.empty() and time.monotonic()>=next_job_check:', 1)
    changes = [(module, Path(__file__).read_text()), (renderer, render_source), (program, play_source), (path, source)]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    for target, code in changes:
        compile(code, str(target), "exec")
    for target, code in changes:
        if target.exists():
            shutil.copy2(target, target.with_name(f"{target.name}.scripted-{stamp}.bak"))
        with tempfile.NamedTemporaryFile(mode="w", dir=root, delete=False) as temp:
            temp.write(code)
        temporary = Path(temp.name)
        try:
            if target.exists():
                shutil.copymode(target, temporary)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    print("DIANA_SCRIPTED_TV_READY")


if __name__ == "__main__":
    install()

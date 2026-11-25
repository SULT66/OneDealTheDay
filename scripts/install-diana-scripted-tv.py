"""Install prepared ODD Live TV playback into Diana's existing host worker."""
from datetime import datetime
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap


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
        if not phrases or len(phrases) > 40:
            raise ValueError("SCRIPT_SEGMENT_LIMIT")
        duration = 0
        for index, phrase in enumerate(phrases):
            part = job / f"part-{index:03d}"
            part.mkdir(mode=0o700)
            wav = part / "speech.wav"
            worker["synthesize_azure"](phrase, wav)
            clip = worker["render_musetalk"](wav, part)
            seconds = float(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(clip),
            ], text=True, timeout=15))
            if not 0 < seconds <= 30:
                raise ValueError("SCRIPT_CLIP_DURATION")
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
    except Exception:
        for target in published:
            target.unlink(missing_ok=True)
        try:
            post(base, "/api/odd-tv/worker/ack", key, {**lease, "aired": False, "script_preparation_failed": True})
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
    root = Path.home() / "odd-ai-humans/gpu-worker"
    path = root / "odd_live_host_worker.py"
    program = root / "odd_live_program.py"
    module = root / "odd_live_scripted.py"
    source = path.read_text()
    play_source = program.read_text()
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
    changes = [(module, Path(__file__).read_text()), (program, play_source), (path, source)]
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

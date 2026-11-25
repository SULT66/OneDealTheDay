"""Use MuseTalk's frame callback to encode speech clips without temporary PNGs."""
from datetime import datetime
from pathlib import Path
import shutil

path = Path.home() / "odd-ai-humans/MuseTalk/scripts/odd_live_stream.py"
source = path.read_text()
if "DAEMON_DIRECT_ENCODE_V1" in source:
    print("DIRECT_RENDER_ALREADY_SET")
    raise SystemExit(0)

anchor = '                    avatar.inference(audio_path, job_id, args.fps, False)\n'
insert = '\n@torch.no_grad()\nclass Avatar:'
if source.count(anchor) != 1 or source.count(insert) != 1:
    raise SystemExit("VERSION_MISMATCH: no files changed")

encoder = '''
# DAEMON_DIRECT_ENCODE_V1
def encode_speech_clip(avatar, audio_path, output_path, fps):
    """Encode BGR frames as MuseTalk produces them and mux the original WAV."""
    import subprocess

    process = None
    geometry = None
    frame_count = 0
    temporary = output_path + ".encoding.mp4"

    def write_frame(frame, _audio_slice):
        nonlocal process, geometry, frame_count
        height, width, channels = frame.shape
        if channels != 3 or str(frame.dtype) != "uint8":
            raise ValueError("UNEXPECTED_MUSETALK_FRAME_FORMAT")
        if process is None:
            geometry = (width, height)
            process = subprocess.Popen([
                "ffmpeg", "-y", "-nostdin", "-v", "error",
                "-f", "rawvideo", "-pixel_format", "bgr24",
                "-video_size", f"{width}x{height}", "-framerate", str(fps),
                "-i", "pipe:0", "-i", audio_path,
                "-map", "0:v:0", "-map", "1:a:0",
                "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                "-c:v", "libx264", "-preset", "ultrafast", "-threads:v", "2",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", temporary,
            ], stdin=subprocess.PIPE)
        if geometry != (width, height):
            raise ValueError("MUSETALK_FRAME_SIZE_CHANGED")
        process.stdin.write(frame.tobytes())
        frame_count += 1

    start = time.perf_counter()
    try:
        avatar.inference_stream(audio_path, fps, write_frame)
        if not frame_count:
            raise RuntimeError("MUSETALK_NO_FRAMES_TO_ENCODE")
        process.stdin.close()
        if process.wait(timeout=30):
            raise RuntimeError("DIRECT_CLIP_ENCODER_FAILED")
        os.replace(temporary, output_path)
        print("MUSETALK_DIRECT_ENCODE", frame_count, "frames",
              round(time.perf_counter() - start, 3), "seconds", flush=True)
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
                process.wait()
            if not process.stdin.closed:
                try:
                    process.stdin.close()
                except BrokenPipeError:
                    pass
        if os.path.exists(temporary):
            os.unlink(temporary)

'''
updated = source.replace(insert, '\n' + encoder + insert, 1)
updated = updated.replace(anchor, (
    '                    generated_clip = os.path.join(avatar.video_out_path, job_id + ".mp4")\n'
    '                    encode_speech_clip(avatar, audio_path, generated_clip, args.fps)\n'
), 1)
compile(updated, str(path), "exec")
backup = path.with_name(path.name + datetime.now().strftime(".direct-%Y%m%d-%H%M%S.bak"))
shutil.copy2(path, backup)
temporary = path.with_name(path.name + ".direct.tmp")
try:
    temporary.write_text(updated)
    shutil.copymode(path, temporary)
    temporary.replace(path)
finally:
    temporary.unlink(missing_ok=True)
print("DIRECT_RENDER_SET")
print("Backup:", backup)

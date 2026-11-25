"""Install the continuous source-video fallback on the Diana broadcaster."""
from datetime import datetime
from pathlib import Path
import shutil

root = Path.home() / "odd-ai-humans"
path = root / "gpu-worker/odd_live_program.py"
video = root / "assets/chloe/musetalk/OneDailyDrop_host_90s_seamless.mp4"
source = path.read_text()
if "CHLOE_SOURCE_LOOP_V1" in source:
    print("CHLOE_SOURCE_LOOP_ALREADY_SET")
    raise SystemExit(0)
if not video.is_file() or not video.stat().st_size:
    raise SystemExit(f"Chloe source video missing: {video}")

def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise SystemExit("VERSION_MISMATCH: no files changed")
    source = source.replace(old, new, 1)

replace_once(
    "def write_all(fd, data):",
    '''# CHLOE_SOURCE_LOOP_V1
class ChloeSourceLoop:
    """Read the assembled Chloe source at the broadcaster frame rate."""

    def __init__(self, path):
        self.capture = cv2.VideoCapture(str(path))
        self.source_fps = self.capture.get(cv2.CAP_PROP_FPS)
        if not self.capture.isOpened() or not 0 < self.source_fps <= 240:
            self.capture.release()
            raise RuntimeError(f"CHLOE_SOURCE_VIDEO_UNREADABLE: {path}")
        self.step = self.source_fps / FPS
        self.position = 0.0
        self.frame = self.read()

    def read(self):
        ok, frame = self.capture.read()
        if not ok:
            self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self.capture.read()
        if not ok:
            raise RuntimeError("CHLOE_SOURCE_VIDEO_READ_FAILED")
        return frame

    def next(self):
        frame = self.frame
        self.position += self.step
        while self.position >= 1:
            self.frame = self.read()
            self.position -= 1
        return frame

    def close(self):
        self.capture.release()


def write_all(fd, data):''',
)
begin = source.index('    images=sorted(IDLE.glob("*.png"))')
end = source.index('    process,video_fd,audio_fd=launch_ffmpeg', begin)
source = source[:begin] + '''    width,height=1280,720
    source_video = ROOT / "assets/chloe/musetalk/OneDailyDrop_host_90s_seamless.mp4"
    source_loop = ChloeSourceLoop(source_video)
    print("CHLOE_SOURCE_LOOP_READY", source_video.name, flush=True)
''' + source[end:]
begin = source.index('    audio_thread.start()') + len('    audio_thread.start()\n')
end = source.index('    next_tick=time.monotonic()', begin)
source = source[:begin] + '''    current=None
    frame_count=0
    speech_started=False
''' + source[end:]
replace_once(
    '            can_play=(current is not None and not entry_pending and\n',
    '            can_play=(current is not None and\n',
)
begin = source.index('            else:\n                now=time.monotonic()\n')
end = source.index('                segment=b"\\0"*AUDIO_BYTES_PER_FRAME', begin)
source = source[:begin] + '''            else:
                frame=landscape_frame(source_loop.next(),width,height)
''' + source[end:]
replace_once('    finally:\n        try:video_queue.put', '    finally:\n        source_loop.close()\n        try:video_queue.put')
if 'HOST_LOOKAHEAD_V1' not in source:
    replace_once('                prepared=decoded_jobs.get_nowait()',
                 '                prepared=decoded_jobs.get_nowait() if current is None else None')
    replace_once('            if current is None and time.monotonic()>=next_job_check:',
                 '            if decoded_jobs.empty() and time.monotonic()>=next_job_check:')

compile(source, str(path), "exec")
backup = path.with_name(path.name + datetime.now().strftime(".source-%Y%m%d-%H%M%S.bak"))
shutil.copy2(path, backup)
temp = path.with_name(path.name + ".moving.tmp")
try:
    temp.write_text(source)
    shutil.copymode(path, temp)
    temp.replace(path)
finally:
    temp.unlink(missing_ok=True)
print("CHLOE_SOURCE_LOOP_SET")
print("Backup:", backup)

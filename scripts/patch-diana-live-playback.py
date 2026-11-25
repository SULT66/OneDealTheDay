from pathlib import Path
from datetime import datetime
import shutil

path = Path.home() / "odd-ai-humans/gpu-worker/odd_live_program.py"
source = path.read_text()
if "HOST_LOOKAHEAD_V1" in source:
    print("SMOOTH_PLAYBACK_ALREADY_SET")
    raise SystemExit

def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise SystemExit("VERSION_MISMATCH: no changes written")
    source = source.replace(old, new, 1)

replace_once(
    '            try:\n                prepared=decoded_jobs.get_nowait()',
    '            # HOST_LOOKAHEAD_V1: consume the next clip only after the current one finishes.\n'
    '            try:\n                prepared=decoded_jobs.get_nowait() if current is None else None',
)
replace_once(
    '            if current is None and time.monotonic()>=next_job_check:',
    '            if decoded_jobs.empty() and time.monotonic()>=next_job_check:',
)
replace_once(
    '    idle_idx=0\n',
    '    idle_cycle_started=time.monotonic()\n',
)
replace_once(
    '                    # Hold a single idle frame while the GPU renders the next\n'
    '                    # spoken turn; never replay extracted source-video frames.\n'
    '                    frame=first',
    '                    # Use a gentle camera move while the next voiced clip renders.\n'
    '                    phase=(time.monotonic()-idle_cycle_started)*math.tau/12\n'
    '                    inset=round(4*(1-math.cos(phase)))\n'
    '                    frame=(cv2.resize(first[inset:height-inset,inset:width-inset],\n'
    '                                      (width,height)) if inset else first)',
)
compile(source, str(path), "exec")
backup = path.with_name(path.name + datetime.now().strftime(".%Y%m%d-%H%M%S.bak"))
shutil.copy2(path, backup)
temp = path.with_name(path.name + ".smooth.tmp")
try:
    temp.write_text(source)
    shutil.copymode(path, temp)
    temp.replace(path)
finally:
    temp.unlink(missing_ok=True)
print("SMOOTH_PLAYBACK_SET")
print("Backup:", backup)

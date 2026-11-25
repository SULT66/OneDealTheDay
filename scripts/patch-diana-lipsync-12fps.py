"""Configure Diana to render lip sync at 12 FPS and hand off 25 FPS clips."""
from datetime import datetime
from pathlib import Path
import shutil
import tempfile

root = Path.home() / "odd-ai-humans"
supervisor = root / "gpu-worker/odd_live_supervisor.py"
renderer = root / "MuseTalk/scripts/odd_live_stream.py"
changes = [
    (supervisor,
     '"--version", "v15", "--fps", "25", "--batch_size", "4",',
     '"--version", "v15", "--fps", "12", "--batch_size", "8",'),
    (renderer,
     '"-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",',
     '"-vf", "fps=25,pad=ceil(iw/2)*2:ceil(ih/2)*2",'),
]
if "DAEMON_DIRECT_ENCODE_V1" not in renderer.read_text():
    raise SystemExit("Expected the direct-encode renderer. No files changed.")

pending = []
for path, old, new in changes:
    source = path.read_text()
    if source.count(new) == 1 and old not in source:
        continue
    if source.count(old) != 1 or new in source:
        raise SystemExit(f"Unexpected version of {path}. No files changed.")
    updated = source.replace(old, new, 1)
    compile(updated, str(path), "exec")
    pending.append((path, updated))

stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
backups = {}
staged = {}
installed = []
try:
    for path, updated in pending:
        backup = path.with_name(path.name + f".fps-{stamp}.bak")
        shutil.copy2(path, backup)
        backups[path] = backup
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as handle:
            staged[path] = Path(handle.name)
            handle.write(updated)
        shutil.copymode(path, staged[path])
    for path, temporary in staged.items():
        temporary.replace(path)
        installed.append(path)
except BaseException:
    for path in reversed(installed):
        shutil.copy2(backups[path], path)
    raise
finally:
    for temporary in staged.values():
        temporary.unlink(missing_ok=True)

print("LIPSYNC_12FPS_SET" if pending else "LIPSYNC_12FPS_ALREADY_SET")
for backup in backups.values():
    print(f"Backup: {backup}")

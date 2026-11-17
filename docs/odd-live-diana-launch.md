# ODD Live TV — Diana workstation test

ODD Live TV is a self-hosted, one-hour show. The admin selects **exactly two** published products, 30 minutes each, with optional talking points. This is separate from the old Live Drop presenter flow.

## What the pilot does

- Plays the configured entrance motion once, then uses idle motion while the speech worker prepares clips.
- Presents product 1 for minutes 0–30 and product 2 for minutes 30–60.
- Opens question preparation windows at minutes 3–8, 12–17, 21–26, 33–38, 42–47, and 51–56. Each spoken answer may include up to three queued questions; overflow waits for the next slot.
- Creates each Azure Speech + MuseTalk response during the show. The full hour is not pre-rendered, so GPU/render delays can still cause gaps.
- Shows the viewer chat, product, LIVE timer, viewer count, expand/fullscreen, and mini-player in the public experience.

The admin notes are guidance for generated narration, not a word-for-word timed script. Browser audio and lip-sync must be checked on a real client before calling the pilot successful.

## Diana-only files

Use the existing WSL2 Ubuntu installation, Conda environment `odd-ai-test`, MuseTalk v1.5, MediaMTX, and RTX 5070 Ti. Do not overwrite the MuseTalk fork. The worker discovers an existing local avatar unless `ODD_LIVE_AVATAR_SOURCE` and `ODD_LIVE_AVATAR_ID` explicitly select one.

Credentials stay only on Diana:

- `~/.config/odd-live/worker.env`: `ODD_LIVE_API_BASE=https://www.onedailydrop.com`, `ODD_LIVE_WORKER_KEY`, and optional `ODD_LIVE_ACK_DELIVERED=0`.
- `~/.config/odd-live/speech.env`: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; permissions must be `chmod 600`.
- Voice defaults to `en-US-SaraNeural`; set `ODD_LIVE_VOICE` only if you have verified that voice on the workstation.

Do not paste credentials into chat or commit them.

## Test sequence

1. Confirm `python -m py_compile gpu-worker/odd_live_host_worker.py gpu-worker/odd_live_program.py gpu-worker/odd_live_supervisor.py` passes.
2. Start the supervisor on Diana. It starts MediaMTX, the host worker, and the broadcaster when the backend controller is set to running.
3. Create a two-product test show from the ODD Live TV admin and wait for its scheduled start. Do not create a second show while one is active.
4. Check local ingest with `ffprobe` and confirm **both H.264 and AAC**. This confirms RTSP tracks only; it does not prove the public player can play audio.
5. Open the public live page in Chrome, unmute the player, and confirm continuous audible speech, synchronized lips, and a viewer question answered at an expected Q&A window.
6. Only after the public audio check succeeds, set `ODD_LIVE_ACK_DELIVERED=1` in the private worker config and restart the supervisor. This lets the broadcaster mark a queued response delivered after it sends the clip into RTSP. It still cannot confirm what a remote browser heard.

To stop, use the admin **Stop stream** control or stop the supervisor with Ctrl+C. The viewer player and the GPU publisher are separate checks.

## Limits before production

- A real Diana GPU smoke test and public browser audio test are required. CI cannot validate CUDA, Azure Speech credentials, MuseTalk timing, or external HLS audio.
- The first pilot is a rehearsal; keep `ODD_LIVE_ACK_DELIVERED=0` until the audible browser check succeeds.
- RTSP on `127.0.0.1:8554` is local ingest. The storefront must reach MediaMTX through the configured public HTTPS viewer endpoint; a local RTSP probe alone is insufficient.
- Measure end-to-end delay, audio level, A/V sync, and recovery after a rendered speech clip before starting an unattended show.

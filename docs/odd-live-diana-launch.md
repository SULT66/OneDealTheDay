# ODD Live / Diana — staged installation and acceptance

ODD Live TV is an **independent** 60-minute channel on the OneDailyDrop backend. Existing 10-minute Live Drop and its Tavus host remain unchanged.

## Current implementation

- `src/oddTvChannel.js`: draft/start/stop a show, 8–10 published products with merchant diversification, time-based rotation (60 minutes), separate moderated/rate-limited question queue.
- `src/oddLiveBrain.js`: grounded response prompt and fallback that cannot fabricate unknown price or stock.
- `src/oddLiveQueue.js`: single-lease producer handshake; question not marked `sent` until affirmative broadcast acknowledgement.
- `gpu-worker/odd_live_chloe_worker.py`: processes one queued viewer question, generates Azure Speech + a MuseTalk v1.5 lip-synced MP4; `--watch` supervises repeated checks.
- `gpu-worker/odd_live_program.py`: keeps a local RTSP H.264/AAC stream, switches to lip-synced answers, and can play occasional short motion MP4s between answers.
- `components/live/ODDLiveTvExperience.tsx`: shows current on-air product, merchant link, shared chat below the **external HTTPS viewer embed**.

## Separate service feature flags

All default to **OFF**:
- `ODD_TV_ENABLED=true`: create TV tables + read/chat/show scheduling routes.
- `ODD_LIVE_WORKER_ENABLED=true` and `ODD_LIVE_WORKER_KEY=<strong random secret>`: allow authenticated GPU worker routes.
- `OPENAI_API_KEY=<server-side secret>`: enable live grounded language responses; without it, safe fallback speech.
- `ODD_LIVE_AI_MODEL`: optional model selection.
- `ODD_LIVE_EMBED_URL=https://...`: public *viewer* endpoint, NOT the RTSP ingest URL and NOT `localhost`.
- `ODD_LIVE_AI_PREVIEW=true`: optional **admin-only** old Live Drop rehearsal endpoint; unrelated to hourly TV.

All worker keys, Azure Speech credentials and model tokens belong in secure server-side environment variables. Never expose them to browser JS or a public repository.

### Show API (admin key)

- `POST /api/admin/odd-tv/show` with `X-Admin-Key`: `{"market":"us"}` automatically selects 8–10 eligible published products across merchants. For a hand-picked lineup, send exactly 8–10 published product IDs as `{"market":"us","product_ids":[101,202,...]}`. The storefront itself has no product-picker screen yet.
- `POST /api/admin/odd-tv/show/:id/start` starts a 60-minute show immediately.
- `POST /api/admin/odd-tv/show/:id/stop` ends it.

**Do not start a show until media and chat can be viewed by an external test browser.** Start/stop is not an OBS or GPU command.

### Public read/chat endpoints

- `GET /api/odd-tv/live?market=us`
- `GET /api/odd-tv/chat?market=us`
- `POST /api/odd-tv/chat` with `{"market":"us","text":"Does it have a timer?","session_id":"<anonymous token>"}`

### Diana, WSL2 staged rehearsal

Already installed: Ubuntu `odd-ai-test` Conda, RTX 5070 Ti, MuseTalk v1.5, prepared avatar `chloe_closeup_01`, MediaMTX local port 8554.

Copy only the Python files from the reviewed GitHub branch into `~/odd-ai-humans/gpu-worker`; do not overwrite the existing MuseTalk fork or the running `odd-live-main` controller. Use a **new** RTSP path `odd-live-smart`.

Required *Diana-only* environment:

```text
ODD_LIVE_API_BASE=https://<backend-host>
ODD_LIVE_WORKER_KEY=<same secret as backend>
ODD_LIVE_MODE=tv
AZURE_SPEECH_KEY=<existing Azure Speech secret>
AZURE_SPEECH_REGION=<region from Speech resource>
ODD_LIVE_VOICE=en-US-SaraNeural
```

On Diana, the worker also reads `~/.config/odd-live/speech.env` (`chmod 600`) for `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, without overriding explicit environment variables. That file has already been created on Diana. Do not commit or paste credentials. The selected default Sara voice uses `cheerful` style, subject to later user approval. The TV worker lease lasts 10 minutes to accommodate batched MuseTalk; do not enable unattended polling until timeout and failed-turn retry logic are tested.

1. First confirm `python -m py_compile gpu-worker/odd_live_chloe_worker.py gpu-worker/odd_live_program.py`.
2. In WSL start `python gpu-worker/odd_live_program.py` (local RTSP only; **no** `--ack-delivered`).
3. With a test show already started, run one turn with `python gpu-worker/odd_live_chloe_worker.py --once`. It builds one WAV+MP4 and writes an atomic `*.ready.json` handoff to the local program.
4. Confirm `rtsp://127.0.0.1:8554/odd-live-smart` displays lips and speaks the answer, and the ODD TV chat question is still **queued**, because public delivery is not yet proven.
5. Enable `--ack-delivered` only once end-to-end playback, reconnects, error handling and the authenticated HTTPS viewer/ingest relay are verified.



### Optional walk/gesture clips

Put short Chloe motion videos in `~/odd-ai-humans/assets/chloe/motions/` on Diana. Use 16:9 clips with Chloe's approved appearance, clothes, and studio; 5–10 seconds, 10–60 fps, MP4. Audio is ignored. The broadcaster scales them to the stream size and plays one every 50 seconds while no answer is being spoken. File names sort alphabetically, so number them (for example `01-walk-to-table.mp4`, `02-turn-and-present.mp4`, `03-walk-back.mp4`). Keep the walk clips silent or treat their sound as discarded; spoken answers still use the MuseTalk lip-sync path.

## Operational safety / next gates

**Do not merge / publish before:**

- GitHub unit/integration test suite + Python `py_compile` passes.
- GPU smoke test with actual Azure Speech and MuseTalk succeeds on Diana.
- Tune encoding FPS, AV sync, lip/face realism and latency on a real client device.
- Configure public HTTPS delivery (e.g., LL-HLS/WebRTC relay), access restrictions, health probes and TLS; RTSP `127.0.0.1` is **local only**.
- Separate GPU role, Azure API, affiliate-click and hosted media spend is measured against $200/month operational ceiling.
- Add a persistent turn/outbox log or DB-based delivery state before enabling unattended production; an in-memory lease alone cannot guarantee exactly-once across process restart.
- Control AI replies to avoid repetitive filler; make sure show-product rotation does not split a spoken sentence.

**Known MVP limitations:** the RTSP compositor is a proof-of-concept, not a public broadcaster; one turn uses batched MuseTalk, not zero-latency real-time video. The scheduled show is automatic; autonomous repeated polling requires a supervised runner and robust stop conditions. Automated final audio delivery acknowledgement is not yet production-safe.

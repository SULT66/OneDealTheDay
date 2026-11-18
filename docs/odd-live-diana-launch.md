# ODD Live TV — Diana workstation test

ODD Live TV is a self-hosted, one-hour show. The admin selects two published products, 30 minutes each, then starts or stops the show. The host creates fresh narration from verified product listing details; there is no script field.

## What the pilot does

- Uses the Diana WSL2 machine and RTX 5070 Ti to publish a continuous live feed.
- Presents product 1 for minutes 0–30 and product 2 for minutes 30–60.
- Generates speech locally through Ollama and renders matching lip-sync with MuseTalk during the show.
- Answers questions from OneDailyDrop chat on the next available host turn.
- Does not loop prerecorded idle-motion MP4s. The broadcaster holds the avatar idle frame while the next spoken segment is rendered.
- Shows the live player, current product, chat, show timer, and viewer count on the public experience.

The browser player starts muted so autoplay works reliably. Viewers enable sound with the player’s “Turn on live sound” control. Verify lip-sync and audible browser playback before calling the pilot successful.

## Diana-only files

Use the existing WSL2 Ubuntu installation, Conda environment `odd-ai-test`, MuseTalk v1.5, MediaMTX, and RTX 5070 Ti. Do not overwrite the MuseTalk fork. The worker discovers an existing local avatar unless `ODD_LIVE_AVATAR_SOURCE` and `ODD_LIVE_AVATAR_ID` explicitly select one.

Credentials stay only on Diana:

- `~/.config/odd-live/worker.env`: `ODD_LIVE_API_BASE=https://www.onedailydrop.com` and `ODD_LIVE_WORKER_KEY`.
- `~/.config/odd-live/llm.env`: local Ollama base URL and model name; the worker uses `/api/chat` with thinking disabled.
- `~/.config/odd-live/speech.env`: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; permissions must be `chmod 600`.
- Voice defaults to `en-US-SaraNeural`; set `ODD_LIVE_VOICE` only if you have verified that voice on the workstation.

Do not paste credentials into chat or commit them.

## Test sequence

1. Confirm the Python files compile in the `odd-ai-test` environment.
2. Start the supervisor on Diana. It starts MediaMTX, the host worker, and the broadcaster when the admin control is set to running.
3. Create a two-product show from ODD Live TV admin and start it. The live stream begins after its opening turn is rendered.
4. Check local ingest for H.264 and AAC.
5. Open the public live page, enable sound, submit a viewer question, and confirm the host answers it in a generated lip-synced segment.
6. Only after browser playback succeeds, set `ODD_LIVE_ACK_DELIVERED=1` in the private worker config and restart the supervisor.

To stop, use the admin “Stop stream” control or stop the supervisor with Ctrl+C.

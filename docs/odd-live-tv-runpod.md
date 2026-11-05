# ODD Live TV RunPod handoff

This branch adds a separate ODD Live TV viewer at `/tv/` and a no-store status API. It does not change the existing `/:market/live` Live Drop.

## Runtime settings

Set these App Service settings only after a verified HLS publisher is available:

- `ODD_LIVE_ONLINE=true` to show the LIVE badge.
- `ODD_LIVE_HLS_URL=https://…/index.m3u8` — public HTTPS HLS playback URL. This value is returned to viewers; never put an ingest credential or signed secret in it.
- `ODD_LIVE_TITLE=ODD Live TV` — optional show title.
- `ODD_LIVE_PRODUCT_IDS=123,456` — optional ordered product IDs; the viewer reads product details and prices from `/api/products`.

The viewer checks `/api/odd-live-tv/status` every five seconds and uses hls.js for HLS playback in browsers such as Chrome. The HLS host must allow browser access from OneDailyDrop (CORS) and must publish continuously with current audio/video.

## Not a running stream yet

MuseTalk currently produces files and does not publish HLS itself. This viewer will remain OFF AIR until the real-time worker and authenticated publisher are deployed, the HLS URL is configured, and the production build is deployed. Do not set `ODD_LIVE_ONLINE` before confirming that viewers can watch both live video and audio.

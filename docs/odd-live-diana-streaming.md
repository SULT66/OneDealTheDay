# ODD Live — Diana GPU → OneDailyDrop /live

## Why this integration is safe

The storefront already supports `stream_embed_url` on a scheduled Live Drop. The
`BroadcastStage` component prioritizes that iframe over Tavus. It also already
has a product panel, price board, chat and visitor tracking. Keep these intact.

This change introduces an optional **standalone** channel player when there is
no active scheduled drop. It is disabled unless the server-side environment
variable `ODD_LIVE_EMBED_URL` points at an HTTPS embeddable WebRTC player.

No video goes through the Next.js or Express application. No GPU model or
publisher credential belongs in the storefront repo. No changes are made to the
running site until configuration is added and this PR is deployed.

## Signal flow

1. On **Diana**, the RTX 5070 Ti runs MuseTalk 1.5 (face animation) and speech
   generation. The accelerated demo is not yet a validated live ingest pipeline:
   add a frame/audio producer, synchronization, encoder, and stream reconnect.
2. Publish video and audio from Diana to a **dedicated streaming ingress**
   (for example, MediaMTX using WebRTC WHIP, SRT or RTMP, with a secure ingest).
   Use a server that can fan out the stream to multiple watchers. The storefront
   must never connect viewers directly to Diana.
3. Expose a TLS-protected, **read-only embeddable player** with WebRTC playback
   for low latency. A MediaMTX WebRTC read page can be embedded in an iframe
   behind a reverse proxy. HTTPS is required for production.
4. Set `ODD_LIVE_EMBED_URL=https://<your-stream-domain>/<read-path>` in the
   storefront **server** environment for the standalone TV slot.
5. For a scheduled drop, configure that drop's existing `stream_embed_url`
   to the same read-only player URL. That drop's stage then owns the stream,
   product visuals, checkout links and chat.

## Existing behavior and limitations

- The standalone player appears on `/[market]/live` when the initial
  server-rendered drop is not `waiting` or `live`.
- Active drops continue to display their existing LiveDropPanel and
  BroadcastStage. If the drop has `stream_embed_url`, it takes precedence
  over Tavus; if not, existing fallbacks remain.
- A drop can change state after SSR without a page navigation. Before launch,
  test the transition from standalone TV to an active drop and decide whether
  to share one persistent player rather than displaying two players.
- The channel iframe does not yet synchronize the current product with the
  Dora/Chloe chat or source video. Build signed control messages and product
  selectors on the backend before calling it interactive.
- The site does not manage stream health, failover or online status yet. Do not
  claim that a stream is live just because a URL is configured.
- Secure the public read endpoint, rate limit it where appropriate, configure
  allowed embedding origins, TLS and TURN/STUN as needed. Keep WHIP/RTMP
  publish secrets and room administrator tokens on the ingest server only.
- Test multiple concurrent viewers, audio autoplay gestures, mobile Safari and
  Chrome, return-to-shop navigation, end-to-end latency and CDN/bandwidth cost.
- The next GPU benchmark must measure **encoder + WebRTC** output, not only
  MuseTalk inference without saving frames.

## Rollout checklist

1. Prepare an authenticated streaming ingress and public read-only player.
2. Publish a short live test from Diana; confirm timestamps, continuous audio,
   browser playback and reconnect behavior on two different devices.
3. Configure `ODD_LIVE_EMBED_URL` in staging only and deploy.
4. Check `/us/live` when no drop is scheduled, with DevTools network checks.
5. Configure `stream_embed_url` on one test drop and verify pricing and
   affiliate attribution remain correct.
6. Only after approval: enable production configuration.

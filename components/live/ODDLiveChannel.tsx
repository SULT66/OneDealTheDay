/**
 * Optional always-on ODD Live channel outside scheduled product drops.
 *
 * The ingest/transcoding server is intentionally separate from the storefront.
 * Only a public HTTPS player URL is configured here, never a publishing key.
 * During an active drop the existing LiveDropPanel owns the stage so product
 * pricing, checkout links, viewer presence and host fallbacks remain intact.
 */
export function ODDLiveChannel({ embedUrl }: { embedUrl?: string }) {
  if (!embedUrl) return null;

  let playerUrl: string;
  try {
    const parsed = new URL(embedUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    playerUrl = parsed.toString();
  } catch {
    return null;
  }

  return (
    <section aria-label="ODD Live TV" className="mx-auto w-full max-w-5xl px-3 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#061224] text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-lg font-black tracking-tight sm:text-xl">ODD Live TV</h2>
            <p className="text-xs text-white/65">AI shopping television — watch products as they are presented</p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold">Shopping TV</span>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={playerUrl}
            title="ODD Live shopping television stream"
            loading="eager"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}

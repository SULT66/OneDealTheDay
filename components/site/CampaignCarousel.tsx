"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";

export type CampaignSlide = {
  key: string;
  eyebrow: string;
  title: string;
  note: string;
  cta: string;
  href: string;
  /** Background photograph, when the campaign has one. */
  image?: string;
  imagePosition?: string;
  /** Flat colour behind the photograph, and the whole background without one. */
  ground: string;
  /** Accent for the eyebrow and the button. */
  accent: string;
  accentText: string;
  eyebrowText: string;
  dots: string;
};

/*
 * The home hero, rotating when more than one campaign has something to say.
 *
 * Every slide is in the markup from the first paint — hidden siblings carry
 * aria-hidden and inert rather than being mounted later — so the server sends
 * a complete hero, the photographs are fetched before their turn comes, and
 * the height never jumps between slides of different lengths.
 *
 * Rotation stops while a pointer is over the hero or a keyboard focus is
 * inside it: a person reading or reaching for the button should not have it
 * replaced under them. It never starts at all when the visitor has asked for
 * reduced motion, and the dots still work in that case.
 */
export function CampaignCarousel({ slides, intervalMs = 6000, label }: { slides: CampaignSlide[]; intervalMs?: number; label: string }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (slides.length < 2 || held) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motion?.matches) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % slides.length), intervalMs);
    return () => window.clearInterval(timer);
  }, [slides.length, intervalMs, held]);

  /* A slide that scrolled away mid-rotation should not keep its turn running
     in a tab nobody is looking at. */
  useEffect(() => {
    const onVisibility = () => setHeld(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const current = slides[Math.min(index, slides.length - 1)];

  return <div
    ref={region}
    role="region"
    aria-label={label}
    aria-roledescription={slides.length > 1 ? "carousel" : undefined}
    onMouseEnter={() => setHeld(true)}
    onMouseLeave={() => setHeld(false)}
    onFocusCapture={() => setHeld(true)}
    onBlurCapture={event => { if (!region.current?.contains(event.relatedTarget as Node)) setHeld(false); }}
    className="relative isolate overflow-hidden rounded-card text-white"
    style={{ backgroundColor: current.ground }}
  >
    {/* The grid stacks every slide in one cell, so the hero is as tall as its
        tallest slide and nothing reflows when the turn changes. */}
    <div className="grid">
      {slides.map((slide, position) => {
        const shown = position === index;
        /* Every slide is in the document, so only one of them may be the
           page's heading. The first one keeps that job whichever slide is on
           screen: a heading that changed every six seconds would be a heading
           no crawler and no screen reader could rely on. */
        const Heading = position === 0 ? "h1" : "p";
        return <div
          key={slide.key}
          aria-hidden={shown ? undefined : "true"}
          {...(shown ? {} : { inert: "" as unknown as boolean })}
          className={`col-start-1 row-start-1 transition-opacity duration-700 motion-reduce:transition-none ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {slide.image && <div aria-hidden="true" className="absolute inset-0 bg-cover bg-no-repeat" style={{ backgroundImage: `url("${slide.image}")`, backgroundPosition: slide.imagePosition || "center 65%" }} />}
          <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, ${slide.ground}f2, ${slide.ground}99, transparent)` }} />
          <div className="relative max-w-3xl px-5 py-6 sm:px-8 lg:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: slide.eyebrowText }}>{slide.eyebrow}</p>
            <Heading id={position === 0 ? "hero-title" : undefined} className="mt-2 whitespace-pre-line text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl">{slide.title}</Heading>
            <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
              <p className="max-w-md text-sm leading-relaxed text-white/80">{slide.note}</p>
              <a href={slide.href} tabIndex={shown ? undefined : -1} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-90" style={{ backgroundColor: slide.accent, color: slide.accentText }}>
                {slide.cta}<ArrowRight size={18} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>;
      })}
    </div>

    {slides.length > 1 && <div className="absolute bottom-3 right-5 flex gap-2 sm:bottom-4 sm:right-6">
      {slides.map((slide, position) => <button
        key={slide.key}
        type="button"
        onClick={() => setIndex(position)}
        aria-label={slide.eyebrow}
        aria-current={position === index ? "true" : undefined}
        className="h-2.5 rounded-full transition-all"
        style={{ width: position === index ? 26 : 10, backgroundColor: position === index ? current.dots : "rgba(255,255,255,0.45)" }}
      />)}
    </div>}
  </div>;
}

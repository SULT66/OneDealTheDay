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
  textColor?: string;
  highlight?: boolean;
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
    className="relative isolate overflow-hidden rounded-card"
    style={{ backgroundColor: current.ground, color:current.textColor || "#fff" }}
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
          <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, ${slide.ground}, ${slide.ground}d9 35%, ${slide.ground}00 75%)` }} />
          <div className="relative max-w-xl px-5 pb-20 pt-7 sm:px-8 sm:pt-9 lg:px-10 lg:pt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: slide.eyebrowText }}>{slide.eyebrow}</p>
            <Heading id={position === 0 ? "hero-title" : undefined} className="mt-3 whitespace-pre-line text-4xl font-black uppercase leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl" style={{fontFamily:'Impact, "Arial Black", sans-serif'}}>{slide.title.split("\n").map((line,i)=><span key={i} className="block"><span className={slide.highlight && i===1 ? "inline-block bg-[#c1f21d] px-2 pb-1 text-[#101010]" : ""}>{line}</span></span>)}</Heading>
            <div className="mt-4 flex flex-col items-start gap-4">
              <p className="max-w-xs text-sm font-medium leading-relaxed">{slide.note}</p>
              <a href={slide.href} tabIndex={shown ? undefined : -1} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-90" style={{ backgroundColor: slide.accent, color: slide.accentText }}>
                {slide.cta}<ArrowRight size={18} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>;
      })}
    </div>

    {slides.length > 1 && <div className="absolute bottom-3 left-5 right-5 flex gap-1 sm:bottom-4 sm:left-8 sm:right-auto">
      {slides.map((slide, position) => <button
        key={slide.key}
        type="button"
        onClick={() => setIndex(position)}
        aria-label={slide.eyebrow}
        aria-current={position === index ? "true" : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full border px-2 sm:flex-none sm:px-3 text-[10px] font-bold uppercase tracking-wide transition-all"
        style={{ color:current.textColor || "#fff", borderColor:current.textColor ? "#10101035" : "#ffffff55", backgroundColor: position === index ? current.dots : "transparent" }}
      >{slide.eyebrow.split(" · ")[0]}</button>)}
    </div>}
  </div>;
}

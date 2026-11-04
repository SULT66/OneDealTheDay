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
  imageOnRight?: boolean;
  fullSlideLink?: boolean;
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
          {...(shown ? {} : { inert: true })}
          className={`relative isolate col-start-1 row-start-1 transition-opacity duration-700 motion-reduce:transition-none ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {slide.imageOnRight && <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[70%] bg-[#c1f21d] sm:w-[55%]" style={{ clipPath: "polygon(28% 0, 100% 0, 100% 100%, 0 100%, 4% 82%, 10% 73%, 9% 59%, 17% 45%, 16% 33%, 25% 17%)" }} />}
          {slide.image && <div aria-hidden="true"
            className={`absolute bg-cover bg-no-repeat ${slide.imageOnRight ? "inset-y-0 right-0 w-[66%] sm:w-[51%]" : "inset-0"}`}
            style={{
              backgroundImage: `url("${slide.image}")`,
              backgroundPosition: slide.imagePosition || "center 65%",
              clipPath: slide.imageOnRight ? "polygon(30% 0, 100% 0, 100% 100%, 1% 100%, 7% 83%, 12% 71%, 11% 60%, 20% 43%, 19% 31%, 27% 15%)" : undefined,
            }} />}
          <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, ${slide.ground}, ${slide.ground}d9 35%, ${slide.ground}00 75%)` }} />
          {slide.fullSlideLink && <a aria-hidden="true" tabIndex={-1} href={slide.href} className="absolute inset-0" />}
          <div className={`relative max-w-xl px-5 pb-36 pt-7 sm:px-8 sm:pb-28 sm:pt-9 lg:px-10 lg:pt-10 ${slide.fullSlideLink ? "pointer-events-none" : ""}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: slide.eyebrowText }}>{slide.eyebrow}</p>
            <Heading id={position === 0 ? "hero-title" : undefined} className="mt-3 whitespace-pre-line text-4xl font-black uppercase leading-[1.04] tracking-[0.01em] sm:text-5xl lg:text-6xl" style={{fontFamily:'"Arial Black", "Helvetica Neue", Arial, sans-serif'}}>{slide.title.split("\n").map((line,i)=><span key={i} className="block"><span className={slide.highlight && i===1 ? "inline-block bg-[#c1f21d] px-2 pb-1 text-[#101010]" : ""}>{line}</span></span>)}</Heading>
            <div className="mt-4 flex flex-col items-start gap-4">
              <p className="max-w-xs text-sm font-medium leading-relaxed">{slide.note}</p>
              <a href={slide.href} tabIndex={shown ? undefined : -1} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-90 ${shown && slide.fullSlideLink ? "pointer-events-auto" : ""}`} style={{ backgroundColor: slide.accent, color: slide.accentText }}>
                {slide.cta}<ArrowRight size={18} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>;
      })}
      {/* Tabs sit ON the slide artwork, not in a detached footer. Every slide
          reserves space for two rows of touch-sized buttons on narrow phones. */}
      {slides.length > 1 && <div aria-label="Campaign slides" className="relative z-20 col-start-1 row-start-1 self-end grid grid-cols-2 gap-2 px-5 pb-5 sm:flex sm:flex-wrap sm:px-8 sm:pb-6 lg:px-10">
      {slides.map((slide, position) => <button
        key={slide.key}
        type="button"
        onClick={() => setIndex(position)}
        aria-label={slide.eyebrow}
        aria-current={position === index ? "true" : undefined}
        className="flex min-h-11 min-w-0 items-center justify-center rounded-full border px-3 py-2 text-center text-[11px] font-bold uppercase leading-tight tracking-[0.01em] shadow-sm backdrop-blur-sm transition-colors hover:border-[#101010] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#101010]"
        style={{ color: "#101010", borderColor: position === index ? "#101010" : "#10101045", backgroundColor: position === index ? "#c1f21d" : "#fffffff0" }}
      >{slide.eyebrow.split(" · ")[0]}</button>)}
      </div>}
    </div>
  </div>;
}

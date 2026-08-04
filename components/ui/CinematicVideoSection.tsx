"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScrollScrubVideo } from "@/hooks/usescrollscrubvideo";

gsap.registerPlugin(ScrollTrigger);

const ctaBase =
  "inline-flex items-center justify-center px-10 py-4 text-xs font-medium uppercase tracking-[0.3em] transition-colors duration-300";

interface CinematicVideoSectionProps {
  videoSrc: string;
  poster?: string;
  eyebrow: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
  align?: "left" | "center" | "right";
  /** Chapter marker, e.g. "02" — only pass this when the sections genuinely read as a numbered sequence. */
  index?: string;
}

/**
 * A full-viewport section that pins while its background video is scrubbed
 * by scroll position (see useScrollScrubVideo) — the same family of
 * technique (pin + scroll-synced video + parallax + masked reveal) used on
 * the GTA VI site. Intended to be dropped in directly after <HeroSection />
 * so multiple instances chain into one continuous cinematic sequence: each
 * section pins, plays out its clip against the scroll, then hands off to
 * the next as the reader keeps scrolling.
 *
 * Visual language (type scale, tracking, button styles, neutral-950/white
 * palette) intentionally matches HeroSection/VideoHero so this reads as a
 * continuation of the hero, not a new section style.
 */
export function CinematicVideoSection({
  videoSrc,
  poster,
  eyebrow,
  title,
  description,
  cta,
  align = "center",
  index,
}: CinematicVideoSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Pins the section and syncs `videoSrc` playback to scroll progress.
  useScrollScrubVideo({
    videoRef,
    triggerRef: sectionRef,
    reduced,
    scrollDistance: "+=130%",
  });

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const mask = maskRef.current;
    if (reduced || !section || !content || !mask) return;

    gsap.set(mask, { clipPath: "inset(14% 14% 14% 14% round 4px)" });
    gsap.set(content, { y: 60, opacity: 0 });

    // Phase 1 — approach: as the section scrolls into view (before it pins),
    // the frame opens via clip-path and the copy rises in.
    const reveal = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 85%",
        end: "top 30%",
        scrub: 1,
      },
    });
    reveal
      .to(mask, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "power2.out" }, 0)
      .to(content, { y: 0, opacity: 1, ease: "power2.out" }, 0);

    // Phase 2 — pinned: a slow parallax drift on the copy for the length of
    // the pin, so the text keeps moving at a different rate than the footage.
    const parallax = gsap.to(content, {
      yPercent: -8,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "+=130%",
        scrub: 0.6,
      },
    });

    return () => {
      reveal.scrollTrigger?.kill();
      parallax.scrollTrigger?.kill();
      ScrollTrigger.getAll().forEach((st) => {
        if (st.vars.trigger === section) st.kill();
      });
    };
  }, [reduced]);

  const alignClass =
    align === "left"
      ? "items-start text-left"
      : align === "right"
        ? "items-end text-right"
        : "items-center text-center";

  return (
    <section
      ref={sectionRef}
      className="relative h-dvh w-full overflow-hidden bg-neutral-950"
    >
      <div ref={maskRef} className="absolute inset-0 will-change-[clip-path]">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          poster={poster}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/50" />
      </div>

      <div
        className={`relative z-10 flex h-full w-full flex-col justify-center px-6 ${alignClass}`}
      >
        <div ref={contentRef} className="max-w-2xl will-change-transform">
          <div className="mb-5 flex items-center justify-center gap-3 text-white/70">
            {index && (
              <span className="text-xs font-light tracking-[0.3em]">{index}</span>
            )}
            <p className="text-xs font-light uppercase tracking-[0.3em]">{eyebrow}</p>
          </div>
          <h2 className="text-4xl font-light tracking-tight text-white sm:text-6xl md:text-7xl">
            {title}
          </h2>
          {description && (
            <p className="mx-auto mt-6 max-w-md text-sm font-light leading-relaxed text-white/70 sm:text-base">
              {description}
            </p>
          )}
          {cta && (
            <a
              href={cta.href}
              className={`${ctaBase} mt-10 border border-white/40 text-white hover:border-white hover:bg-white/10`}
            >
              {cta.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
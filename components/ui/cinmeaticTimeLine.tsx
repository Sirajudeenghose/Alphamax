"use client";

import { useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";
import {
  useCinematicTimeline,
  type CinematicClip,
  type CinematicSlide,
} from "@/hooks/useCinmeaticTimeLine";

const ctaBase =
  "inline-flex items-center justify-center px-10 py-4 text-xs font-medium uppercase tracking-[0.3em] transition-colors duration-300";

/**
 * Two source files stitched into one virtual timeline. `start`/`end` are in
 * seconds on that shared timeline, NOT the file's own internal timecode —
 * clip 2's `start` is where the handoff happens, so its own playback begins
 * at (virtualTime - start) internally.
 *
 * Adjust these to match your actual footage length (ffprobe / video
 * properties panel) — the numbers below follow the example timeline as
 * given: 0–12s from VIDEO 2.mp4, 12–22s from VIDEO 3.mp4.
 */
const CLIPS: CinematicClip[] = [
  { src: "/videos/VIDEO 2 - scrub.mp4", start: 0, end: 12 },
  { src: "/videos/VIDEO 3 - scrub.mp4", start: 12, end: 22 },
];

const SLIDES: (CinematicSlide & {
  eyebrow?: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
  align?: "left" | "center" | "right";
})[] = [
  {
    id: "section-2",
    start: 0,
    end: 4,
    eyebrow: "Chapter One",
    title: "Arrival",
    description: "The estate reveals itself, one frame at a time.",
    align: "center",
  },
  {
    id: "section-3",
    start: 4,
    end: 8,
    eyebrow: "Chapter Two",
    title: "The Grounds",
    description: "One hundred and twenty acres, shaped for celebration.",
    align: "left",
  },
  {
    id: "section-4",
    start: 8,
    end: 12,
    eyebrow: "Chapter Three",
    title: "Golden Hour",
    description: "Where the light does half the work.",
    cta: { label: "Explore the Venue", href: "#venue" },
    align: "right",
  },
  {
    id: "section-5",
    start: 12,
    end: 17,
    eyebrow: "Chapter Four",
    title: "The Evening",
    description: "Chandelier-lit gardens, alive until dawn.",
    align: "center",
  },
  {
    id: "section-6",
    start: 17,
    end: 22,
    eyebrow: "Chapter Five",
    title: "Begin Your Story",
    description: "Every love story deserves a beautiful beginning.",
    cta: { label: "Book Your Date", href: "#contact" },
    align: "center",
  },
];

const TOTAL_DURATION = CLIPS[CLIPS.length - 1].end;

/** How much scroll (in viewport-heights) each virtual second of the
 *  timeline consumes. Higher = slower, more deliberate scrub. */
const VH_PER_SECOND = 22;

export function CinematicTimeline() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const slideElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const reduced = useReducedMotion();

  useCinematicTimeline({
    wrapperRef,
    videoRefs: [video1Ref, video2Ref],
    clips: CLIPS,
    slides: SLIDES,
    slideElsRef,
    reduced,
  });

  const alignClass = (align: "left" | "center" | "right" = "center") =>
    align === "left"
      ? "items-start text-left"
      : align === "right"
        ? "items-end text-right"
        : "items-center text-center";

  if (reduced) {
    // Accessible, non-scroll-jacked fallback: plain stacked sections, each
    // showing its clip paused on frame one, full-opacity copy, normal flow.
    return (
      <>
        {SLIDES.map((slide) => (
          <section
            key={slide.id}
            id={slide.id}
            className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-neutral-950 px-6"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/50" />
            <div className={`relative z-10 flex max-w-2xl flex-col ${alignClass(slide.align)}`}>
              {slide.eyebrow && (
                <p className="mb-5 text-xs font-light uppercase tracking-[0.3em] text-white/70">
                  {slide.eyebrow}
                </p>
              )}
              <h2 className="text-4xl font-light tracking-tight text-white sm:text-6xl md:text-7xl">
                {slide.title}
              </h2>
              {slide.description && (
                <p className="mt-6 max-w-md text-sm font-light leading-relaxed text-white/70 sm:text-base">
                  {slide.description}
                </p>
              )}
              {slide.cta && (
                <a
                  href={slide.cta.href}
                  className={`${ctaBase} mt-10 border border-white/40 text-white hover:border-white hover:bg-white/10`}
                >
                  {slide.cta.label}
                </a>
              )}
            </div>
          </section>
        ))}
      </>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative w-full"
      style={{ height: `${TOTAL_DURATION * VH_PER_SECOND}vh` }}
    >
      {/* Pinned stage — GSAP pins this to the viewport for the whole
          wrapper height above, so the video never resizes/jumps between
          sections; only opacity + currentTime change underneath it. */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-neutral-950">
        <video
          ref={video1Ref}
          className="absolute inset-0 h-full w-full object-cover will-change-[opacity]"
          src={CLIPS[0].src}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          style={{ opacity: 1 }}
        />
        <video
          ref={video2Ref}
          className="absolute inset-0 h-full w-full object-cover will-change-[opacity]"
          src={CLIPS[1].src}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          style={{ opacity: 0 }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/50" />

        {SLIDES.map((slide, i) => (
          <div
            key={slide.id}
            id={slide.id}
            ref={(el) => {
              slideElsRef.current[i] = el;
            }}
            className={`pointer-events-none absolute inset-0 z-10 flex flex-col justify-center px-6 will-change-transform ${alignClass(slide.align)}`}
            style={{ opacity: i === 0 ? 1 : 0 }}
          >
            <div className="mx-auto max-w-2xl">
              {slide.eyebrow && (
                <p className="mb-5 text-xs font-light uppercase tracking-[0.3em] text-white/70">
                  {slide.eyebrow}
                </p>
              )}
              <h2 className="text-4xl font-light tracking-tight text-white sm:text-6xl md:text-7xl">
                {slide.title}
              </h2>
              {slide.description && (
                <p className="mt-6 max-w-md text-sm font-light leading-relaxed text-white/70 sm:text-base">
                  {slide.description}
                </p>
              )}
              {slide.cta && (
                <a
                  href={slide.cta.href}
                  className={`${ctaBase} mt-10 border border-white/40 text-white hover:border-white hover:bg-white/10`}
                  style={{ pointerEvents: "auto" }}
                >
                  {slide.cta.label}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
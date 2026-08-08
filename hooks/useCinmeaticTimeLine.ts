"use client";

import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export interface CinematicClip {
  src: string;
  /** Where this clip starts on the shared virtual timeline, in seconds. */
  start: number;
  /** Where this clip ends on the shared virtual timeline, in seconds. */
  end: number;
}

export interface CinematicSlide {
  id: string;
  start: number;
  end: number;
}

interface UseCinematicTimelineOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  videoRefs: RefObject<HTMLVideoElement | null>[];
  clips: CinematicClip[];
  slides: CinematicSlide[];
  slideElsRef: RefObject<(HTMLDivElement | null)[]>;
  reduced: boolean;
  /** Crossfade half-width, in virtual seconds, around each clip boundary. */
  crossfadeWindow?: number;
  /** How many virtual seconds a slide's copy takes to fade in/out on either side of [start, end]. */
  slideFadeMargin?: number;
  /** Minimum currentTime delta before a seek is issued — raise this on
   *  devices with slower decoders (mobile) to cut redundant seeks; the
   *  visual difference below ~0.08s is imperceptible during scroll. */
  seekThreshold?: number;
}

const blobUrlCache = new Map<string, string>();

async function toBlobUrl(src: string) {
  const cached = blobUrlCache.get(src);
  if (cached) return cached;
  try {
    const res = await fetch(src, { cache: "force-cache" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(src, url);
    return url;
  } catch {
    return src;
  }
}

/**
 * Drives a single continuous scroll-scrubbed "cinematic" timeline that spans
 * multiple <video> clips and multiple full-viewport text slides, all pinned
 * to one shared scroll range (the GTA VI technique).
 *
 * - Exactly one ScrollTrigger for the whole span (not one per section) so
 *   there's a single source of truth for progress and no pin hand-off jank.
 * - Video opacity/currentTime and slide opacity/y are all set via gsap.set
 *   (transform + opacity only) inside one onUpdate — cheap enough to run
 *   on every scroll tick without dropping frames.
 * - The clip boundary is crossfaded (both videos briefly overlaid) so there
 *   is never a black frame or a hard cut between the two source files.
 */
export function useCinematicTimeline({
  wrapperRef,
  videoRefs,
  clips,
  slides,
  slideElsRef,
  reduced,
  crossfadeWindow = 0.4,
  slideFadeMargin = 1,
  seekThreshold = 0.02,
}: UseCinematicTimelineOptions) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const videos = videoRefs.map((r) => r.current);
    if (!wrapper || videos.some((v) => !v)) return;

    const totalDuration = clips[clips.length - 1]?.end ?? 0;

    if (reduced) {
      // Accessible fallback: no pinning, no scroll-jacking. Park every clip
      // on its first frame (paused — it must never autoplay) and show every
      // slide's copy at rest so the page still reads top to bottom.
      videos.forEach((v) => {
        if (!v) return;
        v.pause();
        v.currentTime = 0;
      });
      slideElsRef.current.forEach((el) => {
        if (el) gsap.set(el, { opacity: 1, y: 0 });
      });
      return;
    }

    let cancelled = false;
    let trigger: ScrollTrigger | undefined;

    // Swap every clip onto a fully-downloaded blob URL so seeks never
    // trigger byte-range network requests mid-scrub (a fetch for each
    // keyframe is what makes mobile scrub look like a slideshow on first
    // visit), then unlock iOS/Safari — it refuses programmatic currentTime
    // seeks on a <video> that has never actually played. Prime with a muted
    // play → immediate pause before wiring up the scrub.
    const primeAll = async () => {
      for (const [i, v] of videos.entries()) {
        if (!v || cancelled) continue;
        v.muted = true;
        v.playsInline = true;
        try {
          const blobUrl = clips[i]?.src && (await toBlobUrl(clips[i].src));
          if (cancelled) return;
          if (blobUrl && v.getAttribute("src") !== blobUrl) {
            v.src = blobUrl;
            v.load();
          }
          await v.play();
          v.pause();
          v.currentTime = 0;
        } catch {
          // Autoplay blocked — scrubbing still works fine once the
          // ScrollTrigger starts driving currentTime directly.
        }
      }
    };

    // Batch seeks to at most one per compositor frame. An onUpdate that
    // writes v.currentTime directly can issue many seeks per frame during a
    // fast flick; each one forces a hardware-decoder flush/reset, so the
    // winner on mobile is to remember the newest target and apply it once
    // per rAF instead.
    let rafId = 0;
    const pendingSeek = new Array<number>(videos.length).fill(Number.NaN);

    const flushSeeks = () => {
      rafId = 0;
      pendingSeek.forEach((target, i) => {
        const v = videos[i];
        if (!v || !Number.isFinite(target)) return;
        if (
          Number.isFinite(v.duration) &&
          Math.abs(v.currentTime - target) > seekThreshold
        ) {
          v.currentTime = target;
        }
      });
      pendingSeek.fill(Number.NaN);
    };

    const requestSeek = (i: number, time: number) => {
      pendingSeek[i] = time;
      if (!rafId) {
        rafId = requestAnimationFrame(flushSeeks);
      }
    };

    const bind = () => {
      if (cancelled) return;

      trigger = ScrollTrigger.create({
        trigger: wrapper,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5,
        onUpdate: (self) => {
          const virtualTime = self.progress * totalDuration;

          // --- video clips: scrub + crossfade at the handoff ---
          clips.forEach((clip, i) => {
            const v = videos[i];
            if (!v) return;
            const clipDuration = clip.end - clip.start;
            const fadeInFrom = clip.start - crossfadeWindow;
            const fadeOutTo = clip.end + crossfadeWindow;

            if (virtualTime < fadeInFrom || virtualTime > fadeOutTo) {
              gsap.set(v, { opacity: 0 });
              return;
            }

            let opacity = 1;
            if (virtualTime < clip.start) {
              opacity = (virtualTime - fadeInFrom) / crossfadeWindow;
            } else if (virtualTime > clip.end) {
              opacity = 1 - (virtualTime - clip.end) / crossfadeWindow;
            }
            gsap.set(v, { opacity: Math.min(1, Math.max(0, opacity)) });

            const localTime = Math.min(
              Math.max(virtualTime - clip.start, 0),
              clipDuration
            );
            if (
              Number.isFinite(v.duration) &&
              Math.abs(v.currentTime - localTime) > seekThreshold
            ) {
              requestSeek(i, localTime);
            }
          });

          // --- text slides: fade + drift as each one's slot passes ---
          slides.forEach((slide, i) => {
            const el = slideElsRef.current[i];
            if (!el) return;
            const fadeInFrom = slide.start - slideFadeMargin;
            const fadeOutTo = slide.end + slideFadeMargin;

            let opacity = 0;
            let y = 24;
            if (virtualTime >= slide.start && virtualTime <= slide.end) {
              opacity = 1;
              y = 0;
            } else if (virtualTime > fadeInFrom && virtualTime < slide.start) {
              const t = (virtualTime - fadeInFrom) / slideFadeMargin;
              opacity = t;
              y = 24 * (1 - t);
            } else if (virtualTime > slide.end && virtualTime < fadeOutTo) {
              const t = (virtualTime - slide.end) / slideFadeMargin;
              opacity = 1 - t;
              y = -24 * t;
            }

            gsap.set(el, {
              opacity: Math.min(1, Math.max(0, opacity)),
              y,
              pointerEvents: opacity > 0.6 ? "auto" : "none",
            });
          });
        },
      });
    };

    primeAll().then(() => {
      if (!cancelled) bind();
    });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      trigger?.kill();
      ScrollTrigger.getAll().forEach((s) => {
        if (s.trigger === wrapper) s.kill();
      });
    };
    // slides/clips are expected to be stable module-level constants passed
    // in from the parent — if you make them dynamic, memoize them there.
  }, [wrapperRef, videoRefs, clips, slides, slideElsRef, reduced, crossfadeWindow, slideFadeMargin, seekThreshold]);
}
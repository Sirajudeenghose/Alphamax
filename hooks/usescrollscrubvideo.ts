"use client";

import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface UseScrollScrubVideoOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
  reduced: boolean;
  /** How much scroll distance the pin (and the video's full playthrough) spans. */
  scrollDistance?: string;
  pinSpacing?: boolean;
  onProgress?: (progress: number) => void;
}

/**
 * Pins `triggerRef` for `scrollDistance` of scroll and drives the video's
 * `currentTime` from the pin's scroll progress instead of letting it
 * autoplay/loop on its own. That's the specific technique behind the GTA VI
 * site's "footage plays *with* the scroll" feel — the video never runs on
 * its own clock, it runs on the reader's.
 *
 * Reduced-motion visitors get a normal autoplaying, looping video with no
 * pinning and no scroll-jacking.
 */
export function useScrollScrubVideo({
  videoRef,
  triggerRef,
  reduced,
  scrollDistance = "+=130%",
  pinSpacing = true,
  onProgress,
}: UseScrollScrubVideoOptions) {
  useEffect(() => {
    const video = videoRef.current;
    const trigger = triggerRef.current;
    if (!video || !trigger) return;

    if (reduced) {
      video.muted = true;
      video.loop = true;
      video.play().catch(() => {});
      return;
    }

    let cancelled = false;

    const bind = () => {
      if (cancelled) return;
      video.pause();

      ScrollTrigger.create({
        trigger,
        start: "top top",
        end: scrollDistance,
        scrub: 0.6,
        pin: true,
        pinSpacing,
        anticipatePin: 1,
        onUpdate: (self) => {
          const duration = video.duration;
          if (!duration) return;
          const target = self.progress * duration;
          // Ignore sub-frame deltas — avoids thrashing the video decoder
          // with a seek on every single scroll tick.
          if (Math.abs(video.currentTime - target) > 0.05) {
            video.currentTime = target;
          }
          onProgress?.(self.progress);
        },
      });
    };

    // Safari/iOS refuses programmatic currentTime seeks on a video that has
    // never actually played. Unlock it with a muted play → immediate pause
    // before wiring up the scrub, otherwise scrubbing silently no-ops on iOS.
    video.muted = true;
    video.playsInline = true;

    const primeAndBind = () => {
      const attempt = video.play();
      if (attempt && typeof attempt.then === "function") {
        attempt.then(() => {
          video.pause();
          bind();
        }).catch(bind);
      } else {
        bind();
      }
    };

    if (video.readyState >= 1) {
      primeAndBind();
    } else {
      video.addEventListener("loadedmetadata", primeAndBind, { once: true });
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", primeAndBind);
      ScrollTrigger.getAll().forEach((st) => {
        if (st.vars.trigger === trigger) st.kill();
      });
    };
  }, [videoRef, triggerRef, reduced, scrollDistance, pinSpacing, onProgress]);
}
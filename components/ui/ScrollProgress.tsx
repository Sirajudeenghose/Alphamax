"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const supportsScrollTimeline =
  typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");

export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || supportsScrollTimeline || !barRef.current) return;

    const trigger = ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        if (barRef.current) {
          gsap.set(barRef.current, { scaleX: self.progress });
        }
      },
    });

    return () => {
      trigger.kill();
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      ref={barRef}
      className="scroll-progress-bar fixed top-0 left-0 z-50 h-[2px] w-full origin-left scale-x-0"
      style={{ backgroundColor: "rgba(255,255,255,0.6)" }}
      role="progressbar"
      aria-label="Page scroll progress"
    />
  );
}

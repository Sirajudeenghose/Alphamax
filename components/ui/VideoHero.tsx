"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { gsap } from "gsap";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface VideoHeroProps {
  videoSrc: string;
  children: ReactNode;
  poster?: string;
  overlayOpacity?: number;
  wrapperRef?: RefObject<HTMLDivElement | null>;
}

export function VideoHero({
  videoSrc,
  children,
  poster,
  overlayOpacity = 0.55,
  wrapperRef,
}: VideoHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    if (reduced) {
      video.style.opacity = "1";
      overlay.style.opacity = String(overlayOpacity);
      return;
    }

    gsap.set(video, { scale: 1.06 });
    gsap.set(overlay, { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(overlay, { opacity: overlayOpacity, duration: 0.9, delay: 0.1 })
      .to(video, { scale: 1, duration: 2.4 }, "<");

    return () => {
      tl.kill();
    };
  }, [reduced, overlayOpacity]);

  return (
    <section className="relative h-dvh w-full overflow-hidden">
      <div ref={wrapperRef} className="absolute inset-0 will-change-transform">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-neutral-950"
        />
      </div>
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
    </section>
  );
}

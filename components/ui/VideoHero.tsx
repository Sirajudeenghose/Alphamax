"use client";

import { useRef, type ReactNode } from "react";

interface VideoHeroProps {
  videoSrc: string;
  children: ReactNode;
  poster?: string;
  overlayOpacity?: number;
}

export function VideoHero({ videoSrc, children, poster, overlayOpacity = 0.5 }: VideoHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section className="relative h-dvh w-full overflow-hidden">
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
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
    </section>
  );
}

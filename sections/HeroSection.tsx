"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { VideoHero } from "@/components/ui/VideoHero";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ChevronDown } from "lucide-react";

const VIDEO_PATH = "/videos/Wedding_venue_sunrise_floral_dec._202607301704.mp4";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (reduced || !container || !content || !indicator) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container,
        pin: true,
        start: "top top",
        end: "+=80%",
        scrub: 1.5,
      },
    });

    tl.to(content, { scale: 0.92, opacity: 0.6, ease: "power2.inOut" }, 0);
    tl.to(indicator, { opacity: 0, ease: "power2.out" }, 0);

    if (titleRef.current) {
      gsap.fromTo(
        titleRef.current,
        { y: 80, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.5, ease: "power3.out", delay: 0.5 }
      );
    }

    if (subtitleRef.current) {
      gsap.fromTo(
        subtitleRef.current,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: "power3.out", delay: 1 }
      );
    }

    gsap.to(indicator, {
      y: 10,
      repeat: -1,
      yoyo: true,
      duration: 1.5,
      ease: "power2.inOut",
      delay: 2,
    });

    return () => {
      ScrollTrigger.getAll().forEach((st) => {
        if (st.vars.trigger === container) st.kill();
      });
    };
  }, [reduced]);

  return (
    <div ref={containerRef}>
      <VideoHero videoSrc={VIDEO_PATH} overlayOpacity={0.45}>
        <div ref={contentRef} className="flex flex-col items-center text-center px-6 will-change-transform">
          <p
            ref={subtitleRef}
            className="mb-4 text-sm font-light tracking-[0.3em] uppercase text-white/70"
          >
            Where Every Moment Becomes a Masterpiece
          </p>
          <h1
            ref={titleRef}
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-light tracking-tight text-white"
          >
            Alphamax
          </h1>
          <div className="mt-2 h-px w-16 bg-white/40" />
        </div>
      </VideoHero>
      <div
        ref={indicatorRef}
        className="absolute bottom-10 left-1/2 z-20 -translate-x-1/2 text-white/50"
      >
        <ChevronDown className="h-8 w-8" aria-hidden="true" />
      </div>
    </div>
  );
}

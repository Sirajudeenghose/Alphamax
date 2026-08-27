"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { VideoHero } from "@/components/ui/VideoHero";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ChevronDown } from "lucide-react";

const VIDEO_PATH = "/videos/wedding-venue-hero.mp4";

const ctaBase =
  "inline-flex items-center justify-center px-10 py-4 text-xs font-medium uppercase tracking-[0.3em] transition-colors duration-300";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (reduced || !container || !wrapper || !content || !indicator) return;

    const mm = gsap.matchMedia();

    const bounceRef = { current: null as gsap.core.Tween | null };

    mm.add("(min-width: 768px)", () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top top",
          end: "bottom top",
          scrub: 1.5,
        },
      });

      tl.to(wrapper, { scale: 1.15, ease: "power1.inOut" }, 0)
        .to(content, { scale: 0.9, opacity: 0.2, ease: "power2.inOut" }, 0)
        .to(indicator, { opacity: 0, ease: "power2.out" }, 0);

      if (titleRef.current) {
        gsap.fromTo(
          titleRef.current,
          { y: 80, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.5, ease: "power3.out", delay: 0.6 }
        );
      }

      if (subtitleRef.current) {
        gsap.fromTo(
          subtitleRef.current,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.2, ease: "power3.out", delay: 0.9 }
        );
      }

      if (ctaRef.current) {
        gsap.fromTo(
          ctaRef.current,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.2, ease: "power3.out", delay: 1.3 }
        );
      }

      bounceRef.current = gsap.to(indicator, {
        y: 10,
        repeat: -1,
        yoyo: true,
        duration: 1.5,
        ease: "power2.inOut",
        delay: 2.2,
      });

      ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: "bottom top",
        onLeave: () => bounceRef.current?.pause(),
        onEnterBack: () => bounceRef.current?.resume(),
      });
    });

    mm.add("(max-width: 767px)", () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top top",
          end: "bottom top",
          scrub: 1.5,
        },
      });

      tl.to(content, { opacity: 0, ease: "power2.inOut" }, 0)
        .to(indicator, { opacity: 0, ease: "power2.out" }, 0);

      if (titleRef.current) {
        gsap.fromTo(
          titleRef.current,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 1, ease: "power3.out", delay: 0.4 }
        );
      }

      if (subtitleRef.current) {
        gsap.fromTo(
          subtitleRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.6 }
        );
      }

      if (ctaRef.current) {
        gsap.fromTo(
          ctaRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.9 }
        );
      }
    });

    return () => {
      mm.revert();
      bounceRef.current = null;
    };
  }, [reduced]);

  return (
    <div
      ref={containerRef}
      className="relative h-[180vh]"
      style={reduced ? { height: "100dvh" } : undefined}
    >
      <VideoHero
        videoSrc={VIDEO_PATH}
        poster="/images/wedding-venue-hero-poster.jpg"
        overlayOpacity={0.55}
        wrapperRef={wrapperRef}
        className={reduced ? undefined : "sticky top-0"}
      >
        <div
          ref={contentRef}
          className="flex flex-col items-center text-center px-6 will-change-transform"
        >
          <p
            ref={subtitleRef}
            className="mb-5 max-w-xs text-xs font-light uppercase tracking-[0.2em] text-white/70 sm:max-w-none sm:tracking-[0.3em] sm:text-sm"
          >
            Where Every Moment Becomes a Masterpiece
          </p>
          <h1
            ref={titleRef}
            className="text-5xl font-light tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl"
          >
            Alphamax
          </h1>
          <div className="mt-3 h-px w-16 bg-white/40" />
          <div
            ref={ctaRef}
            className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:gap-6"
          >
            <a
              href="#services"
              className={`${ctaBase} bg-white text-neutral-950 hover:bg-white/80`}
            >
              Explore the Venue
            </a>
            <a
              href="#contact"
              className={`${ctaBase} border border-white/40 text-white hover:border-white hover:bg-white/10`}
            >
              Book Your Date
            </a>
          </div>
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

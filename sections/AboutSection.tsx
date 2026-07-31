"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextReveal } from "@/components/ui/TextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";

export function AboutSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const line = lineRef.current;
    const body = bodyRef.current;
    if (reduced || !section || !line || !body) return;

    gsap.fromTo(
      line,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 1.5,
        ease: easing.premium,
        scrollTrigger: {
          trigger: section,
          start: "top 80%",
          toggleActions: "play none none reverse",
        },
      }
    );

    gsap.fromTo(
      body,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: easing.premium,
        scrollTrigger: {
          trigger: section,
          start: "top 75%",
          toggleActions: "play none none reverse",
        },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach((st) => {
        if (st.vars.trigger === section) st.kill();
      });
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-32"
    >
      <div className="mx-auto max-w-4xl text-center">
        <TextReveal
          text="Our Story"
          as="h2"
          className="mb-8 text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
        />
        <div
          ref={lineRef}
          className="mx-auto mb-10 h-px w-20 origin-left bg-amber-500/60"
        />
        <p
          ref={bodyRef}
          className="text-lg leading-relaxed text-neutral-400 sm:text-xl"
        >
          Nestled in the heart of nature&apos;s finest landscapes, Alphamax is
          more than a venue — it is a sanctuary for life&apos;s most cherished
          moments. From sun-drenched ceremonies beneath ancient oaks to
          candlelit receptions under a canopy of stars, every detail is crafted
          to transform your vision into an unforgettable reality.
        </p>
      </div>
    </section>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextReveal } from "@/components/ui/TextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";
import { ArrowRight } from "lucide-react";

export function ContactSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const btn = btnRef.current;
    if (reduced || !section || !btn) return;

    gsap.fromTo(
      btn,
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: easing.premium,
        delay: 0.3,
        scrollTrigger: {
          trigger: section,
          start: "top 80%",
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
      id="contact"
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-neutral-950 to-black px-6 py-32"
    >
      <div className="mx-auto max-w-3xl text-center">
        <TextReveal
          text="Begin Your Journey"
          as="h2"
          className="mb-6 text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
        />
        <p className="mb-12 text-lg text-neutral-500 sm:text-xl">
          Every love story deserves a beautiful beginning. Let us help you write
          yours.
        </p>
        <a
          ref={btnRef}
          href="#"
          className="group inline-flex items-center gap-3 border border-white/20 px-8 py-4 text-sm font-light tracking-[0.15em] uppercase text-white transition-all hover:border-amber-500/50 hover:text-amber-400"
          onClick={(e) => e.preventDefault()}
        >
          Inquire Now
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </a>
      </div>
    </section>
  );
}

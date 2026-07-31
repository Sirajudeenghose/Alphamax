"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextReveal } from "@/components/ui/TextReveal";
import { ParallaxSection } from "@/components/ui/ParallaxSection";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";
import { MapPin, Trees, Waves } from "lucide-react";

const details = [
  {
    icon: MapPin,
    label: "Location",
    value: "Tuscany, Italy",
  },
  {
    icon: Trees,
    label: "Estate",
    value: "120 Acres",
  },
  {
    icon: Waves,
    label: "Capacity",
    value: "Up to 300 Guests",
  },
];

export function VenueSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    if (reduced || !section || !content) return;

    gsap.fromTo(
      content,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: easing.premium,
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
    <ParallaxSection
      id="venue"
      className="min-h-screen bg-neutral-950 py-32"
      speed={0.15}
    >
      <div
        ref={contentRef}
        className="relative mx-auto max-w-6xl px-6"
      >
        <TextReveal
          text="The Venue"
          as="h2"
          className="mb-16 text-center text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
        />
        <div className="grid gap-10 sm:grid-cols-3">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex flex-col items-center text-center"
            >
              <detail.icon
                className="mb-4 h-6 w-6 text-amber-400/60"
                aria-hidden="true"
              />
              <span className="mb-2 text-sm font-medium tracking-[0.15em] uppercase text-neutral-500">
                {detail.label}
              </span>
              <span className="text-2xl font-light text-white">
                {detail.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ParallaxSection>
  );
}

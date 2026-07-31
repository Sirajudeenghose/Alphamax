"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";
import { Sparkles, Sun, Stars } from "lucide-react";

const features = [
  {
    icon: Sun,
    title: "Sunrise Ceremonies",
    description: "Exchange vows as golden light breaks across the horizon.",
  },
  {
    icon: Sparkles,
    title: "Artisan Curation",
    description: "World-class cuisine, floral design, and bespoke styling.",
  },
  {
    icon: Stars,
    title: "Evening Galas",
    description: "Celebrate under chandelier-lit gardens until dawn.",
  },
];

export function ExperienceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    const cardsContainer = cardsRef.current;
    if (reduced || !section || !heading || !cardsContainer) return;

    gsap.fromTo(
      heading,
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

    const cards = cardsContainer.querySelectorAll<HTMLElement>(".feature-card");
    if (cards.length > 0) {
      gsap.fromTo(
        cards,
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          stagger: 0.2,
          ease: easing.premium,
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }

    return () => {
      ScrollTrigger.getAll().forEach((st) => {
        if (st.vars.trigger === section) st.kill();
      });
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 px-6 py-32"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          ref={headingRef}
          className="mb-20 text-center text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
        >
          The Experience
        </h2>
        <div
          ref={cardsRef}
          className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              className="feature-card group rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 backdrop-blur-sm transition-colors hover:border-amber-500/30"
            >
              <feature.icon
                className="mb-6 h-6 w-6 text-amber-400/80"
                aria-hidden="true"
              />
              <h3 className="mb-3 text-xl font-light text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-500">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { easing } from "@/lib/helpers/animations";

interface TextRevealProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  stagger?: number;
}

export function TextReveal({ text, as: Tag = "p", className, stagger = 0.04 }: TextRevealProps) {
  const containerRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (reduced || !el) return;

    const words = el.querySelectorAll<HTMLSpanElement>(".word");

    gsap.fromTo(
      words,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        stagger,
        ease: easing.premium,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.vars.trigger === el && st.kill());
    };
  }, [reduced, stagger]);

  const words = text.split(" ");

  return (
    <Tag ref={containerRef as never} className={className} aria-label={text}>
      {reduced ? (
        text
      ) : (
        <>
          {words.map((word, i) => (
            <span key={i} className="word inline-block">
              {word}
              {i < words.length - 1 && "\u00A0"}
            </span>
          ))}
        </>
      )}
    </Tag>
  );
}

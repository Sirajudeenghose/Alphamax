"use client";

import { useEffect, useRef } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { HeroSection } from "@/sections/HeroSection";
import { CinematicTimeline } from "@/components/ui/cinmeaticTimeLine";
import { ContactSection } from "@/sections/ContactSection";

export default function Home() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Touch devices run native momentum scroll on the compositor thread,
    // which fights with the main-thread video-decode work happening in the
    // scrub's onUpdate — that fight is what shows up as jank on phones but
    // not on desktop. normalizeScroll replaces native scroll with a
    // transform-driven one GSAP fully controls, removing that contention.
    if (typeof window !== "undefined" && "ontouchstart" in window) {
      ScrollTrigger.normalizeScroll(true);
    }

    ScrollTrigger.refresh();

    const handleResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <main className="bg-black">
      <ScrollProgress />
      <HeroSection />
      <CinematicTimeline />
      <ContactSection />
    </main>
  );
}
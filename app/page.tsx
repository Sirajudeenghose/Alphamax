"use client";

import { useEffect, useRef } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { HeroSection } from "@/sections/HeroSection";
import { AboutSection } from "@/sections/AboutSection";
import { ExperienceSection } from "@/sections/ExperienceSection";
import { VenueSection } from "@/sections/VenueSection";
import { ContactSection } from "@/sections/ContactSection";

export default function Home() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    ScrollTrigger.refresh();

    const handleResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <main className="bg-black">
      <ScrollProgress />
      <HeroSection />
      <AboutSection />
      <ExperienceSection />
      <VenueSection />
      <ContactSection />
    </main>
  );
}

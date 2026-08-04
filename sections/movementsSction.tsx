"use client";

import { CinematicVideoSection } from "@/components/ui/CinematicVideoSection";

/**
 * Viewport 3 — the second chapter, and the point where the sequence hands
 * off to the rest of the landing page. Carries the "Book Your Date" CTA so
 * the same action from the hero reappears here, per the repeated-CTA
 * pattern in the PRD.
 */
export function MomentsSection() {
  return (
    <CinematicVideoSection
      videoSrc="/videos/signature-moment.mp4"
      poster="/images/signature-moment-poster.jpg"
      index="03"
      eyebrow="The Experience"
      title="Every Detail, Considered"
      description="From first walkthrough to last dance — one team, one vision, carried all the way through."
      cta={{ label: "Book Your Date", href: "#contact" }}
      align="center"
    />
  );
}
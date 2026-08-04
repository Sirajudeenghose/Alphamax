"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is at or below `breakpointPx` — used to pick a
 * mobile-aspect video source instead of the desktop 16:9 one. Matches the
 * same media-query pattern as useReducedMotion so it stays consistent with
 * the rest of the animation hooks.
 */
export function useIsMobile(breakpointPx = 768) {
  const query = `(max-width: ${breakpointPx - 1}px)`;

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return isMobile;
}
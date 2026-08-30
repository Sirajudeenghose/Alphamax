"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Feature detection (evaluated once at module scope) ──────────────────────

const supportsWebCodecs =
  typeof VideoDecoder !== "undefined" &&
  typeof EncodedVideoChunk !== "undefined";

const supportsOffscreenCanvas =
  typeof OffscreenCanvas !== "undefined";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClipSource {
  src: string;
  start: number;
  end: number;
}

interface UseWebCodecsTimelineOptions {
  clips: ClipSource[];
  reduced: boolean;
  isMobile: boolean;
}

interface UseWebCodecsTimelineReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Primary clip (index 0) is drawable — its first frame is decoded and the
   *  canvas can take over. Clip 1 still loads in the background and becomes
   *  drawable without gating this. */
  ready: boolean;
  requestFrame: (virtualTime: number) => void;
  failed: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWebCodecsTimeline({
  clips,
  reduced,
  isMobile,
}: UseWebCodecsTimelineOptions): UseWebCodecsTimelineReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const rafIdRef = useRef(0);
  const pendingTimeRef = useRef<number | null>(null);
  const initDoneRef = useRef(false);

  // Initialize: create Worker, size canvas, transfer OffscreenCanvas
  useEffect(() => {
    if (
      reduced ||
      !supportsWebCodecs ||
      !supportsOffscreenCanvas ||
      initDoneRef.current
    )
      return;
    initDoneRef.current = true;

    let cancelled = false;

    async function init() {
      try {
        const canvas = canvasRef.current;
        if (!canvas) {
          setFailed(true);
          return;
        }

        // Size canvas backing store with DPR (CSS layout handled by Tailwind classes)
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for perf
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);

        // Create Worker — webpack will bundle the module
        const worker = new Worker(
          new URL("../lib/webcodecs/timeline-worker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current = worker;

        // Set up message handlers
        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "ready") {
            // Progressive readiness: the worker posts {ready, index} as each
            // clip becomes drawable. `ready` flips true when the PRIMARY clip
            // (index 0) is ready — its first frame is decoded and painted, so
            // the canvas can take over immediately. Clip 1 is prepared in the
            // background and becomes drawable without gating the takeover.
            if (msg.index === 0) {
              setReady(true);
            }
          } else if (msg.type === "error") {
            console.error("WebCodecs Worker error:", msg.message);
            setFailed(true);
            worker.terminate();
            workerRef.current = null;
          }
        };

        worker.onerror = (err) => {
          console.error("WebCodecs Worker crashed:", err);
          setFailed(true);
          worker.terminate();
          workerRef.current = null;
        };

        // Transfer OffscreenCanvas to Worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage(
          {
            type: "init",
            clips: clips.map((c) => ({ src: c.src, start: c.start, end: c.end })),
            canvas: offscreen,
            width: Math.round(w * dpr),
            height: Math.round(h * dpr),
            isMobile,
          },
          [offscreen]
        );

        // Handle resize
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        const onResize = () => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (cancelled || !workerRef.current) return;
            const newW = window.innerWidth;
            const newH = window.innerHeight;
            const newDpr = Math.min(window.devicePixelRatio || 1, 2);
            // After transferControlToOffscreen, main thread no longer owns
            // the backing store — send resize message to Worker only.
            // CSS sizing is handled by Tailwind classes (absolute inset-0 h-full w-full).
            workerRef.current.postMessage({
              type: "resize",
              width: Math.round(newW * newDpr),
              height: Math.round(newH * newDpr),
            });
          }, 150);
        };
        window.addEventListener("resize", onResize);

        // Store cleanup refs
        return () => {
          window.removeEventListener("resize", onResize);
          if (resizeTimer) clearTimeout(resizeTimer);
        };
      } catch (err) {
        console.error("WebCodecs init failed:", err);
        setFailed(true);
      }
    }

    let cleanupResize: (() => void) | undefined;

    init().then((cleanup) => {
      if (cancelled) return;
      cleanupResize = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupResize?.();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      workerRef.current?.postMessage({ type: "destroy" });
      workerRef.current?.terminate();
      workerRef.current = null;
      initDoneRef.current = false;
      setReady(false);
    };
  }, [reduced, clips, isMobile]);

  // Public: request a frame (rAF-coalesced)
  const requestFrame = useCallback(
    (virtualTime: number) => {
      if (!ready || !workerRef.current) return;

      pendingTimeRef.current = virtualTime;

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          const t = pendingTimeRef.current;
          if (t !== null && workerRef.current) {
            workerRef.current.postMessage({ type: "seek", virtualTime: t });
          }
        });
      }
    },
    [ready]
  );

  return { canvasRef, ready, requestFrame, failed };
}

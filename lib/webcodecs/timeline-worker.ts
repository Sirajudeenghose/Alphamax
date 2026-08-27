/**
 * WebCodecs Timeline Worker
 *
 * Owns VideoDecoder, FrameCache, and OffscreenCanvas rendering.
 * Main thread sends virtualTime; this Worker decodes + draws.
 *
 * Message protocol (inbound):
 *   init   { type:'init', clips:[{src,start,end}], canvas:OffscreenCanvas, width, height }
 *   seek   { type:'seek', virtualTime:number }
 *   resize { type:'resize', width:number, height:number }
 *   destroy { type:'destroy' }
 *
 * Message protocol (outbound):
 *   ready  { type:'ready' }
 *   error  { type:'error', message:string }
 */

import { parseMp4, buildDecoderConfig, type ParsedMp4 } from "./mp4-parser";
import { FrameCache, computeAdaptiveCacheSize } from "./frame-cache";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClipSource {
  src: string;
  start: number;
  end: number;
}

interface InitMessage {
  type: "init";
  clips: ClipSource[];
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  isMobile: boolean;
}

interface SeekMessage {
  type: "seek";
  virtualTime: number;
}

interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

interface DestroyMessage {
  type: "destroy";
}

type InboundMessage = InitMessage | SeekMessage | ResizeMessage | DestroyMessage;

// ─── ClipDecoder ─────────────────────────────────────────────────────────────

class ClipDecoder {
  parsed: ParsedMp4 | null = null;
  private decoder: VideoDecoder | null = null;
  cache: FrameCache;
  private decoderConfig: VideoDecoderConfig | null = null;
  private disposed = false;
  private lastOutputIndex = -1;
  private queueSize = 0;
  private readonly MAX_QUEUE = 12;
  /** Called when a frame finishes decoding. Used to trigger redraws when
   *  a decode completes after the last drawFrame (stale-frame race). */
  onDecoded: ((frameIndex: number) => void) | null = null;

  constructor(cacheSize: number) {
    this.cache = new FrameCache(cacheSize);
  }

  async init(arrayBuffer: ArrayBuffer): Promise<void> {
    this.parsed = parseMp4(arrayBuffer);
    this.decoderConfig = buildDecoderConfig(this.parsed);
  }

  private makeOutputCallback(): (frame: VideoFrame) => void {
    return (frame) => {
      this.queueSize = Math.max(0, this.queueSize - 1);
      const idx = this.findFrameByTimestamp(frame.timestamp);
      if (idx >= 0) {
        this.cache.set(idx, frame);
        this.lastOutputIndex = idx;
        this.onDecoded?.(idx);
      } else {
        frame.close();
      }
    };
  }

  private makeErrorCallback(isRecovery = false): (e: DOMException) => void {
    return (e) => {
      console.error(
        isRecovery ? "VideoDecoder recovery failed:" : "VideoDecoder error:",
        e
      );
      this.queueSize = Math.max(0, this.queueSize - 1);
      if (!isRecovery) this.recoverDecoder();
    };
  }

  private ensureDecoder(): VideoDecoder {
    if (this.decoder) return this.decoder;
    if (!this.decoderConfig) throw new Error("Decoder not configured");

    this.decoder = new VideoDecoder({
      output: this.makeOutputCallback(),
      error: this.makeErrorCallback(),
    });

    this.decoder.configure(this.decoderConfig);
    return this.decoder;
  }

  private findFrameByTimestamp(timestamp: number): number {
    if (!this.parsed) return -1;
    const frames = this.parsed.frameIndex;
    // Binary search
    let lo = 0,
      hi = frames.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timestamp === timestamp) return frames[mid].index;
      if (frames[mid].timestamp < timestamp) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo < frames.length ? frames[lo].index : -1;
  }

  private recoverDecoder(): void {
    if (!this.decoderConfig) return;
    try {
      this.decoder?.close();
    } catch {}
    this.decoder = null;
    this.decoder = new VideoDecoder({
      output: this.makeOutputCallback(),
      error: this.makeErrorCallback(true),
    });
    this.decoder.configure(this.decoderConfig);
  }

  /**
   * Decode a specific frame by index with directional prefetch.
   * Skips backpressure when decoder queue is full.
   */
  decodeFrame(
    frameIndex: number,
    prefetchRadius: number,
    scrollDirection: number
  ): void {
    if (!this.parsed || this.disposed) return;

    const totalFrames = this.parsed.frameIndex.length;
    if (frameIndex < 0 || frameIndex >= totalFrames) return;

    // Build decode list: target first, then neighbors biased toward scroll direction
    const indices: number[] = [frameIndex];

    // Forward prefetch is prioritized when scrolling down
    for (let d = 1; d <= prefetchRadius; d++) {
      if (scrollDirection >= 0) {
        // Scrolling down: prioritize frames ahead
        if (frameIndex + d < totalFrames) indices.push(frameIndex + d);
        if (frameIndex - d >= 0) indices.push(frameIndex - d);
      } else {
        // Scrolling up: prioritize frames behind
        if (frameIndex - d >= 0) indices.push(frameIndex - d);
        if (frameIndex + d < totalFrames) indices.push(frameIndex + d);
      }
    }

    for (const idx of indices) {
      // Backpressure: don't queue more than MAX_QUEUE frames
      if (this.queueSize >= this.MAX_QUEUE) break;
      if (this.cache.has(idx) || this.cache.isDecoding(idx)) continue;

      const frameInfo = this.parsed.frameIndex[idx];
      this.cache.markDecoding(idx);
      this.queueSize++;

      try {
        const chunk = new EncodedVideoChunk({
          type: "key", // all-intra
          timestamp: frameInfo.timestamp,
          duration: frameInfo.duration,
          data: frameInfo.data,
        });
        this.ensureDecoder().decode(chunk);
      } catch (e) {
        console.warn("Decode failed for frame", idx, e);
        this.queueSize = Math.max(0, this.queueSize - 1);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {}
      this.decoder = null;
    }
    this.cache.clear();
    this.parsed = null;
    this.decoderConfig = null;
  }
}

// ─── Canvas drawing ──────────────────────────────────────────────────────────

function drawFrameToCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: VideoFrame,
  canvasW: number,
  canvasH: number
): void {
  const frameW = frame.displayWidth;
  const frameH = frame.displayHeight;
  const frameAspect = frameW / frameH;
  const canvasAspect = canvasW / canvasH;

  let sx = 0,
    sy = 0,
    sw = frameW,
    sh = frameH;

  if (frameAspect > canvasAspect) {
    sh = frameH;
    sw = frameH * canvasAspect;
    sx = (frameW - sw) / 2;
  } else {
    sw = frameW;
    sh = frameW / canvasAspect;
    sy = (frameH - sh) / 2;
  }

  ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
}

// ─── Crossfade ───────────────────────────────────────────────────────────────

function computeCrossfade(
  virtualTime: number,
  clip0Start: number,
  clip0End: number,
  clip1Start: number,
  clip1End: number,
  crossfadeWindow: number
): { opacity0: number; opacity1: number } {
  const fadeInFrom0 = clip0Start - crossfadeWindow;
  const fadeOutTo0 = clip0End + crossfadeWindow;
  const fadeInFrom1 = clip1Start - crossfadeWindow;
  const fadeOutTo1 = clip1End + crossfadeWindow;

  let opacity0 = 0;
  let opacity1 = 0;

  if (virtualTime >= fadeInFrom0 && virtualTime <= fadeOutTo0) {
    if (virtualTime < clip0Start) {
      opacity0 = (virtualTime - fadeInFrom0) / crossfadeWindow;
    } else if (virtualTime > clip0End) {
      opacity0 = 1 - (virtualTime - clip0End) / crossfadeWindow;
    } else {
      opacity0 = 1;
    }
  }

  if (virtualTime >= fadeInFrom1 && virtualTime <= fadeOutTo1) {
    if (virtualTime < clip1Start) {
      opacity1 = (virtualTime - fadeInFrom1) / crossfadeWindow;
    } else if (virtualTime > clip1End) {
      opacity1 = 1 - (virtualTime - clip1End) / crossfadeWindow;
    } else {
      opacity1 = 1;
    }
  }

  return {
    opacity0: Math.max(0, Math.min(1, opacity0)),
    opacity1: Math.max(0, Math.min(1, opacity1)),
  };
}

// ─── Worker state ────────────────────────────────────────────────────────────

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvasW = 0;
let canvasH = 0;
let decoders: ClipDecoder[] = [];
let clips: ClipSource[] = [];
let crossfadeWindow = 0.4;

// Latest virtualTime (coalesced — only the latest matters)
let pendingTime: number | null = null;
let rendering = false;

// Track last drawn frame indices per clip so we hold the last valid frame
let lastDrawnIdx = [-1, -1];
let lastVirtualTime = 0;

function drawFrame(virtualTime: number): void {
  if (!canvas || !ctx || decoders.length < 2) return;

  const clip0 = decoders[0];
  const clip1 = decoders[1];
  if (!clip0?.parsed || !clip1?.parsed) return;

  // Compute scroll direction for direction-aware prefetch
  const direction = virtualTime > lastVirtualTime ? 1 : virtualTime < lastVirtualTime ? -1 : 0;
  lastVirtualTime = virtualTime;

  const cf = computeCrossfade(
    virtualTime,
    clips[0].start,
    clips[0].end,
    clips[1].start,
    clips[1].end,
    crossfadeWindow
  );

  ctx.clearRect(0, 0, canvasW, canvasH);

  // Clip 0
  if (cf.opacity0 > 0) {
    const clip0Duration = clips[0].end - clips[0].start;
    const localTime0 = Math.max(
      0,
      Math.min(virtualTime - clips[0].start, clip0Duration)
    );
    const maxIdx0 = clip0.parsed.frameIndex.length - 1;
    const frameIdx0 = Math.min(Math.round(localTime0 * clip0.parsed.frameRate), maxIdx0);
    const frame0 = clip0.cache.get(frameIdx0);
    if (frame0) {
      ctx.globalAlpha = cf.opacity0;
      drawFrameToCanvas(ctx, frame0, canvasW, canvasH);
      lastDrawnIdx[0] = frameIdx0;
    } else if (lastDrawnIdx[0] >= 0) {
      // Hold last valid frame instead of showing blank
      const lastFrame0 = clip0.cache.get(lastDrawnIdx[0]);
      if (lastFrame0) {
        ctx.globalAlpha = cf.opacity0;
        drawFrameToCanvas(ctx, lastFrame0, canvasW, canvasH);
      }
      // Request decode for the missing frame
      clip0.decodeFrame(frameIdx0, 3, direction);
    } else {
      clip0.decodeFrame(frameIdx0, 6, direction);
    }
  }

  // Clip 1
  if (cf.opacity1 > 0) {
    const clip1Duration = clips[1].end - clips[1].start;
    const localTime1 = Math.max(
      0,
      Math.min(virtualTime - clips[1].start, clip1Duration)
    );
    const maxIdx1 = clip1.parsed.frameIndex.length - 1;
    const frameIdx1 = Math.min(Math.round(localTime1 * clip1.parsed.frameRate), maxIdx1);
    const frame1 = clip1.cache.get(frameIdx1);
    if (frame1) {
      ctx.globalAlpha = cf.opacity1;
      drawFrameToCanvas(ctx, frame1, canvasW, canvasH);
      lastDrawnIdx[1] = frameIdx1;
    } else if (lastDrawnIdx[1] >= 0) {
      const lastFrame1 = clip1.cache.get(lastDrawnIdx[1]);
      if (lastFrame1) {
        ctx.globalAlpha = cf.opacity1;
        drawFrameToCanvas(ctx, lastFrame1, canvasW, canvasH);
      }
      clip1.decodeFrame(frameIdx1, 3, direction);
    } else {
      clip1.decodeFrame(frameIdx1, 6, direction);
    }
  }

  ctx.globalAlpha = 1;

  // Evict distant frames
  clip0.cache.evict(lastDrawnIdx[0]);
  clip1.cache.evict(lastDrawnIdx[1]);
}

function renderLoop(): void {
  if (!canvas) return;
  rendering = false;

  if (pendingTime !== null) {
    const time = pendingTime;
    pendingTime = null;
    drawFrame(time);
  }
}

function requestRender(virtualTime: number): void {
  pendingTime = virtualTime;
  if (!rendering) {
    rendering = true;
    // Use setTimeout(0) instead of rAF — Worker has no rAF
    setTimeout(renderLoop, 0);
  }
}

/**
 * After a decode completes, check whether the freshly-decoded frame is the
 * one drawFrame was waiting for. If no render is already queued, schedule
 * one at the last-known playhead so the canvas updates immediately instead
 * of staying stale until the next scroll event.
 */
function scheduleRedraw(): void {
  if (!rendering && pendingTime === null) {
    requestRender(lastVirtualTime);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function handleInit(msg: InitMessage): Promise<void> {
  clips = msg.clips;
  canvas = msg.canvas;
  canvasW = msg.width;
  canvasH = msg.height;
  canvas.width = canvasW;
  canvas.height = canvasH;

  ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    self.postMessage({ type: "error", message: "Failed to get canvas context" });
    return;
  }

  crossfadeWindow = 0.4;
  const cacheSize = computeAdaptiveCacheSize(msg.isMobile);

  try {
    // Fetch and parse all clips in parallel
    const buffers = await Promise.all(
      clips.map(async (clip) => {
        const res = await fetch(clip.src);
        if (!res.ok) throw new Error(`Failed to fetch ${clip.src}`);
        return res.arrayBuffer();
      })
    );

    // Create decoders
    decoders = [];
    for (const buf of buffers) {
      const decoder = new ClipDecoder(cacheSize);
      await decoder.init(buf);
      decoders.push(decoder);
    }

    // When a decode completes after the last drawFrame (stale-frame race),
    // schedule an immediate redraw so the canvas shows the decoded frame
    // instead of remaining stuck on the placeholder.
    for (const decoder of decoders) {
      decoder.onDecoded = () => scheduleRedraw();
    }

    // Pre-decode first frames of clip 0 to ensure immediate first paint
    if (decoders[0]) {
      decoders[0].decodeFrame(0, 6, 1);
    }

    self.postMessage({ type: "ready" });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : "Unknown init error",
    });
  }
}

function handleSeek(virtualTime: number): void {
  if (decoders.length < 2) return;
  // Direction tracking is used inside drawFrame for prefetch biasing
  requestRender(virtualTime);
}

function handleResize(width: number, height: number): void {
  canvasW = width;
  canvasH = height;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
  // Re-draw at current playhead after resize (guard only on pendingTime).
  if (pendingTime !== null) {
    drawFrame(pendingTime);
  }
}

function handleDestroy(): void {
  decoders.forEach((d) => d.dispose());
  decoders = [];
  clips = [];
  crossfadeWindow = 0.4;
  canvas = null;
  ctx = null;
  pendingTime = null;
  rendering = false;
  lastDrawnIdx = [-1, -1];
  lastVirtualTime = 0;
}

// ─── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<InboundMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      void handleInit(msg);
      break;
    case "seek":
      handleSeek(msg.virtualTime);
      break;
    case "resize":
      handleResize(msg.width, msg.height);
      break;
    case "destroy":
      handleDestroy();
      break;
  }
};

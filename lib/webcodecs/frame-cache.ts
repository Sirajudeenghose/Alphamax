/**
 * Bounded sliding-window frame cache for WebCodecs VideoFrame management.
 *
 * Maintains a window of decoded VideoFrame objects around the current playhead.
 * Frames outside the window are explicitly closed (they are NOT garbage-collected).
 *
 * The cache size is adaptive: set conservatively based on device capability,
 * and shrunk further if the decoder queue backs up.
 */

export type FrameStatus = "missing" | "decoding" | "cached" | "evicted";

export class FrameCache {
  private cache = new Map<number, VideoFrame>();
  private decoding = new Set<number>();
  private maxFrames: number;

  constructor(maxFrames: number) {
    this.maxFrames = maxFrames;
  }

  get(index: number): VideoFrame | null {
    return this.cache.get(index) ?? null;
  }

  has(index: number): boolean {
    return this.cache.has(index);
  }

  isDecoding(index: number): boolean {
    return this.decoding.has(index);
  }

  status(index: number): FrameStatus {
    if (this.cache.has(index)) return "cached";
    if (this.decoding.has(index)) return "decoding";
    return "missing";
  }

  /**
   * Store a decoded frame. If a frame already exists at this index, it is closed first.
   */
  set(index: number, frame: VideoFrame): void {
    const existing = this.cache.get(index);
    if (existing && existing !== frame) {
      try {
        existing.close();
      } catch {
        // already closed
      }
    }
    this.cache.set(index, frame);
    this.decoding.delete(index);
  }

  /**
   * Mark a frame as being decoded (to prevent duplicate decode requests).
   */
  markDecoding(index: number): void {
    this.decoding.add(index);
  }

  /**
   * Evict frames that are more than `maxFrames` away from the current index.
   * MUST be called periodically to prevent memory exhaustion.
   */
  evict(currentIndex: number): void {
    for (const [idx, frame] of this.cache) {
      if (Math.abs(idx - currentIndex) > this.maxFrames) {
        try {
          frame.close();
        } catch {
          // already closed
        }
        this.cache.delete(idx);
      }
    }
    // Also clean up stale decoding markers
    for (const idx of this.decoding) {
      if (Math.abs(idx - currentIndex) > this.maxFrames) {
        this.decoding.delete(idx);
      }
    }
  }

  /**
   * Close and remove all cached frames. Call on unmount / cleanup.
   */
  clear(): void {
    for (const frame of this.cache.values()) {
      try {
        frame.close();
      } catch {
        // already closed
      }
    }
    this.cache.clear();
    this.decoding.clear();
  }

  /**
   * Number of currently cached (decoded) frames.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Dynamically resize the cache window (e.g. if device is under memory pressure).
   */
  setMaxFrames(max: number): void {
    this.maxFrames = max;
  }
}

/**
 * Adaptive cache size based on device capability.
 *
 * Conservative defaults:
 * - Low memory (≤2 GB): 24 frames (~1s at 24fps)
 * - Medium (≤4 GB): 36 frames (~1.5s)
 * - Mobile (default): 48 frames (~2s)
 * - Desktop: 72 frames (~3s)
 */
export function computeAdaptiveCacheSize(isMobile: boolean): number {
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (deviceMemory && deviceMemory <= 2) return 24;
  if (deviceMemory && deviceMemory <= 4) return 36;
  return isMobile ? 48 : 72;
}

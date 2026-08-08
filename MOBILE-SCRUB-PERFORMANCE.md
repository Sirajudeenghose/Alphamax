# Mobile Scrub Performance — Problem & Fix

## Symptom

Scroll-scrubbing the cinematic timeline is buttery smooth on a laptop but on a phone it stutters frame-by-frame — "feels like moving GIF-still images". Same code, same files, same browser engine family: laptop yes, phone lag.

## The actual problem

Two independent layers of lag, both triggered by how the browser *seeks* a `<video>` element:

### 1. Network stalls mid-scrub (the main cause)

A `<video>` with a normal `src` URL is served in byte ranges. Every seek to a range that hasn't been downloaded yet fires a **new HTTP byte-range request**.

The scrub clips are all-intra (`keyint=1`) — every frame is a keyframe — so every seek lands on a fresh ~40 KB keyframe read. During a 5-second scrub the page can generate dozens of range requests.

- **Laptop**: the browser/HTTP cache usually contains the whole file, so scrubbing decodes purely from memory → seamless.
- **Phone (first visit)**: each not-yet-cached range request costs 100ms+ of network RTT → the video visually *steps* to each buffered frame like a GIF.

This is why it appears "the mobile files are broken" even though the encodes are technically correct.

### 2. Decoder flush storms (the secondary cause)

The old `onUpdate` wrote `v.currentTime` directly every scroll tick when the delta exceeded the threshold (0.02s desktop / 0.08s mobile). A fast flick can issue **several seeks per compositor frame**; each one forces the hardware decoder to flush and reset its pipeline. On phones this decode reset is far slower than on a laptop GPU, compounding the GIF effect.

## What the files actually are (verified with ffprobe)

```
VIDEO 2 MOBILE - scrub.mp4
  h264, High profile, level 3.1, 720x1280, 24 fps, yuv420p
  no B-frames, no audio track, 10.00 s, ~7.9 Mbps
```

All-intra, B-frame-free, audio-free, portrait 720p — already the correct encode shape. Nothing wrong with the files themselves; the problem was *when* the browser was asked to decode.

## What was done to fix it

Changed **one file**: `hooks/useCinmeaticTimeLine.ts`.

### Fix 1 — Preload the whole clip into a Blob URL (non-blocking)

- `toBlobUrl(src)` (module scope): fetches the full MP4 with `cache: "force-cache"` (20s abort timeout) once, stores `URL.createObjectURL(blob)` in a module-level cache. Failure returns `undefined` → element keeps its original URL.
- `primeAll` stays exactly as before: play → pause unlock on the **original JSX src**, so the first frame paints immediately and the ScrollTrigger binds right away (this ordering matters — a version that awaited the blob download first left the video black on slow phone connections).
- `upgradeToBlob` runs **after** `bind()` as a background task: once each blob is ready and the element has metadata (`readyState >= 1`), it swaps `v.src` and restores the current playback position. The element loads from memory from then on.
- Result: zero network traffic during the scrub once the blob has landed; if the fetch is slow or fails, the page simply behaves like before the fix.

### Fix 2 — At most one seek per animation frame

- `onUpdate` no longer writes `v.currentTime`. It only records the newest wanted time via `requestSeek(i, time)`.
- One `requestAnimationFrame`-scheduled `flushSeeks` applies the latest coalesced target per frame — intermediate stale seeks are discarded.
- Unmount cleans up: `cancelAnimationFrame(rafId)` + existing trigger kill.

Result: a fast flick collapses to exactly one decoder seek per compositor frame instead of a queued storm.

## How to verify on a real phone

1. Serve the site (`npm run dev`) and open it in the phone browser (or desktop Chrome DevTools → device emulation → throttled "Slow 3G").
2. Confirm the network behavior changed:
   - DevTools → Network → reload → scroll the timeline.
   - Before the fix: a storm of `range` requests per scrub.
   - After the fix: exactly one full request per clip at startup, nothing during the scrub.
3. Scrub feel: no more GIF-like stepping once the initial download completes.

## Still optional (not yet applied)

The lag fix is done; these are quality-of-cost trims:

1. **Lower mobile bitrate.** 7.9 Mbps is excessive for mostly-static venue footage; ~40 KB/keyframe also slows the initial blob download. Re-encode mobile pair (keep `-g 1 -bf 0 -an -pix_fmt yuv420p`):

   ```bash
   ffmpeg -i in.mp4 -c:v libx264 -preset veryslow -crf 24 -g 1 -bf 0 -an -pix_fmt yuv420p -movflags +faststart out-scrub.mp4
   ```

   Expect ~3-4 Mbps with no visible difference at 720p on a phone. Keep durations identical and `CLIP_TIMING` in sync.

2. **Ultimate fallback (only if a specific device still stutters):** the GTA-VI-style scrub is often not a video at all but a pre-extracted image sequence (24 fps × 10s ≈ 240 frames). Swapping `background-image` / `<img>` per tick is near-free for mobile GPUs and runs smoothly even on cheap SoCs. Costs more storage and development; unnecessary if Fix 1 + 2 solves it.

## Files touched

- `hooks/useCinmeaticTimeLine.ts` (blob preload, rAF-batched seeks)
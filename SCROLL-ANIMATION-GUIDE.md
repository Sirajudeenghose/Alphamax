# Scroll Animation Guide — Desktop & Mobile

A practical walkthrough of how the Alphamax landing page turns scroll into a cinematic experience. Covers every animated section, what happens on desktop vs. mobile, and how the pieces connect — down to the tiny details.

**Current renderer — read this first.** The scroll-scrub timeline has **two render paths that ship together**:

1. **WebCodecs (PRIMARY)** — the browser's `VideoDecoder` API + an `OffscreenCanvas` running inside a `Worker`. It fetches the MP4s, demuxes them with a hand-rolled parser, decodes frames with `VideoDecoder`, caches decoded `VideoFrame`s in a bounded sliding window, and paints to a canvas — all decoding/drawing off the main thread. This is the primary renderer **where the required APIs and codec are supported** (`VideoDecoder` + `EncodedVideoChunk` + `OffscreenCanvas`, feature-detected at module scope in `useWebCodecsTimeline.ts`); the `<video>` path is the fallback everywhere else. Note: real cross-browser/device verification of this path is still a validation item — code-level detection + fallback exist, but it was never exhaustively confirmed on every target device.
2. **`<video>` elements (FALLBACK floor)** — the classic GTA-VI `currentTime` scrub. This is the permanent safety net when WebCodecs is unavailable or fails at runtime. It is **not** the primary renderer anymore.

Companion docs (these document the *fallback* `<video>` path in depth; the WebCodecs path is documented in §3 below and its own files):
- [`SCROLL-SCRUB-VIDEO.md`](./SCROLL-SCRUB-VIDEO.md) — deep-dive on the virtual 0–20s timeline + the `<video>` scrubbing technique
- [`MOBILE-SCRUB-PERFORMANCE.md`](./MOBILE-SCRUB-PERFORMANCE.md) — the two mobile `<video>`-path fixes and the regression that taught us the hard rule

---

## Page structure

The page is four sections rendered in `app/page.tsx`:

```
ScrollProgress          ← fixed 2px bar, tracks full-page scroll
HeroSection             ← autoplay hero video, CSS-sticky (h-[180vh] + sticky top-0), scroll-to-dismiss
CinematicTimeline       ← two scrubbed videos + five text slides, CSS sticky
ContactSection          ← simple reveal-on-scroll
```

Each section is independent. Two separate ScrollTrigger systems run in parallel — the hero's CSS-sticky stage and the timeline's CSS-sticky stage — and they never share triggers or state. **The timeline itself owns one ScrollTrigger** (`hooks/useCinmeaticTimeLine.ts`); the `hooks/useWebCodecsTimeline.ts` hook is a separate concern that only feeds it frames.

---

## 1. ScrollProgress

**File:** `components/ui/ScrollProgress.tsx`

A thin fixed bar at the top of the page that fills left-to-right as the user scrolls.

| | Desktop | Mobile |
|---|---|---|
| Animation | `scaleX` from 0 → 1, scrubbed to page scroll | Same |
| ScrollTrigger | `trigger: document.body`, `start: "top top"`, `end: "bottom bottom"` | Same |
| Performance | Negligible — one opacity-class property on a 2px element | Same |

No differences between breakpoints. The trigger is lightweight enough that it doesn't need optimization.

---

## 2. HeroSection

**File:** `sections/HeroSection.tsx`
**Video:** `public/videos/wedding-venue-hero.mp4` (preloaded in `app/layout.tsx`)

An autoplay hero video that fills the viewport. As the user scrolls, the hero dismisses — the video scales out and content fades. On scroll-back, everything reverses.

### What happens on desktop (≥ 768px)

```
┌─────────────────────────────────┐
│  wrapper (scale 1 → 1.15)       │  ← CSS-sticky, scrub: 1.5, end: +=80%
│  ┌───────────────────────────┐  │
│  │ video (scale 1.06 → 1)    │  │  ← VideoHero entry animation
│  │ overlay (opacity 0 → 0.55)│  │
│  └───────────────────────────┘  │
│  content (scale 1 → 0.9,        │  ← fades + shrinks as you scroll
│           opacity 1 → 0.2)      │
│  indicator (opacity 1 → 0)      │  ← chevron disappears
└─────────────────────────────────┘
```

**Scroll-triggered timeline** (CSS `sticky`, `scrub: 1.5` — *not* `pin: true`):
- The hero outer div is `h-[180vh]`; the inner `VideoHero` wrapper is `sticky top-0`, so the video stays pinned for one viewport-height of scroll (same flat-DOM technique as the timeline, see §3). The `scrub: 1.5` ScrollTrigger only drives scale/opacity — it never pins anything.
- `wrapper`: scale 1 → 1.15 (slow zoom-out feel)
- `content`: scale 1 → 0.9, opacity 1 → 0.2 (text recedes)
- `indicator`: opacity 1 → 0 (chevron fades)

**Entry animations** (timed, not scroll-driven):
- Title: `y: 80 → 0`, opacity 0 → 1, 1.5s, delay 0.6s
- Subtitle: `y: 40 → 0`, opacity 0 → 1, 1.2s, delay 0.9s
- CTA buttons: `y: 30 → 0`, opacity 0 → 1, 1.2s, delay 1.3s

**Chevron bounce** (infinite yoyo):
- `y: 10`, repeat -1, yoyo true, 1.5s cycle
- Pauses when hero scrolls off-screen (`onLeave`), resumes on scroll-back (`onEnterBack`)

### What happens on mobile (< 768px)

**Scroll-triggered timeline** (same CSS-sticky + scrub):
- `wrapper`: **no scale** — removed because scaling a sticky full-viewport element forces expensive GPU compositing of a larger surface on mobile
- `content`: opacity 1 → 0 (fade only, no scale)
- `indicator`: opacity 1 → 0

**Entry animations** (shorter, smaller):
- Title: `y: 40 → 0`, 1s, delay 0.4s (was y:80, 1.5s, delay 0.6s)
- Subtitle: `y: 20 → 0`, 0.8s, delay 0.6s (was y:40, 1.2s, delay 0.9s)
- CTA buttons: `y: 20 → 0`, 0.8s, delay 0.9s (was y:30, 1.2s, delay 1.3s)

**No chevron bounce** — the infinite yoyo animation is desktop-only. On mobile the hero scrolls away quickly; a perpetual bounce wastes GPU cycles on an element that's off-screen most of the time.

### Implementation

All breakpoint logic uses `gsap.matchMedia()`:

```tsx
const mm = gsap.matchMedia();

mm.add("(min-width: 768px)", () => {
  // desktop: full scale + bounce
});

mm.add("(max-width: 767px)", () => {
  // mobile: no scale, no bounce, shorter animations
});

// cleanup: mm.revert() kills everything created inside
```

`mm.revert()` in the cleanup function kills all ScrollTriggers, tweens, and the bounce tween created inside each breakpoint context. No manual iteration needed.

---

## 3. CinematicTimeline (the main scroll-scrub)

**Files:**
- `components/ui/cinmeaticTimeLine.tsx` — constants, markup, mobile clip selection, dual-path wiring
- `hooks/useCinmeaticTimeLine.ts` — the shared ScrollTrigger + slide engine (and the `<video>` fallback scrub)
- `hooks/useWebCodecsTimeline.ts` — the WebCodecs primary renderer (creates the Worker, owns the canvas)
- `lib/webcodecs/timeline-worker.ts` — the Worker: decode + draw off the main thread
- `lib/webcodecs/mp4-parser.ts` — hand-rolled ISO BMFF parser (extracts frame bytes + codec config)
- `lib/webcodecs/frame-cache.ts` — bounded sliding-window `VideoFrame` cache
- `components/ui/timelineSlides.tsx` — slide content markup
- `hooks/UseIsMobile.ts` — mobile detection (768px breakpoint)

This is the centerpiece: two video clips stitched into a single 20-second virtual timeline, scrubbed by scroll position, with five text slides fading in and out at precise moments. The **video frames are painted by WebCodecs** (a Worker decodes + draws to an offscreen canvas); **the text slides are animated by GSAP** in the existing scrub hook.

### The one engine both paths share

Everything hangs off a single ScrollTrigger in `hooks/useCinmeaticTimeLine.ts`. On every scroll tick its `onUpdate`:

1. Computes `virtualTime` (scroll progress × 20s).
2. Calls the **frame callback** if one is wired (WebCodecs active), or scrubs the `<video>` elements otherwise.
3. Animates the 5 text slides (`gsap.set` opacity + y).

The component picks the path and passes it in as `onFrameRequest`:

```ts
const webcodecsActive = webcodecsReady && !webcodecsFailed;
useCinematicTimeline({
  // ...
  onFrameRequest: webcodecsActive ? requestFrame : undefined,
});
```

- **WebCodecs active** (`webcodecsReady && !webcodecsFailed`): the `<video>` elements are hidden (`opacity: 0`), the canvas is shown, and `onUpdate` calls `requestFrame(virtualTime)` → the Worker builds the frame. The hook only runs the slide animations.
- **Fallback** (`onFrameRequest` undefined): the hook scrubs `currentTime` on the two stacked `<video>`s (crossfaded at the 10s handoff) — see §3.3.

The `ready`/`failed` flags come from `useWebCodecsTimeline`. Readiness is **progressive**, not "both clips done". The Worker posts `{ type: "ready", index }` as each clip becomes drawable; `ready` flips true when the **primary** clip (index 0) has decoded its first frame — so the canvas can take over with a real frame already painted, without waiting for clip 1. `failed` flips true on a feature-detection miss, a Worker crash, or any init/parse/decode-fetch error (which drops to the `<video>` floor). This is the production rule: *the page never waits for the video; the video never waits for the user*.

#### The scroll runway

The wrapper div is `TOTAL_DURATION × VH_PER_SECOND` tall:

```
20 seconds × 22 vh/second = 440vh
```

That's the scroll distance. The inner stage is `position: sticky; top: 0` — it stays pinned to the viewport for the full 440vh while the user scrolls through it. No GSAP `pin: true` — CSS sticky handles the pinning.

```
┌─── wrapper (440vh tall) ───────────────┐
│                                         │
│  ┌─── sticky stage (100dvh) ─────────┐  │
│  │  video 1 (opacity: crossfaded)     │  │  ← the two <video>s (fallback)
│  │  video 2 (opacity: crossfaded)     │  │
│  │  canvas (WebCodecs)                │  │  ← the primary painter
│  │  slide 1..5 (opacity + y drift)    │  │
│  └────────────────────────────────────┘  │
│                                         │
│        (empty scroll space)             │  ← 440vh of runway
│                                         │
└─────────────────────────────────────────┘
```

Note the DOM always contains **both** the two `<video>`s and the `<canvas>`. The videos are visible during fallback init and then hidden; the canvas becomes visible once WebCodecs takes over. This is deliberate — it lets the fallback paint the very first frame before WebCodecs is ready.

#### The virtual timeline

One ScrollTrigger maps scroll progress (0 → 1) to virtual time (0 → 20s):

```ts
const virtualTime = self.progress * totalDuration;
// self.progress: 0 at scroll top, 1 at scroll bottom
// totalDuration: 20
```

Everything — the frame to paint, which clip is visible, the crossfade, slide opacity, slide `y` — is derived from this single `virtualTime` value.

#### Slide sync (runs on BOTH paths)

Five slides occupy non-overlapping slots on the same virtual clock:

| Slide | Virtual time | Duration |
|-------|-------------|----------|
| Services | 0s – 4.5s | 4.5s |
| Process | 4.5s – 8.5s | 4s |
| Testimonials | 8.5s – 12.5s | 4s |
| FAQ | 12.5s – 16s | 3.5s |
| CTA | 16s – 20s | 4s |

Each slide fades in over `slideFadeMargin` (1s) before its slot, holds at full opacity for `[start, end]`, then fades out over 1s after. A subtle `y` drift (24px) accompanies the fade. Hidden slides get `pointer-events: none` so they can't intercept clicks; the visible slide gets `pointer-events: auto` so FAQ accordions / the CTA link stay clickable only while on screen.

### 3.1 WebCodecs primary path — how the frame is painted

This is the heart of the modern implementation. All of it lives in `lib/webcodecs/` + `hooks/useWebCodecsTimeline.ts`.

#### Feature detection (module scope)

`useWebCodecsTimeline.ts` checks once at module load:

```ts
const supportsWebCodecs =
  typeof VideoDecoder !== "undefined" &&
  typeof EncodedVideoChunk !== "undefined";
const supportsOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
```

If either is missing (old browser), the hook never starts the Worker and `failed` stays false while `ready` stays false → the `<video>` path silently carries on. Feature detection is keyed on the *constructor* existing, not on a successful decode.

#### Init sequence (main thread)

1. **Size the canvas backing store** with DPR (capped at 2× for perf): `canvas.width = innerWidth × dpr`, `canvas.height = innerHeight × dpr`. CSS layout is handled by Tailwind (`absolute inset-0 h-full w-full`) — the backing store resolution is separate.
2. **Create the Worker** via `new Worker(new URL("../lib/webcodecs/timeline-worker.ts", import.meta.url), { type: "module" })` — webpack bundles it.
3. **Transfer the canvas**: `canvas.transferControlToOffscreen()` then `postMessage({ type: "init", clips, canvas, width, height, isMobile }, [offscreen])`. After this the main thread no longer owns the backing store.
4. **Resize** is forwarded to the Worker (`type: "resize"`) after a 150ms debounce; it re-draws at the current playhead.

#### Worker init (off the main thread) — progressive readiness

The Worker (`timeline-worker.ts`) on `init` deliberately does **not** wait for both clips before becoming drawable:

1. **Kicks off both fetches in parallel** up front (`cache: "force-cache"`), but does **not** await clip 1 before making clip 0 drawable.
2. **Clip 0 first** — `await` only clip 0's fetch, then `parseMp4` → `buildDecoderConfig`, creating the `ClipDecoder` (owns a `VideoDecoder` + `FrameCache`). Wires `onDecoded → scheduleRedraw()` and an `onFirstFrame` callback.
3. **Pre-decodes clip 0 frame 0** (`decodeFrame(0, 3, 1)`). The instant that first frame lands, `onFirstFrame` posts `{ type: "ready", index: 0 }`.
4. **Main thread flips `ready`** on `index: 0` → `webcodecsActive` becomes true → the canvas takes over with clip 0's first frame already painted. Clip 1 is *not* required for this.
5. **Clip 1 in the background** — `await` clip 1's fetch, parse/configure it, post `{ type: "ready", index: 1 }` on its first decoded frame. Until then, `drawFrame` degrades to clip-0-only (full opacity, crossfade skipped); once configured, the shared 0.4s crossfade resumes.

If **any** step throws (fetch fails, parse error, `VideoDecoder.configure` fails, non-`avc1` sample entry), the Worker posts `type: "error"` and the hook sets `failed = true` → graceful drop to the `<video>` floor. A clip-1 failure therefore drops the whole canvas path to video (clip 1 covers the back half of the timeline), which is the documented fallback behavior.

#### The hand-rolled MP4 parser (`mp4-parser.ts`)

`VideoDecoder` needs each frame as an `EncodedVideoChunk` with the raw `avc1` sample bytes, plus a matching `VideoDecoderConfig`. The browser gives you neither from a `<video>` — so `mp4-parser.ts` walks the ISO BMFF box structure:

- **Traverses** `ftyp → moov → trak → mdia → minf → stbl` (plus `mdat`) using a recursive `findBox`.
- **`parseAvcC`** reads the `avc1` sample-entry's `avcC` box to extract SPS + PPS and build the codec string `avc1.${profile}${compatibility}${level}` (e.g. `-profile:v high` → `avc1.640028`).
- **`buildDecoderConfig`** reconstructs a valid `description` box (configVersion 1, lengthSizeMinusOne = 3, SPS + PPS) — `VideoDecoder` *requires* this `description` for H.264, and a wrong profile/level string is a configuration error.
- **Builds `frameIndex`** — `{ index, offset, size, timestamp, duration, data: Uint8Array }` per sample — from `stts` (timestamps), `stsz` (sizes), `stsc` (samples-per-chunk), and `stco`/`co64` (chunk offsets). Each frame's `data` is `slice()`d out so the full MP4 buffer can be released.
- **Assumes** a single video track, no B-frames, all-intra (`-g 1`). It `throw`s on any non-`avc1` sample entry. The timestamp → index lookup is a binary search.

#### The bounded frame cache (`frame-cache.ts`)

A decoded `VideoFrame` is ~8MB of graphics memory and is **not** garbage-collected — you must `.close()` it explicitly. `FrameCache` is a `Map<frameIndex, VideoFrame>` that:

- **`set`** stores a frame, closing any previous frame at the same index.
- **`evict(currentIndex)`** iterates and `.close()`s any frame more than `maxFrames` away from the playhead (also prunes stale "decoding" markers). Called on every draw.
- **`clear`** closes all frames on unmount / worker destroy.
- `computeAdaptiveCacheSize(isMobile)` sizes the window by device:
  - ≤2 GB RAM → 24 frames, ≤4 GB → 36 frames
  - else 48 (mobile) / 72 (desktop) frames

There is also a per-clip decoder **backpressure gate `MAX_QUEUE = 12`** — `decodeFrame` won't queue more than 12 `EncodedVideoChunk`s at once (`queueSize` is decremented in the `output` callback). This prevents the decoder from running away when the user flicks the scroll.

#### Decoding + drawing on scroll

Main thread `requestFrame(virtualTime)` is **rAF-coalesced** (mirroring the fallback's `flushSeeks`): it records the newest time and posts at most one `{ type: "seek", virtualTime }` per rAF to the Worker.

In the Worker, `drawFrame(virtualTime)`:

1. Computes **scroll direction** (positive = down) for direction-aware prefetch biasing.
2. Computes the **crossfade** opacities via `computeCrossfade(...)` — 0.4s window around each clip boundary (same numbers as the `<video>` path; see §3.3).
3. Clears the canvas, then for each clip whose opacity > 0:
   - Maps `virtualTime` → clip-local time → frame index (`round(localTime × frameRate)`).
   - If the frame is **cached** → `drawImage` it (with the clip's `globalAlpha`).
   - If **not yet decoded** → **hold the last drawn frame** (`lastDrawnIdx`) instead of showing black, and `decodeFrame(target, radius, direction)` to request it (radius 3 while a frame is held, 6 when cold).
   - `decodeFrame` queues the target + neighbors **biased toward the scroll direction**, skipping already-cached/decoding indices, respecting `MAX_QUEUE`.
4. **Evicts** distant frames (`cache.evict(lastDrawnIdx)`).

The Worker has no `requestAnimationFrame`, so its render loop is `setTimeout(renderLoop, 0)` — it coalesces `pendingTime` and draws at most once per tick.

#### The stale-frame race fix (don't drop it)

A decode can complete *after* the last `drawFrame` ran, leaving the canvas stale until the next scroll event. `scheduleRedraw()` guards with `if (!rendering && pendingTime === null) requestRender(lastVirtualTime)` — so a freshly-decoded frame triggers an immediate redraw at the last-known playhead instead of waiting for the next scroll tick. This is what makes the frame "pop" in without visible lag.

#### Crossfade in the Worker

`computeCrossfade` matches the fallback: each clip ramps to/from opacity 1 across a 0.4s window straddling its `start`/`end`, independent of the other clip. Both clips decode + draw simultaneously near the boundary so the seam is a soft blend, never a cut or black frame.

#### Worker message protocol

| Message | Direction | Payload |
|---|---|---|
| `init` | main → worker | `{ clips:[{src,start,end}], canvas:OffscreenCanvas, width, height, isMobile }` (canvas transferred) |
| `seek` | main → worker | `{ virtualTime }` (rAF-coalesced) |
| `resize` | main → worker | `{ width, height }` (150ms debounced) |
| `destroy` | main → worker | cleanup decoders + clear cache + close canvas ctx |
| `ready` | worker → main | `{ index }` — that clip is drawable; main thread flips `ready` on `index: 0` (primary clip, first frame decoded) |
| `error` | worker → main | init/decode failure message |

On `destroy` (or unmount) every decoder is `dispose()`d: `VideoDecoder.close()`, `cache.clear()` (closes all frames), `parsed`/config nulled. The main thread also `terminate()`s the Worker and resets `ready`.

### 3.2 Desktop vs. mobile differences

| Aspect | Desktop (≥ 768px) | Mobile (< 768px) |
|--------|-------------------|-------------------|
| Video source | `VIDEO 2 - scrub.mp4` (16:9) | `VIDEO 2 MOBILE - scrub.mp4` (portrait crop) |
| WebCodecs cache size | 72 frames | 48 frames (fewer in-flight `VideoFrame`s on weaker GPUs) |
| Seek threshold (`<video>` fallback) | 0.02s | 0.08s (wider — weaker decoders, imperceptible difference) |
| Scroll normalization | Only on touch devices (`"ontouchstart" in window`) | `normalizeScroll(true)` on all touch devices |
| Slide backdrop-blur | `backdrop-blur-sm` on cards | **Removed** — forces background re-rasterization on every frame during scroll |
| Text reveal (ContactSection) | Word-by-word stagger animation | **Plain text** — fewer animated DOM nodes, no ScrollTrigger |

The engine layers are identical on both breakpoints. The component passes different `clips`, `seekThreshold`, and `isMobile` (which sizes the cache), and the hooks/Worker do the rest. Desktop and mobile video sets must be **duration-identical** (the mobile files are a portrait crop of the same footage, not different-length cuts).

### 3.3 The `<video>` fallback path (secondary, kept as the floor)

When WebCodecs is unavailable/failed, `onFrameRequest` is undefined and the hook runs the classic GTA-VI scrub on the two stacked `<video>`s. This whole sub-system (`useCinmeaticTimeLine.ts`) is now the **safety net** — do not delete it, and treat its invariants as load-bearing.

#### The startup sequence (primeAll → bind → upgradeToBlob)

The hook runs three phases in strict order:

```
primeAll()  →  bind()  →  upgradeToBlob()
   │              │              │
   │              │              └─ Background: fetch full MP4 into memory,
   │              │                 swap v.src to blob URL. Zero network
   │              │                 traffic during scrub after this lands.
   │              │
   │              └─ Create ScrollTrigger. Scrub is live from this point.
   │                 onUpdate only writes to pendingSeek[], not v.currentTime.
   │
   └─ Play → pause → currentTime = 0 on original src.
      Unlocks iOS/Safari programmatic seeking.
      First frame paints immediately.
```

**The hard rule:** `upgradeToBlob` is always a background upgrade, never a prerequisite. An earlier version awaited both ~10MB downloads before `bind()` — on slow phones the video sat black and unscrubbable. The current design means scrub works from the first scroll, and gets smoother once the blob lands.

#### Video crossfade (fallback)

Two `<video>` elements are stacked absolutely. At the 10s handoff, both are briefly visible:

```
virtual time:  9.6s   9.8s   10.0s   10.2s   10.4s
clip 1:        ████▓▓░░        (fades out over 0.4s)
clip 2:              ░░▓▓████  (fades in over 0.4s)
```

Local time inside a clip is `min(max(virtualTime - clip.start, 0), clipDuration)`; the video's `currentTime` seeks there, `gsap.set(opacity)` ramps it in/out across the 0.4s window.

#### rAF-batched seeks

The `onUpdate` callback never writes `v.currentTime` directly. It records the newest target via `requestSeek()`:

```ts
const requestSeek = (i: number, time: number) => {
  pendingSeek[i] = time;
  if (!rafId) rafId = requestAnimationFrame(flushSeeks);
};
```

`flushSeeks` runs once per animation frame, applies the latest coalesced target per video (skipping no-ops inside the seek threshold), and resets. A fast scroll flick collapses to **one decoder seek per compositor frame** instead of a queued storm — this is what keeps the scrub smooth on phones.

### 3.4 All-intra video encoding (prerequisite for BOTH paths)

Normal MP4s have a ~2s keyframe interval — a `<video>` can only seek to a keyframe, and a WebCodecs `VideoDecoder` depends on `key` chunks. Every frame must be an independent keyframe for either path to scrub instantly:

```bash
ffmpeg -i in.mp4 -c:v libx264 -preset veryslow -crf 24 \
  -g 1 -bf 0 -an -pix_fmt yuv420p -movflags +faststart out-scrub.mp4
```

Key flags: `-g 1` (every frame = keyframe), `-bf 0` (no B-frames — the parser can't handle them anyway), `-an` (no audio), `-movflags +faststart` (moov atom at front so the parsed sample tables are available without waiting for `mdat`).

Current files in `public/videos/`:

```
Desktop:  VIDEO 2 - scrub.mp4 / VIDEO 3 - scrub.mp4         (16:9, ~10s)
Mobile:   VIDEO 2 MOBILE - scrub.mp4 / VIDEO 3 MOBILE - scrub.mp4  (portrait, ~10s)
  h264 High profile, 24 fps, yuv420p, no B-frames, no audio, ~10s
```

**Never wire the plain originals into the timeline** — they have normal keyframe intervals (and the WebCodecs parser would fail on their sample tables' mismatch with the all-intra assumption). Desktop and mobile sets must be duration-identical, and `CLIP_TIMING` must stay in sync with real durations.

---

## 4. ContactSection

**File:** `sections/ContactSection.tsx`

A simple scroll-reveal section below the timeline.

| | Desktop | Mobile |
|---|---|---|
| Button animation | `y: 30 → 0`, opacity 0 → 1, triggered at `top 80%` | Same |
| TextReveal | Word-by-word stagger (y: 40, 0.04s stagger) | **Plain text** — no word spans, no GSAP, no ScrollTrigger |
| `backdrop-blur` | None used | None used |

The only mobile optimization here is skipping the `TextReveal` word-stagger animation — on mobile it renders plain text, avoiding the overhead of creating individually animated DOM nodes and a dedicated ScrollTrigger.

---

## 5. Touch device handling

**File:** `app/page.tsx`

```ts
if ("ontouchstart" in window) {
  ScrollTrigger.normalizeScroll(true);
}
```

On touch devices, native momentum scroll runs on the compositor thread and fights with the main-thread work in the scrub: the `onUpdate` slide animations plus (in the fallback video path) the decode-driven seeks. `normalizeScroll` replaces native scroll with a transform-driven one that GSAP fully controls, removing that contention. (The WebCodecs path already keeps decode/draw off the main thread in its Worker, so this mainly protects the slide animation half of `onUpdate`.)

This runs once on mount before any ScrollTrigger reads scroll position. `ScrollTrigger.refresh()` is called after to recalculate all trigger geometry.

---

## 6. Reduced motion

**File:** `hooks/useReducedMotion.ts`

When `prefers-reduced-motion: reduce` is active:

- **HeroSection:** No entry animations, no scroll-triggered timeline, no bounce. Content renders at rest.
- **CinematicTimeline:** No pinning, no scroll-jacking, and the WebCodecs Worker is **never started** (`useWebCodecsTimeline` bails on `reduced`). Videos pause on frame one. Slides render as plain stacked sections in normal document flow. Slide `id`s stay valid as anchor targets.
- **ContactSection:** No scroll-reveal animation.
- **TextReveal:** Plain text, no word spans.
- **ScrollProgress:** No tracking bar.

---

## 7. File map

| File | What it does |
|------|-------------|
| `app/page.tsx` | Composes all sections, `normalizeScroll` on touch, `ScrollTrigger.refresh` on mount/resize |
| `app/layout.tsx` | Preloads hero video via `<link rel="preload" as="video">` |
| `sections/HeroSection.tsx` | Hero video + scroll-to-dismiss with `matchMedia` desktop/mobile split |
| `components/ui/VideoHero.tsx` | Autoplay hero video with entry scale animation and overlay |
| `components/ui/cinmeaticTimeLine.tsx` | Timeline constants, sticky stage markup, clip/seek selection, primary/fallback wiring |
| `hooks/useCinmeaticTimeLine.ts` | The shared ScrollTrigger + slide engine; `<video>` fallback scrub: primeAll → bind → upgradeToBlob, crossfade, rAF seeks |
| `hooks/useWebCodecsTimeline.ts` | Primary renderer: creates the Worker, sizes + transfers the canvas, forward rAF-coalesced seeks; `ready`/`failed` feature detection |
| `lib/webcodecs/timeline-worker.ts` | The Worker: fetch + parse MP4s, `VideoDecoder` decode, `FrameCache`, crossfade, OffscreenCanvas draw |
| `lib/webcodecs/mp4-parser.ts` | Hand-rolled ISO BMFF parser: avcC codec config + `frameIndex` sample table |
| `lib/webcodecs/frame-cache.ts` | Bounded sliding-window `VideoFrame` cache with explicit `.close()` eviction |
| `hooks/UseIsMobile.ts` | Viewport < 768px detection (swaps clip set, seek threshold, cache size) |
| `hooks/useReducedMotion.ts` | `prefers-reduced-motion` detection |
| `components/ui/timelineSlides.tsx` | Five slide content components + `TimelineSlideContent` router |
| `components/ui/TextReveal.tsx` | Word-by-word stagger (desktop) / plain text (mobile) |
| `components/ui/ScrollProgress.tsx` | Fixed scroll-progress bar |
| `sections/ContactSection.tsx` | Contact CTA with scroll-reveal button |
| `lib/helpers/animations.ts` | Shared easing constants and `animateFrom`/`createScrollReveal` utilities |

---

## 8. Gotchas

- **Misspelled filenames are real:** `cinmeaticTimeLine.tsx`, `useCinmeaticTimeLine.ts`, `UseIsMobile.ts` — import them exactly as-is.
- **Never add `pin: true` to the timeline hook** — the sticky CSS pin is deliberate. GSAP pinning inserts spacer elements and breaks the hero-to-timeline handoff.
- **Never add `overscroll-contain` to slide wrappers** — combined with `overflow-y-auto` it swallows desktop wheel events and freezes the page mid-scrub.
- **Do NOT pre-decode the whole WebCodecs timeline.** One 1080p `VideoFrame` is ~8MB of graphics memory; hold too many and the tab crashes. Trust the adaptive `FrameCache` window (`computeAdaptiveCacheSize`) and the `MAX_QUEUE = 12` decoder backpressure gate.
- **Always `.close()` evicted `VideoFrame`s** (`FrameCache.evict` / `clear` / `set`) — they are not GC'd JS objects. Leaking them tanks GPU memory.
- **Keep the source H.264 (`avc1`), not AV1** — H.264 hardware decode is near-universal on mobile SoCs; AV1 is inconsistent on budget Android / older iPhones.
- **Codec string must match the source profile** — `mp4-parser.ts` derives `avc1.${profile}${comp}${level}` from the `avcC` box and rebuilds the `description` box. A wrong profile/level (or missing `description`) is a `VideoDecoder` configuration error that silently drops to the `<video>` floor.
- **The parser assumes one video track, all-intra, no B-frames** — re-encoded source is required; the plain originals (normal keyframe interval / different sample table shape) will fail parse or decode.
- **The `onDecoded` → `scheduleRedraw` race fix matters** — don't drop it. Without it, a frame decoded after the last draw can leave the canvas stale until the next scroll event.
- **`webcodecsActive = ready && !failed`** — don't gate on `ready` alone. A runtime failure after init sets `failed` while `ready` may still be true; the active check must be false in that case so the `<video>` floor takes over.
- **Module-level constants are effect deps** — `CLIP_TIMING`, `SLIDES`, `DESKTOP_CLIPS`, `MOBILE_CLIPS` are stable references. Re-creating them inline rebinds the entire ScrollTrigger (and re-inits the Worker, since `clips`/`isMobile` are effect deps there too).
- **`mm.revert()` for cleanup** — `matchMedia` contexts must be cleaned up with `mm.revert()`, not manual ScrollTrigger iteration.
- **Desktop and mobile video sets must be duration-identical** — the mobile files are a different aspect crop, not different-length cuts.
- **`backdrop-blur` on mobile** — removed from timeline slide cards. It forces background re-rasterization during scroll. Desktop keeps it.

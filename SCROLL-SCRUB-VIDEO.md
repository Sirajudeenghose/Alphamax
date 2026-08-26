# Scroll-Scrubbed Cinematic Video — How We Built It

How the Alphamax landing page turns ~440vh of scroll into one continuous, frame-accurate, GTA-VI-style cinematic sequence: two source videos stitched into a single virtual 0–20s timeline, five content slides fading in and out on schedule, all pinned to the viewport and scrubbed purely by scroll position.

Companion doc: [`MOBILE-SCRUB-PERFORMANCE.md`](./MOBILE-SCRUB-PERFORMANCE.md) — the two mobile-specific performance fixes (blob-URL preload + rAF-batched seeks) and the regression that nearly replaced the working design. Read it before touching `useCinmeaticTimeLine.ts`.

---

## 1. The effect we wanted

- User scrolls down a long, empty-feeling page and the **video tracks their scroll** — scroll forward, footage advances; scroll back, it rewinds. No play button, no scrubber UI.
- The sequence is **two separate ~10s video files** stitched seamlessly into one 20s "film", with a crossfade at the handoff so there's never a hard cut or black frame.
- **Text slides** (services, process, testimonials, FAQ, CTA) fade in/out at fixed moments on that same virtual timeline — the whole thing is one choreographed sequence, not five separate sections.
- The stage stays pinned to the viewport the entire time; only video opacity/`currentTime` and slide opacity/transform change underneath it.

## 2. The core idea: scroll position → virtual time

Everything hangs off one equation in the hook's ScrollTrigger `onUpdate`:

```ts
const virtualTime = self.progress * totalDuration;
```

- `self.progress` goes 0 → 1 as the user scrolls through the whole pinned range.
- `totalDuration` is the length of the virtual timeline (20s).
- Every frame of the scrub is derived from `virtualTime`:
  - which clip is visible and at what `currentTime`,
  - whether we're inside a clip-boundary crossfade,
  - which slide slot we're in and how faded it is.

The same scroll range drives everything — one `ScrollTrigger`, one source of truth for progress, no per-section triggers to stay in sync.

## 3. The two layers of the build

There are really two separate problems being solved:

| Problem | Solution |
|---|---|
| "The video won't scrub" | All-intra re-encoded clips (`keyint=1`) so any seek is instant (§4) |
| "The scrubbing is janky on phones" | Blob-URL preload + one seek per frame (→ `MOBILE-SCRUB-PERFORMANCE.md`) |
| "Two files shouldn't look like two files" | Virtual timeline + crossfade window (§5) |
| "It must stay pinned while scrolling" | CSS `sticky` wrapper instead of GSAP `pin: true` (§6) |
| "Text slides at the right moments" | `SLIDES` array with start/end on the virtual timeline (§7) |
| "First paint must be instant" | `primeAll` on the original src → bind → background blob upgrade (§8) |

## 4. Video encoding: why the clips scrub at all

A `<video>` element "scrubs" by setting `currentTime`. The catch: a normal MP4 has a **keyframe (I-frame) interval** of ~2 seconds, and the decoder can only seek to a keyframe. Between keyframes the browser would have to decode from the last keyframe forward — so scrubbing a normal file steps in ~2s jumps (or worse, stalls fetching ranges).

The fix is re-encoding the clips **all-intra**: every frame is a keyframe, so *any* seek lands instantly. We also drop B-frames (can't seek into a bidirectional frame cleanly), audio (nothing to hear), and enable `faststart`:

```bash
ffmpeg -i in.mp4 -c:v libx264 -preset veryslow -crf 24 -g 1 -bf 0 -an -pix_fmt yuv420p -movflags +faststart out-scrub.mp4
```

Key flags:
- `-g 1` — one GOP frame = every frame a keyframe (`keyint=1`).
- `-bf 0` — no B-frames.
- `-an` — no audio track.
- `-movflags +faststart` — moov atom at the front so playback/seek starts without downloading the whole file.

Current files (in `public/videos/`), verified with ffprobe:

```
VIDEO 2 - scrub.mp4          /  VIDEO 3 - scrub.mp4          (desktop)
VIDEO 2 MOBILE - scrub.mp4   /  VIDEO 3 MOBILE - scrub.mp4   (portrait crop)
  h264, High profile, 24 fps, yuv420p, no B-frames, no audio, ~10s
```

**The plain originals (`VIDEO 2.mp4`, `VIDEO 2 mobile.mp4`, …) still exist in the folder but are NOT wired into the timeline** — they have a normal ~2s keyframe interval and scrub at a decode-limited pace that looks broken. If anyone "fixes" a missing file by pointing at an original, the scrub silently regresses.

Two durations, one rule:
- Desktop and mobile sets must be **duration-identical** (the mobile files are a different aspect crop of the same footage, not different-length cuts).
- `CLIP_TIMING` in `components/ui/cinmeaticTimeLine.tsx` must stay in sync with the real durations.

## 5. The virtual timeline and the crossfade

Two clips stitched into one 20s film, defined as module-level constants:

```ts
const CLIP_TIMING = [
  { start: 0, end: 10 },    // VIDEO 2 - scrub.mp4 fills 0–10s
  { start: 10, end: 20 },   // VIDEO 3 - scrub.mp4 fills 10–20s
] as const;
```

`start`/`end` are on the **shared virtual timeline, not the file's own timecode**. The local position inside a clip is:

```ts
const localTime = Math.min(Math.max(virtualTime - clip.start, 0), clipDuration);
```

At the handoff (virtual time 10s), one clip must fade out while the other fades in. Both `<video>` elements are stacked absolutely and crossfaded with a `crossfadeWindow` of 0.4s of virtual time:

```ts
const fadeInFrom = clip.start - crossfadeWindow;
const fadeOutTo = clip.end + crossfadeWindow;

// outside the window → invisible
// before clip.start → ramping in
// after clip.end → ramping out
// between start and end → opacity 1
gsap.set(v, { opacity: Math.min(1, Math.max(0, opacity)) });
```

Both videos are actually decoding/advancing around the boundary, so the seam is a soft blend rather than a cut.

## 6. Pinning: CSS `sticky`, not GSAP `pin: true`

This is deliberate. The structure is a scroll-range container with a sticky stage inside:

```tsx
<div ref={wrapperRef} style={{ height: `${TOTAL_DURATION * VH_PER_SECOND}vh` }}>
  <div className="sticky top-0 h-screen supports-[height:100dvh]:h-dvh">
    <video … />          {/* clip 1 */}
    <video … />          {/* clip 2 */}
    {SLIDES.map(…)}      {/* text slides, absolute */}
  </div>
</div>
```

- The wrapper is 20s × 22vh-per-second = **440vh of scroll distance** — that's the "runway" the user scrolls through.
- The inner stage is `position: sticky; top: 0` — it follows the viewport for the wrapper's entire height, which *is* the pin. No GSAP pin involved.
- The hook's ScrollTrigger (`start: "top top"`, `end: "bottom bottom"`, `scrub: 0.5`) just measures that range; it doesn't pin anything.

Why not `pin: true`? The page already has two pinned regions (this timeline + the hero's `pin: true`). GSAP pinning inserts spacer elements and transforms the flow; `sticky` keeps the DOM flat, avoids pin hand-off jank at the boundary with the hero, and lets `normalizeScroll` on touch devices work with native-compositor-friendly layout. **Do not add `pin: true` to the hook** — it breaks the design.

## 7. Text slides on the same clock

```ts
const SLIDES = [
  { id: "services",     start: 0,   end: 4.5, type: "services" },
  { id: "process",      start: 4.5, end: 8.5, type: "process" },
  { id: "testimonials", start: 8.5, end: 12.5, type: "testimonials" },
  { id: "faq",          start: 12.5, end: 16,  type: "faq" },
  { id: "cta",          start: 16,   end: 20,  type: "cta" },
];
```

Each slide has a `start`/`end` slot on the same virtual timeline. With a `slideFadeMargin` of 1s, the hook fades a slide in across `[start - 1, start]`, holds it at full opacity for `[start, end]`, and fades it out across `[end, end + 1]` — with a small y-drift so the fade feels physical:

```ts
gsap.set(el, {
  opacity: clampedOpacity,
  y,
  pointerEvents: opacity > 0.6 ? "auto" : "none",   // only the visible slide is interactive
});
```

Two details that matter in production:

- **`pointerEvents` toggling** — hidden slides are `pointer-events: none` so they can't intercept clicks; the visible slide (FAQ accordions, CTA link) is clickable only while it's actually on screen.
- **Slide wrappers are `overflow-y-auto`** (`m-auto` centering inside) so on short phone screens a slide's content scrolls internally instead of being clipped. **Never add `overscroll-contain`** to those wrappers — combined with `overflow-y-auto` it swallows desktop wheel events mid-scrub and freezes the whole page.

## 8. First paint vs. smooth scrub: `primeAll` → `bind` → blob upgrade

The hook's lifecycle is a strict order of three phases:

```ts
primeAll().then(() => {
  if (cancelled) return;
  bind();
  void upgradeToBlob();
});
```

### `primeAll` — iOS unlock, on the ORIGINAL src

iOS/Safari refuses programmatic `currentTime` seeks on a `<video>` that has never played. So every clip gets a muted `play()` → `pause()` → `currentTime = 0` unlock against the original JSX `src`. This runs first and is **never** awaited on anything slow — the first frame paints immediately and the ScrollTrigger binds right away.

### `bind` — the trigger goes live

One `ScrollTrigger.create` with `scrub: 0.5`. The `onUpdate` never touches `currentTime` directly anymore — it records the newest wanted time:

```ts
const requestSeek = (i: number, time: number) => {
  pendingSeek[i] = time;
  if (!rafId) rafId = requestAnimationFrame(flushSeeks);
};
```

`flushSeeks` runs once per animation frame, applies the latest coalesced target per video (skipping no-ops inside the seek threshold), and resets. A fast scroll flick that would have queued a storm of seeks collapses to **one decoder seek per compositor frame** — this is what keeps the scrub smooth on phones.

### `upgradeToBlob` — background, never a prerequisite

Video seeks on a normal URL fire HTTP **byte-range** requests whenever the target range isn't downloaded. On a first phone visit that's 100ms+ of network per keyframe = the GIF-still-frame slideshow effect. So after binding, the hook fetches each clip once (`cache: "force-cache"`, 20s abort timeout), builds a `URL.createObjectURL` blob, caches it module-wide, and swaps `v.src` to the blob — the clip then loads from memory and **zero network traffic happens during the scrub**.

The hard rule learned from a regression (see `MOBILE-SCRUB-PERFORMANCE.md` §"Regression we hit"): **never gate scrub startup on a network download**. An earlier version awaited both 10MB fetches before binding — on slow phones the video sat black and unscrubbable. Network work must always be an additive background upgrade, never a prerequisite.

## 9. Supporting pieces

- **`useIsMobile()`** (`hooks/UseIsMobile.ts`) — below 768px it swaps `clips` to the portrait source set and widens the seek dedup threshold (0.08s vs 0.02s) so weaker mobile decoders aren't hammered with sub-frame seeks.
- **`normalizeScroll(true)`** on touch devices (`app/page.tsx`) — native momentum scroll runs on the compositor thread and fights the main-thread video decode; `normalizeScroll` replaces native scroll with a transform-driven one GSAP fully controls.
- **`ScrollTrigger.refresh()`** on mount and on resize — needed because the wrapper's scroll height is in `vh` and the pin geometry is derived.
- **Reduced motion** (`useReducedMotion()`) — the hook short-circuits entirely: videos pause on frame one, slides render as plain stacked sections in normal document flow, no pinning, no scroll-jacking. Slide `id`s stay valid anchors.
- **Module-level constants** — `CLIP_TIMING`, `SLIDES`, `DESKTOP_CLIPS`, `MOBILE_CLIPS` are stable references *and* the hook lists `clips`/`slides` in its effect deps. Re-creating them inline on render rebinds the whole trigger every render.
- **Hero section** (`sections/HeroSection.tsx`) is a separate autoplay video with its **own** `pin: true` + `scrub: 1.5` scale-out ScrollTrigger. Two pinned regions on the page — don't mistake the hero trigger for part of the timeline machinery.

## 10. Verification checklist (does the scrub feel right?)

1. `npm run dev`, open the page, scroll through the timeline.
2. **Video follows scroll in both directions**, including mid-scroll reversal.
3. **No black frame or hard cut** at the 10s handoff — just a soft crossfade.
4. Slides fade in/out exactly during their slots; FAQ and CTA are clickable only when visible.
5. DevTools → Network → reload → scroll: after the initial full-file requests (one per clip), **no `range` requests during the scrub** (blob upgrade worked).
6. Test at 768px and below: portrait clips, no stutter. Throttle to Slow 3G on first load: video still scrubs (maybe choppy until the blob lands, never black).
7. `prefers-reduced-motion: reduce`: no pinning, stacked slides, videos on frame one.
8. Scroll into the page after the timeline without fighting: page flow resumes normally below the 440vh runway.

## 11. Files that make this work

| File | Role |
|---|---|
| `components/ui/cinmeaticTimeLine.tsx` | Constants (`CLIP_TIMING`, `SLIDES`, `DESKTOP_CLIPS`, `MOBILE_CLIPS`, `VH_PER_SECOND`), sticky stage markup, `useIsMobile` selection, reduced-motion fallback |
| `components/ui/timelineSlides.tsx` | The five slides' actual markup |
| `hooks/useCinmeaticTimeLine.ts` | The entire scrub engine: `primeAll` → `bind` → `upgradeToBlob`, crossfade math, slide fade math, rAF-batched seeks |
| `hooks/UseIsMobile.ts` | Mobile clip set + seek threshold selection |
| `app/page.tsx` | `normalizeScroll` on touch, `ScrollTrigger.refresh()` on mount/resize |
| `public/videos/* - scrub.mp4` | The all-intra re-encoded clips (never the originals) |

Misspelled filenames are imported exactly as-is: `cinmeaticTimeLine.tsx`, `useCinmeaticTimeLine.ts`, `UseIsMobile.ts`.

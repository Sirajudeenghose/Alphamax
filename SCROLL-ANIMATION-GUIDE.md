# Scroll Animation Guide — Desktop & Mobile

A practical walkthrough of how the Alphamax landing page turns scroll into a cinematic experience. Covers every animated section, what happens on desktop vs. mobile, and how the pieces connect.

Companion docs (deeper dives):
- [`SCROLL-SCRUB-VIDEO.md`](./SCROLL-SCRUB-VIDEO.md) — full technical deep-dive on the scroll-scrub timeline technique
- [`MOBILE-SCRUB-PERFORMANCE.md`](./MOBILE-SCRUB-PERFORMANCE.md) — the two mobile performance fixes and the regression that taught us the hard rule

---

## Page structure

The page is four sections rendered in `app/page.tsx`:

```
ScrollProgress          ← fixed 2px bar, tracks full-page scroll
HeroSection             ← autoplay hero video, pinned, scroll-to-dismiss
CinematicTimeline       ← two scrubbed videos + five text slides, CSS sticky
ContactSection          ← simple reveal-on-scroll
```

Each section is independent. Two separate ScrollTrigger systems run in parallel — the hero's pin and the timeline's sticky stage — and they never share triggers or state.

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
│  wrapper (scale 1 → 1.15)       │  ← pinned, scrub: 1.5, end: +=80%
│  ┌───────────────────────────┐  │
│  │ video (scale 1.06 → 1)    │  │  ← VideoHero entry animation
│  │ overlay (opacity 0 → 0.55)│  │
│  └───────────────────────────┘  │
│  content (scale 1 → 0.9,        │  ← fades + shrinks as you scroll
│           opacity 1 → 0.2)      │
│  indicator (opacity 1 → 0)      │  ← chevron disappears
└─────────────────────────────────┘
```

**Scroll-triggered timeline** (GSAP `pin: true`, `scrub: 1.5`):
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

**Scroll-triggered timeline** (same pin + scrub):
- `wrapper`: **no scale** — removed because scaling a pinned full-viewport element forces expensive GPU compositing of a larger surface on mobile
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
- `components/ui/cinmeaticTimeLine.tsx` — constants, markup, mobile clip selection
- `hooks/useCinmeaticTimeLine.ts` — the scrub engine
- `components/ui/timelineSlides.tsx` — slide content markup
- `hooks/UseIsMobile.ts` — mobile detection (768px breakpoint)

This is the centerpiece: two video clips stitched into a single 20-second virtual timeline, scrubbed by scroll position, with five text slides fading in and out at precise moments.

### How it works (both breakpoints)

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
│  │  video 1 (opacity: crossfaded)     │  │  ← stays pinned
│  │  video 2 (opacity: crossfaded)     │  │
│  │  slide 1..5 (opacity + y drift)    │  │
│  └────────────────────────────────────┘  │
│                                         │
│        (empty scroll space)             │  ← 440vh of runway
│                                         │
└─────────────────────────────────────────┘
```

#### The virtual timeline

One ScrollTrigger maps scroll progress (0 → 1) to virtual time (0 → 20s):

```ts
const virtualTime = self.progress * totalDuration;
// self.progress: 0 at scroll top, 1 at scroll bottom
// totalDuration: 20
```

Everything — video `currentTime`, video opacity, slide opacity, slide `y` — is derived from this single `virtualTime` value in one `onUpdate` callback.

#### Video crossfade

Two `<video>` elements are stacked absolutely. At the 10s handoff, both are briefly visible:

```
virtual time:  9.6s   9.8s   10.0s   10.2s   10.4s
clip 1:        ████▓▓░░        (fades out over 0.4s)
clip 2:              ░░▓▓████  (fades in over 0.4s)
```

The crossfade window is 0.4s of virtual time. Both videos decode simultaneously around the boundary so there's never a black frame or hard cut.

#### Slide sync

Five slides occupy non-overlapping slots on the same virtual clock:

| Slide | Virtual time | Duration |
|-------|-------------|----------|
| Services | 0s – 4.5s | 4.5s |
| Process | 4.5s – 8.5s | 4s |
| Testimonials | 8.5s – 12.5s | 4s |
| FAQ | 12.5s – 16s | 3.5s |
| CTA | 16s – 20s | 4s |

Each slide fades in over 1s before its slot, holds at full opacity, then fades out over 1s after. A subtle `y` drift (24px) accompanies the fade for a physical feel. Hidden slides get `pointer-events: none` so they can't intercept clicks.

### Desktop vs. mobile differences

| Aspect | Desktop (≥ 768px) | Mobile (< 768px) |
|--------|-------------------|-------------------|
| Video source | `VIDEO 2 - scrub.mp4` (16:9) | `VIDEO 2 MOBILE - scrub.mp4` (portrait crop) |
| Seek threshold | 0.02s | 0.08s (wider — weaker decoders, imperceptible difference) |
| Scroll normalization | Only on touch devices (`"ontouchstart" in window`) | `normalizeScroll(true)` on all touch devices |
| Slide backdrop-blur | `backdrop-blur-sm` on cards | **Removed** — forces background re-rasterization on every frame during scroll |
| Text reveal (ContactSection) | Word-by-word stagger animation | **Plain text** — fewer animated DOM nodes, no ScrollTrigger |
| Timeline scrub engine | Same `useCinematicTimeline` hook | Same hook, different `seekThreshold` and `clips` |

The scrub engine itself (`hooks/useCinmeaticTimeLine.ts`) is identical on both breakpoints. It doesn't know or care which device it's on — the component passes different `seekThreshold` and `clips` values, and the hook does the rest.

### The startup sequence (primeAll → bind → upgradeToBlob)

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

### rAF-batched seeks

The `onUpdate` callback never writes `v.currentTime` directly. It records the newest target via `requestSeek()`:

```ts
const requestSeek = (i: number, time: number) => {
  pendingSeek[i] = time;
  if (!rafId) rafId = requestAnimationFrame(flushSeeks);
};
```

`flushSeeks` runs once per animation frame, applies the latest coalesced target per video (skipping no-ops inside the seek threshold), and resets. A fast scroll flick collapses to **one decoder seek per compositor frame** instead of a queued storm — this is what keeps the scrub smooth on phones.

### All-intra video encoding

Normal MP4s have a ~2s keyframe interval — the decoder can only seek to a keyframe, so scrubbing steps in visible jumps. The solution is re-encoding every frame as a keyframe:

```bash
ffmpeg -i in.mp4 -c:v libx264 -preset veryslow -crf 24 \
  -g 1 -bf 0 -an -pix_fmt yuv420p -movflags +faststart out-scrub.mp4
```

Key flags: `-g 1` (every frame = keyframe), `-bf 0` (no B-frames), `-an` (no audio), `-movflags +faststart` (moov atom at front).

Current files in `public/videos/`:

```
Desktop:  VIDEO 2 - scrub.mp4 / VIDEO 3 - scrub.mp4         (16:9, ~10s)
Mobile:   VIDEO 2 MOBILE - scrub.mp4 / VIDEO 3 MOBILE - scrub.mp4  (portrait, ~10s)
```

**Never wire the plain originals into the timeline** — they have normal keyframe intervals and scrub at a decode-limited pace that looks broken. Desktop and mobile sets must be duration-identical.

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

On touch devices, native momentum scroll runs on the compositor thread and fights with the main-thread video decode work in the scrub's `onUpdate`. `normalizeScroll` replaces native scroll with a transform-driven one that GSAP fully controls, removing that contention.

This runs once on mount before any ScrollTrigger reads scroll position. `ScrollTrigger.refresh()` is called after to recalculate all trigger geometry.

---

## 6. Reduced motion

**File:** `hooks/useReducedMotion.ts`

When `prefers-reduced-motion: reduce` is active:

- **HeroSection:** No entry animations, no scroll-triggered timeline, no bounce. Content renders at rest.
- **CinematicTimeline:** No pinning, no scroll-jacking. Videos pause on frame one. Slides render as plain stacked sections in normal document flow. Slide `id`s stay valid as anchor targets.
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
| `components/ui/cinmeaticTimeLine.tsx` | Timeline constants, sticky stage markup, clip/seek selection |
| `hooks/useCinmeaticTimeLine.ts` | The scrub engine: primeAll → bind → upgradeToBlob, crossfade, slide sync, rAF seeks |
| `hooks/UseIsMobile.ts` | Viewport < 768px detection (swaps clip set + seek threshold) |
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
- **Module-level constants are effect deps** — `CLIP_TIMING`, `SLIDES`, `DESKTOP_CLIPS`, `MOBILE_CLIPS` are stable references. Re-creating them inline rebinds the entire ScrollTrigger.
- **`mm.revert()` for cleanup** — `matchMedia` contexts must be cleaned up with `mm.revert()`, not manual ScrollTrigger iteration.
- **Desktop and mobile video sets must be duration-identical** — the mobile files are a different aspect crop, not different-length cuts.
- **`backdrop-blur` on mobile** — removed from timeline slide cards. It forces background re-rasterization during scroll. Desktop keeps it.

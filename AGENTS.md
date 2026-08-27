# Alphamax — Agent Guide

## Stack
- **Next.js 16** (App Router) + **React 19**, TypeScript strict, **Tailwind CSS 4** (no `tailwind.config`; `@import "tailwindcss"` in CSS)
- **Supabase** (helpers in `lib/supabase/`), GSAP + ScrollTrigger, Framer Motion, Lucide React, React Hook Form
- Package manager: **npm** (lockfile: `package-lock.json`)

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` (bare `eslint`) |
| Typecheck | `npx tsc --noEmit` (no npm script — run manually) |

No test framework installed.

## Architecture
- Landing page composed in `app/page.tsx` (a `"use client"` component): `ScrollProgress` → `HeroSection` (autoplay `wedding-venue-hero.mp4`) → `CinematicTimeline` → `ContactSection` (`id="contact"`, lives in `sections/ContactSection.tsx`). Content sections follow the UX-research arc (attention → orientation → proof → validation → action); copy is placeholder — keep the premium/dark/amber design language
- **`ExperienceSection`/`VenueSection` were deleted** (older commits) — do not reference or resurrect them. CTAs: hero links to `#services` + `#contact`, timeline CTA links to `#contact`; `#venue` no longer exists anywhere
- Cinematic timeline (`components/ui/cinmeaticTimeLine.tsx`, filename misspelled): one pinned wrapper, two `<video>` elements crossfaded across a continuous **virtual 0–20s timeline** (both source clips are ~10s; timings baked into `CLIP_TIMING`, scroll speed in `VH_PER_SECOND = 22`) and 5 content slides (services / process / testimonials / faq / cta) faded in/out from the `SLIDES` array — slide markup lives in `components/ui/timelineSlides.tsx`. All driven by a single ScrollTrigger `onUpdate` via `gsap.set` in `hooks/useCinmeaticTimeLine.ts` (the misspelled file exports the correctly-cased `useCinematicTimeline`). Pin is **CSS `sticky`, not `pin: true`** — the wrapper div carries `TOTAL_DURATION * VH_PER_SECOND` vh of scroll height; do not add `pin: true` to the hook
- **Read `MOBILE-SCRUB-PERFORMANCE.md` before modifying `useCinmeaticTimeLine.ts`** — it documents the mobile-perf machinery in the hook (blob-URL preload, rAF-coalesced seeks) and a regression that replaced a previous "working" design. Invariants: scrub startup must **never** wait on a network download (`primeAll` runs on the original src → `bind()` → background `upgradeToBlob`); `onUpdate` only records targets via `requestSeek`, one coalesced seek per frame via `flushSeeks`
- **`SCROLL-SCRUB-VIDEO.md`** is the full walkthrough of the technique: virtual 0–20s timeline, all-intra (`keyint=1`) encode requirement, crossfade, `sticky` pinning, slide sync, and the prime/bind/blob lifecycle
- Reduced-motion fallback (`useReducedMotion()` in the timeline): no pin/scrub — videos pause on frame one, slides render as plain stacked sections (their `id`s stay usable as anchors)
- `CLIP_TIMING` / `SLIDES` / `DESKTOP_CLIPS` / `MOBILE_CLIPS` are module-level constants and the hook lists `clips`/`slides` in its effect deps — keep them stable or memoize; re-creating them inline rebinds the whole trigger
- `HeroSection` has its own **independent** ScrollTrigger (`pin: true`, `scrub: 1.5`, scale-out on the hero video) — the page has two pinned regions; don't mistake it for part of the timeline
- `hooks/UseIsMobile.ts` (`useIsMobile`) swaps to mobile-aspect clips below 768px and widens the seek dedup threshold (0.08 vs 0.02) — desktop and mobile sets must stay duration-identical
- Touch devices: `page.tsx` calls `ScrollTrigger.normalizeScroll(true)` when `"ontouchstart" in window`
- Dead scaffolds, not rendered — do not treat as source of truth: `sections/movementsSction.tsx` (misspelled; its `CinematicVideoSection` references `/videos/signature-moment.mp4` + a poster that don't exist), `components/ui/CinematicVideoSection.tsx`, `components/ui/ParallaxSection.tsx` (never imported), `hooks/usescrollscrubvideo.ts` (superseded by the timeline hook). Live `components/ui/` files are only: `cinmeaticTimeLine.tsx`, `timelineSlides.tsx`, `ScrollProgress.tsx`, `VideoHero.tsx` (used by HeroSection), `TextReveal.tsx` (used by ContactSection)
- GSAP helpers in `lib/helpers/animations.ts` (`easing`, `animateFrom`, `createScrollReveal`); `hooks/useReducedMotion.ts` for a11y
- Empty, unwired scaffolds — do not assume they're in use: `components/{common,layouts}/`, `app/{admin,api}/`, `constants/`, `types/`, `utils/`, `styles/`, `lib/{services,validations}/`

## Performance Architecture — Known State

### What's already done (don't redo or second-guess)
- **Timeline scrub uses CSS `sticky`, not GSAP `pin: true`** — this is deliberate; `pin: true` causes JS-driven layout measurement thrashing on every scroll tick. The timeline wrapper is a sticky element with scroll height set via `TOTAL_DURATION * VH_PER_SECOND` vh. Do not add `pin: true` to the timeline hook
- **All-intra encoded source files** (`keyint=1`): `VIDEO 2 - scrub.mp4`, `VIDEO 3 - scrub.mp4`, mobile variants. Every frame is an independent keyframe — this is required for WebCodecs decode later and for current seek latency. Do not replace with standard encodes
- **rAF-coalesced seeks**: `onUpdate` never writes `currentTime` directly; it records targets via `requestSeek`, and one `flushSeeks` runs per rAF frame. This matches Apple's own recommended workaround for rapid seek cancellation
- **Background blob upgrade**: `primeAll` runs on original src → `bind()` → background `upgradeToBlob`. Scrub never waits on network. This is an invariant — do not reorder or block bind on blob fetch

### Known gap: HeroSection still uses `pin: true`
`HeroSection.tsx` uses GSAP `pin: true` with `scrub: 1.5` (lines 40–44, 97–101). This is the exact pattern that causes the most layout thrashing on scroll — it was the single biggest bottleneck in a Chrome profile of the GTA VI benchmark site this project is modeled on. Converting it to CSS `sticky` (the same migration already completed for the timeline) is the most impactful low-risk change available. If you do this:
- Test the hero → timeline handoff on a real device after the change; sticky's spacer behavior differs from GSAP pin-spacing
- The entry animations (title/subtitle/CTA `fromTo` tweens) are time-based (`duration` + `delay`), not scroll-scrubbed, so they can stay as-is

### Performance tiers (what to do next, in priority order)

| Tier | Change | Files | Effort | Notes |
|------|--------|-------|--------|-------|
| 1 | WebCodecs sliding-window frame cache replacing `<video>` seek | `useCinmeaticTimeLine.ts` | High | **The actual fix** — removes the seek bottleneck entirely. See details below |
| 2 | OffscreenCanvas + Worker for decode/draw | same hook, new worker file | Medium (after Tier 1) | Runs VideoDecoder + drawImage off main thread. Protects against React reconciliation / GSAP ticker spikes during scroll |
| 3 | HeroSection `pin: true` → CSS sticky | `HeroSection.tsx` | Low–Medium | See "Known gap" above |
| 4 | Native `animation-timeline: scroll()` | `ScrollProgress.tsx`, indicator fades | Low | Progressive enhancement. See details below |
| 5 | `content-visibility: auto` | `ContactSection.tsx` | Very low | See details below |
| 6 | Lenis unification | `app/page.tsx` | Low | Only worth adding once multiple independent scroll-driven subsystems need one synchronized progress value. `ScrollTrigger.normalizeScroll(true)` already handles the mobile problem Lenis would otherwise solve. Add late, measure before/after on a real phone |

#### Tier 1 — WebCodecs frame cache (the actual fix)

`<video>.currentTime` writes go through the browser's media pipeline; rapid seeks cancel seeks already in progress (Apple's own guidance). Your rAF-coalesced seeks and `seekThreshold` are a correct implementation of Apple's recommended workaround — but the ceiling is a property of the primitive, not your code. The only way past it is to stop asking `<video>` to seek.

Use `diffusionstudio/webcodecs-scroll-sync` as reference implementation. The pattern: demux your existing scrub MP4 into `EncodedVideoChunk[]`, decode via `VideoDecoder`, cache `VideoFrame` objects in a bounded sliding window (24 frames either side of playhead), explicitly `.close()` frames that fall outside the window as the user scrolls. Your `-g 1` all-intra source means every chunk decodes independently — random-access scrubbing is fast because no chunk depends on another.

**Critical constraints:**
- Do NOT pre-decode the whole timeline. A single 1080p frame is ~8MB of raw pixel data; `VideoFrame` objects reference actual graphics memory. Hold too many and the tab crashes. A typical device ceiling is ~2s of full-res video simultaneously
- Explicitly `.close()` every evicted `VideoFrame` — they are not garbage-collected JS objects
- Keep H.264 (`avc1`), not AV1 — H.264 hardware decode is near-universal across mobile SoCs; AV1 hardware decode is newer and inconsistent on budget Android and older iPhones
- The decoder codec string must match your source profile: `avc1.640028` (High profile, level 4.0) matches `-profile:v high`

Browser support: Chrome/Edge 94+, Safari 16.4+ (VideoDecoder; full WebCodecs from Safari 26), Firefox 130+ desktop, Samsung Internet 17+. Safe to ship as primary path, not experimental.

The existing `useCinmeaticTimeLine.ts` becomes the permanent fallback floor — do not delete it.

#### Tier 4 — Native `animation-timeline: scroll()`

For `ScrollProgress` and any element whose transform is a simple linear function of scroll position:

```css
.scroll-progress {
  transform: scaleX(0);
  transform-origin: left;
}
@supports (animation-timeline: scroll()) {
  .scroll-progress {
    animation: fill-progress linear;
    animation-timeline: scroll(root);
    animation-fill-mode: both;
  }
}
@keyframes fill-progress { to { transform: scaleX(1); } }
```

Gate the existing GSAP ScrollTrigger for this element behind `!CSS.supports('animation-timeline: scroll()')` — don't let both systems drive the same transform. In Safari 26.4+ this runs fully on the compositor (threaded), not the main thread. Firefox stable still has it behind a flag (on by default in Nightly) — GSAP fallback covers Firefox users silently.

#### Tier 5 — `content-visibility: auto`

One-line, zero-risk change on `ContactSection.tsx` and any future below-fold content:

```css
content-visibility: auto;
contain-intrinsic-size: auto 800px; /* estimate of section height */
```

Tells the browser to skip layout and paint while the section is off-screen (i.e. during the 440vh timeline scroll). Baseline since Chrome/Edge, Firefox, and Safari 18.1+ (September 2024). Pays off more as the page grows.

### Fallback ladder pattern (when implementing Tier 1)
```ts
const supportsFrameCache = 'VideoDecoder' in window
const lowMemory = (navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4

const tier = !supportsFrameCache ? 'video-element'      // current system, unchanged
           : lowMemory           ? 'frame-cache-reduced' // smaller window, lower res
           : 'frame-cache-full'
```

### GSAP anti-patterns to avoid (from the GTA VI Chrome profile audit)
- **Implicit `from` reads** — letting GSAP read an element's current computed style as the start value forces a synchronous layout. Set explicit `from` values in every `fromTo`
- **Unit-mismatched tweens** — converting between `px` and `%` mid-animation forces synchronous style recalculation. Keep a single unit per animation
- **Initializing everything at mount** — gate below-fold animation setup behind `IntersectionObserver` rather than running it all in `useEffect`. Idle observers cost nothing until the element is near viewport. `TextReveal` in `ContactSection` is a candidate; the video priming pipeline is not (user reaches it within one scroll gesture)

### Profiling protocol
Chrome DevTools Performance panel: 4x–6x CPU throttling, paint flashing + layer borders on. Test on mid-range Android and older iPhone (not desktop Safari responsive mode — mobile Safari behavior does not reproduce there). Look for: yellow (JS), purple (style/layout), red (dropped frames) — aim to shrink purple and red during scroll, not just overall load time.

## Conventions
- `@/*` path alias maps to repo root (e.g. `@/components/`, `@/lib/`)
- `.env.local` is gitignored; copy `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Supabase helpers exist (`lib/supabase/client.ts`, `server.ts`) but nothing imports them yet
- Interactive/animated components start with `"use client"` — mirror the existing pattern
- **Mobile is the primary target** — timeline slide content is sized to fit a phone viewport (compact text/padding; `min-[430px]`/`sm:`/`md:` breakpoints, never desktop-first `lg:`-only layouts); the pinned stage uses `h-dvh` with `h-screen` fallback, and slide wrappers are `overflow-y-auto` (centered via `m-auto`) so short screens scroll rather than clip
- **Never add `overscroll-contain` to the timeline slide wrappers** — the hook sets `pointer-events: auto` on the visible slide, and `overflow-y-auto` + `overscroll-contain` swallows desktop wheel events, freezing the whole page mid-scrub (scroll only recovered when overscroll containment was removed; touch devices are unaffected because `normalizeScroll` intercepts input)
- GSAP ScrollTrigger pattern: guard on `useReducedMotion()`, kill triggers on cleanup, `ScrollTrigger.refresh()` on mount + resize (see `app/page.tsx`)

## Quirks
- Misspelled/non-camelCase filenames must be imported exactly as-is: `cinmeaticTimeLine.tsx`, `useCinmeaticTimeLine.ts`, `UseIsMobile.ts`, `usescrollscrubvideo.ts`
- Scroll-scrub REQUIRES the all-intra re-encoded (`keyint=1`) files: desktop `VIDEO 2 - scrub.mp4` / `VIDEO 3 - scrub.mp4`, mobile `VIDEO 2 MOBILE - scrub.mp4` / `VIDEO 3 MOBILE - scrub.mp4`. The plain originals (`VIDEO 2.mp4`, `VIDEO 2 mobile.mp4`, …) still exist in `public/videos/` but seek at a decode-limited pace — wiring them into the timeline looks broken. If video is re-exported, keep the "- scrub" pair, the 10.01s durations, and `CLIP_TIMING` in sync
- `public/videos/` holds large tracked MP4s, some with spaces/parens in filenames — don't add media without intent
- ESLint uses flat config `eslint.config.mjs` (`eslint-config-next/core-web-vitals` + `/typescript`)
- All `.env*` files are gitignored — never commit secrets

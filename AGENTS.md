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
- Cinematic timeline (`components/ui/cinmeaticTimeLine.tsx`, filename misspelled): **dual render path.** Primary path is **WebCodecs**: `hooks/useWebCodecsTimeline.ts` creates a `Worker` (`lib/webcodecs/timeline-worker.ts`) that fetches the MP4s, demuxes them (`lib/webcodecs/mp4-parser.ts` — hand-rolled ISO BMFF parser), decodes via `VideoDecoder`, caches `VideoFrame`s in a bounded sliding window (`lib/webcodecs/frame-cache.ts`), and draws to an `OffscreenCanvas`. **Fallback path** is the two `<video>` elements crossfaded + `currentTime` scrubbing in `hooks/useCinmeaticTimeLine.ts` (exports correct-cased `useCinematicTimeline`) — this is now a permanent fallback floor, NOT the primary renderer. The active path: `webcodecsActive = ready && !failed`; when active, the hook's `onFrameRequest` is passed to `useCinematicTimeline`, which then skips video seeking/opacity and only runs the slide animations. Videos are hidden (`opacity: 0`), canvas shown. **`ready` means *progressive* readiness — it flips when the PRIMARY clip (index 0) has decoded its first frame, NOT when both clips are done.** The Worker fetches both MP4s in parallel but only awaits clip 0 before becoming drawable; clip 1 is prepared in the background (`drawFrame` degrades to clip-0-only and skips the crossfade until clip 1 is configured). This is the production loading rule "the page never waits for the video; the video never waits for the user" — see the Worker init protocol in `timeline-worker.ts`
- Both paths share one continuous **virtual 0–20s timeline** (both source clips ~10s; timings in `CLIP_TIMING`, scroll speed `VH_PER_SECOND = 22`) and 5 content slides (services / process / testimonials / faq / cta) faded in/out from `SLIDES` — slide markup in `components/ui/timelineSlides.tsx`. One ScrollTrigger `onUpdate` sets everything via `gsap.set` in `useCinmeaticTimeLine.ts`. Pin is **CSS `sticky`, not `pin: true`** — wrapper carries `TOTAL_DURATION * VH_PER_SECOND` vh of scroll height; do not add `pin: true` to the hook
- **Read `MOBILE-SCRUB-PERFORMANCE.md` before modifying `useCinmeaticTimeLine.ts`** — it documents the mobile-perf machinery in the hook (blob-URL preload, rAF-coalesced seeks) and a regression that replaced a previous "working" design. Invariants: scrub startup must **never** wait on a network download (`primeAll` runs on the original src → `bind()` → background `upgradeToBlob`); `onUpdate` only records targets via `requestSeek`, one coalesced seek per frame via `flushSeeks`
- **`SCROLL-SCRUB-VIDEO.md`** is the full walkthrough of the technique: virtual 0–20s timeline, all-intra (`keyint=1`) encode requirement, crossfade, `sticky` pinning, slide sync, and the prime/bind/blob lifecycle
- Reduced-motion fallback (`useReducedMotion()` in the timeline): no pin/scrub — videos pause on frame one, slides render as plain stacked sections (their `id`s stay usable as anchors). The WebCodecs Worker is **never started** under reduced motion (`useWebCodecsTimeline.ts` bails on `reduced ||` before creating the Worker) — an agent investigating "why isn't the canvas painting" must rule reduced-motion out first
- `CLIP_TIMING` / `SLIDES` / `DESKTOP_CLIPS` / `MOBILE_CLIPS` are module-level constants and the hook lists `clips`/`slides` in its effect deps — keep them stable or memoize; re-creating them inline rebinds the whole trigger
- `HeroSection` has its own **independent** ScrollTrigger (`scrub: 1.5`, scale-out on the hero video) — uses CSS `sticky` (`h-[180vh]` + `sticky top-0`), not `pin: true`; don't mistake it for part of the timeline
- `hooks/UseIsMobile.ts` (`useIsMobile`) swaps to mobile-aspect clips below 768px and widens the seek dedup threshold (0.08 vs 0.02) — desktop and mobile sets must stay duration-identical
- Touch devices: `page.tsx` calls `ScrollTrigger.normalizeScroll(true)` when `"ontouchstart" in window`
- Dead scaffolds — still on disk, unwired (mutually referencing chain `movementsSction` → `CinematicVideoSection` → `usescrollscrubvideo`; `ParallaxSection`) — do not reference or resurrect: `sections/movementsSction.tsx`, `components/ui/CinematicVideoSection.tsx`, `components/ui/ParallaxSection.tsx`, `hooks/usescrollscrubvideo.ts`. Live `components/ui/` files are only: `cinmeaticTimeLine.tsx`, `timelineSlides.tsx`, `ScrollProgress.tsx`, `VideoHero.tsx` (used by HeroSection), `TextReveal.tsx` (used by ContactSection). `hooks/usescrollscrubvideo.ts` on disk is NOT used by the interactive timeline — that's `useCinematicTimeline`
- GSAP helpers in `lib/helpers/animations.ts` (`easing`, `animateFrom`, `createScrollReveal`); `hooks/useReducedMotion.ts` for a11y
- Empty, unwired scaffolds — do not assume they're in use: `components/{common,layouts}/`, `app/{admin,api}/`, `constants/`, `types/`, `utils/`, `styles/`, `lib/{services,validations}/`

## Performance Architecture — Known State

### What's already done (don't redo or second-guess)
- **Timeline scrub uses CSS `sticky`, not GSAP `pin: true`** — this is deliberate; `pin: true` causes JS-driven layout measurement thrashing on every scroll tick. The timeline wrapper is a sticky element with scroll height set via `TOTAL_DURATION * VH_PER_SECOND` vh. Do not add `pin: true` to the timeline hook
- **All-intra encoded source files** (`keyint=1`): `VIDEO 2 - scrub.mp4`, `VIDEO 3 - scrub.mp4`, mobile variants. Every frame is an independent keyframe — this is required for WebCodecs decode later and for current seek latency. Do not replace with standard encodes
- **rAF-coalesced seeks** (fallback `<video>` path, `useCinmeaticTimeLine.ts`): `onUpdate` never writes `currentTime` directly; it records targets via `requestSeek`, and one `flushSeeks` runs per rAF frame. This matches Apple's own recommended workaround for rapid seek cancellation
- **Background blob upgrade** (fallback path): `primeAll` runs on original src → `bind()` → background `upgradeToBlob`. Scrub never waits on network. This is an invariant — do not reorder or block bind on blob fetch

### HeroSection — already uses CSS sticky (verified)
`HeroSection.tsx` uses CSS `sticky` (`h-[180vh]` + `sticky top-0`) with a `scrub: 1.5` ScrollTrigger that only drives scale/opacity animations — no `pin: true`. Same pattern as the timeline.

### Implementation status (all of these shipped — don't redo)
- **Tiers 1 + 2 — WebCodecs frame cache + OffscreenCanvas Worker: DONE.** `lib/webcodecs/` (`mp4-parser.ts`, `frame-cache.ts`, `timeline-worker.ts`) + `hooks/useWebCodecsTimeline.ts`. The Worker owns `VideoDecoder`, the bounded `FrameCache`, and OffscreenCanvas drawing off the main thread; main thread sends coalesced `virtualTime` seeks. The `<video>` scrubbing path in `useCinmeaticTimeLine.ts` is now strictly the fallback floor (WebCodecs unavailable/failed) — do not delete it. `diffusionstudio/webcodecs-scroll-sync` was the reference
- **Tier 3 — HeroSection CSS sticky: DONE** (below)
- **Tier 4 — native `animation-timeline: scroll()`: DONE** for the scroll bar. `globals.css` defines `.scroll-progress-bar` with `@supports (animation-timeline: scroll())`; `ScrollProgress.tsx` gates its GSAP ScrollTrigger behind `!supportsScrollTimeline` so only one system drives the transform
- **Tier 5 — `content-visibility: auto`: DONE** on `ContactSection.tsx` (inline `contentVisibility: "auto"`, `containIntrinsicSize: "auto 1000px"`)

#### WebCodecs implementation invariants (respect if you touch this path)
- **Do NOT pre-decode the whole timeline.** A single 1080p frame is ~8MB raw; `VideoFrame` objects reference actual graphics memory; hold too many and the tab crashes. The cache is adaptive (`computeAdaptiveCacheSize`): 24 frames ≤2GB, 36 ≤4GB, 48 mobile / 72 desktop. There is a real per-clip `MAX_QUEUE = 12` decoder backpressure gate
- **Explicitly `.close()` every evicted `VideoFrame`** (`FrameCache.evict` / `clear` / `set`) — they are not GC'd JS objects. Frames outside the sliding window are closed as the playhead moves
- **Keep H.264 (`avc1`), not AV1** — H.264 hardware decode is near-universal on mobile SoCs; AV1 is inconsistent on budget Android / older iPhones
- **Decoder codec string must match the source profile.** `mp4-parser.ts` builds `avc1.${profile}${comp}${level}` from the avcC box (`parseAvcC`) and reconstructs the `description` box for `buildDecoderConfig`. `-profile:v high` → `avc1.640028`. Wrong profile/level = `VideoDecoder` configuration error
- `frameIndex` order/timestamps are derived from stts/stsz/stsc/stco(stco→co64 fallback); the parser assumes a **single video track, all-intra, no B-frames** ISO BMFF. It throws on non-`avc1` sample entries
- Crossfade (0.4s around each clip boundary), direction-aware prefetch biasing, and "hold last drawn frame while decoding" (`lastDrawnIdx`) all live in the Worker (`timeline-worker.ts`); the `onDecoded` → `scheduleRedraw` race fix matters — don't drop it
- Browsers: Chrome/Edge 94+, Safari 16.4+ (VideoDecoder; full WebCodecs Safari 26+), Firefox 130+ desktop, Samsung Internet 17+. Feature-detected at module scope in `useWebCodecsTimeline.ts` (`VideoDecoder` + `EncodedVideoChunk` + `OffscreenCanvas`); the `<video>` path is the silent floor

#### Production loading strategy — progressive readiness (do not regress to "both ready")
Loading is deliberately **progressive**, not a two-phase "download everything → paint". The rule is **"the page never waits for the video; the video never waits for the user"**:
1. **Early prioritized download** — `app/layout.tsx` `<link rel="preload" as="video">`s the timeline scrub clips (`media`-gated per breakpoint, clip 0 `high` / clip 1 `low`) so the download starts at page load, not when the user scrolls into the timeline.
2. **Poster / first-frame visual** — each timeline `<video>` carries a `poster` (`public/images/timeline-clip1-poster{,-mobile}.jpg`, generated from clip 0 frame 0), so the stage is never blank even before clip metadata decodes.
3. **First cinematic frame ASAP** — the Worker fetches **both** MP4s in parallel but only awaits clip 0 to become drawable (parse → configure → decode frame 0). Posts `{type:"ready", index:0}` on clip 0's first decoded frame → main thread flips `ready` → canvas takes over with a real frame already painted.
4. **Clip 1 prepared in background** — not gated by takeover. `drawFrame` degrades to clip-0-only (full opacity, crossfade skipped) until clip 1 is configured, then the shared 0.4s crossfade resumes.
5. **Progressive decode + bounded frame cache + fallback** — unchanged; `<video>` is the silent floor for WebCodecs-unavailable/failed/reduced-motion.

Corollaries for future edits: **do NOT** re-add a "wait for both clips before `ready`" gate, wrap startup in `setTimeout`/fake loaders, or block page render on media. `ready` = primary-clip drawable, by design. Test the clip-1-behind-clip-0 path with DevTools network throttling (clip 1 connection throttled hard) and confirm the canvas still paints clip 0 immediately and clip 1 "pops in" at the handoff without a blank/cut.

### Remaining tuning (deferred, nothing urgent)
- **Lenis unification** — only add once multiple independent scroll-driven subsystems need one sync progress value. Currently only the timeline scrubs; `ScrollTrigger.normalizeScroll(true)` on touch already handles the mobile problem Lenis would otherwise solve. Add late, measure before/after on a real phone
- `TextReveal` in `ContactSection` is a candidate for gating its below-fold animation setup behind `IntersectionObserver` instead of running at mount (idle observers cost nothing until near viewport)

### GSAP anti-patterns to avoid (from the GTA VI Chrome profile audit)
- **Implicit `from` reads** — letting GSAP read an element's current computed style as the start value forces a synchronous layout. Set explicit `from` values in every `fromTo`
- **Unit-mismatched tweens** — converting between `px` and `%` mid-animation forces synchronous style recalculation. Keep a single unit per animation
- **Initializing everything at mount** — gate below-fold animation setup behind `IntersectionObserver` rather than running it all in `useEffect`. Idle observers cost nothing until the element is near viewport. `TextReveal` in `ContactSection` is a candidate; the video priming pipeline is not (user reaches it within one scroll gesture)

### Profiling protocol
Chrome DevTools Performance panel: 4x–6x CPU throttling, paint flashing + layer borders on. Test on mid-range Android and older iPhone (not desktop Safari responsive mode — mobile Safari behavior does not reproduce there). Look for: yellow (JS), purple (style/layout), red (dropped frames) — aim to shrink purple and red during scroll, not just overall load time.

## Mobile swipe-release behavior (a core UX requirement — do not break)

One of the central discovery-driving requirements for the timeline, worth stating explicitly because a careless optimization will silently break it. The desired interaction on a touch device:

1. **Short swipe** (finger down, quick flick up), **then release**.
2. **Small continued movement** — the finger is up, but the viewport coasts a little further under scroll inertia.
3. **The video follows that post-release movement** — it must keep advancing/rewinding in step with the inertia, frame-accurate, not snap off the playhead.
4. **The scroll settles** — the coasting decelerates to a stop.
5. **Exact final frame** — when scrolling has fully stopped, the video is parked precisely on the frame for the final scroll position (no visible "grab the right frame" settling or a frame that's ahead/behind of the playhead by a step).

Every piece of the mobile machinery exists to serve this one gesture, and they only work *together*:
- `ScrollTrigger.normalizeScroll(true)` (touch only) replaces native momentum with a transform scroll GSAP fully controls — so the coast phase doesn't fight the decode/draw work (`app/page.tsx`).
- `scrub: true` on the timeline trigger (`useCinmeaticTimeLine.ts:192`) — direct 1:1 progress, no easing/lag that would desync the video from the thumb during the settle.
- The **final-frame redraw** (`lastDrawnIdx` hold-while-decoding in the Worker, `onDecoded` → `scheduleRedraw`) — so on settle the canvas converges to the exact frame even if the target frame hadn't finished decoding mid-scroll.
- The `<video>` fallback's `flushSeeks` one-coalesced-seek-per-rAF — so the coast phase issues at most one decoder seek per compositor frame instead of a queued storm.

**Regression test to keep in mind:** flick fast, release, watch whether the video (a) continues tracking the coast, (b) stops smoothly, and (c) sits dead-on the playhead's final frame. If it jumps ahead of / behind the final frame or stops a frame short, the final-frame handling regressed. Test on a real phone — desktop trackpad scrolling does not reproduce touch inertia.

## Conventions
- `@/*` path alias maps to repo root (e.g. `@/components/`, `@/lib/`)
- `.env.local` is gitignored; copy `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Supabase helpers exist (`lib/supabase/client.ts`, `server.ts`) but nothing imports them yet
- Interactive/animated components start with `"use client"` — mirror the existing pattern
- **Mobile is the primary target** — timeline slide content is sized to fit a phone viewport (compact text/padding; `min-[430px]`/`sm:`/`md:` breakpoints, never desktop-first `lg:`-only layouts); the pinned stage uses `h-dvh` with `h-screen` fallback, and slide wrappers are `overflow-y-auto` (centered via `m-auto`) so short screens scroll rather than clip
- **Never add `overscroll-contain` to the timeline slide wrappers** — the hook sets `pointer-events: auto` on the visible slide, and `overflow-y-auto` + `overscroll-contain` swallows desktop wheel events, freezing the whole page mid-scrub (scroll only recovered when overscroll containment was removed; touch devices are unaffected because `normalizeScroll` intercepts input)
- GSAP ScrollTrigger pattern: guard on `useReducedMotion()`, kill triggers on cleanup, `ScrollTrigger.refresh()` on mount + resize (see `app/page.tsx`)

## Quirks
- Misspelled/non-camelCase filenames must be imported exactly as-is: `cinmeaticTimeLine.tsx`, `useCinmeaticTimeLine.ts`, `UseIsMobile.ts`
- Scroll-scrub REQUIRES the all-intra re-encoded (`keyint=1`) files: desktop `VIDEO 2 - scrub.mp4` / `VIDEO 3 - scrub.mp4`, mobile `VIDEO 2 MOBILE - scrub.mp4` / `VIDEO 3 MOBILE - scrub.mp4`. The plain originals (`VIDEO 2.mp4`, `VIDEO 2 mobile.mp4`, …) still exist in `public/videos/` but seek at a decode-limited pace — wiring them into the timeline looks broken. If video is re-exported, keep the "- scrub" pair, the 10.01s durations, and `CLIP_TIMING` in sync
- `public/videos/` holds large tracked MP4s, some with spaces/parens in filenames — don't add media without intent
- `mediabunny` and `mp4-muxer` are installed in `package.json` but **not imported anywhere** — the WebCodecs path uses the hand-rolled `lib/webcodecs/mp4-parser.ts`, not mediabunny. Don't assume they're wired in
- ESLint uses flat config `eslint.config.mjs` (`eslint-config-next/core-web-vitals` + `/typescript`)
- All `.env*` files are gitignored — never commit secrets

## Project evolution / change history

This reconstructs how the current state was reached so an agent understands *why* the code looks the way it does (and what got rejected along the way). It is reconstructed from git history (`git log --oneline`), the deep-dive docs (`MOBILE-SCRUB-PERFORMANCE.md`, `SCROLL-SCRUB-VIDEO.md`, `SCROLL-ANIMATION-GUIDE.md`), and the code itself. Items marked **UNVERIFIED** could not be confirmed from the repo (they come from the working session history, not anything on disk); treat them as background, not fact.

- **STAGE 0 — Setup + landing page scaffold (Jul 30–31, `git log`: `setup` / `landing page`).** Next.js app + the premium/dark/amber one-page composition.
- **STAGE 1 — Landing animations + first mobile responsiveness (Aug 4).** `landing page animation..`, `mobile responsiveness`, `mobile res`. The `<video>` scroll-scrub timeline first appears: virtual 0–20s timeline (`CLIP_TIMING`, `VH_PER_SECOND = 22`), 5 slides (`SLIDES`), CSS `sticky` pinning, crossfade at the 10s handoff, `primeAll` → `bind` → `upgradeToBlob` lifecycle. This path is documented in depth in `SCROLL-SCRUB-VIDEO.md`.
- **STAGE 2 — All-intra re-encoding (`video optimizer`, Aug 4).** Reason: a normal MP4 (~2s keyframe interval) can only `currentTime`-seek to a keyframe, so scrubbing steps in jumps. Re-encoded desktop + mobile pairs with `-g 1 -bf 0 -an -pix_fmt yuv420p -movflags +faststart` (`keyint=1`, no B-frames, no audio, faststart). The plain originals still exist in `public/videos/` and are deliberately NOT wired in.
- **STAGE 3 — Mobile scrub performance fixes + regression (`mobile scroll fix`, `fix`, Aug 8).** Two causes of phone jank: (1) byte-range HTTP requests per seek on a normal URL, (2) multiple decoder-flush storms during a flick. Fixes: blob-URL preload (background `upgradeToBlob`) + rAF-coalesced seeks (`requestSeek`/`flushSeeks`). A first attempt that made `primeAll` **await** the 20 MB blob download before `bind()` left the video black on slow phones — reverted to the invariant "network work is always an additive background upgrade, never a prerequisite". Full story in `MOBILE-SCRUB-PERFORMANCE.md`.
- **STAGE 4 — WebCodecs investigation → hand-rolled parser.** The `<video>` seek ceiling is a property of the primitive; the fix was to decode frames directly. **UNVERIFIED from repo:** Mediabunny was investigated then rejected; the stated reason on disk is that `VideoDecoder` needs per-frame `EncodedVideoChunk`s plus a matching `description` box that a `<video>`/library path doesn't expose, hence `lib/webcodecs/mp4-parser.ts`. The repo evidence is consistent with this: `mediabunny` + `mp4-muxer` are in `package.json` but imported nowhere. `diffusionstudio/webcodecs-scroll-sync` was the reference repo.
- **STAGE 5 — Worker + OffscreenCanvas migration.** `hooks/useWebCodecsTimeline.ts` creates a `Worker` (`lib/webcodecs/timeline-worker.ts`), transfers the canvas via `transferControlToOffscreen()`, forwards rAF-coalesced `virtualTime` seeks; the Worker owns dedup/demux (`mp4-parser.ts`), decode (`VideoDecoder`), and OffscreenCanvas drawing. The `<video>` path in `useCinmeaticTimeLine.ts` became the permanent fallback floor. Active path = `webcodecsActive = ready && !failed`.
- **STAGE 6 — Frame cache + prefetch + backpressure.** `lib/webcodecs/frame-cache.ts`: bounded sliding window, explicit `.close()` of every evicted `VideoFrame`, adaptive size (`computeAdaptiveCacheSize`: 24 ≤2GB / 36 ≤4GB / 48 mobile / 72 desktop), per-clip `MAX_QUEUE = 12` decoder backpressure, direction-aware prefetch, `lastDrawnIdx` hold-while-decoding.
- **STAGE 7–8 — Bug audit + critical fixes.** The code contains direct evidence of these shipped fixes: `recoverDecoder()` + `makeErrorCallback(isRecovery)` (decoder recovery on runtime error), FPS/timescale correctness (`timescale`/`frameRate` from the mdhd box, `timescaleToSeconds`, binary-search frame lookup), per-frame `data.slice()` so the full MP4 buffer is released after parse, canvas backing-store sizing with DPR (capped at 2×), resize re-forwarding (150ms debounce), `onDecoded` → `scheduleRedraw` stale-frame race fix, crossfade factorization (`computeCrossfade`, shared `crossfadeWindow = 0.4`). **UNVERIFIED from repo:** the exact sequential BUG-1..6 / VERIFY / cleanup checklist and the order the fix-work landed — the repo shows the end state, not the running bug list.
- **STAGE 9 — Mobile momentum / scroll correction + hero sticky.** The timeline ScrollTrigger now uses `scrub: true` (previously `scrub: 0.5`). HeroSection migrated from GSAP `pin: true` to CSS `sticky` (`h-[180vh]` + `sticky top-0`, `scrub: 1.5` scale/opacity only) — removes the layout-thrash hotspot.
- **STAGE 10 — Final validation / perf tier completion.** `animation-timeline: scroll()` on the scroll bar (Tier 4), `content-visibility: auto` on `ContactSection` (Tier 5), GSAP anti-pattern audit (implicit `from` reads, unit-mismatched tweens, mount-time init). Build/typecheck/lint clean.
- **STAGE 11 — Progressive-readiness production loading (WebCodecs path).** Broke the previous "both clips must be ready before canvas takeover" gate. `timeline-worker.ts` now fetches both MP4s in parallel but only awaits clip 0 (parse → configure → decode frame 0) before posting `{type:"ready", index:0}`; clip 1 is prepared in the background and `drawFrame` degrades to clip-0-only (crossfade skipped) until it's configured. `useWebCodecsTimeline.ts` flips `ready` on the primary clip's first decoded frame — not when both are done. `layout.tsx` preloads the scrub clips early (`media`-gated per breakpoint, clip 0 `high` / clip 1 `low`); the timeline `<video>`s gained `poster` first-frame visuals (`public/images/timeline-clip1-poster{,-mobile}.jpg`, ffmpeg-generated from clip 0 frame 0). See the "Production loading strategy" section above.

**The exact bugs discovered during the WebCodecs work, in roughly the order they surfaced.** Each shows what the code does now and where. Symptom → root cause → shipped fix (evidence in `lib/webcodecs/` etc.):
- **Canvas 300×150 (default) / blank-small stage** → an unsized `<canvas>` has a 300×150 backing store → the canvas is explicitly sized on init with `devicePixelRatio` (capped 2×) in `useWebCodecsTimeline.ts` and re-sent on `resize`.
- **Hardcoded FPS / wrong clip timing** → frame lookup assumed a fixed frame rate → `frameRate` is now derived from the `mdhd` timescale (`timescale / firstDuration`, with `: 24` fallback) in `mp4-parser.ts`; `timescaleToSeconds` + binary search convert virtual time → index.
- **Blank canvas on cache miss (held-frame gap)** → an uncached frame showed black → **`lastDrawnIdx` hold-while-decoding** in `timeline-worker.ts`: while the target decodes, keep drawing the previous frame instead of black.
- **Decode on the main thread** → `requestFrame`→VideoDecoder→draw all on the UI thread stalled scroll → everything moved into the **Worker + OffscreenCanvas** (`transferControlToOffscreen()`), main thread only posts rAF-coalesced `seek`s.
- **Duplicate crossfade code** → the `<video>` crossfade math was duplicated, so the two paths drifted → factored into shared **`computeCrossfade()`** with one `crossfadeWindow = 0.4`.
- **Resize after OffscreenCanvas transfer** → once control is transferred the main thread can't resize the backing store → the hook forwards `resize` messages to the Worker (150ms debounce, re-draw at current playhead).
- **Decoder frame-lookup inefficiency** → scanning for the frame index → **binary search** (`frameIndex` ordered by time) for O(log n) lookup.
- **Initialization / re-initialization races** → the effect could re-run or the Worker double-init → **`initDoneRef`** guard holds a single init; `ready` is reset on cleanup so it can safely re-init.
- **Decoder recovery closure** → a runtime `VideoDecoder` error (or one thrown inside the error callback) wasn't recoverable → **`makeErrorCallback(isRecovery)`** + **`recoverDecoder()`** — a non-recovery error closes and rebuilds the decoder; recovery errors are silently ignored.
- **`scrub: 0.5` → post-scroll continuation** → lagged scrubbing kept easing after the finger stopped, so the frame kept drifting past the thumb → **`scrub: true`** (1:1) for the timeline trigger.
- **Final frame decoded but not rendered** → a frame completing *after* the last draw left the canvas stale until the next scroll tick → **`onDecoded → scheduleRedraw()`** redraws at the last-known playhead immediately.

**Rejected / changed approaches (worth not re-litigating):**
- **Mediabunny rejected** (STAGE 4) — not just "a library exists we didn't use": the decision was driven by Worker/bundling + the need for per-frame `EncodedVideoChunk`s with a reconstructed `description` box. Do not "simplify" back to a demuxer library without re-checking `VideoDecoder.configure` requires that `description`.
- **Initial Worker approach changed** — WebCodecs decode existed first as a main-thread implementation before the decode/draw was moved off the main thread into the Worker + OffscreenCanvas (the migration, not an optional refactor: main-thread decode was a measurable jank source during scroll).
- **Kept the `<video>` path instead of deleting it** — it is not dead code to remove; it is the permanent fallback floor (WebCodecs unavailable/failed/reduced-motion) and the first-paint path before the Worker is ready. Do not delete `useCinmeaticTimeLine.ts`'s scrub machinery.
- **`pin: true` rejected for the timeline** (both the stage and the hero) — CSS `sticky` won; pinning inserts spacer elements, thrashes layout on every scroll tick, and breaks the hero→timeline handoff.
- **`overscroll-contain` rejected on slide wrappers** — swallows desktop wheel events mid-scrub, freezing the page.
- **Blocking blob-upgrade rejected** (STAGE 3 regression) — scrubbing must never wait on network.
- **`scrub: 0.5` (lagged scrubbing) rejected** for the timeline — replaced with `scrub: true` because smoothing desyncs the frame from the thumb during mobile settle.
- **Lenis deliberately not added (yet)** — the deferred-unification decision, not an oversight: only the timeline scrubs today, and `ScrollTrigger.normalizeScroll(true)` on touch already solves the mobile problem Lenis would otherwise address. Add only when multiple scroll-driven subsystems need one shared progress value; measure on a real phone before/after.
- **AV1 rejected** as the codec — H.264 hardware decode is far more universal on mobile; AV1 is inconsistent on budget Android / older iPhones.
- **Mediabunny-crossfade duplication / false positives** — a couple of "bugs" were audit false-positives (e.g. a concern that briefly looked like a duplicate-crossfade regression) and were resolved as no-ops; the shipped crossfade is the single shared `computeCrossfade`. Treat the historical bug list above as indicative, not exhaustively ordered.

**Implementation vs verification.** These are two different claims and both matter. Nearly everything above is **implemented in code** (confirmed by reading `lib/webcodecs/`, `hooks/use*Timeline.ts`, `app/page.tsx`, the git log, and the deep-dive docs). **Actually verified on real iPhone/Android hardware** is a smaller, still-open subset: the WebCodecs path has feature-detection + a graceful `<video>` floor, but the "paints correctly and scrub feels right on every target device/browser" claim was never exhaustively confirmed on-device. Keep that frame of mind: code-complete ≠ device-verified. The `<video>` floor stays the safety net specifically because the primary path's real-device coverage is a known-open validation item. Where a doc disagrees with code, the code wins.

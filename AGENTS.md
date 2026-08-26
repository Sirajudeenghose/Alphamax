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
- Landing page composed in `app/page.tsx` (a `"use client"` component): `ScrollProgress` → `HeroSection` (autoplay `wedding-venue-hero.mp4`) → `CinematicTimeline` → `ContactSection` (`id="contact"`, lives in `sections/ContactSection.tsx`). `app/layout.tsx` adds a `<link rel="preload" as="video">` for the hero MP4. Content sections follow the UX-research arc (attention → orientation → proof → validation → action); copy is placeholder — keep the premium/dark/amber design language
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

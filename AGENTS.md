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
- Landing page composed in `app/page.tsx` (a `"use client"` component): `ScrollProgress` → `HeroSection` (autoplay `wedding-venue-hero.mp4`) → `CinematicTimeline` → `ContactSection`
- **`ExperienceSection`/`VenueSection` exist in `sections/` but are NOT rendered** — yet the hero CTA and timeline slide CTAs still link to `#venue`, a dead anchor. Don't "fix" either without intent
- Cinematic timeline (`components/ui/cinmeaticTimeLine.tsx`, filename misspelled): one pinned wrapper, two `<video>` elements crossfaded across a shared **virtual 0–20s timeline** (both source clips are 10.01s; timings baked into `CLIP_TIMING`) plus 5 text slides faded in/out from the `SLIDES` array. All driven by a single ScrollTrigger `onUpdate` via `gsap.set` in `hooks/useCinmeaticTimeLine.ts` (the misspelled file exports the correctly-cased `useCinematicTimeline`)
- `hooks/UseIsMobile.ts` (`useIsMobile`) swaps to mobile-aspect clips below 768px and widens the seek dedup threshold (0.08 vs 0.02) — desktop and mobile sets must stay duration-identical
- Touch devices: `page.tsx` calls `ScrollTrigger.normalizeScroll(true)` when `"ontouchstart" in window`
- Dead scaffolds, not rendered — do not treat as source of truth: `sections/movementsSction.tsx` (misspelled; its `CinematicVideoSection` references `/videos/signature-moment.mp4` + a poster that don't exist), `components/ui/CinematicVideoSection.tsx`, `hooks/usescrollscrubvideo.ts` (superseded by the timeline hook)
- GSAP helpers in `lib/helpers/animations.ts` (`easing`, `animateFrom`, `createScrollReveal`); `hooks/useReducedMotion.ts` for a11y
- Empty, unwired scaffolds — do not assume they're in use: `components/{common,layouts}/`, `app/{admin,api}/`, `constants/`, `types/`, `utils/`, `styles/`, `lib/{services,validations}/`

## Conventions
- `@/*` path alias maps to repo root (e.g. `@/components/`, `@/lib/`)
- `.env.local` is gitignored; copy `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Supabase helpers exist (`lib/supabase/client.ts`, `server.ts`) but nothing imports them yet
- Interactive/animated components start with `"use client"` — mirror the existing pattern
- GSAP ScrollTrigger pattern: guard on `useReducedMotion()`, kill triggers on cleanup, `ScrollTrigger.refresh()` on mount + resize (see `app/page.tsx`)

## Quirks
- Misspelled/non-camelCase filenames must be imported exactly as-is: `cinmeaticTimeLine.tsx`, `useCinmeaticTimeLine.ts`, `UseIsMobile.ts`, `usescrollscrubvideo.ts`
- Scroll-scrub REQUIRES the all-intra re-encoded (`keyint=1`) files: desktop `VIDEO 2 - scrub.mp4` / `VIDEO 3 - scrub.mp4`, mobile `VIDEO 2 MOBILE - scrub.mp4` / `VIDEO 3 MOBILE - scrub.mp4`. The plain originals (`VIDEO 2.mp4`, `VIDEO 2 mobile.mp4`, …) still exist in `public/videos/` but seek at a decode-limited pace — wiring them into the timeline looks broken. If video is re-exported, keep the "- scrub" pair, the 10.01s durations, and `CLIP_TIMING` in sync
- `public/videos/` holds large tracked MP4s, some with spaces/parens in filenames — don't add media without intent
- ESLint uses flat config `eslint.config.mjs` (`eslint-config-next/core-web-vitals` + `/typescript`)
- All `.env*` files are gitignored — never commit secrets

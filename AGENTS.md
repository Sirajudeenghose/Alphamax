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
- Landing page (wedding venue) composed in `app/page.tsx` (a `"use client"` component): one `sections/*Section.tsx` per section — Hero, StoryVideo (`VIDEO 2.mp4`), Video3 (`VIDEO 3.mp4`), Experience, Venue, Contact
- UI primitives in `components/ui/`: `VideoHero` (autoplay hero video), `CinematicVideoSection` (pinned scroll-scrubbed video section), `ScrollProgress`, `ParallaxSection`, `TextReveal`
- Scroll-scrubbed video technique: `hooks/usescrollscrubvideo.ts` pins a section and drives `video.currentTime` from scroll progress; `CinematicVideoSection` uses the hook, `sections/StoryVideoSection.tsx` inlines its own version of the same pattern
- `sections/movementsSction.tsx` (filename misspelled) is **not** rendered in `app/page.tsx` — an in-progress scaffold; its `CinematicVideoSection` points at `/videos/signature-moment.mp4` + a poster that don't exist yet. Don't treat it as the source of truth for page structure
- GSAP helpers in `lib/helpers/animations.ts` (`easing`, `animateFrom`, `createScrollReveal`); `hooks/useReducedMotion.ts` for a11y
- Empty, unwired scaffolds — do not assume they're in use: `components/{common,layouts}/`, `app/{admin,api}/`, `constants/`, `types/`, `utils/`, `styles/`, `lib/{services,validations}/`

## Conventions
- `@/*` path alias maps to repo root (e.g. `@/components/`, `@/lib/`)
- `.env.local` is gitignored; copy `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Supabase helpers exist (`lib/supabase/client.ts`, `server.ts`) but nothing imports them yet
- Interactive/animated components start with `"use client"` — mirror the existing pattern
- GSAP ScrollTrigger pattern: guard on `useReducedMotion()`, kill triggers on cleanup, `ScrollTrigger.refresh()` on mount + resize (see `app/page.tsx`)

## Quirks
- Hook file `hooks/usescrollscrubvideo.ts` is all-lowercase (not camelCase) — import path must match exactly
- `public/videos/` holds large tracked MP4s, some with spaces/parens in filenames (e.g. `VIDEO 2.mp4`, `wedding-venue-hero(1).mp4`) — don't add media without intent
- ESLint uses flat config `eslint.config.mjs` (`eslint-config-next/core-web-vitals` + `/typescript`)
- All `.env*` files are gitignored — never commit secrets

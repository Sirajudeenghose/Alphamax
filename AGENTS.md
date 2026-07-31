# Alphamax — Agent Guide

## Stack
- **Next.js 16** (App Router) + **React 19**, TypeScript strict, **Tailwind CSS 4**
- **Supabase** (client + server helpers in `lib/supabase/`)
- Animation: GSAP, Framer Motion. Icons: Lucide React. Forms: React Hook Form
- Package manager: **npm** (lockfile: `package-lock.json`)

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` (no npm script — run manually) |

## Conventions
- `@/*` path alias maps to repo root (e.g. `@/components/`, `@/lib/`)
- Tailwind v4 syntax: `@import "tailwindcss"` in CSS, no `tailwind.config`
- `.env.local` is gitignored; copy `.env.example` for required Supabase vars
- Components live under `components/{ui,common,layouts}/` — create if dirs are empty
- Supabase client: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server)
- Empty scaffolds exist at `constants/`, `types/`, `utils/`, `sections/`, `hooks/`, `styles/`, `lib/{services,validations,helpers}/`, `app/{admin,api}/` — project is early stage

## Notable quirks
- No test framework installed; no test script in `package.json`
- ESLint uses `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` (flat config in `eslint.config.mjs`)
- All `.env*` files are gitignored — never commit secrets

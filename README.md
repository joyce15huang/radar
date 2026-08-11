# Personal Daily Digest

A zero-anxiety, low-cognitive-load morning briefing. Each day you get a finite
deck of 10–12 "Micro-Dossier Cards" — world news, hyper-local gems, your
schedule, and life admin — that you clear one by one until you reach a
definitive **"You're all caught up for today."** state. The feed is designed to
be pre-generated overnight by an AI scout, so it's instant and calm the moment
you wake up.

## Status: Phase 1 complete — UI shell + static feed

This is the frontend-only shell running against **hardcoded** data. It nails the
layout, motion, and completion state before any backend is wired in.

- Centered, mobile-width column (`max-w-xl`) for a phone-like feel on desktop.
- Minimalist header: weekday briefing title + a live remaining-count pill.
- Card component: color-coded category tag, title, markdown summary, and an
  action bar (`[Primary Action]` + `[Dismiss]`).
- Framer Motion `AnimatePresence` — cards collapse vertically and disappear on
  dismiss/act.
- Calming "all caught up" completion screen when the deck is empty.
- Light + dark mode (follows your system setting).

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Dismiss (or act on) all 12 cards to reach the
completion screen.

## Tech stack

Next.js 14 (App Router) · React · TypeScript · Tailwind CSS · Framer Motion ·
Lucide React. Backend (Supabase) and the nightly AI scout arrive in later phases.

## Project structure

```
src/
  app/
    layout.tsx          Root layout + metadata + Geist fonts
    page.tsx            Server component: computes the date, renders the feed
    globals.css         Tailwind entry + small polish
  components/
    DigestFeed.tsx      Client: holds deck state, AnimatePresence orchestration
    DigestCard.tsx      Single card: tag, title, summary, action bar, collapse
    DigestHeader.tsx    Date title + remaining-count pill
    AllCaughtUp.tsx     Completion screen
    RichText.tsx        Tiny inline-markdown renderer (**bold**, *italic*, `code`)
  data/
    cards.ts            Phase 1 hardcoded deck (replaced by a Supabase query in Phase 4)
  lib/
    types.ts            DossierCard / CategoryKey / CardStatus
    categories.ts       Per-category label, icon, and color styling
```

## Roadmap

- **Phase 2** — Supabase auth + schema (`Users`, `Preferences`, `Cards`) and a
  profile page for the standing prompt.
- **Phase 3** — the nightly-scout API route: preferences → search query → Tavily
  → LLM synthesis → bulk-insert cards.
- **Phase 4** — fetch real `pending` cards, persist dismiss/act mutations, and a
  Vercel Cron job to run the scout overnight.

The `DossierCard` type and the `onAct` / `onDismiss` handlers in `DigestFeed`
are already shaped to map onto Supabase rows and mutations in Phase 4.

# Rally AI

**Your personal tennis coach. Powered by AI.**

Rally AI is a full-stack web app (installable as a PWA) that watches your tennis technique through
your phone or laptop camera, measures your movement on the device, gives short evidence-based cues
while you practise, and writes a detailed coaching report with drills afterwards. It tracks your
progress over time and only compares like with like.

> Perfect your game. One stroke at a time.

---

## What it does

| | |
|---|---|
| **Live Coach** | Full-screen camera with on-device pose tracking (MediaPipe), skeleton and joint-angle overlay, wrist trail, stroke-phase HUD, camera setup assistant, countdown, recording, pause/resume, one cue at a time with cooldowns, spoken cues, voice commands, Focus / Shadow / Drill modes. |
| **Video analysis** | Drag-and-drop or photo-library upload (MP4 / MOV / WebM), on-device frame-by-frame tracking with progress and cancel, then the same report and review tools as live sessions. |
| **Review player** | Slow motion, frame stepping, jump to next stroke, phase-coloured timeline, annotation markers that jump to the moment, skeleton overlay, fullscreen, frame screenshots, pose-only replay when no video is kept. |
| **Coaching report** | Top three improvements, AI summary, heuristic category snapshot, findings with *evidence → why it matters → how to fix → drill → priority → confidence*, limitations, the full measurement table, stroke-type correction. |
| **Training** | Weekly plan (on-device, optionally refined by AI), 23-drill library with objectives, steps, mistakes and success criteria, guided drill sessions, technique library, weekly challenge, favourites. |
| **Progress** | Practice frequency, streaks, metric trends grouped by stroke × camera view × method, recurring patterns, goals, and personal bests only when an improvement repeats. |
| **Compare** | Two strokes side by side, aligned on the estimated contact with manual offset, joint-angle charts, comparable-only measurement table, AI comparison. |
| **AI Coach chat** | Answers grounded in *your* session data, with links that jump to the session timestamp and suggested follow-ups. |
| **Privacy** | Private by default, guest mode with no account, opt-in cloud video, retention controls, JSON export, account deletion. |

## Honesty by design

Rally AI never presents something it can't measure as fact:

- Every measurement is labelled **Measured (2D)**, **Estimated (3D model)** or **Derived timing**, and
  has a confidence that depends on the camera angle *and* landmark visibility. Measurements with weak
  evidence are omitted, not shown with a misleading number.
- Ball contact is **always an estimate** (the ball and racket aren't tracked). No racket speed, ball
  speed, spin, racket-face angle, grip or exact 3D joint angles are reported.
- A finding needs to **repeat across strokes** before it appears in the report; a red "needs work"
  requires a large margin *and* at least medium confidence; 3D-estimate rules can never go red.
- Category scores are labelled as coaching heuristics, and categories without evidence show "—".
- AI output is schema-validated and then re-checked: unknown strokes, sessions and drills are dropped,
  timestamps are clamped, and confidence is capped by the tracking quality of the cited strokes.
- Local test mode returns deterministic **fixture** responses that are visibly labelled — and is
  refused in production, where a missing key yields "AI unavailable", never fake coaching.

## Quick start

Requirements: Node.js 20+ (tested on 24), npm.

```bash
npm install
cp .env.example .env.local      # optional — see below
npm run dev                     # http://localhost:3000
```

With **no configuration**, the app runs fully on the device: guest mode, live tracking, video
analysis and on-device reports. AI features report "unavailable".

To try the AI flows without an OpenAI key, set `AI_MODE=fixture` in `.env.local` (labelled test data).

To enable real AI coaching, set `OPENAI_API_KEY` (server-side only). To enable accounts and cloud
sync, configure Supabase (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

Optional: `npm run fetch-models` downloads the pose models into `public/mediapipe/models` so tracking
works fully offline (otherwise they load once from Google's MediaPipe model bucket and are cached by
the service worker).

> The camera needs a secure context: `http://localhost` works on the computer running the dev
> server. To test on a phone, use HTTPS (e.g. a deployed preview or `next dev --experimental-https`).

### Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server (copies the MediaPipe WASM runtime first) |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next + React Compiler hook rules) |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; starts a fixture-mode dev server) |
| `npm run check` | typecheck + lint + tests |

In development, `/dev/seed` creates clearly labelled **synthetic** sessions from stick-figure pose
fixtures so the report, progress, compare and chat screens can be exercised without a camera. The
route returns 404 in production.

## Configuration

All variables are documented in [`.env.example`](.env.example). Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | – | Enables AI reports, comparisons, chat, plans |
| `OPENAI_ANALYSIS_MODEL` | `gpt-6.1-sol` | Image-capable model for reports and comparisons |
| `OPENAI_FAST_MODEL` | `gpt-6-luna` | Cheaper model for chat and plans |
| `ENABLE_REALTIME` / `OPENAI_REALTIME_MODEL` | `false` / `gpt-realtime-2.1` | Conversational voice coach (WebRTC) |
| `AI_IMAGE_DETAIL` | `low` | Image detail for key frames (cost lever) |
| `AI_DAILY_BUDGET_USD_PER_USER` / `_GLOBAL` | `0.50` / `10` | Daily spend caps (estimated from tokens) |
| `AI_REQUESTS_PER_10_MIN` | `12` | Per-user rate limit (chat gets 2×) |
| `AI_PRICE_ANALYSIS` / `AI_PRICE_FAST` | `2,10` / `0.1,0.5` | USD per 1M tokens for cost estimates — keep in sync with current pricing |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | – | Accounts and cloud sync |
| `SUPABASE_SERVICE_ROLE_KEY` | – | Server-only: usage ledger + account deletion |

Model IDs change over time — check the [OpenAI models page](https://developers.openai.com/api/docs/models)
and set the variables accordingly. Any image-capable model that supports Structured Outputs in the
Responses API works.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — the two analysis systems, data flow, modules, data model
- [Deployment & Supabase setup](docs/DEPLOYMENT.md)
- [Manual device testing checklist](docs/MANUAL_TESTING.md)
- [Status, known limitations & roadmap](docs/STATUS.md)

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Motion ·
Lucide · Recharts · MediaPipe Tasks Vision (Pose Landmarker) · OpenAI SDK (Responses API,
Structured Outputs, Realtime) · Zod 4 · Supabase (Auth, Postgres + RLS, Storage) · IndexedDB (idb) ·
Vitest · Playwright.

---

Rally AI provides technique coaching only. It is not a medical or injury-diagnosis tool.

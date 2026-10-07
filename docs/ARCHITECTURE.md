# Architecture

## Two cooperating analysis systems

```
                         ┌──────────────────────── Browser (System A, on-device) ───────────────────────┐
 camera / video file ──► │ MediaPipe Pose Landmarker (GPU→CPU fallback, full→lite model by device speed) │
                         │   → One Euro landmark smoothing                                              │
                         │   → per-frame features (angles, rotation estimates, wrist speed, balance…)  │
                         │   → streaming stroke segmentation + phases (ready … recovery)               │
                         │   → classification (manual selection preferred)                            │
                         │   → per-stroke measurements with method + view-gated confidence            │
                         │   → evidence-gated rules → cue scheduler → visual + spoken cues            │
                         │   → key-frame ring buffer (a few JPEGs per stroke)                         │
                         └──────────────┬─────────────────────────────────────────────────────────────┘
                                        │ stored session: strokes, measurements, findings, pose trace
                                        ▼
                         ┌──────────── Server (System B, asynchronous) ─────────────┐
 ≤ 8 strokes, ≤ 20 small│ /api/ai/report  size limit → Zod → availability → identity │
 key frames + numbers ─►│ → rate limit → cache → budget → concurrency slot           │──► OpenAI Responses API
                         │ → structured output (zodTextFormat) → re-validate          │    (store: false)
                         │ → post-process (drop unknown ids, cap confidence) → usage  │
                         └───────────────────────────────────────────────────────────┘
```

The camera preview never waits on the network. System A runs at a device-dependent inference rate
(adaptive 15–60 Hz, measured from actual detect time) inside a `requestVideoFrameCallback` loop; UI
state is published ~8×/s; the per-frame loop lives in refs, not React state. System B is called once
per session (plus explicit compare/chat/plan requests) through a persistent job queue.

## Source layout

```
src/
  app/                     routes (App Router)
    (app)/                 signed-in-or-guest app shell: dashboard, analyze, sessions, progress,
                           compare, training, assistant, profile, settings
    coach/live/            full-screen Live Coach (setup step + HUD)
    api/ai/*               report, compare, chat, plan, realtime (client secret), status
    api/account/delete     account deletion (service role)
    auth/callback          Supabase email/magic-link callback
    dev/seed               development-only synthetic data tool (404 in production)
  components/              glass design system, report, review player, charts, UI primitives
  hooks/use-live-coach.ts  the live engine
  lib/
    cv/                    landmarks, geometry, smoothing, features, segmentation, classify,
                           metrics, rules, cues, quality, footwork, trace, overlay, vision, keyframes, pipeline
    ai/                    Zod schemas, prompt templates, post-processing, labelled fixtures
    server/                env validation, AI route pipeline, guards (rate limit, LRU, semaphore), usage/budgets, OpenAI wrapper
    analysis/              request building, persistent job queue, video processing, finalisation, corrections
    data/                  DataStore interface, IndexedDB store, Supabase store, React provider + hooks
    progress/ plan/ chat/  trends & comparability, local plan generator, chat context builder
    tennis/                domain types, labels, drill library, technique library
    voice/                 speech synthesis + recognition, Realtime WebRTC client
supabase/
  migrations/              schema, RLS policies, storage bucket + policies
  seed.sql                 drill reference data (generated from the drill library)
tests/
  unit/ integration/       Vitest
  e2e/                     Playwright
  fixtures/synthetic.ts    synthetic, licence-free pose traces with ground-truth contact times
```

The CV and AI layers are framework-free TypeScript modules (no React, no DOM except `vision.ts`,
`keyframes.ts`, `overlay.ts`), so they can be reused by future native apps or a server worker.

## Computer-vision details

- **Coordinates.** Image landmarks are aspect-corrected; lengths are in *torso lengths*
  (mid-shoulder → mid-hip, median-stabilised) so results are comparable across players and distances.
- **Rotation** uses MediaPipe's monocular "world" landmarks (yaw of the shoulder and hip lines). It is
  always labelled as an estimate and capped at medium confidence.
- **Segmentation** anchors each stroke on a peak of hitting-wrist speed, walks back to the start of
  preparation and the backswing turnaround (loading), forward to the end of the follow-through and to
  the moment the player settles (recovery). Contact is the speed peak for groundstrokes and the
  highest hand point for serves/overheads — always marked *estimated*. Boundaries are marked
  approximate when visibility is low. The same function runs offline and on a rolling live buffer.
- **View suitability** (`cv/config.ts`) decides which measurement families are trustworthy per
  camera angle (e.g. knee angles: side/diagonal = medium, front/rear = low).
- **Mirroring**: mirrored uploads are un-mirrored by flipping x *and* swapping anatomical left/right,
  so the hitting arm is still identified correctly.
- **Quality checks** (setup assistant): person present, whole body in frame, feet, arms, distance,
  lighting (thumbnail luminance), camera stability (thumbnail change outside the player box),
  bystanders (2-pose detection), tracking confidence; "room to swing" is a manual item.

## Live cues

`CueScheduler`: one cue at a time, priority × confidence ordering, 7 s global and 25 s per-cue
cooldowns, 90 s back-off after two repeats, stale cues dropped after 6 s, cues held while the player is
swinging or audio is playing, user-muted categories and Focus mode filtering, and low-confidence
evidence never produces a live cue.

## Data model

Normalised Postgres schema (`supabase/migrations/20261006000000_init.sql`):
`profiles`, `sessions`, `strokes`, `measurements`, `feedback`, `reports`, `training_plans`,
`drills` (shared reference data), `drill_logs`, `goals` (progress goals), `conversations`, `messages`,
`favorites`, `analysis_jobs`, `ai_usage`.

- Every user-owned table has `user_id` defaulting to `auth.uid()`, an index, and an RLS policy
  `user_id = auth.uid()` for all operations; child inserts additionally require the parent to be owned
  by the same user (restrictive policies).
- `ai_usage` is readable by its owner and writable only by the service role.
- Deleting an auth user cascades to all rows; storage objects are removed by `/api/account/delete`.
- Recordings live in a private `recordings` bucket under `<user id>/…`, readable only by the owner
  and served through short-lived signed URLs.

Guest mode uses the same shapes in IndexedDB (`LocalStore`); signed-in users get a `SupabaseStore`
(records in Postgres, media cached per user in a separate IndexedDB database, recordings uploaded only
on opt-in). Guest data is never uploaded or merged automatically.

## AI integration

- Official `openai` SDK, `responses.parse` with `zodTextFormat` (Structured Outputs), `store: false`,
  hashed `safety_identifier`, timeouts and SDK retries.
- Separate prompt templates for reports, comparisons, chat and plans share one set of coaching
  principles (evidence first, no invented measurements, handedness/view awareness, uncertainty,
  no medical claims). Session data is passed as delimited JSON *data* and the model is told to ignore
  instructions inside it.
- Every response is re-validated with the same Zod schema and post-processed before it is stored.
- Realtime voice: the server mints a 10-minute client secret (`/v1/realtime/client_secrets`); the
  browser connects with WebRTC (`/v1/realtime/calls`). The API key never reaches the client.

## Cost controls

Budget-conscious defaults: low image detail, ≤ 8 strokes and ≤ 20 frames per report, a cheaper model
for chat/plans, request de-duplication cache, per-user rate limits, per-user and global daily budgets
(in memory, and in `ai_usage` when Supabase is configured), a concurrency semaphore, and a persistent
client job queue with retry/back-off and cancellation. If OpenAI is unavailable the on-device analysis
is complete on its own.

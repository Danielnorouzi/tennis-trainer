# Status, known limitations & roadmap

## Task checklist

### Phase 1 — Foundation
- [x] Next.js 16 App Router, strict TypeScript, Tailwind 4, Motion, Lucide, Recharts
- [x] Design tokens (light/dark), glass component system, reduced transparency & motion
- [x] Responsive navigation (floating tab bar on phones, sidebar on desktop)
- [x] Supabase auth (email/password + magic link), session-refresh proxy, auth callback
- [x] Database schema, indexes, foreign keys, cascades, RLS, private storage policies, drill seed
- [x] Guest mode (IndexedDB) and signed-in mode (Supabase) behind one `DataStore` interface

### Phase 2 — Computer vision
- [x] Camera access with front/rear, resolution, mirroring, orientation-aware layout
- [x] MediaPipe Pose Landmarker with GPU/CPU benchmarking and full/lite model selection
- [x] One Euro smoothing, aspect-corrected features, torso-length normalisation
- [x] Skeleton/angle/trail overlay with evidence colours
- [x] Camera setup assistant with live checks + manual items

### Phase 3 — Live coaching
- [x] Session controls, countdown, recording (MP4/WebM negotiation), pause/resume, background pause
- [x] Streaming segmentation and phase tracking; manual stroke selection; shadow, focus, drill modes
- [x] Evidence-gated rules and cue scheduler; spoken cues; voice commands; feedback history

### Phase 4 — OpenAI
- [x] Secure server routes: report, compare, chat, plan, realtime client secret, status
- [x] Key-frame sampling, Structured Outputs, re-validation, post-processing, prompt templates
- [x] Rate limits, budgets, cache, concurrency limit, usage logging, labelled fixture mode
- [x] Persistent job queue with retry, resume and cancel

### Phase 5 — Training intelligence
- [x] Drill library (23), technique library, local + AI plans, drill logging, weekly challenge
- [x] Progress trends with comparability rules, personal bests, recurring patterns, goals
- [x] Compare workspace with sync, manual alignment, angle charts and AI comparison
- [x] Chat grounded in the user's own sessions with timestamp links

### Phase 6 — Refinement
- [x] PWA manifest, generated icons, service worker (app shell + CV runtime caching)
- [x] Landing, privacy, sign-in/up, 404, loading and error states
- [x] Unit (95), integration and end-to-end (14) tests; typecheck and lint clean; production build passes
- [ ] Physical-device test pass (see [MANUAL_TESTING.md](MANUAL_TESTING.md))

## Known limitations (honest list)

- **Not validated on real players yet.** Thresholds in `src/lib/cv/config.ts` and `rules.ts` are
  reasoned, conservative starting points, tested against synthetic traces only. They need tuning
  against real footage reviewed by a coach.
- **No ball or racket tracking.** Contact is estimated from body motion; grip, racket-face angle,
  spin, ball/racket speed are not measured. No reliable in-browser tennis racket/ball model was
  included; the architecture leaves room for one (`lib/cv/vision.ts`).
- **Single camera, monocular 3D.** Rotation and stance width use MediaPipe's world-landmark estimates
  and are labelled as estimates. No multi-camera calibration.
- **Automatic stroke classification is heuristic** (forehand/backhand by preparation side, serve by
  hand height and toss arm). Volley/slice detection is low confidence; return, approach and defensive
  shots are only available via manual correction. Manual selection is the recommended default.
- **Pose inference runs on the main thread** (adaptive rate). Moving MediaPipe into a Web Worker with
  OffscreenCanvas would reduce jank on low-end phones but isn't universally supported on iOS Safari yet.
- **Video compression is not implemented.** Uploaded videos are processed locally at full size;
  only small JPEG key frames are ever sent to the AI. Cloud backup uploads the original file (500 MB cap).
- **In-memory rate limiting/cache** (see DEPLOYMENT.md §4) is per instance.
- **Report generation runs inside a request** with a client-side persistent queue, not a server-side
  durable worker.
- **Guest → account migration** is not automatic (users can export JSON first).
- **Footwork metrics** (split steps, lateral bursts) are coarse proxies without court calibration.
- **Remote camera pairing and coach sharing** are not implemented (see roadmap).

## Roadmap (next most valuable)

1. Tune thresholds with labelled real footage; add per-style rule variants (open vs neutral stance).
2. Web Worker inference + OffscreenCanvas where supported.
3. Ball detection (where a reliable model exists) to verify contact and measure spacing.
4. Smart Replay: auto-save the most instructive strokes with their observations.
5. Remote camera: one device films, another shows controls/results (WebRTC + secure pairing code).
6. Coach sharing with explicit, revocable, per-session links.
7. Server-side durable job queue and shared rate-limit store.
8. Guest-to-account import.
9. Licensed professional reference strokes for comparison.
10. Native iOS/Android shells reusing `lib/cv`, `lib/ai` and the API routes.

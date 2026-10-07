# Deployment

Rally AI is a standard Next.js 16 app. Any Node.js host works (Vercel, Netlify, Fly.io, Render, a
container). It needs HTTPS in production — browsers only allow camera and microphone access in a
secure context.

## 1. Minimal deployment (on-device only)

```bash
npm ci
npm run build
npm start          # PORT=3000 by default
```

No environment variables are required. Users get guest mode with on-device tracking and reports.

## 2. Enable AI coaching (OpenAI)

Set on the server (never with a `NEXT_PUBLIC_` prefix):

```
OPENAI_API_KEY=sk-...
OPENAI_ANALYSIS_MODEL=<image-capable model>   # default gpt-6.1-sol
OPENAI_FAST_MODEL=<cheaper model>             # default gpt-6-luna
AI_DAILY_BUDGET_USD_PER_USER=0.50
AI_DAILY_BUDGET_USD_GLOBAL=10
AI_PRICE_ANALYSIS=<input,output USD per 1M tokens>
AI_PRICE_FAST=<input,output USD per 1M tokens>
```

Optional conversational voice coach:

```
ENABLE_REALTIME=true
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
```

Check `GET /api/ai/status` — it reports `"ai": "live"` when configured (and never returns secrets).

**Do not** set `AI_MODE=fixture` in production; the server refuses fixture mode when
`NODE_ENV=production` and reports AI as unavailable instead.

## 3. Enable accounts, sync and private cloud storage (Supabase)

1. Create a Supabase project.
2. Apply the schema and policies — either:
   - **SQL editor:** paste and run `supabase/migrations/20261006000000_init.sql`, then `supabase/seed.sql`; or
   - **CLI:**
     ```bash
     npx supabase login
     npx supabase init            # once, creates supabase/config.toml
     npx supabase link --project-ref <your-ref>
     npx supabase db push
     npx supabase db execute --file supabase/seed.sql   # or run seed.sql in the SQL editor
     ```
3. **Auth → URL configuration:** set the Site URL to your domain and add
   `https://<your-domain>/auth/callback` to the redirect allow-list.
4. **Auth → Providers → Email:** enable email + password (and confirm-email if you want it).
5. Set the environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only
   ```
6. Verify RLS: in the SQL editor, `select tablename, rowsecurity from pg_tables where schemaname = 'public';`
   — every table should show `true`.

The migration creates the private `recordings` storage bucket (500 MB per file, video MIME types
only) with owner-only policies on `<user id>/…` paths.

If you regenerate the drill library, run `node scripts/gen-drill-seed.mts` and re-apply `seed.sql`.

## 4. Scaling notes

- **Rate limits, the response cache and the concurrency semaphore are in-process memory.** They are
  correct for a single Node instance. On multi-instance/serverless deployments, budgets are still
  enforced against the `ai_usage` table (when the service-role key is set), but rate limiting and
  caching become per-instance — put a shared store (e.g. Redis/Upstash) behind `lib/server/guards.ts`
  if you need strict global limits.
- **Report generation** runs inside the request (`maxDuration` 120 s on `/api/ai/report`). The client
  job queue persists jobs, retries transient failures and resumes after reloads. For very long
  analyses, move `/api/ai/report` behind a durable queue (e.g. Supabase Queues / pg-boss / Inngest).
- The service worker caches the app shell, build assets and the MediaPipe runtime/models; API and
  auth routes are never cached.

## 5. Vercel specifics

- Framework preset: Next.js. Build command `npm run build` (runs the MediaPipe copy step).
- Add the environment variables above; mark `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as
  sensitive.
- Function max duration: ensure your plan allows 120 s for `/api/ai/report`.

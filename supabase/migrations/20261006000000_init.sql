-- Rally AI — initial schema
-- Every user-owned table carries user_id and is protected by Row Level Security so a user can only
-- ever read or write their own rows. Deleting an auth user cascades to all their data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  experience text not null default 'intermediate' check (experience in ('beginner', 'intermediate', 'advanced')),
  handedness text not null default 'right' check (handedness in ('right', 'left')),
  backhand text not null default 'two' check (backhand in ('one', 'two')),
  frequency text not null default 'weekly',
  goals text[] not null default '{}',
  preferred_strokes text[] not null default '{}',
  challenges text[] not null default '{}',
  equipment text[] not null default '{}',
  environment text not null default 'both' check (environment in ('court', 'home', 'both')),
  with_ball boolean not null default true,
  onboarded boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();

-- create an empty profile row when a user signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- drills (shared, read-only reference data; seeded below)
-- ---------------------------------------------------------------------------------------------
create table public.drills (
  id text primary key,
  title text not null,
  category text not null,
  focus text[] not null default '{}',
  objective text not null,
  instructions text[] not null default '{}',
  reps text not null,
  duration_min int not null check (duration_min between 1 and 120),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  common_mistakes text[] not null default '{}',
  success_criteria text[] not null default '{}',
  needs_ball boolean not null default false,
  needs_court boolean not null default false
);

-- ---------------------------------------------------------------------------------------------
-- sessions, strokes, measurements, feedback, reports
-- ---------------------------------------------------------------------------------------------
create table public.sessions (
  id text primary key check (char_length(id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms int not null default 0 check (duration_ms >= 0),
  source text not null check (source in ('live', 'upload')),
  mode text not null default 'standard' check (mode in ('standard', 'shadow', 'drill', 'focus')),
  selection text not null,
  camera_view text not null check (camera_view in ('side', 'front', 'rear', 'diagonal')),
  handedness text not null check (handedness in ('right', 'left')),
  mirrored boolean not null default false,
  focus text,
  drill_id text references public.drills (id) on delete set null,
  status text not null check (status in ('recording', 'processing', 'complete', 'failed', 'interrupted')),
  analysis_status text not null default 'none',
  analysis_error text,
  has_recording boolean not null default false,
  recording_mime text,
  recording_path text,
  video_w int,
  video_h int,
  tracked_fraction real not null default 0,
  avg_visibility real not null default 0,
  local_report jsonb,
  selected_goal text,
  notes text not null default '' check (char_length(notes) <= 4000),
  favorite boolean not null default false,
  live_cues jsonb not null default '[]'::jsonb
);
create index sessions_user_created_idx on public.sessions (user_id, created_at desc);

create table public.strokes (
  id text primary key check (char_length(id) <= 64),
  session_id text not null references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idx int not null,
  type text not null,
  type_source text not null check (type_source in ('auto', 'manual', 'user_corrected')),
  type_confidence text not null check (type_confidence in ('low', 'medium', 'high')),
  type_reasons text[] not null default '{}',
  t0 double precision not null,
  t1 double precision not null,
  contact_t double precision not null,
  phases jsonb not null default '[]'::jsonb,
  quality text not null check (quality in ('low', 'medium', 'high')),
  visibility real not null,
  recovery_observed boolean not null default false,
  excluded boolean not null default false,
  key_frame_times double precision[] not null default '{}'
);
create index strokes_session_idx on public.strokes (session_id, idx);
create index strokes_user_type_idx on public.strokes (user_id, type);

create table public.measurements (
  id bigint generated always as identity primary key,
  stroke_id text not null references public.strokes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  label text not null,
  value double precision not null,
  unit text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  method text not null check (method in ('measured_2d', 'estimated_3d', 'derived')),
  note text
);
create index measurements_stroke_idx on public.measurements (stroke_id);
create index measurements_user_key_idx on public.measurements (user_id, key);

create table public.feedback (
  id text primary key check (char_length(id) <= 64),
  session_id text not null references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('local', 'ai')),
  rule_id text,
  category text not null,
  title text not null,
  observation text not null,
  evidence text[] not null default '{}',
  why_it_matters text not null default '',
  adjustment text not null default '',
  drill_id text,
  priority text not null check (priority in ('high', 'medium', 'low')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  severity text not null check (severity in ('ok', 'watch', 'issue', 'insufficient')),
  stroke_ids text[] not null default '{}',
  t0 double precision,
  t1 double precision,
  cue text
);
create index feedback_session_idx on public.feedback (session_id);

create table public.reports (
  session_id text primary key references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report jsonb not null,
  model text not null,
  mode text not null check (mode in ('live', 'fixture')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- training: plans, drill log, goals (progress)
-- ---------------------------------------------------------------------------------------------
create table public.training_plans (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  source text not null check (source in ('local', 'ai')),
  title text not null,
  rationale text not null default '',
  weekly_goals text[] not null default '{}',
  days jsonb not null default '[]'::jsonb,
  active boolean not null default false
);
create index training_plans_user_idx on public.training_plans (user_id, created_at desc);
create unique index training_plans_one_active on public.training_plans (user_id) where active;

create table public.drill_logs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  drill_id text not null references public.drills (id) on delete cascade,
  completed_at timestamptz not null default now(),
  reps int check (reps is null or reps between 0 and 10000),
  rating int check (rating is null or rating between 1 and 5),
  notes text not null default '' check (char_length(notes) <= 2000),
  session_id text references public.sessions (id) on delete set null
);
create index drill_logs_user_idx on public.drill_logs (user_id, completed_at desc);

create table public.goals (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) <= 200),
  category text not null,
  metric_key text,
  stroke_type text,
  active boolean not null default true,
  notes text not null default ''
);
create index goals_user_idx on public.goals (user_id);

-- ---------------------------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------------------------
create table public.conversations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default '',
  session_ids text[] not null default '{}'
);
create index conversations_user_idx on public.conversations (user_id, updated_at desc);

create table public.messages (
  id text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  details text,
  refs jsonb not null default '[]'::jsonb,
  follow_ups text[] not null default '{}',
  mode text,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- favorites, analysis jobs, AI usage
-- ---------------------------------------------------------------------------------------------
create table public.favorites (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('drill', 'session', 'finding')),
  ref_id text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);

create table public.analysis_jobs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text not null references public.sessions (id) on delete cascade,
  kind text not null,
  status text not null check (status in ('queued', 'running', 'complete', 'failed', 'cancelled')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analysis_jobs_user_status_idx on public.analysis_jobs (user_id, status);
create trigger analysis_jobs_updated before update on public.analysis_jobs for each row execute function public.touch_updated_at();

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  analysis_type text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles: own row" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'strokes', 'measurements', 'feedback', 'reports', 'training_plans', 'drill_logs',
    'goals', 'conversations', 'messages', 'favorites', 'analysis_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%s: own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t, t);
  end loop;
end $$;

-- child rows must belong to a parent owned by the same user
create policy "strokes: parent owned" on public.strokes as restrictive for insert to authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "measurements: parent owned" on public.measurements as restrictive for insert to authenticated
  with check (exists (select 1 from public.strokes s where s.id = stroke_id and s.user_id = (select auth.uid())));
create policy "feedback: parent owned" on public.feedback as restrictive for insert to authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "messages: parent owned" on public.messages as restrictive for insert to authenticated
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

-- AI usage: users may read their own usage; only the service role (server) writes it.
alter table public.ai_usage enable row level security;
create policy "ai_usage: read own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Drills: readable by everyone, writable by nobody through the API.
alter table public.drills enable row level security;
create policy "drills: public read" on public.drills for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- Private storage for recordings and pose traces: <bucket>/<user id>/<file>
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 524288000,
        array['video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "recordings: read own" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings: update own" on storage.objects for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Run once in Supabase SQL Editor. This schema is intentionally user-scoped.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  target_role text not null default '',
  skills jsonb not null default '[]'::jsonb,
  timezone text not null default 'America/Toronto',
  email_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_evidence (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('project','experience','education','skill')),
  title text not null,
  details text not null,
  source text not null default 'User-confirmed',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company text not null,
  location text,
  description text,
  source_url text,
  source_name text,
  fetched_at date,
  status text not null default 'shortlisted' check (status in ('shortlisted','preparing','applied','assessment','interview','offer','closed')),
  next_date date,
  analysis jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proof_sprints (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete cascade,
  title text not null,
  deliverable text not null,
  checklist jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned','in_progress','complete')),
  honest_resume_bullet text,
  target_requirement text,
  artifact_url text,
  artifact_notes text,
  evidence_id uuid references public.candidate_evidence(id) on delete set null,
  completed_at timestamptz,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.milestones (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete cascade,
  kind text not null check (kind in ('assessment','interview','follow_up','deadline')),
  due_at timestamptz not null,
  note text,
  completed_at timestamptz,
  reminder_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.coding_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete set null,
  language text not null,
  challenge_id text,
  passed boolean not null default false,
  result_summary text,
  feedback jsonb not null default '{}'::jsonb,
  elapsed_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete set null,
  transcript text,
  score integer check (score between 0 and 100),
  feedback jsonb not null default '{}'::jsonb,
  question_plan jsonb not null default '[]'::jsonb,
  turns jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','complete','discarded')),
  consent_to_save boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_imports (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  file_name text not null,
  file_type text not null,
  parse_status text not null default 'pending' check (parse_status in ('pending','ready','failed')),
  proposed_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.application_kits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete cascade,
  selected_evidence_ids jsonb not null default '[]'::jsonb,
  content jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.extension_connections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  extension_id text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Source connections are private intake records. They describe where a user chose to
-- pull evidence from; they never turn source material into approved evidence by themselves.
create table if not exists public.profile_connections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','resume','linkedin_export','linkedin_reference')),
  external_id text,
  status text not null default 'connected' check (status in ('connected','needs_refresh','error','disconnected')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.reminder_deliveries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (milestone_id, reminder_key)
);

-- Existing hackathon projects can run this safely after the initial schema.
alter table public.profiles add column if not exists timezone text not null default 'America/Toronto';
alter table public.profiles add column if not exists email_reminders boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists onboarding jsonb not null default '{}'::jsonb;
alter table public.proof_sprints add column if not exists target_requirement text;
alter table public.proof_sprints add column if not exists artifact_url text;
alter table public.proof_sprints add column if not exists artifact_notes text;
alter table public.proof_sprints add column if not exists evidence_id uuid references public.candidate_evidence(id) on delete set null;
alter table public.proof_sprints add column if not exists completed_at timestamptz;
alter table public.milestones add column if not exists completed_at timestamptz;
alter table public.milestones add column if not exists reminder_enabled boolean not null default true;
alter table public.coding_attempts add column if not exists challenge_id text;
alter table public.coding_attempts add column if not exists feedback jsonb not null default '{}'::jsonb;
alter table public.coding_attempts add column if not exists elapsed_seconds integer;
alter table public.interview_sessions add column if not exists question_plan jsonb not null default '[]'::jsonb;
alter table public.interview_sessions add column if not exists turns jsonb not null default '[]'::jsonb;
alter table public.interview_sessions add column if not exists status text not null default 'in_progress';
alter table public.interview_sessions add column if not exists consent_to_save boolean not null default false;

alter table public.saved_jobs drop constraint if exists saved_jobs_status_check;
update public.saved_jobs set status = 'shortlisted' where status = 'saved';
alter table public.saved_jobs alter column status set default 'shortlisted';
alter table public.saved_jobs add constraint saved_jobs_status_check check (status in ('shortlisted','preparing','applied','assessment','interview','offer','closed')) not valid;

alter table public.profiles enable row level security;
alter table public.candidate_evidence enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.proof_sprints enable row level security;
alter table public.milestones enable row level security;
alter table public.coding_attempts enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.evidence_imports enable row level security;
alter table public.application_kits enable row level security;
alter table public.extension_connections enable row level security;
alter table public.profile_connections enable row level security;
alter table public.reminder_deliveries enable row level security;

drop policy if exists "profiles are private" on public.profiles;
drop policy if exists "evidence is private" on public.candidate_evidence;
drop policy if exists "jobs are private" on public.saved_jobs;
drop policy if exists "sprints are private" on public.proof_sprints;
drop policy if exists "milestones are private" on public.milestones;
drop policy if exists "attempts are private" on public.coding_attempts;
drop policy if exists "interviews are private" on public.interview_sessions;
drop policy if exists "imports are private" on public.evidence_imports;
drop policy if exists "application kits are private" on public.application_kits;
drop policy if exists "extension connections are private" on public.extension_connections;
drop policy if exists "reminder deliveries are private" on public.reminder_deliveries;
drop policy if exists "profile connections are private" on public.profile_connections;
create policy "profiles are private" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "evidence is private" on public.candidate_evidence for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jobs are private" on public.saved_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sprints are private" on public.proof_sprints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "milestones are private" on public.milestones for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attempts are private" on public.coding_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "interviews are private" on public.interview_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "imports are private" on public.evidence_imports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "application kits are private" on public.application_kits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "extension connections are private" on public.extension_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminder deliveries are private" on public.reminder_deliveries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profile connections are private" on public.profile_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private resume storage. Raw uploads remain opt-in and are not sent to the AI automatically.
insert into storage.buckets (id, name, public) values ('resume-files', 'resume-files', false) on conflict (id) do nothing;
drop policy if exists "resume uploads are private" on storage.objects;
create policy "resume uploads are private" on storage.objects for all using (bucket_id = 'resume-files' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = 'resume-files' and auth.uid()::text = (storage.foldername(name))[1]);

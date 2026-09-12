-- Run once in Supabase SQL Editor. This schema is intentionally user-scoped.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  target_role text not null default '',
  skills jsonb not null default '[]'::jsonb,
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
  status text not null default 'saved' check (status in ('saved','applied','assessment','interview','offer')),
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
  created_at timestamptz not null default now()
);

create table if not exists public.coding_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete set null,
  language text not null,
  passed boolean not null default false,
  result_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete set null,
  transcript text,
  score integer check (score between 0 and 100),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.candidate_evidence enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.proof_sprints enable row level security;
alter table public.milestones enable row level security;
alter table public.coding_attempts enable row level security;
alter table public.interview_sessions enable row level security;

create policy "profiles are private" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "evidence is private" on public.candidate_evidence for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jobs are private" on public.saved_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sprints are private" on public.proof_sprints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "milestones are private" on public.milestones for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attempts are private" on public.coding_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "interviews are private" on public.interview_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private resume storage. Raw uploads remain opt-in and are not sent to the AI automatically.
insert into storage.buckets (id, name, public) values ('resume-files', 'resume-files', false) on conflict (id) do nothing;
create policy "resume uploads are private" on storage.objects for all using (bucket_id = 'resume-files' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = 'resume-files' and auth.uid()::text = (storage.foldername(name))[1]);

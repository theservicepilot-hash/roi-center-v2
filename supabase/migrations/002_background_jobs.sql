-- Internal job queue (no Inngest / Trigger / Redis)
create table if not exists background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'error')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text not null default '',
  result jsonb,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_background_jobs_pending
  on background_jobs (run_after, created_at)
  where status = 'pending';

create index if not exists idx_background_jobs_type
  on background_jobs (job_type, status);

drop trigger if exists trg_background_jobs_updated_at on background_jobs;
create trigger trg_background_jobs_updated_at
  before update on background_jobs
  for each row execute function set_updated_at();

alter table background_jobs enable row level security;
-- No anon policies: service role only

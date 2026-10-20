-- Core tables: profiles, jobs, documents, applications (docs/CONTRACT.md, section 5).
-- Every table is owned by a user (user_id -> auth.users, on delete cascade). Row Level Security is enabled in
-- 20261020100200_rls.sql; this file only creates structure, constraints, indexes and updated_at triggers.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ profiles

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  headline text not null default '',
  summary text not null default '',
  cv jsonb not null default '{"contact":{"name":"","email":"","phone":"","location":""},"experience":[],"education":[],"skills":{"has":[],"lacks":[]},"languages":[],"links":[]}'::jsonb,
  search_settings jsonb not null default '{"keywords":[],"cities":["Amsterdam","Rotterdam","Den Haag"],"remote":"hybrid-or-remote","englishOnly":false,"minSeniority":"any"}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint profiles_cv_is_object check (jsonb_typeof(cv) = 'object'),
  constraint profiles_search_settings_is_object check (jsonb_typeof(search_settings) = 'object')
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ jobs

create table if not exists public.jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  company text not null,
  location text not null default 'Unknown',
  url text,
  source text not null,
  description text not null default '',
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  status text not null default 'new',
  fit smallint not null default 0,
  category text not null default 'C',
  hybrid text not null default 'unclear',
  hybrid_quote text,
  language text not null default 'unknown',
  recommended_document_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint jobs_pkey primary key (user_id, id),
  constraint jobs_id_not_empty check (length(id) > 0),
  constraint jobs_status_check check (status in ('new', 'applied', 'skipped')),
  constraint jobs_fit_check check (fit between 0 and 5),
  constraint jobs_category_check check (category in ('A', 'B', 'C', 'D')),
  constraint jobs_hybrid_check check (hybrid in ('quoted', 'unclear', 'office-first')),
  constraint jobs_language_check check (language in ('english', 'dutch', 'unknown'))
);

create index if not exists jobs_user_status_first_seen_idx
  on public.jobs (user_id, status, first_seen_at desc);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ documents
-- job_id has no foreign key: the contract keeps it a free reference (a composite FK with on delete set null would
-- also null user_id). Object path convention: {user_id}/{document_id}/{filename}; only the {user_id}/ prefix is
-- enforced here (and by the storage policies).

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text,
  kind text not null,
  filename text not null,
  mime text not null,
  size_bytes integer not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint documents_user_id_id_key unique (user_id, id),
  constraint documents_kind_check check (kind in ('cv', 'letter', 'template')),
  constraint documents_filename_check check (length(filename) between 1 and 255),
  constraint documents_mime_check check (
    mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ),
  constraint documents_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint documents_storage_path_check check (left(storage_path, 37) = user_id::text || '/')
);

create index if not exists documents_user_kind_idx on public.documents (user_id, kind);
create index if not exists documents_expires_at_idx on public.documents (expires_at) where expires_at is not null;

-- ------------------------------------------------------------------ applications
-- The composite foreign keys keep an application from pointing at another user's job or document (foreign key
-- checks bypass RLS). "on delete set null (col)" nulls only the document column, never user_id (PostgreSQL 15+).

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  applied_at timestamptz not null default now(),
  cv_document_id uuid,
  letter_document_id uuid,
  cv_label text not null default '',
  notes text not null default '',
  stage text not null default 'applied',
  updated_at timestamptz not null default now(),
  constraint applications_user_job_key unique (user_id, job_id),
  constraint applications_job_fkey foreign key (user_id, job_id)
    references public.jobs (user_id, id) on delete cascade,
  constraint applications_cv_document_fkey foreign key (user_id, cv_document_id)
    references public.documents (user_id, id) on delete set null (cv_document_id),
  constraint applications_letter_document_fkey foreign key (user_id, letter_document_id)
    references public.documents (user_id, id) on delete set null (letter_document_id),
  constraint applications_stage_check check (stage in ('applied', 'interview', 'offer', 'rejected', 'withdrawn'))
);

create index if not exists applications_user_applied_at_idx
  on public.applications (user_id, applied_at desc);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Run this in the Supabase SQL editor to create the table

create table if not exists changelog_entries (
  slug text primary key,
  title text not null,
  date date not null,
  tags jsonb not null default '[]',
  summary text default '',
  deadlines jsonb default '[]',
  deadline_date date,
  has_action_required boolean default false,
  has_breaking_change boolean default false,
  has_deprecation boolean default false,
  requires_eng_review boolean default false,
  url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for common queries
create index if not exists idx_changelog_date on changelog_entries (date desc);
create index if not exists idx_changelog_eng_review on changelog_entries (requires_eng_review) where requires_eng_review = true;
create index if not exists idx_changelog_deadline on changelog_entries (deadline_date) where deadline_date is not null;

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists changelog_updated_at on changelog_entries;
create trigger changelog_updated_at
  before update on changelog_entries
  for each row execute function update_updated_at();

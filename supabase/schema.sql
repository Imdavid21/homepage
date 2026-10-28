create table if not exists entries (
  address text primary key,
  name text not null,
  handle text unique, -- optional
  score int not null,
  parts jsonb not null,
  updated_at timestamptz not null default now()
);
alter table entries enable row level security; -- only the service key (server side) reads and writes
create index if not exists entries_rank on entries (score desc, updated_at asc);

create table if not exists scores (
  address text primary key,
  name text not null,
  score int not null,
  parts jsonb not null,
  updated_at timestamptz not null default now()
);
alter table scores enable row level security; -- server side only
create index if not exists scores_rank on scores (score desc, updated_at asc);
alter table scores add column if not exists legend boolean not null default false;

-- the email each claimant registered with on Luma; server side only
alter table entries add column if not exists email text;
create unique index if not exists entries_email_unique on entries (lower(email)) where email is not null;

-- emails approved for the event on Luma. Claiming needs an email on this list once REQUIRE_APPROVAL=1.
-- Import a CSV with one column "email" in the dashboard, then run: update approved set email = lower(trim(email));
create table if not exists approved (email text primary key);
alter table approved enable row level security; -- server side only

-- Wick Runner leaderboard (applied as migration wick_runner_leaderboard). Server side only.
create table if not exists wick_players (
  tg text primary key, display text not null, score int not null default 0, best_at timestamptz,
  runs int not null default 0, seed boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table wick_players enable row level security;
create index if not exists wick_players_rank on wick_players (score desc, best_at asc);
create table if not exists wick_runs (
  id bigint generated always as identity primary key,
  tg text not null references wick_players(tg) on delete cascade,
  score int not null, created_at timestamptz not null default now()
);
alter table wick_runs enable row level security;
-- wick_submit(p_tg, p_display, p_score): keeps the best score per Telegram username and logs every run

-- House of HYPE guest directory (migration house_of_hype_guests). Server side only.
create table if not exists hoh_guests (id text primary key, name text not null, x text, tg text, company text, title text, linkedin text, updated_at timestamptz not null default now());
alter table hoh_guests enable row level security;
create table if not exists hoh_config (key text primary key, value text not null); -- attendee_code, admin_key
alter table hoh_config enable row level security;

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

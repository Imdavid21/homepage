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

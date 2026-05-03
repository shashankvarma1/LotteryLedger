-- ============================================================
-- LOTTERY LEDGER — Full Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Sessions
create table if not exists sessions (
  id                 uuid primary key default gen_random_uuid(),
  session_date       date not null default current_date,
  price_per_ticket   numeric(10,2) not null default 1.00,
  sr50_net_sales     numeric(10,2) default 0,
  sr50_commission    numeric(10,2) default 0,
  sr50_cashes        numeric(10,2) default 0,
  sr50_cash_bonus    numeric(10,2) default 0,
  sr50_claims_bonus  numeric(10,2) default 0,
  sr50_adjustments   numeric(10,2) default 0,
  sr50_service_fee   numeric(10,2) default 2.00,
  sr50_net_due       numeric(10,2) default 0,
  ir34_tickets       integer default 0,
  ir34_totals        numeric(10,2) default 0,
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_sessions_date on sessions(session_date desc);

-- Books (one row per book/agent entry)
create table if not exists books (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  row_number   integer not null,
  start_num    integer,
  end_num      integer,
  is_returned  boolean not null default false,
  created_at   timestamptz default now()
);
create index if not exists idx_books_session on books(session_id, row_number);

-- Global settings
create table if not exists settings (
  id               text primary key default 'default',
  price_per_ticket numeric(10,2) not null default 1.00
);
insert into settings (id, price_per_ticket) values ('default', 1.00)
on conflict (id) do nothing;

-- Ticket values (per ticket number)
create table if not exists ticket_values (
  ticket_number integer primary key,
  value         numeric(10,2) not null
);

-- Your default ticket values
insert into ticket_values (ticket_number, value) values
  (1,50),(2,50),(3,50),(4,50),
  (5,30),(6,30),(7,30),(8,30),(9,30),
  (10,20),(11,20),(12,20),(13,20),
  (14,10),(15,10),(16,10),(17,10),(18,10),(19,10),(20,10),
  (21,10),(22,10),(23,10),(24,10),(25,10),(26,10),(27,10),
  (28,5),(29,5),(30,5),(31,5),(32,5),(33,5),(34,5),(35,5),
  (36,5),(37,5),(38,5),(39,5),(40,5),
  (41,2),(42,2),(43,2),(44,2),(45,2),(46,2),(47,2),(48,2),
  (49,20),(50,20),(51,20),(52,20),
  (53,10),(54,10),(55,10),(56,10),
  (57,5),(58,5),(59,5),(60,5),
  (61,10),(62,10),(63,10),
  (64,1),(65,1),(66,1),(67,1),(68,1),
  (69,20)
on conflict (ticket_number) do nothing;

-- Disable RLS (personal app)
alter table sessions      disable row level security;
alter table books         disable row level security;
alter table settings      disable row level security;
alter table ticket_values disable row level security;

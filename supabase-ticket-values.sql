-- Run this in Supabase SQL Editor
-- Stores the value of each individual ticket number

create table if not exists ticket_values (
  ticket_number integer primary key,
  price         numeric(10,2) not null
);

alter table ticket_values disable row level security;

-- Optional: pre-load your known values (you can also enter them in the app)
-- insert into ticket_values (ticket_number, price) values
--   (1, 50), (2, 50), (3, 50), (4, 50),
--   (5, 30), (6, 30), (7, 30), (8, 30), (9, 30),
--   ...etc

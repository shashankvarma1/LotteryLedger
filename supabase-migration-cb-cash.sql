-- Run this once in the Supabase SQL Editor.
-- Adds "Cashed from Back" (CB) and cash short/over tracking to sessions.

alter table sessions add column if not exists cb_amount numeric(10,2) default 0;  -- added to final total
alter table sessions add column if not exists cash_diff numeric(10,2) default 0;  -- negative = short, positive = over
alter table sessions add column if not exists cash_note text;                     -- staff explanation

-- Log of automatic corrections: when today's start is fixed, the previous day's
-- end is updated to match and both sessions get a note for the owner.
alter table sessions add column if not exists corrections jsonb default '[]'::jsonb;

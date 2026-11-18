-- One session per store per day.
-- Run STEP 1 first. Only run STEP 2 when STEP 1 returns no rows.
-- Nothing here changes or deletes data.

-- STEP 1 (read-only): find dates where a store has more than one session.
select s.store_id, s.session_date, count(*) as sessions,
       string_agg(s.id::text || '  (' || coalesce(b.book_count, 0) || ' books, created ' ||
                  to_char(s.created_at, 'YYYY-MM-DD HH24:MI') || ')', E'\n' order by s.created_at) as details
from sessions s
left join (select session_id, count(*) as book_count from books group by session_id) b on b.session_id = s.id
group by s.store_id, s.session_date
having count(*) > 1
order by s.session_date desc;

-- STEP 2: stop duplicates from ever being created again.
-- If duplicates still exist this fails with an error and changes nothing.
create unique index if not exists uniq_sessions_store_date on sessions (store_id, session_date);

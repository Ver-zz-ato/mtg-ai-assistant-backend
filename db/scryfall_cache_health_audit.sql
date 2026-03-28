-- Read-only health checks for public.scryfall_cache (run in Supabase SQL editor).
-- Safe to run in production; no writes.

-- 1) Row count
-- select count(*) as total from public.scryfall_cache;

-- 2) Duplicate oracle identity: same set + collector_number, different PK (name)
-- (Investigate manually; some promos may legitimately share numbers across sets — use judgment.)
select set, collector_number, count(*) as n, array_agg(name order by name) as names
from public.scryfall_cache
where set is not null and collector_number is not null and trim(collector_number) <> ''
group by set, collector_number
having count(*) > 1
order by n desc, set, collector_number
limit 200;

-- 3) name_norm drift: should match canonical normalization of display semantics;
--    for this table, expect name = name_norm when both are set correctly.
select name, name_norm
from public.scryfall_cache
where name is distinct from name_norm
   or name_norm is null
limit 500;

-- 4) Suspicious MDFC-style coexistence heuristic (manual review):
--    same set + number where one PK contains " // " and another does not (possible front-face-only junk PK).
with keyed as (
  select set, collector_number, name,
         strpos(name, '//') > 0 as is_split_name
  from public.scryfall_cache
  where set is not null and collector_number is not null
)
select k.set, k.collector_number,
       array_agg(k.name order by k.name) filter (where k.is_split_name) as split_pk,
       array_agg(k.name order by k.name) filter (where not k.is_split_name) as non_split_pk
from keyed k
group by k.set, k.collector_number
having count(*) filter (where k.is_split_name) > 0
   and count(*) filter (where not k.is_split_name) > 0
limit 200;

-- 5) Rows missing common core fields (tune thresholds as needed)
select name, set, collector_number, type_line, oracle_text, small, normal
from public.scryfall_cache
where (oracle_text is null or trim(oracle_text) = '')
   or (type_line is null or trim(type_line) = '')
   or (small is null and normal is null)
limit 500;

-- Price buckets per collection and currency, using the most recent snapshot unless a date is provided.
-- Returns one row per bucket with a count and total value.
-- Buckets: '<$1', '$1–5', '$5–20', '$20–50', '$50–100', '$100+'

create or replace function public.collection_price_buckets(
  p_collection_id uuid,
  p_currency text default 'USD',
  p_snapshot_date date default null
)
returns table(bucket text, count integer, total numeric)
language sql
as $$
with latest as (
  select coalesce(p_snapshot_date, (
    select snapshot_date from public.price_snapshots
    where currency = upper(p_currency)
    order by snapshot_date desc limit 1
  )) as dt
),
-- normalize names similar to app (lower + collapse spaces). Diacritics removal omitted.
names as (
  select lower(regexp_replace(name, '\\s+', ' ', 'g')) as name_norm, qty
  from public.collection_cards
  where collection_id = p_collection_id
),
prices as (
  select ps.name_norm, ps.unit::numeric as unit
  from public.price_snapshots ps, latest
  where ps.currency = upper(p_currency) and ps.snapshot_date = latest.dt
)
select bucket,
       count(*) as count,
       sum(unit * qty) as total
from (
  select n.name_norm, n.qty, coalesce(p.unit, 0) as unit,
    case
      when coalesce(p.unit,0) < 1 then '<$1'
      when p.unit < 5 then '$1–5'
      when p.unit < 20 then '$5–20'
      when p.unit < 50 then '$20–50'
      when p.unit < 100 then '$50–100'
      else '$100+'
    end as bucket
  from names n
  left join prices p on p.name_norm = n.name_norm
) t
group by bucket
order by case bucket
  when '<$1' then 1
  when '$1–5' then 2
  when '$5–20' then 3
  when '$20–50' then 4
  when '$50–100' then 5
  else 6 end;
$$;

comment on function public.collection_price_buckets(uuid, text, date)
  is 'Price bucket histogram for a collection using latest or given snapshot date.';

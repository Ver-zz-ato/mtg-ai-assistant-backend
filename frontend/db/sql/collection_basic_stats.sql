-- Helper SQL to expose card type, rarity, and set stats for a collection via a single endpoint
-- (Use this if you prefer server-side aggregation.)
create or replace function public.collection_basic_stats(
  p_collection_id uuid
)
returns table(
  type_hist jsonb,
  rarity_hist jsonb,
  sets_top jsonb
)
language plpgsql
as $$
declare
  v_type jsonb := '{}'::jsonb;
  v_rarity jsonb := '{}'::jsonb;
  v_sets jsonb := '[]'::jsonb;
begin
  -- Type histogram
  select jsonb_build_object(
    'creature', coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%creature%' then cc.qty else 0 end),0),
    'instant', coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%instant%' then cc.qty else 0 end),0),
    'sorcery', coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%sorcery%' then cc.qty else 0 end),0),
    'land',    coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%land%' then cc.qty else 0 end),0),
    'artifact',coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%artifact%' then cc.qty else 0 end),0),
    'enchantment',coalesce(sum(case when lower(coalesce(sc.type_line,'')) like '%enchantment%' then cc.qty else 0 end),0)
  ) into v_type
  from public.collection_cards cc
  left join public.scryfall_cache sc on sc.name = cc.name
  where cc.collection_id = p_collection_id;

  -- Rarity histogram
  select jsonb_object_agg(rarity, cnt) into v_rarity
  from (
    select lower(coalesce(sc.rarity,'unknown')) as rarity, sum(cc.qty)::int as cnt
    from public.collection_cards cc
    left join public.scryfall_cache sc on sc.name = cc.name
    where cc.collection_id = p_collection_id
    group by 1
  ) x;

  -- Top sets (up to 10)
  select jsonb_agg(jsonb_build_object('set', set, 'count', cnt)) into v_sets
  from (
    select upper(coalesce(sc.set,'?')) as set, sum(cc.qty)::int as cnt
    from public.collection_cards cc
    left join public.scryfall_cache sc on sc.name = cc.name
    where cc.collection_id = p_collection_id
    group by 1
    order by cnt desc
    limit 10
  ) s;

  return query select coalesce(v_type,'{}'::jsonb), coalesce(v_rarity,'{}'::jsonb), coalesce(v_sets,'[]'::jsonb);
end;
$$;

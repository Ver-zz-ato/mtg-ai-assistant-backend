-- Pro-gated storage limits for ManaTap saved objects.
-- Free: 15 decks, 10 collections, 500 total qty per collection, 10 wishlists, 100 total qty per wishlist.
-- Pro users are unlimited. Existing over-limit Free users can reduce/delete, but cannot grow further.

create or replace function public.manatap_is_storage_pro(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select p.is_pro = true
      and (p.pro_until is null or p.pro_until > now())
    from public.profiles p
    where p.id = p_user_id
  ), false);
$$;

revoke all on function public.manatap_is_storage_pro(uuid) from public;

create or replace function public.manatap_enforce_deck_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deck_count integer;
begin
  if new.user_id is null or public.manatap_is_storage_pro(new.user_id) then
    return new;
  end if;

  select count(*) into deck_count
  from public.decks
  where user_id = new.user_id;

  if deck_count >= 15 then
    raise exception 'PRO_LIMIT_DECKS: Free accounts can save up to 15 decks. Upgrade to Pro for unlimited decks.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.manatap_enforce_deck_storage_limit() from public;

drop trigger if exists manatap_deck_storage_limit on public.decks;
create trigger manatap_deck_storage_limit
before insert on public.decks
for each row execute function public.manatap_enforce_deck_storage_limit();

create or replace function public.manatap_enforce_collection_count_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  collection_count integer;
begin
  if new.user_id is null or public.manatap_is_storage_pro(new.user_id) then
    return new;
  end if;

  select count(*) into collection_count
  from public.collections
  where user_id = new.user_id;

  if collection_count >= 10 then
    raise exception 'PRO_LIMIT_COLLECTIONS: Free accounts can save up to 10 collections. Upgrade to Pro for unlimited collections.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.manatap_enforce_collection_count_limit() from public;

drop trigger if exists manatap_collection_count_limit on public.collections;
create trigger manatap_collection_count_limit
before insert on public.collections
for each row execute function public.manatap_enforce_collection_count_limit();

create or replace function public.manatap_enforce_collection_size_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  current_total integer;
  next_total integer;
begin
  select c.user_id into owner_id
  from public.collections c
  where c.id = new.collection_id;

  if owner_id is null or public.manatap_is_storage_pro(owner_id) then
    return new;
  end if;

  select coalesce(sum(greatest(coalesce(cc.qty, 0), 0)), 0)::integer into current_total
  from public.collection_cards cc
  where cc.collection_id = new.collection_id;

  if tg_op = 'UPDATE' and old.collection_id = new.collection_id then
    next_total := current_total - greatest(coalesce(old.qty, 0), 0) + greatest(coalesce(new.qty, 0), 0);
    if next_total <= current_total then
      return new;
    end if;
  else
    next_total := current_total + greatest(coalesce(new.qty, 0), 0);
  end if;

  if next_total > 500 then
    raise exception 'PRO_LIMIT_COLLECTION_SIZE: Free collections can hold up to 500 cards. Upgrade to Pro for unlimited collection size.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.manatap_enforce_collection_size_limit() from public;

drop trigger if exists manatap_collection_size_limit on public.collection_cards;
create trigger manatap_collection_size_limit
before insert or update on public.collection_cards
for each row execute function public.manatap_enforce_collection_size_limit();

create or replace function public.manatap_enforce_wishlist_count_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  wishlist_count integer;
begin
  if new.user_id is null or public.manatap_is_storage_pro(new.user_id) then
    return new;
  end if;

  select count(*) into wishlist_count
  from public.wishlists
  where user_id = new.user_id;

  if wishlist_count >= 10 then
    raise exception 'PRO_LIMIT_WISHLISTS: Free accounts can save up to 10 wishlists. Upgrade to Pro for unlimited wishlists.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.manatap_enforce_wishlist_count_limit() from public;

drop trigger if exists manatap_wishlist_count_limit on public.wishlists;
create trigger manatap_wishlist_count_limit
before insert on public.wishlists
for each row execute function public.manatap_enforce_wishlist_count_limit();

create or replace function public.manatap_enforce_wishlist_size_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  current_total integer;
  next_total integer;
begin
  select w.user_id into owner_id
  from public.wishlists w
  where w.id = new.wishlist_id;

  if owner_id is null or public.manatap_is_storage_pro(owner_id) then
    return new;
  end if;

  select coalesce(sum(greatest(coalesce(wi.qty, 0), 0)), 0)::integer into current_total
  from public.wishlist_items wi
  where wi.wishlist_id = new.wishlist_id;

  if tg_op = 'UPDATE' and old.wishlist_id = new.wishlist_id then
    next_total := current_total - greatest(coalesce(old.qty, 0), 0) + greatest(coalesce(new.qty, 0), 0);
    if next_total <= current_total then
      return new;
    end if;
  else
    next_total := current_total + greatest(coalesce(new.qty, 0), 0);
  end if;

  if next_total > 100 then
    raise exception 'PRO_LIMIT_WISHLIST_SIZE: Free wishlists can hold up to 100 cards. Upgrade to Pro for unlimited wishlist size.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.manatap_enforce_wishlist_size_limit() from public;

drop trigger if exists manatap_wishlist_size_limit on public.wishlist_items;
create trigger manatap_wishlist_size_limit
before insert or update on public.wishlist_items
for each row execute function public.manatap_enforce_wishlist_size_limit();

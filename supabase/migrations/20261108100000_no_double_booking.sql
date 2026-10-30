-- RentRig: an item can never be reserved twice for overlapping dates.

create extension if not exists btree_gist with schema extensions;

-- Rental dates are whole days and both ends are included: an item rented from
-- the 12th to the 14th is out on the 12th, 13th and 14th. '[]' says so.
-- Cancelled and completed reservations no longer hold the item.
alter table public.reservations
  add constraint no_overlapping_reservations exclude using gist (
    equipment_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status in ('pending_payment', 'confirmed'));

-- What the public catalogue needs to show availability: the busy date ranges
-- of one item, without customers or prices. At most one year per call.
create function public.equipment_busy_dates(item uuid, from_date date, to_date date)
returns table (starts_on date, ends_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select r.starts_on, r.ends_on
  from public.reservations r
  where r.equipment_id = item
    and r.status in ('pending_payment', 'confirmed')
    and daterange(r.starts_on, r.ends_on, '[]')
        && daterange(from_date, least(to_date, from_date + 366), '[]')
  order by r.starts_on;
$$;

revoke execute on function public.equipment_busy_dates(uuid, date, date) from public;
grant execute on function public.equipment_busy_dates(uuid, date, date) to anon, authenticated;

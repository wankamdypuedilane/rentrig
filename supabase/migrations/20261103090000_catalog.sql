-- RentRig catalogue: categories and rentable equipment.

create table public.equipment_categories (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  category_id smallint not null references public.equipment_categories (id),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  -- Money is stored as integer cents, never as floating-point numbers.
  daily_price_cents integer not null check (daily_price_cents > 0),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Foreign keys are not indexed automatically in PostgreSQL.
create index equipment_category_id_idx on public.equipment (category_id);

-- The catalogue is public, but only active equipment is visible.
alter table public.equipment_categories enable row level security;
alter table public.equipment enable row level security;

create policy "Anyone can read categories"
  on public.equipment_categories for select
  to anon, authenticated
  using (true);

create policy "Anyone can read active equipment"
  on public.equipment for select
  to anon, authenticated
  using (is_active);

-- Nobody changes the catalogue through the public API (staff rules come next).
revoke insert, update, delete on public.equipment_categories, public.equipment from anon, authenticated;

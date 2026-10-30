-- Sample catalogue for local development (fictional data).
insert into public.equipment_categories (slug, name) values
  ('cleaning', 'Cleaning'),
  ('access', 'Access & lifting'),
  ('power-tools', 'Power tools'),
  ('earthmoving', 'Earthmoving');

insert into public.equipment (category_id, name, description, daily_price_cents, deposit_cents)
select c.id, e.name, e.description, e.daily, e.deposit
from (values
  ('cleaning', 'Pressure washer 2500 W', 'Hot-water pressure washer for patios and facades.', 4500, 15000),
  ('cleaning', 'Floor scrubber', 'Walk-behind scrubber for warehouses.', 6900, 20000),
  ('access', 'Aluminium scaffold tower 6 m', 'Mobile tower with outriggers.', 5500, 30000),
  ('access', 'Scissor lift 8 m', 'Electric scissor lift, indoor use.', 18900, 80000),
  ('power-tools', 'Tile cutter 1200 mm', 'Wet tile saw for large formats.', 3900, 10000),
  ('earthmoving', 'Mini excavator 1.5 t', 'Compact excavator with three buckets.', 24900, 120000)
) as e(category, name, description, daily, deposit)
join public.equipment_categories c on c.slug = e.category;

update public.equipment set is_active = false where name = 'Floor scrubber';

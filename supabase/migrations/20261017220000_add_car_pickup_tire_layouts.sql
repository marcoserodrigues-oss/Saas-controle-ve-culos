-- Add ready-to-use four-wheel layouts for passenger cars and light pickups.
-- These templates model four road tires only; the spare tire is not a road position.
alter table public.tire_layout_templates
  drop constraint if exists tire_layout_templates_diagram_type_check;
alter table public.tire_layout_templates
  add constraint tire_layout_templates_diagram_type_check
  check (diagram_type in ('truck','tractor','trailer','bus','equipment','car','pickup'));

insert into public.tire_layout_templates
  (code, name, asset_kind, diagram_type, axle_count, tire_count, description, layout, is_system, is_active)
values
(
  'CAR-4W-4',
  'Carro de passeio / SUV — 4 pneus',
  'vehicle'::public.asset_kind,
  'car',
  2,
  4,
  'Esquema-base para carro de passeio ou SUV com um pneu por roda. Não inclui estepe; confira a configuração real antes de aplicar.',
  '[{"code":"E1-LE","label":"Dianteiro · esquerdo","axle":1,"side":"left","slot":"single","x":29,"y":28},{"code":"E1-LD","label":"Dianteiro · direito","axle":1,"side":"right","slot":"single","x":71,"y":28},{"code":"E2-LE","label":"Traseiro · esquerdo","axle":2,"side":"left","slot":"single","x":29,"y":72},{"code":"E2-LD","label":"Traseiro · direito","axle":2,"side":"right","slot":"single","x":71,"y":72}]'::jsonb,
  true,
  true
),
(
  'PIC-4W-4',
  'Caminhonete / picape leve — 4 pneus',
  'vehicle'::public.asset_kind,
  'pickup',
  2,
  4,
  'Esquema-base para caminhonete ou picape leve com pneus simples nos dois eixos. Não inclui estepe nem rodagem dupla; valide o modelo do veículo.',
  '[{"code":"E1-LE","label":"Dianteiro · esquerdo","axle":1,"side":"left","slot":"single","x":29,"y":26},{"code":"E1-LD","label":"Dianteiro · direito","axle":1,"side":"right","slot":"single","x":71,"y":26},{"code":"E2-LE","label":"Traseiro · esquerdo","axle":2,"side":"left","slot":"single","x":29,"y":72},{"code":"E2-LD","label":"Traseiro · direito","axle":2,"side":"right","slot":"single","x":71,"y":72}]'::jsonb,
  true,
  true
)
on conflict (code) where organization_id is null do update
set name = excluded.name,
    asset_kind = excluded.asset_kind,
    diagram_type = excluded.diagram_type,
    axle_count = excluded.axle_count,
    tire_count = excluded.tire_count,
    description = excluded.description,
    layout = excluded.layout,
    is_system = true,
    is_active = true;

-- Each authorization represents one fueling event. A cancelled event releases it for correction.
create unique index if not exists fuel_events_one_active_per_authorization_idx
  on public.fuel_events (organization_id, authorization_id)
  where authorization_id is not null and status <> 'cancelled';

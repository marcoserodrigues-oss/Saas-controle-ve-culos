#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <local-postgres-url>" >&2
  exit 2
fi
DB_URL="$1"
ORG_ID="c1000000-0000-4000-8000-000000000001"
VEHICLE_ID="c2000000-0000-4000-8000-000000000001"
AUTH_ID="c3000000-0000-4000-8000-000000000001"
EVENT_A_ID="c4000000-0000-4000-8000-000000000001"
EVENT_B_ID="c4000000-0000-4000-8000-000000000002"
TMP_DIR="$(mktemp -d)"
A_LOG="$TMP_DIR/session-a.log"
B_LOG="$TMP_DIR/session-b.log"
A_PID=""

cleanup() {
  if [[ -n "$A_PID" ]]; then
    wait "$A_PID" 2>/dev/null || true
  fi
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "
    delete from public.fuel_events where id in ('$EVENT_A_ID', '$EVENT_B_ID');
    delete from public.fuel_authorizations where id = '$AUTH_ID';
    delete from public.vehicles where id = '$VEHICLE_ID';
    delete from public.organizations where id = '$ORG_ID';
  " >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL
insert into public.organizations (id, name) values ('$ORG_ID', 'Concurrency QA');
insert into public.vehicles (id, organization_id, code, description, status)
values ('$VEHICLE_ID', '$ORG_ID', 'CONC-QA', 'Concurrent fueling test vehicle', 'active');
insert into public.fuel_authorizations
  (id, organization_id, authorization_code, vehicle_id, valid_from, valid_until, max_liters, max_amount_cents, status)
values
  ('$AUTH_ID', '$ORG_ID', 'CONC-QA', '$VEHICLE_ID', now() - interval '1 day', now() + interval '1 day', 50, 100000, 'active');
SQL

# Session A consumes 30 L, then holds its transaction open while session B tries another 30 L.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q >"$A_LOG" 2>&1 <<SQL &
begin;
insert into public.fuel_events
  (id, organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
values
  ('$EVENT_A_ID', '$ORG_ID', '$VEHICLE_ID', '$AUTH_ID', now(), 1000, 30, 1000, 'full', 'active');
select pg_sleep(5);
commit;
SQL
A_PID=$!

# Give session A time to acquire the authorization row lock and insert its event.
sleep 1
set +e
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q >"$B_LOG" 2>&1 <<SQL
insert into public.fuel_events
  (id, organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
values
  ('$EVENT_B_ID', '$ORG_ID', '$VEHICLE_ID', '$AUTH_ID', now(), 1030, 30, 1000, 'full', 'active');
SQL
B_STATUS=$?
set -e

if [[ "$B_STATUS" -eq 0 ]]; then
  echo "FAIL: concurrent second fueling unexpectedly succeeded; the 50 L authorization was exceeded." >&2
  exit 1
fi
if ! grep -Eqi 'limite de litros autorizado|fuel_events_one_active_per_authorization_idx|duplicate key|authorization.*limit|exceeds.*liters' "$B_LOG"; then
  echo "FAIL: session B failed for an unexpected reason:" >&2
  cat "$B_LOG" >&2
  exit 1
fi

wait "$A_PID"
A_STATUS=$?
A_PID=""
if [[ "$A_STATUS" -ne 0 ]]; then
  echo "FAIL: session A failed unexpectedly:" >&2
  cat "$A_LOG" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "
  select case
    when consumed_liters = 30 and
         (select count(*) from public.fuel_events where authorization_id = '$AUTH_ID' and status = 'active') = 1
    then 'PASS'
    else 'FAIL'
  end
  from public.fuel_authorizations where id = '$AUTH_ID';
" | grep -qx 'PASS'

echo "PASS: concurrent sessions preserved the one-active-fueling-per-authorization invariant; only one event committed."

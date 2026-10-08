#!/usr/bin/env bash
# ============================================================================
# Verifies the schema against a real Postgres 17 + pgvector, using stub
# Supabase objects. This proves the migrations run clean and the security
# policies actually isolate data, without touching your production project.
#
# Usage: bash scripts/verify-schema.sh
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="hamza_schema_test"

echo "==> ensuring postgres is running"
sudo pg_ctlcluster 17 main start 2>/dev/null || true
sleep 1

echo "==> recreating test database"
sudo -u postgres dropdb --if-exists "$DB"
sudo -u postgres createdb "$DB"

run() {
  echo "==> $1"
  sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d "$DB" < "$REPO/$1"
}

run tests/00_supabase_stubs.sql
run supabase/migrations/0001_init.sql
run supabase/migrations/0002_storage.sql
run tests/01_schema_smoke_test.sql
run supabase/migrations/0003_phase2.sql
run tests/02_phase2_smoke_test.sql
run supabase/migrations/0004_outreach_tracking.sql
run tests/03_phase2_1_smoke_test.sql

echo
echo "==> Schema verified. Dropping test database."
sudo -u postgres dropdb "$DB"

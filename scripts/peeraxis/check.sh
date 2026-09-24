#!/usr/bin/env bash
# The full Persuaider gate, as CI's "fast" job runs it, on a throwaway socket-only Postgres:
# migrations from scratch, schema drift, typecheck, lint, unit + real-database integration
# tests, production build. Needs no secrets: the build uses CI's placeholder Clerk keys.
# Never touches a remote database, never deploys, never calls an LLM.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=env.sh
. "$ROOT/scripts/peeraxis/env.sh"
peeraxis_mask_env
# Build-time placeholders, identical to .github/workflows/ci.yml. No network calls use them.
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2ktcGxhY2Vob2xkZXIuY2xlcmsuYWNjb3VudHMuZGV2JA
export CLERK_SECRET_KEY=sk_test_ci_placeholder

# shellcheck source=pg.sh
. "$ROOT/scripts/peeraxis/pg.sh"
trap peeraxis_pg_down EXIT
trap 'exit 130' INT TERM

now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
step() {
  local name="$1" t0; shift
  echo "== $name" >&2
  t0="$(now)"
  "$@"
  echo "== $name ok ($(echo "$(now) - $t0" | bc)s)" >&2
}

step "postgres up"    peeraxis_pg_up
step "migrate deploy" npx prisma migrate deploy
step "schema drift"   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
step "typecheck"      npx tsc --noEmit
step "lint"           npm run lint
step "tests"          npm test -- --ci
step "build"          npm run build

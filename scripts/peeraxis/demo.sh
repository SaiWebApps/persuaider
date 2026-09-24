#!/usr/bin/env bash
# Record one Peeraxis Demonstration against a LOCAL production build.
#   PEERAXIS_DEMO_SPEC    spec file, relative to the repo root (required)
#   PEERAXIS_DEMO_OUTPUT  empty-or-new folder for report.json, videos, screenshots, logs (required)
# Secrets: only CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, read from .env.peeraxis.
# Never touches a remote database, never deploys, never calls an LLM.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
: "${PEERAXIS_DEMO_SPEC:?set PEERAXIS_DEMO_SPEC (spec path relative to the repo root)}"
: "${PEERAXIS_DEMO_OUTPUT:?set PEERAXIS_DEMO_OUTPUT (output folder)}"
[ -f "$PEERAXIS_DEMO_SPEC" ] || { echo "demo.sh: spec not found: $PEERAXIS_DEMO_SPEC" >&2; exit 2; }
mkdir -p "$PEERAXIS_DEMO_OUTPUT"
PEERAXIS_DEMO_OUTPUT="$(cd "$PEERAXIS_DEMO_OUTPUT" && pwd)"; export PEERAXIS_DEMO_OUTPUT PEERAXIS_DEMO_SPEC
LOGS="$PEERAXIS_DEMO_OUTPUT/logs"; mkdir -p "$LOGS"
TIMINGS="$PEERAXIS_DEMO_OUTPUT/timings.tsv"; : >"$TIMINGS"

now() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }
phase_start=""; phase() { phase_name="$1"; phase_start="$(now)"; echo "== $1" >&2; }
phase_end() { printf '%s\t%.1f\n' "$phase_name" "$(echo "$(now) - $phase_start" | bc)" >>"$TIMINGS"; }

# --- Environment: nothing from the developer's shell or from Next's env files. -----------
# shellcheck source=env.sh
. "$ROOT/scripts/peeraxis/env.sh"
peeraxis_mask_env
[ -f .env.peeraxis ] || { echo "demo.sh: .env.peeraxis missing (needs the two Clerk dev keys)" >&2; exit 2; }
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    CLERK_SECRET_KEY=*|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=*)
      name="${line%%=*}"; value="${line#*=}"; value="${value%\"}"; value="${value#\"}"
      export "$name=$value" ;;
  esac
done <.env.peeraxis
case "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" in pk_test_*) ;; *) echo "demo.sh: need a Clerk DEVELOPMENT publishable key (pk_test_)" >&2; exit 2;; esac
case "${CLERK_SECRET_KEY:-}" in sk_test_*) ;; *) echo "demo.sh: need a Clerk DEVELOPMENT secret key (sk_test_)" >&2; exit 2;; esac

# --- Lifecycle ------------------------------------------------------------------------------
# shellcheck source=pg.sh
. "$ROOT/scripts/peeraxis/pg.sh"
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  peeraxis_pg_down
}
trap cleanup EXIT
trap 'exit 130' INT TERM

phase "pg up";   peeraxis_pg_up; phase_end
phase "migrate"; npx prisma migrate deploy >"$LOGS/migrate.log" 2>&1 || { cat "$LOGS/migrate.log" >&2; exit 1; }; phase_end
phase "build";   npm run build >"$LOGS/build.log" 2>&1 || { tail -50 "$LOGS/build.log" >&2; exit 1; }; phase_end

PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"localhost",()=>{console.log(s.address().port);s.close()})')"
export PEERAXIS_DEMO_PORT="$PORT"
phase "start"
set -m   # own process group, so cleanup can stop next and any worker it forks
./node_modules/.bin/next start -H localhost -p "$PORT" >"$LOGS/server.log" 2>&1 &
SERVER_PID=$!
set +m
for _ in $(seq 1 120); do
  kill -0 "$SERVER_PID" 2>/dev/null || { cat "$LOGS/server.log" >&2; echo "demo.sh: server exited" >&2; exit 1; }
  code="$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:$PORT/login" || true)"
  [ "$code" = "200" ] && break
  sleep 0.5
done
[ "$code" = "200" ] || { echo "demo.sh: server not ready (last /login status $code)" >&2; exit 1; }
phase_end

phase "playwright"
set +e
npx playwright test --config e2e/playwright.peeraxis.config.ts
PW_STATUS=$?
set -e
phase_end
cat "$TIMINGS" >&2
exit "$PW_STATUS"

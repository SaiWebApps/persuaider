#!/usr/bin/env bash
# Throwaway Postgres for one Peeraxis demo. Source this file, then call
#   peeraxis_pg_up     -> exports DATABASE_URL / DATABASE_URL_UNPOOLED (unix socket only)
#   peeraxis_pg_down   -> stops the cluster and deletes its folder (idempotent)
# The caller owns the EXIT trap and must call peeraxis_pg_down from it.
# No TCP port is opened (listen_addresses=''). The data folder lives under $TMPDIR; the socket
# gets its own short folder in /tmp, because a unix socket path must stay under 104 bytes and
# Peeraxis's stage TMPDIR alone is ~108 bytes.

PEERAXIS_PG_DIR=""
PEERAXIS_PG_SOCK=""

peeraxis_pg_up() {
  local bin
  for bin in initdb pg_ctl createdb; do
    command -v "$bin" >/dev/null || { echo "pg.sh: $bin not found on PATH" >&2; return 1; }
  done
  PEERAXIS_PG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pxpg.XXXXXX")" || return 1
  PEERAXIS_PG_SOCK="$(mktemp -d /tmp/pxs.XXXXXX)" || return 1
  local data="$PEERAXIS_PG_DIR/data" sock="$PEERAXIS_PG_SOCK"
  initdb -D "$data" -U peeraxis --auth=trust --encoding=UTF8 --no-locale >"$PEERAXIS_PG_DIR/initdb.log" 2>&1 \
    || { cat "$PEERAXIS_PG_DIR/initdb.log" >&2; return 1; }
  pg_ctl -D "$data" -l "$PEERAXIS_PG_DIR/postgres.log" -w -t 30 \
    -o "-c listen_addresses='' -k $sock -p 5432 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
    start >/dev/null || { cat "$PEERAXIS_PG_DIR/postgres.log" >&2; return 1; }
  createdb -h "$sock" -p 5432 -U peeraxis persuaider_demo || return 1
  export DATABASE_URL="postgresql://peeraxis@localhost:5432/persuaider_demo?host=$sock"
  export DATABASE_URL_UNPOOLED="$DATABASE_URL"
}

peeraxis_pg_down() {
  if [ -n "$PEERAXIS_PG_DIR" ] && [ -d "$PEERAXIS_PG_DIR" ]; then
    pg_ctl -D "$PEERAXIS_PG_DIR/data" -m immediate -w -t 30 stop >/dev/null 2>&1 || true
    rm -rf "$PEERAXIS_PG_DIR"
  fi
  if [ -n "$PEERAXIS_PG_SOCK" ] && [ -d "$PEERAXIS_PG_SOCK" ]; then
    rm -rf "$PEERAXIS_PG_SOCK"
  fi
  PEERAXIS_PG_DIR=""
  PEERAXIS_PG_SOCK=""
}

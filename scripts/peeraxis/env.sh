#!/usr/bin/env bash
# Environment masking shared by check.sh and demo.sh. Source this file from the repo root, then
# call peeraxis_mask_env.
# Next.js (build, start, next/jest) and Prisma load .env, .env.local, .env.production(.local)
# and prisma/.env themselves, but never override a variable that is already defined (even as
# ""). Mask every name those files define, plus the known paid and remote names, so the real
# .env.local (LLM keys, Neon URLs) cannot reach a build, a server, a test or Playwright.

peeraxis_mask_env() {
  local f name
  for f in .env .env.local .env.development .env.development.local .env.test .env.test.local \
           .env.production .env.production.local prisma/.env; do
    [ -f "$f" ] || continue
    for name in $(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' "$f"); do
      export "$name="
    done
  done
  for name in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_GEMINI_API_KEY UPSTASH_REDIS_REST_URL \
              UPSTASH_REDIS_REST_TOKEN CLERK_WEBHOOK_SECRET CLERK_SECRET_KEY \
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY DATABASE_URL DATABASE_URL_UNPOOLED; do
    export "$name="
  done
  export NEXT_TELEMETRY_DISABLED=1 CI=1
}

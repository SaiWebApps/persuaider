#!/usr/bin/env bash
# Code-health numbers for Peeraxis: prints {"warnings": N} (ESLint warnings across the repo).
set -euo pipefail
cd "$(dirname "$0")/../.."
npx eslint . --format json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify({warnings:r.reduce((n,f)=>n+f.warningCount,0)}))})'

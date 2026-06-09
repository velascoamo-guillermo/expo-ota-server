#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
Provision the Supabase backend (tables + storage bucket) for expo-ota-server.

Usage:
  scripts/setup-supabase.sh --local                 Start local Supabase stack (Docker), migrations applied
  scripts/setup-supabase.sh --remote <project-ref>  Link and push migrations to a hosted Supabase project

After running, copy the printed env vars into your .env.local (local) or
deployment environment (remote). This script never touches .env files.
EOF
}

fail() {
  echo "Error: $1" >&2
  exit 1
}

require_cli() {
  command -v supabase >/dev/null 2>&1 \
    || fail "supabase CLI not found. Install: brew install supabase/tap/supabase"
}

setup_local() {
  require_cli
  docker info >/dev/null 2>&1 || fail "Docker daemon not running. Start Docker and retry."

  supabase start

  local status_env api_url service_role_key
  status_env="$(supabase status -o env)"
  api_url="$(echo "$status_env" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
  service_role_key="$(echo "$status_env" | sed -n 's/^SERVICE_ROLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"

  [ -n "$api_url" ] || fail "could not parse API_URL from 'supabase status -o env'"
  [ -n "$service_role_key" ] || fail "could not parse SERVICE_ROLE_KEY from 'supabase status -o env'"

  cat <<EOF

Local Supabase stack is running. Copy these into .env.local:

BLOB_STORAGE_TYPE=supabase
DB_TYPE=supabase
SUPABASE_URL=$api_url
SUPABASE_API_KEY=$service_role_key
SUPABASE_BUCKET_NAME=expo-updates
EOF
}

setup_remote() {
  local project_ref="$1"
  require_cli
  supabase projects list >/dev/null 2>&1 || fail "not logged in. Run: supabase login"

  supabase link --project-ref "$project_ref"
  supabase db push

  cat <<EOF

Migrations pushed to project '$project_ref'. Set these in your deployment environment:

BLOB_STORAGE_TYPE=supabase
DB_TYPE=supabase
SUPABASE_URL=https://$project_ref.supabase.co
SUPABASE_API_KEY=<service role key: Dashboard > Project Settings > API>
SUPABASE_BUCKET_NAME=expo-updates
EOF
}

case "${1:-}" in
  --local)
    setup_local
    ;;
  --remote)
    [ $# -ge 2 ] || { usage; fail "--remote requires <project-ref>"; }
    setup_remote "$2"
    ;;
  -h|--help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac

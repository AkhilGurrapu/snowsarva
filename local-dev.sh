#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1) Start backend locally
(
  cd "$ROOT_DIR/backend"
  export API_PORT=8081 DEV_MODE=1 USE_ACCOUNT_USAGE=0 USE_LOCAL_CONNECTOR=1 \
    SNOWFLAKE_ACCOUNT=$(grep '^account' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_USER=$(grep '^user' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_ROLE=$(grep '^role' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_WAREHOUSE=$(grep '^warehouse' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_DATABASE=$(grep '^database' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_SCHEMA=$(grep '^schema' "$ROOT_DIR/config.toml" | awk -F '"' '{print $2}') \
    SNOWFLAKE_TOKEN_FILE="/run/secrets/snowflake-pat.token"

  # Read PAT contents to pass as env (container cannot see host path unless mounted)
  if [[ ! -f "$ROOT_DIR/snowflake-pat.token" ]]; then
    echo "snowflake-pat.token not found at $ROOT_DIR; local dev will fail" >&2
  fi
  docker build --platform linux/amd64 -t snowsarva_backend_local .
  # Also pass PAT as SNOWFLAKE_PASSWORD for Python connector compatibility in dev
  PAT_STR="$(cat "$ROOT_DIR/snowflake-pat.token" 2>/dev/null || true)"
  docker run --rm -e API_PORT -e DEV_MODE -e USE_ACCOUNT_USAGE -e USE_LOCAL_CONNECTOR \
    -e SNOWFLAKE_ACCOUNT -e SNOWFLAKE_USER -e SNOWFLAKE_ROLE -e SNOWFLAKE_WAREHOUSE -e SNOWFLAKE_DATABASE -e SNOWFLAKE_SCHEMA \
    -e SNOWFLAKE_TOKEN_FILE \
    -e SNOWFLAKE_PASSWORD="$PAT_STR" \
    -e SNOWFLAKE_OAUTH_TOKEN \
    -v "$ROOT_DIR/snowflake-pat.token":/run/secrets/snowflake-pat.token:ro \
    -p 8081:8081 snowsarva_backend_local &
)

# 2) Start frontend dev server with proxy to backend
(
  cd "$ROOT_DIR/frontend/react"
  npm install
  npm run dev
)

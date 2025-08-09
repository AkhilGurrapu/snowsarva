#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$ROOT_DIR/config.toml"

# 1) Ensure Makefile is configured with image repo URL (if needed)
if ! grep -q "SNOWFLAKE_REPO=" "$ROOT_DIR/Makefile"; then
  echo "Makefile not configured. Running configure.sh..."
  "$ROOT_DIR/configure.sh"
fi

# 2) Login to Snowflake image registry using PAT
snow --config-file="$CONFIG_FILE" spcs image-registry login -c snowsarva || docker login "$(grep '^SNOWFLAKE_REPO=' "$ROOT_DIR/Makefile" | cut -d= -f2)"

# 3) Build and push images
make -C "$ROOT_DIR" all

# 4) Run/upgrade the native app from app/src
snow --config-file="$CONFIG_FILE" app run -c snowsarva -p "$ROOT_DIR/app/src" --force

echo "Deployment complete. If service is running, refresh the app URL. Otherwise, start it in Snowsight:"
echo "CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'WH_SNOWSARVA_CONSUMER');"

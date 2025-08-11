#!/bin/bash
set -euo pipefail
read -p "Image repository URL (from SHOW IMAGE REPOSITORIES IN SCHEMA): " repository_url
cp Makefile.template Makefile
# macOS sed requires the empty string after -i
sed -i "" "s|REGISTRY_URL_PLACEHOLDER|$repository_url|g" Makefile
echo "Configured Makefile with Snowflake image repository: $repository_url"

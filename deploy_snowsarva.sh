#!/bin/bash

# Snowsarva Deployment Script
# Deploy the Snowsarva Native App to Snowflake Container Services

set -e

# Configuration
REGISTRY_URL="chfwnrv-ddb48976.registry.snowflakecomputing.com"
REGISTRY_PATH="snowsarva_image_database/snowsarva_image_schema/snowsarva_img_repo"
APP_NAME="snowsarva_app"
APP_PKG_NAME="snowsarva_app_pkg"
VERSION="1.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

echo "=================================================="
echo "🚀 Snowsarva Native App Deployment Script"
echo "=================================================="
echo ""

# Step 1: Verify prerequisites
log_step "1. Verifying prerequisites..."
if ! command -v snow >/dev/null 2>&1; then
    log_error "Snowflake CLI (snow) not found. Please install it first."
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker not found. Please install Docker first."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon not running. Please start Docker."
    exit 1
fi

log_info "Prerequisites verified ✓"

# Step 2: Test Snowflake connection
log_step "2. Testing Snowflake connection..."
if snow --config-file="config.toml" connection test -c snowsarva; then
    log_info "Snowflake connection successful ✓"
else
    log_error "Snowflake connection failed. Please check your credentials."
    log_warn "Make sure your token in snowflake-pat.token is valid and not expired."
    exit 1
fi

# Step 3: Login to Snowflake Docker registry
log_step "3. Logging into Snowflake Docker registry..."
if docker login ${REGISTRY_URL} -u $(snow --config-file="config.toml" connection get -c snowsarva user); then
    log_info "Docker registry login successful ✓"
else
    log_error "Failed to login to Snowflake Docker registry"
    exit 1
fi

# Step 4: Push container images
log_step "4. Pushing container images to Snowflake registry..."

log_info "Pushing backend image..."
docker push ${REGISTRY_URL}/${REGISTRY_PATH}/snowsarva_backend:${VERSION}

log_info "Pushing frontend image..."
docker push ${REGISTRY_URL}/${REGISTRY_PATH}/snowsarva_frontend:${VERSION}

log_info "Pushing router image..."
docker push ${REGISTRY_URL}/${REGISTRY_PATH}/snowsarva_router:${VERSION}

log_info "All images pushed successfully ✓"

# Step 5: Create application package
log_step "5. Creating application package..."
snow --config-file="config.toml" sql -q "
CREATE APPLICATION PACKAGE IF NOT EXISTS ${APP_PKG_NAME};
USE APPLICATION PACKAGE ${APP_PKG_NAME};
" --connection snowsarva

log_info "Application package created ✓"

# Step 6: Upload application files
log_step "6. Uploading application files..."
snow --config-file="config.toml" stage put app/manifest.yml @${APP_PKG_NAME}.public.stage --overwrite --connection snowsarva
snow --config-file="config.toml" stage put app/setup.sql @${APP_PKG_NAME}.public.stage --overwrite --connection snowsarva
snow --config-file="config.toml" stage put app/service-spec.yaml @${APP_PKG_NAME}.public.stage/service-spec.yaml --overwrite --connection snowsarva
snow --config-file="config.toml" stage put app/readme.md @${APP_PKG_NAME}.public.stage --overwrite --connection snowsarva

log_info "Application files uploaded ✓"

# Step 7: Create application version
log_step "7. Creating application version..."
snow --config-file="config.toml" sql -q "
USE APPLICATION PACKAGE ${APP_PKG_NAME};
ADD VERSION v1_0_0 USING '@public.stage';
" --connection snowsarva

log_info "Application version created ✓"

# Step 8: Create required infrastructure
log_step "8. Creating required Snowflake infrastructure..."
snow --config-file="config.toml" sql -q "
-- Create compute pool for containers
CREATE COMPUTE POOL IF NOT EXISTS snowsarva_pool
  MIN_NODES = 1
  MAX_NODES = 3
  INSTANCE_FAMILY = CPU_X64_XS;

-- Create warehouse if it doesn't exist
CREATE WAREHOUSE IF NOT EXISTS snowsarva_warehouse
  WITH WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

-- Create image repository if it doesn't exist
CREATE IMAGE REPOSITORY IF NOT EXISTS snowsarva_image_database.snowsarva_image_schema.snowsarva_img_repo;
" --connection snowsarva

log_info "Infrastructure created ✓"

# Step 9: Install application
log_step "9. Installing Snowsarva application..."
snow --config-file="config.toml" sql -q "
CREATE APPLICATION IF NOT EXISTS ${APP_NAME}
  FROM APPLICATION PACKAGE ${APP_PKG_NAME}
  USING VERSION v1_0_0;
" --connection snowsarva

log_info "Application installed ✓"

# Step 10: Start the application
log_step "10. Starting Snowsarva application..."
snow --config-file="config.toml" sql -q "
CALL ${APP_NAME}.config.start_app('snowsarva_pool', 'snowsarva_warehouse');
" --connection snowsarva

log_info "Application started ✓"

# Step 11: Get application URL
log_step "11. Getting application URL..."
APP_URL=$(snow --config-file="config.toml" sql -q "CALL ${APP_NAME}.config.app_url();" --connection snowsarva --output json | jq -r '.[] | select(.CALL | test("app_url")) | .CALL')

echo ""
echo "=================================================="
echo "🎉 Deployment Complete!"
echo "=================================================="
echo ""
log_info "Snowsarva has been successfully deployed!"
echo ""
log_info "Application URL: ${APP_URL}"
echo ""
log_info "Next steps:"
echo "1. Navigate to the application URL in your browser"
echo "2. Configure your data sources and budgets"
echo "3. Explore the cost management and lineage features"
echo ""
log_warn "Note: It may take a few minutes for the containers to start up."
log_info "You can check the status with: snow sql -q \"SHOW SERVICES IN APPLICATION ${APP_NAME};\" --connection snowsarva"
echo ""

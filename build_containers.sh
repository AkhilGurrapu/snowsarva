#!/bin/bash

# Snowsarva Container Build Script
# Builds Docker containers for the Snowflake Native App

set -e

# Configuration
REGISTRY_PREFIX="snowsarva"
VERSION="1.0.0"
PLATFORM="linux/amd64"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build backend container
log_info "Building backend container..."
cd backend
docker build --platform ${PLATFORM} -t ${REGISTRY_PREFIX}/snowsarva_backend:${VERSION} .
docker tag ${REGISTRY_PREFIX}/snowsarva_backend:${VERSION} ${REGISTRY_PREFIX}/snowsarva_backend:latest
log_info "Backend container built successfully"
cd ..

# Build frontend container
log_info "Building frontend container..."
cd frontend
docker build --platform ${PLATFORM} -t ${REGISTRY_PREFIX}/snowsarva_frontend:${VERSION} .
docker tag ${REGISTRY_PREFIX}/snowsarva_frontend:${VERSION} ${REGISTRY_PREFIX}/snowsarva_frontend:latest
log_info "Frontend container built successfully"
cd ..

# Build router container
log_info "Building router container..."
cd router
docker build --platform ${PLATFORM} -t ${REGISTRY_PREFIX}/snowsarva_router:${VERSION} .
docker tag ${REGISTRY_PREFIX}/snowsarva_router:${VERSION} ${REGISTRY_PREFIX}/snowsarva_router:latest
log_info "Router container built successfully"
cd ..

# List built images
log_info "Built containers:"
docker images | grep ${REGISTRY_PREFIX}

log_info "All containers built successfully!"

# Optional: Push to Snowflake registry
if [ "$1" = "push" ]; then
    if [ -z "$SNOWFLAKE_REGISTRY" ]; then
        log_error "SNOWFLAKE_REGISTRY environment variable not set"
        log_info "Set SNOWFLAKE_REGISTRY to your Snowflake image repository URL"
        log_info "Example: export SNOWFLAKE_REGISTRY='chfwnrv-ddb48976.registry.snowflakecomputing.com/snowsarva_image_database/snowsarva_image_schema/snowsarva_img_repo'"
        exit 1
    fi
    
    log_info "Pushing containers to Snowflake registry..."
    
    # Tag and push backend
    docker tag ${REGISTRY_PREFIX}/snowsarva_backend:${VERSION} ${SNOWFLAKE_REGISTRY}/snowsarva_backend:${VERSION}
    docker push ${SNOWFLAKE_REGISTRY}/snowsarva_backend:${VERSION}
    
    # Tag and push frontend
    docker tag ${REGISTRY_PREFIX}/snowsarva_frontend:${VERSION} ${SNOWFLAKE_REGISTRY}/snowsarva_frontend:${VERSION}
    docker push ${SNOWFLAKE_REGISTRY}/snowsarva_frontend:${VERSION}
    
    # Tag and push router
    docker tag ${REGISTRY_PREFIX}/snowsarva_router:${VERSION} ${SNOWFLAKE_REGISTRY}/snowsarva_router:${VERSION}
    docker push ${SNOWFLAKE_REGISTRY}/snowsarva_router:${VERSION}
    
    log_info "All containers pushed to Snowflake registry successfully!"
fi

log_info "Build complete!"
log_info ""
log_info "Next steps:"
log_info "1. Create application package in Snowflake"
log_info "2. Upload manifest.yml, setup.sql, and service-spec.yaml"
log_info "3. Create application from package"
log_info "4. Run: CALL snowsarva.config.start_app()"
log_info ""
log_info "For more details, see the README.md file"
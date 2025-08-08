#!/bin/bash

# Snowsarva Hello World - Container Build and Push Script

set -e  # Exit on any error

# Configuration - Update these values based on your setup
SNOWFLAKE_REGISTRY="${SNOWFLAKE_REGISTRY:-chfwnrv-ddb48976.registry.snowflakecomputing.com/snowsarva_image_database/snowsarva_image_schema/snowsarva_img_repo}"
FRONTEND_IMAGE="snowsarva_frontend"

echo "🚀 Building Snowsarva Hello World Native App Containers"
echo "Registry: $SNOWFLAKE_REGISTRY"

# Function to handle errors
handle_error() {
    echo "❌ Error: $1"
    exit 1
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    handle_error "Docker is not running. Please start Docker and try again."
fi

echo "📦 Building frontend container..."
cd frontend
docker build --platform linux/amd64 -t $FRONTEND_IMAGE . || handle_error "Failed to build frontend image"
cd ..

echo "🔐 Logging into Snowflake registry..."
docker login $SNOWFLAKE_REGISTRY || handle_error "Failed to login to Snowflake registry"

echo "🏷️  Tagging and pushing frontend image..."
docker tag $FRONTEND_IMAGE $SNOWFLAKE_REGISTRY/$FRONTEND_IMAGE || handle_error "Failed to tag frontend image"
docker push $SNOWFLAKE_REGISTRY/$FRONTEND_IMAGE || handle_error "Failed to push frontend image"

echo "✅ Container build and push completed successfully!"
echo ""
echo "Next steps:"
echo "1. Deploy the Native App using Snowflake CLI:"
echo "   snow app deploy"
echo "2. Create the application:"
echo "   snow app run"
echo "3. Start the service using the app procedures"
echo ""
echo "Images pushed:"
echo "- $SNOWFLAKE_REGISTRY/$FRONTEND_IMAGE"
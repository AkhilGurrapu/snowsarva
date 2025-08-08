# Snowsarva Hello World - Deployment Guide

This guide provides step-by-step instructions to deploy the Snowsarva Hello World React application as a Snowflake Native App.

## Prerequisites

1. **Snowflake Account** with:
   - Native Apps enabled
   - Snowpark Container Services enabled
   - Docker access for building images

2. **Local Development Environment**:
   - Docker Desktop installed and running
   - Snowflake CLI installed
   - Git installed

3. **Snowflake Setup** (should already exist):
   - User: `snowsarva_user`
   - Role: `snowsarva_role`
   - Image repository for containers

## Project Structure

```
snowsarva/
├── app/
│   └── src/
│       ├── manifest.yml          # Native app configuration
│       ├── setup.sql             # Installation scripts  
│       ├── readme.md             # App documentation
│       └── snowsarva.yaml        # Container service spec
├── frontend/                     # React Hello World app
│   ├── src/
│   │   ├── App.js               # Main React component
│   │   └── index.js             # React entry point
│   ├── public/
│   │   └── index.html           # HTML template
│   ├── package.json             # React dependencies
│   ├── Dockerfile               # Container build instructions
│   └── nginx.conf               # Web server config
├── snowflake.yml                # Snowflake CLI configuration
└── build_containers.sh          # Build and push script
```

## Deployment Steps

### Step 1: Build and Push Container Images

1. **Start Docker Desktop**
   ```bash
   # Ensure Docker is running
   docker info
   ```

2. **Set Environment Variables**
   ```bash
   export SNOWFLAKE_REGISTRY='chfwnrv-ddb48976.registry.snowflakecomputing.com/snowsarva_image_database/snowsarva_image_schema/snowsarva_img_repo'
   ```

3. **Build and Push Images**
   ```bash
   ./build_containers.sh
   ```

   This script will:
   - Build the React app for production
   - Create a Docker image with Nginx
   - Push to Snowflake's image repository

### Step 2: Deploy Native App Package

1. **Deploy the Application Package**
   ```bash
   snow app deploy
   ```

2. **Create the Application Instance**
   ```bash
   snow app run
   ```

### Step 3: Set Up Required Snowflake Resources

1. **Connect to Snowflake** (using snowsarva_user/role)

2. **Create Compute Pool** (if not exists)
   ```sql
   USE ROLE snowsarva_role;
   
   CREATE COMPUTE POOL IF NOT EXISTS snowsarva_pool
   MIN_NODES = 1
   MAX_NODES = 1
   INSTANCE_FAMILY = CPU_X64_XS;
   ```

3. **Create Warehouse** (if not exists)
   ```sql
   CREATE WAREHOUSE IF NOT EXISTS snowsarva_wh
   WITH WAREHOUSE_SIZE = 'XSMALL'
   AUTO_SUSPEND = 60
   AUTO_RESUME = TRUE;
   ```

### Step 4: Start the Application

1. **Install the Native App** (via Snowsight or SQL)
   ```sql
   -- Navigate to Apps > Installed Apps in Snowsight
   -- Or use SQL to install the application package
   ```

2. **Start the Hello World Service**
   ```sql
   -- Use the installed application
   USE APPLICATION snowsarva_hello_world;
   
   -- Start the service
   CALL app_public.start_app('snowsarva_pool', 'snowsarva_wh');
   ```

3. **Check Service Status**
   ```sql
   CALL app_public.service_status();
   ```

4. **Get Application URL**
   ```sql
   CALL app_public.app_url();
   ```

## Application Management

### Available Procedures

The application provides these management procedures:

| Procedure | Description | Usage |
|-----------|-------------|--------|
| `start_app(pool, warehouse)` | Start the Hello World service | `CALL app_public.start_app('pool_name', 'wh_name');` |
| `stop_app()` | Stop the service | `CALL app_public.stop_app();` |
| `service_status()` | Check service status | `CALL app_public.service_status();` |
| `app_url()` | Get application URL | `CALL app_public.app_url();` |

### Monitoring and Troubleshooting

1. **Check Service Status**
   ```sql
   SHOW SERVICES IN APPLICATION snowsarva_hello_world;
   ```

2. **View Service Logs**
   ```sql
   CALL SYSTEM$GET_SERVICE_LOGS('snowsarva_service', 'snowsarva-frontend', 10);
   ```

3. **Check Endpoints**
   ```sql
   SHOW ENDPOINTS IN SERVICE snowsarva_service;
   ```

## Required Permissions

The application requires these privileges (automatically granted during installation):

- **CREATE COMPUTE POOL**: Create dedicated compute resources
- **BIND SERVICE ENDPOINT**: Expose public web endpoints  
- **CREATE WAREHOUSE**: Create query processing warehouses

## Expected Outcome

Once deployed successfully, you should have:

1. ✅ A running React Hello World application
2. ✅ Public web URL accessible via browser
3. ✅ Beautiful gradient UI with "Hello World!" message
4. ✅ Application management via SQL procedures
5. ✅ Container running in Snowpark Container Services

## Application Features

The Hello World app includes:

- **Beautiful UI**: Gradient background with modern styling
- **Responsive Design**: Works on desktop and mobile
- **Production Ready**: Nginx web server with optimizations
- **Containerized**: Runs in Snowflake's container environment
- **Secure**: Uses Snowflake's native security model

## Support and Next Steps

This POC demonstrates the foundation for building more complex Snowflake Native Apps. The next iteration could include:

- Database connectivity for data visualization
- Advanced React components and routing  
- Backend API integration
- Real-time data processing capabilities

For issues or questions, refer to the application logs and Snowflake documentation.
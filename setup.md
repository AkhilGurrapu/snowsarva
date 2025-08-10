# Snowsarva Application Deployment Guide

This document provides a comprehensive guide for deploying the snowsarva Snowflake Native App with Snowpark Container Services (SPCS).

## Overview

The snowsarva application is a comprehensive Snowflake governance and optimization platform that provides:
- Column-level lineage tracking
- Access lineage by roles
- FinOps metrics and cost analysis
- Real-time ACCOUNT_USAGE integration

## Prerequisites

### 1. Environment Setup
- Docker installed and running
- Snow CLI v3.10.0+ configured
- Snowflake account with appropriate privileges
- Valid Snowflake Personal Access Token (PAT)

### 2. Required Snowflake Objects
- Image repository for container storage
- Compute pool for SPCS
- Warehouse for application operations
- Application package and application

## Deployment Process

### Step 1: Verify Connection

First, ensure your Snowflake connection is working:

```bash
snow --config-file=config.toml connection test -c snowsarva
```

**Expected Output:**
```
+-----------------------------------------------------------+
| key             | value                                   |
|-----------------+-----------------------------------------|
| Connection name | snowsarva                               |
| Status          | OK                                      |
| Host            | YECALEZ-TCB02565.snowflakecomputing.com |
| Account         | YECALEZ-TCB02565                        |
| User            | snowsarva_user                          |
| Role            | SNOWSARVA_ROLE                          |
| Database        | SNOWSARVA_IMAGE_DATABASE                |
| Warehouse       | SNOWSARVA_WAREHOUSE                     |
+-----------------------------------------------------------+
```

### Step 2: Analyze Current Infrastructure

Check existing infrastructure components:

```bash
# Check compute pools
snow --config-file=config.toml sql -c snowsarva -q "SHOW COMPUTE POOLS;"

# Check image repositories
snow --config-file=config.toml sql -c snowsarva -q "SHOW IMAGE REPOSITORIES IN SCHEMA SNOWSARVA_IMAGE_DATABASE.SNOWSARVA_IMAGE_SCHEMA;"

# Check applications
snow --config-file=config.toml sql -c snowsarva -q "SHOW APPLICATIONS LIKE 'SNOWSARVA%';"

# Check warehouses
snow --config-file=config.toml sql -c snowsarva -q "SHOW WAREHOUSES LIKE 'SNOWSARVA%';"
```

### Step 3: Create Required Infrastructure

#### 3.1 Create Compute Pool

```sql
CREATE COMPUTE POOL CP_SNOWSARVA 
MIN_NODES = 1 
MAX_NODES = 1 
INSTANCE_FAMILY = CPU_X64_S;
```

**Verify Creation:**
```sql
DESCRIBE COMPUTE POOL CP_SNOWSARVA;
```

**Expected Status:** STARTING → ACTIVE/IDLE

#### 3.2 Verify Image Repository

The image repository should already exist from initial setup:
```
Repository URL: yecalez-tcb02565.registry.snowflakecomputing.com/snowsarva_image_database/snowsarva_image_schema/snowsarva_image_repo
```

### Step 4: Configure and Build Container Images

#### 4.1 Configure Image Repository

```bash
./configure.sh
```

This updates the Makefile with your specific image repository URL.

#### 4.2 Update Makefile for Authentication

The Makefile needs to be updated to use proper authentication. Update the login target:

```makefile
login:           ## Login to Snowflake Docker repo
	@echo "$(shell cat snowflake-pat.token)" | docker login $(SNOWFLAKE_REPO) --username snowsarva_user --password-stdin
```

#### 4.3 Build and Push Images

```bash
make all
```

This command:
1. Logs into Snowflake Docker registry using PAT token
2. Builds three Docker images:
   - `snowsarva_backend` (Flask + Snowpark)
   - `snowsarva_frontend` (React application)
   - `snowsarva_router` (Nginx routing)
3. Pushes all images to Snowflake registry

**Expected Output:**
```
Login Succeeded
[Docker build processes...]
docker push [repository]/snowsarva_backend
docker push [repository]/snowsarva_frontend  
docker push [repository]/snowsarva_router
```

### Step 5: Deploy Native Application

#### 5.1 Deploy Application Package

```bash
./deploy.sh
```

This script:
1. Rebuilds and pushes container images
2. Creates application package `snowsarva_pkg_akhilgurrapu`
3. Uploads application files to Snowflake stage
4. Validates setup script
5. Creates application `snowsarva_akhilgurrapu`

**Expected Output:**
```
Creating new application package snowsarva_pkg_akhilgurrapu in account.
Validating Snowflake Native App setup script.
Creating new application object snowsarva_akhilgurrapu in account.
Application 'SNOWSARVA_AKHILGURRAPU' created successfully.

Your application object (snowsarva_akhilgurrapu) is now available:
https://app.snowflake.com/YECALEZ/tcb02565/#/apps/application/SNOWSARVA_AKHILGURRAPU
```

### Step 6: Grant Required Privileges

#### 6.1 Grant Application Privileges

```sql
-- Grant compute pool access
GRANT USAGE ON COMPUTE POOL CP_SNOWSARVA TO APPLICATION snowsarva_akhilgurrapu;

-- Grant service endpoint binding
GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION snowsarva_akhilgurrapu;

-- Grant warehouse access
GRANT USAGE ON WAREHOUSE SNOWSARVA_WAREHOUSE TO APPLICATION snowsarva_akhilgurrapu;

-- Grant ACCOUNT_USAGE access (requires ACCOUNTADMIN)
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION snowsarva_akhilgurrapu;
```

### Step 7: Start Application Service

#### 7.1 Start the Service

```sql
CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'SNOWSARVA_WAREHOUSE');
```

**Expected Output:**
```
+------------------------------------------------------+
| START_APP                                            |
|------------------------------------------------------|
| Service started. Check status, then call app_url()   |
| to get endpoint.                                     |
+------------------------------------------------------+
```

#### 7.2 Get Application URL

```sql
CALL snowsarva_akhilgurrapu.app_public.app_url();
```

**Initial Response:**
```
+------------------------------------------------------+
| APP_URL                                              |
|------------------------------------------------------|
| Endpoints provisioning in progress... check back in  |
| a few minutes                                        |
+------------------------------------------------------+
```

Wait 2-3 minutes, then re-run to get the actual endpoint URL.

## Application Management

### Service Management Commands

```sql
-- Start service
CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'SNOWSARVA_WAREHOUSE');

-- Stop service
CALL snowsarva_akhilgurrapu.app_public.stop_app();

-- Get application URL
CALL snowsarva_akhilgurrapu.app_public.app_url();

-- Check service status
SHOW SERVICES IN APPLICATION snowsarva_akhilgurrapu;
```

### Monitoring and Troubleshooting

```sql
-- Check application privileges
SHOW PRIVILEGES IN APPLICATION snowsarva_akhilgurrapu;

-- Check compute pool status
DESCRIBE COMPUTE POOL CP_SNOWSARVA;

-- List applications
SHOW APPLICATIONS LIKE 'SNOWSARVA%';

-- Check grants
SHOW GRANTS TO APPLICATION snowsarva_akhilgurrapu;
```

## Configuration Files

### config.toml
```toml
[connections.snowsarva]
account = "YECALEZ-TCB02565"
user = "snowsarva_user"
authenticator = "PROGRAMMATIC_ACCESS_TOKEN"
token_file_path = "snowflake-pat.token"
role = "snowsarva_role"
warehouse = "snowsarva_warehouse"
database = "snowsarva_image_database"
schema = "snowsarva_image_schema"
```

### snowflake-pat.token
Contains the Personal Access Token (JWT format). This file should be kept secure and not committed to version control.

## Application Features

Once deployed, the application provides:

1. **Lineage Analysis**
   - Column-level lineage tracking
   - SQL parsing with sqlglot
   - dbt integration for model dependencies
   - Interactive lineage visualization

2. **Access Management**
   - Role-based access analysis
   - Usage pattern tracking
   - Privilege drift detection
   - Column-level access monitoring

3. **FinOps Analytics**
   - Warehouse cost analysis
   - Query performance metrics
   - Storage utilization breakdown
   - Cost optimization recommendations

4. **Real-time Metrics**
   - ACCOUNT_USAGE integration
   - Credit usage tracking
   - User activity monitoring
   - Object inventory management

## Local Development

For local development and testing:

```bash
# Start local development environment
./local-dev.sh

# Access locally at:
# Frontend: http://localhost:5173
# Backend API: http://localhost:8081/api/snowpark
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify PAT token is valid and not expired
   - Check config.toml credentials
   - Ensure proper role assignments

2. **Compute Pool Issues**
   - Verify compute pool is in ACTIVE/IDLE state
   - Check grants to application
   - Ensure sufficient capacity

3. **Service Startup Failures**
   - Check container image availability
   - Verify warehouse permissions
   - Review service logs in Snowsight

4. **Image Push Failures**
   - Verify Docker login credentials
   - Check image repository permissions
   - Ensure network connectivity

### Support Commands

```bash
# Test connection
snow --config-file=config.toml connection test -c snowsarva

# Rebuild and redeploy
make all && ./deploy.sh

# Check logs (in Snowsight)
# Navigate to Apps > [Application] > Services > Logs
```

## Security Considerations

1. **PAT Token Management**
   - Rotate tokens regularly
   - Store securely (not in version control)
   - Use minimal required privileges

2. **Application Privileges**
   - Grant only necessary privileges
   - Monitor privilege usage
   - Regular access reviews

3. **Network Security**
   - Use private endpoints where possible
   - Monitor service access logs
   - Implement proper firewall rules

## Deployment Checklist

- [ ] Snowflake connection verified
- [ ] Image repository configured
- [ ] Compute pool created and active
- [ ] Container images built and pushed
- [ ] Application package deployed
- [ ] Required privileges granted
- [ ] Service started successfully
- [ ] Application URL accessible
- [ ] Features tested and working

## Version Information

- **Snow CLI**: v3.10.0+
- **Docker**: Any recent version
- **Snowflake Account**: Standard or higher
- **Application Version**: Based on manifest.yml

---

**Last Updated**: August 10, 2025
**Deployment Account**: YECALEZ-TCB02565
**Application Name**: snowsarva_akhilgurrapu

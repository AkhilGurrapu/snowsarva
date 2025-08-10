At the end of this message, I will ask you to do something. Please follow the "Explore, Plan, Code, Test" workflow when you start.

Explore
First, use parallel subagents to find and read all files that may be useful for implementing the ticket, either as examples or as edit targets. The subagents should return relevant file paths, and any other info that may be useful.

Plan
Next, think hard and write up a detailed implementation plan. Don't forget to include tests, lookbook components, and documentation. Use your judgement as to what is necessary, given the standards of this repo.

If there are things you are not sure about, use parallel subagents to do some web research. They should only return useful information, no noise.

If there are things you still do not understand or questions you have for the user, pause here to ask them before continuing.

Code
When you have a thorough implementation plan, you are ready to start writing code. Follow the style of the existing codebase (e.g. we prefer clearly named variables and methods to extensive comments). Make sure to run our autoformatting script when you're done, and fix linter warnings that seem reasonable to you.

Test
Use parallel subagents to run tests, and make sure they all pass.

If your changes touch the UX in a major way, use the browser to make sure that everything works correctly. Make a list of what to test for, and use a subagent for this step.

If your testing shows problems, go back to the planning stage and think ultrahard.
Local development should be separate and easy without effecting the production snowflake deployment which works.
Work on below app.

# ⚡ Quick Commands (TL;DR)

```bash
# 🛠️ Local Development (safe, no Snowflake changes)
./local-dev.sh                    # Start local dev (http://localhost:5173)

# 🚀 Deploy to Snowflake (production)
./deploy.sh                       # Deploy to Snowflake Native App

# 🔍 Check Connection  
snow --config-file=config.toml connection test -c snowsarva

# 📊 Start Service (after deploy)
snow --config-file=./config.toml sql -c snowsarva -q "CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'WH_SNOWSARVA_CONSUMER');"
snow --config-file=./config.toml sql -c snowsarva -q "CALL snowsarva_akhilgurrapu.app_public.app_url();"
```

# snowsarva (Snowflake Native App with SPCS)

React + Flask behind Nginx, deployed via Snowpark Container Services inside a Snowflake Native App. Uses `config.toml` and `snowflake-pat.token` for CLI auth.

- Frontend: React (Vite) renders metrics from backend
- Backend: Flask + Snowpark exposes `/snowpark/metrics`
- Router: Nginx routes `/` → frontend and `/api` → backend
- App Artifacts: `app/src/manifest.yml`, `app/src/setup.sql`, `app/src/fullstack.yaml`
for auth: use snow cli only not snow sql 
command - 
```bash
snow --config-file=config.toml connection test -c snowsarva
```
Use all these open source within the project to deliver what listed below:
Open source tools:

* dbt (Core & Artifacts) – For model metadata and source-to-model relationships
* sqlglot or sqlfluff – For SQL parsing and extracting column-level lineage
* dbt-column-lineage-extractor – Ready-made tool for dbt projects
* OpenMetadata – Open-source lineage framework with built-in lineage APIs and UI
* SQLLineage – Python package for parsing SQL statements and producing lineage graphs
* Neo4j (or similar graph DB) – For storing column-level nodes and edges
* React Flow, Cytoscape.js, or D3.js – For frontend lineage graph visualization
* Tokern/Recce/Spline (optional) – Additional open-source lineage toolkits for inspiration or integration

What the app delivers
1. Column-level lineage
* End-to-end lineage across databases, schemas, tables, views, and materialized views.
* Column-to-column mappings for SELECT/INSERT/CTAS pipelines.
* Impact analysis (upstream sources, downstream consumers).
* Surfaced in an in-app lineage UI and optionally Snowsight deep links.
1. Access lineage by roles
* Which roles can access which objects/columns.
* Actual usage lineage: which roles/users actually queried or modified objects.
* Alerting on privilege drift and sensitive data exposure paths.
1. FinOps metrics (Snowflake Admin/Monitoring)
* Warehouse cost and utilization by warehouse, role, user, query type.
* Query performance hotspots, retries, and queuing.
* Storage cost breakdown (tables, time travel, failsafe).
* Marketplace/native app metering (if publishing).
* SLA/SLO panels (e.g., cost per workload, $ per query, $ per TB scanned).
High-level architecture
* Snowflake Native App package (Snowflake Native Apps framework) with:
    * Installer and setup scripts (application package + application).
    * Secure views over ACCOUNT_USAGE, ORGANIZATION_USAGE, INFORMATION_SCHEMA, and HORIZON/lineage APIs.
    * Stored procedures (Snowflake Scripting/Python) to materialize column-level lineage and role-access graphs.
    * Optional task/scheduler to refresh lineage and metrics.
    * Snowsight dashboards or Streamlit in-Snowflake app UI for visualization.
* Data sources:
    * Lineage: Snowsight lineage graph + query text parsing for column-level mapping.
    * Access lineage: GRANTS/OBJECT_PRIVILEGES, ACCESS_HISTORY, LOGIN_HISTORY.
    * FinOps: WAREHOUSE_METERING_HISTORY, METERING_DAILY_HISTORY, STORAGE_DAILY_HISTORY, QUERY_HISTORY.
* Governance integration: Horizon catalog and classification tags for sensitive data, with policy checks.


## Dev/Prod parity

- Local development (`./local-dev.sh`):
  - Backend runs with `DEV_MODE=1` and prefers PAT from `snowflake-pat.token` via `SNOWFLAKE_TOKEN_FILE`.
  - Fallbacks supported: `SNOWFLAKE_OAUTH_TOKEN` or `SNOWFLAKE_PASSWORD`.
  - Frontend dev server proxies `/api` → `http://localhost:8081` (see `frontend/react/vite.config.js`).
  - Toggle ACCOUNT_USAGE access check with `USE_ACCOUNT_USAGE=0` to use SHOW-based fallback.

- Production (SPCS inside Native App):
  - Deployed via `./deploy.sh` which builds/pushes images and runs `snow app run -p app/src`.
  - Consumer grants required:
    - `GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION <app>;`
    - `GRANT USAGE ON COMPUTE POOL <pool> TO APPLICATION <app>;`
    - `GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION <app>;`
    - `GRANT USAGE ON WAREHOUSE <wh> TO APPLICATION <app>;`
  - Backend uses the SPCS runtime token and the service `QUERY_WAREHOUSE` set by `app_public.start_app`.

## Configure image repository
Run and paste the repository URL from `SHOW IMAGE REPOSITORIES IN SCHEMA SNOWSARVA_IMAGE_DATABASE.SNOWSARVA_IMAGE_SCHEMA;`.

```bash
./configure.sh
```

## Build and push images
```bash
make all
```

## Run the app (developer)
```bash
# From repo root
snow --config-file=./config.toml app run -c snowsarva -p app/src
```

## Consumer steps (Snowsight as SNOWSARVA_CONSUMER)
- Install the app and open Worksheets
- Grant app roles and start the service

```sql
GRANT APPLICATION ROLE snowsarva.app_admin TO ROLE SNOWSARVA_CONSUMER;
GRANT APPLICATION ROLE snowsarva.app_user TO ROLE SNOWSARVA_CONSUMER;
CALL snowsarva.app_public.start_app('CP_SNOWSARVA', 'WH_SNOWSARVA_CONSUMER');
CALL snowsarva.app_public.app_url();
```

### Grants screen

- The frontend now includes a Grants tab that calls `/api/snowpark/grants/status` and renders required grants with copyable SQL.
  - Endpoint returns whether `ACCOUNT_USAGE` access is effective (based on a test query) and shows SQL for the other grants.

## Troubleshooting and learnings

- Snow CLI project file (`snowflake.yml`):
  - For CLI v3.10.0, a minimal file under `app/src/snowflake.yml` works:
    ```
definition_version: 1
native_app:
  name: snowsarva
  artifacts:
    - src: ./*
      dest: ./
    ```
  - Run with `-p app/src` from repo root so `config.toml` and `snowflake-pat.token` resolve.

- Imported privileges on SNOWFLAKE:
  - To read `SNOWFLAKE.ACCOUNT_USAGE`, the app must request the global privilege in `manifest.yml`, and the consumer must grant it to the application. Format per docs: `IMPORTED PRIVILEGES ON SNOWFLAKE DB`.
  - We now request this privilege in `app/src/manifest.yml`. After upgrading the app, a consumer admin grants:
    - `GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION snowsarva_akhilgurrapu;`
  - Reference: Request global privileges in Native Apps ([docs](https://docs.snowflake.com/en/developer-guide/native-apps/requesting-privs)).
  - If the app version didn’t request the privilege, Snowflake returns “not requested by current application version.” Upgrade the app first, then re-grant.
  - Until the grant is applied, a fallback is to query counts using SHOW-based queries instead of ACCOUNT_USAGE.

- CPU capacity error when starting service:
  - Error: requirement exceeds compute pool capacity. Fixed by reducing per-container requests in `app/src/fullstack.yaml` to 0.3 CPU and 0.5Gi memory each.

- Idempotent setup on app upgrade:
  - `CREATE APPLICATION ROLE` failed on upgrade. Fixed by using `IF NOT EXISTS` in `app/src/setup.sql`.

- Grants required to run the service (as ACCOUNTADMIN):
  - `GRANT USAGE ON COMPUTE POOL CP_SNOWSARVA TO APPLICATION snowsarva_akhilgurrapu;`
  - `GRANT USAGE ON WAREHOUSE WH_SNOWSARVA_CONSUMER TO APPLICATION snowsarva_akhilgurrapu;`
  - `GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION snowsarva_akhilgurrapu;`

- Consumer role to use the app:
  - Use `SNOWSARVA_CONSUMER` when opening the URL and calling procedures.

- Local dev auth errors:
  - "The Programmatic Access Token (PAT) has been disabled": The PAT secret in `snowflake-pat.token` is disabled or rotated. Generate a new PAT in Snowsight and replace the file, or use OAuth/password temporarily.
  - ACCOUNT_USAGE privileges not granted: start local with `USE_ACCOUNT_USAGE=0 ./local-dev.sh` to use SHOW-based fallback.

## Using ACCOUNT_USAGE metrics in the app

Once the consumer grants imported privileges, the backend uses `SNOWFLAKE.ACCOUNT_USAGE.{DATABASES,SCHEMATA}` for metrics.

- Confirm privilege request appears in the app:
  - `SHOW PRIVILEGES IN APPLICATION snowsarva_akhilgurrapu;`
- Grant privilege (admin role):
  - `GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION snowsarva_akhilgurrapu;`
- Restart service as consumer (if already running):
  - `CALL snowsarva_akhilgurrapu.app_public.stop_app();`
  - `CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'WH_SNOWSARVA_CONSUMER');`
  - `CALL snowsarva_akhilgurrapu.app_public.app_url();`

## Cross-check counts via Snow CLI

- SHOW-based (matches app behavior when using fallback):
  - `snow --config-file=config.toml sql -c snowsarva -q "SHOW DATABASES; SELECT COUNT(*) AS DATABASES FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));"`
  - `snow --config-file=config.toml sql -c snowsarva -q "SHOW SCHEMAS IN ACCOUNT; SELECT COUNT(*) AS SCHEMAS FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));"`
- INFORMATION_SCHEMA (alternative):
  - `snow --config-file=config.toml sql -c snowsarva -q "SELECT COUNT(*) AS DATABASES FROM INFORMATION_SCHEMA.DATABASES;"`
  - `snow --config-file=config.toml sql -c snowsarva -q "SELECT COUNT(*) AS SCHEMAS FROM INFORMATION_SCHEMA.SCHEMATA;"`

## Common errors and fixes

- PAT token file not found: Run Snow CLI from repo root or pass absolute `--config-file`.
- “not requested by current application version”: Upgrade app so manifest includes the privilege, then re-grant.
- Service capacity exceeded: reduce container `resources.requests` in `fullstack.yaml` or use a larger pool.
- Object exists on upgrade: make setup idempotent (`IF NOT EXISTS`).
- Wrong app name in SQL: verify with `SHOW APPLICATIONS LIKE 'SNOWSARVA%';` and use that exact name in all GRANTs and CALLs.

## 🎯 Proven Deployment Process (Aug 2025)

### Quick Deploy (Tested & Working)

```bash
# Single command - deploys enhanced app with ACCOUNT_USAGE integration
./deploy.sh
```

**What happens (verified working):**
- ✅ Builds Docker images for backend and router
- ✅ Pushes to Snowflake image repository 
- ✅ Validates setup.sql syntax (all fixes applied)
- ✅ Upgrades application with enhanced features
- ✅ Shows deployment URL

### Verified Service Management

```bash
# Start the service (tested command)
snow --config-file=./config.toml sql -c snowsarva -q "CALL snowsarva_akhilgurrapu.app_public.start_app('CP_SNOWSARVA', 'WH_SNOWSARVA_CONSUMER');"

# Get service endpoint (confirmed working)
snow --config-file=./config.toml sql -c snowsarva -q "CALL snowsarva_akhilgurrapu.app_public.app_url();"
```

**Expected Results:**
- ✅ Service creation: "Service started. Check status, then call app_url() to get endpoint."
- ✅ Endpoint retrieval: Returns SPCS endpoint URL (e.g., `fram4kec-YECALEZ-TCB02565.snowflakecomputing.app`)
- ✅ Application URL: https://app.snowflake.com/YECALEZ/TCB02565/#/apps/application/SNOWSARVA_AKHILGURRAPU

### Deployment Verification Checklist

**✅ Pre-deployment:**
- [ ] Local development tested and working
- [ ] All setup_* temporary files cleaned up
- [ ] setup.sql contains only production-ready code

**✅ During deployment:**
- [ ] Docker images build successfully
- [ ] No syntax errors in setup.sql validation
- [ ] Application upgrade completes successfully

**✅ Post-deployment:**
- [ ] Service starts without errors
- [ ] app_url() returns valid endpoint
- [ ] Enhanced metrics working (/api/snowpark/metrics/enhanced)
- [ ] ACCOUNT_USAGE integration functional

### Common Deployment Issues (All Fixed)

**Issue: "syntax error on line X unexpected 'ON'"**
- ✅ **Fixed**: Removed all `AS $$` delimiters from stored procedures
- ✅ **Fixed**: Used `CREATE APPLICATION ROLE IF NOT EXISTS` 
- ✅ **Fixed**: Used `CREATE OR ALTER VERSIONED SCHEMA`

**Issue: "ON CONFLICT" syntax not supported**
- ✅ **Fixed**: Replaced with `MERGE INTO` statements for upserts

**Issue: Service creation parameter escaping**
- ✅ **Fixed**: Triple quotes (`'''`) around parameters in `EXECUTE IMMEDIATE`

**Issue: Session schema context missing**
- ✅ **Fixed**: Added `USE SCHEMA v1;` after schema creation

### File Cleanup (Completed)

**Removed debugging artifacts:**
- ❌ `setup_backup.sql`
- ❌ `setup_full_backup.sql` 
- ❌ `setup_incremental.sql`
- ❌ `setup_minimal.sql`
- ❌ All corresponding symlinks in `output/deploy/`

**Kept production files:**
- ✅ `app/src/setup.sql` (2,875 bytes, fully functional)
- ✅ `app/src/output/deploy/setup.sql` (symlink to main file)

## 🚀 Development Workflow (Clear & Simple)

### Step 1: Local Development Setup

**Prerequisites:**
- Docker installed and running
- Snow CLI configured with valid PAT token
- Project configured with `config.toml` and `snowflake-pat.token`

**Verify your setup:**
```bash
# Test CLI connection first
snow --config-file=config.toml connection test -c snowsarva

# Should show "Status: OK" with your account details
```

**Start local development:**
```bash
# From project root - this starts both backend and frontend
./local-dev.sh
```

**What happens:**
- ✅ Backend (Flask + Snowpark) runs in Docker container on port 8081
- ✅ Frontend (React + Vite) starts on port 5173 (or next available)
- ✅ Automatic proxy: Frontend `/api/*` routes to backend `http://localhost:8081`
- ✅ Hot reload: Changes to React code refresh immediately
- ✅ Database connection: Uses your PAT token to connect to Snowflake
- ✅ **No deployment**: Nothing is changed in Snowflake, purely local

**Access your app:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8081/api/snowpark/metrics/enhanced
- Logs: Both services show real-time logs in terminal

**Stop development:**
- Press `Ctrl+C` to stop both services
- No cleanup needed - purely local development

### Step 2: Test Your Changes

**Frontend changes:**
- Edit files in `frontend/react/src/`
- Browser auto-refreshes on save
- Check browser console for any errors

**Backend changes:**
- Edit files in `backend/src/`
- Stop with `Ctrl+C` and restart `./local-dev.sh`
- Docker rebuilds and restarts automatically

**New dependencies:**
```bash
# Frontend dependencies
cd frontend/react && npm install

# Backend dependencies - edit backend/src/requirements.txt
# Then restart ./local-dev.sh to rebuild container
```

### Step 3: Deploy to Snowflake

**When ready for production deployment:**
```bash
# Single command deployment from project root
./deploy.sh
```

**What happens:**
- ✅ Builds Docker images for backend and router
- ✅ Pushes images to Snowflake image repository
- ✅ Validates and deploys Native App setup script
- ✅ Upgrades existing application (if already deployed)
- ✅ Shows deployment URL

**Post-deployment setup (first time only):**
```sql
-- As ACCOUNTADMIN, grant required privileges
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION <app_name>;
GRANT USAGE ON COMPUTE POOL <pool> TO APPLICATION <app_name>;
GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION <app_name>;
GRANT USAGE ON WAREHOUSE <warehouse> TO APPLICATION <app_name>;

-- As consumer role, start the service
GRANT APPLICATION ROLE <app_name>.app_admin TO ROLE <consumer_role>;
GRANT APPLICATION ROLE <app_name>.app_user TO ROLE <consumer_role>;
CALL <app_name>.app_public.start_app('<compute_pool>', '<warehouse>');
CALL <app_name>.app_public.app_url();
```

### Authentication Details

**Local Development Authentication (automatic):**
The script handles authentication in this priority order:
1. **PAT Token** (recommended): Put token secret in `snowflake-pat.token` file
2. **OAuth Token**: `export SNOWFLAKE_OAUTH_TOKEN='eyJ...' && ./local-dev.sh`
3. **Password**: `SNOWFLAKE_PASSWORD='password' ./local-dev.sh`

**Production Authentication (automatic):**
- Uses SPCS runtime service tokens
- No manual setup required

### Troubleshooting Common Issues

**Port conflicts:**
```bash
# If you see "port already allocated"
docker ps -a  # Find conflicting containers
docker stop <container_id>
./local-dev.sh  # Restart
```

**Authentication errors:**
```bash
# If PAT token fails
snow --config-file=config.toml connection test -c snowsarva
# Generate new PAT in Snowsight if needed
```

**Frontend not loading:**
```bash
# Check if Vite dev server started
# Look for "Local: http://localhost:5173" in output
# If port is different, use that URL
```

**Backend errors:**
```bash
# Check Docker logs
docker logs <container_name>
# Look for Snowflake connection errors
```

### Development Best Practices

**File structure:**
- ✅ Keep local development and deployment separate
- ✅ Always test locally before deploying
- ✅ Use version control for all changes

**Testing workflow:**
1. Make changes locally
2. Test in browser at localhost:5173
3. Verify API endpoints work
4. Deploy to Snowflake when ready
5. Test production deployment

**Clean development:**
- ✅ Local development never affects Snowflake objects
- ✅ Only deployment (`./deploy.sh`) changes Snowflake
- ✅ Safe to experiment and iterate locally

Configuration correct syntax: 
(base) akhilgurrapu@Mac snowsarva % snow --config-file=config.toml connection test -c snowsarva 
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

# Enhanced Features Implementation (Aug 10, 2025)

## Overview
Implemented comprehensive column-level lineage, access lineage by roles, and FinOps metrics using open source tools, following the existing codebase patterns while adding powerful new capabilities.

## What Was Delivered

### ✅ Column-Level Lineage
- **SQL Parsing Engine**: Using sqlglot to extract column dependencies from CREATE TABLE AS SELECT, INSERT, MERGE, UPDATE queries
- **Auto-Discovery**: Processes SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY for automatic lineage detection from DDL/DML queries
- **dbt Integration**: Upload and process dbt manifest.json files for model lineage extraction with dependency graphs
- **Interactive Visualization**: React Flow-based lineage graphs with different node types (tables, columns, dbt models) and dagre layout
- **Enhanced API Endpoints**: 
  - `/api/snowpark/lineage/sql-parse` - Parse SQL text for column-level lineage
  - `/api/snowpark/lineage/auto-discover` - Auto-discover from query history
  - `/api/snowpark/lineage/dbt-upload` - Process dbt artifacts
  - `/api/snowpark/lineage/enhanced-object` - Enhanced recursive lineage queries

### ✅ Access Lineage by Roles  
- **Grants Analysis**: Processes GRANTS_TO_ROLES and OBJECT_PRIVILEGES from ACCOUNT_USAGE for current privilege state
- **Usage Tracking**: Analyzes ACCESS_HISTORY for actual usage patterns by role/user/object with access counts
- **Role Hierarchy**: Builds role inheritance graphs from role grants
- **Column-Level Access**: Tracks which roles access which specific columns from COLUMNS_ACCESSED data
- **Enhanced API Endpoints**:
  - `/api/snowpark/access/analyze-grants` - Current grants and privileges analysis
  - `/api/snowpark/access/analyze-history` - Usage patterns from ACCESS_HISTORY
  - `/api/snowpark/access/role-graph` - Role-specific access graphs

### ✅ FinOps Metrics & Cost Analysis
- **Warehouse Costs**: WAREHOUSE_METERING_HISTORY analysis with credit usage breakdown by warehouse/compute/cloud services
- **Query Performance**: Query cost analysis by user/role, identifies expensive queries (>1min execution time)
- **Storage Analysis**: TABLE_STORAGE_METRICS breakdown by database/schema (active, time travel, failsafe, clone storage)
- **Cost Estimation**: Estimated dollar costs based on credit usage (2x multiplier)
- **Enhanced API Endpoints**:
  - `/api/snowpark/finops/warehouse-analysis` - Warehouse cost analysis
  - `/api/snowpark/finops/query-analysis` - Query performance and cost analysis  
  - `/api/snowpark/finops/storage-analysis` - Storage cost breakdown
  - `/api/snowpark/finops/comprehensive-analysis` - Combined analysis with storage option

### ✅ Enhanced Frontend Interface
- **Tabbed Interface**: Each major feature (Lineage/Access/FinOps) has multiple specialized analysis tabs
- **Lineage Tab Sub-tabs**: Manual Query, SQL Parser, Auto-Discover, dbt Artifacts
- **Access Tab Sub-tabs**: Grants Analysis, Access History, Role Graph
- **FinOps Tab Sub-tabs**: Warehouse Costs, Query Analysis, Storage Costs, Comprehensive Analysis
- **Interactive Lineage Graph**: Visual lineage with different node types, colors, and layouts using React Flow
- **Real-time Analytics**: Cost breakdowns, usage patterns, access summaries with formatted metrics
- **File Upload Support**: dbt manifest.json upload with drag-and-drop interface

### ✅ Integration & Management
- **Scheduled Procedures**: 
  - `app_public.refresh_lineage_data()` - Placeholder for automated lineage refresh
  - `app_public.refresh_finops_data()` - Daily FinOps data refresh from WAREHOUSE_METERING_HISTORY
  - `app_public.cleanup_old_data(retention_days)` - Cleanup old lineage/FinOps data
- **Health Monitoring**: 
  - `/api/snowpark/status/health` - Comprehensive health check with ACCOUNT_USAGE access test
  - `/api/snowpark/status/data-summary` - Data summary with table counts and recent timestamps
- **Admin Controls**: 
  - `/api/snowpark/admin/refresh-lineage` - Manual lineage refresh trigger
  - `/api/snowpark/admin/refresh-finops` - Manual FinOps refresh trigger  
  - `/api/snowpark/admin/cleanup-data` - Manual data cleanup trigger
- **Enhanced Database Schema**: Added metadata columns, performance indexes, and proper grants

## Technical Implementation

### Open Source Tools Integration
- **sqlglot>=25.0.0**: SQL parsing and AST analysis for column lineage extraction with Snowflake dialect support
- **sqlfluff>=3.1.0**: SQL linting and additional parsing capabilities
- **sqllineage>=1.5.4**: Column-level lineage extraction with networkx graph support
- **dbt-artifacts-parser>=0.6.0**: dbt manifest.json and catalog.json processing
- **@xyflow/react**: Interactive graph visualization with custom node types and layouts
- **dagre**: Automatic graph layout algorithms for hierarchical lineage visualization
- **elkjs**: Alternative graph layout engine for complex lineage graphs

### Backend Architecture (Python + Flask + Snowpark)
- **New Modules Created**:
  - `backend/src/lineage_parser.py` - SnowflakeLineageExtractor and DbtArtifactsProcessor classes
  - `backend/src/access_analyzer.py` - AccessLineageAnalyzer and FinOpsAnalyzer classes
- **Enhanced Database Schema**: 
  - Added metadata columns (node_type, lineage_source, confidence_score, created_at, updated_at)
  - Performance indexes on frequently queried columns
  - Enhanced stored procedures for data management
- **API Expansion**: From ~6 to 25 endpoints with comprehensive error handling and fallback mechanisms
- **Session Management**: Maintained existing dual-connector pattern (SPCS vs local dev) with enhanced resilience

### Frontend Architecture (React + Vite + Tailwind)
- **Component Structure**:
  - `frontend/react/src/components/LineageGraph.jsx` - Interactive lineage visualization component
  - Enhanced `frontend/react/src/App.jsx` with tabbed interfaces and state management
- **Styling**: Maintained existing Tailwind-first approach with Material-UI components for forms
- **State Management**: Added comprehensive state for lineage data, access analysis, and FinOps metrics
- **User Experience**: Progressive disclosure with tabbed interfaces and loading states

### Database Schema Enhancements
- **Enhanced Tables**: Added metadata tracking, confidence scoring, and audit fields to v1.lineage_nodes and v1.lineage_edges
- **Performance Indexes**: 6 new indexes on frequently queried columns for lineage and edge tables
- **Stored Procedures**: 3 new procedures for data refresh and cleanup with proper error handling
- **Security**: Maintained existing application role structure with appropriate grants

## Key Statistics
- **25 API endpoints** (expanded from ~6 original endpoints)
- **46 SQL DDL statements** in enhanced schema (tables, indexes, procedures, grants)
- **Enhanced database tables** with proper metadata tracking and performance optimization
- **Comprehensive error handling** with graceful fallbacks when ACCOUNT_USAGE not granted
- **Production-ready** with proper separation of local dev and SPCS deployment environments

## Usage Instructions

### Local Development Testing
```bash
# Install new frontend dependencies
cd frontend/react && npm install

# Start local development (requires Docker)
./local-dev.sh

# Access at http://localhost:5173
# Backend API at http://localhost:8081/api/snowpark
```

### Feature Testing Guide
1. **LINEAGE Tab**: Test SQL parsing with CREATE TABLE AS SELECT queries, try auto-discovery from query history
2. **ACCESS Tab**: Analyze grants and usage patterns, explore role-object relationships  
3. **FINOPS Tab**: Review warehouse costs, identify expensive queries, analyze storage usage
4. **dbt Integration**: Upload manifest.json files to extract model lineage
5. **Admin Features**: Use refresh and cleanup endpoints for data management

### Production Deployment
```bash
# Deploy enhanced app to Snowflake
./deploy.sh

# Grant required privileges (as ACCOUNTADMIN)
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION snowsarva;
GRANT USAGE ON COMPUTE POOL <pool> TO APPLICATION snowsarva;
GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION snowsarva;
```

## Architecture Decisions
- **Maintained Compatibility**: All changes are additive and backward-compatible with existing functionality
- **Error Resilience**: Graceful degradation when ACCOUNT_USAGE privileges not granted (falls back to SHOW commands)
- **Performance First**: Added proper indexes and optimized queries for large-scale lineage analysis
- **Modular Design**: New functionality in separate modules that can be independently tested and maintained
- **User Experience**: Progressive disclosure with tabbed interfaces to manage complexity while maintaining discoverability

This implementation transforms the basic metrics app into a comprehensive Snowflake governance and optimization platform while maintaining the existing architecture and deployment patterns.

# snowsarva – Column & Access Lineage + FinOps (Real App) – Implementation Plan

This plan describes the scope, architecture, security model, and step-by-step work plan to build the full Snowflake Native App (with SPCS) that delivers: column-level lineage, access lineage by roles, and FinOps metrics. It uses open‑source tooling for parsing and visualization.

Links cited
- Requesting global privileges for Native Apps: https://docs.snowflake.com/en/developer-guide/native-apps/requesting-privs

## 0) High-level architecture
- Native App (application package + application) with SPCS services and scheduled procedures
  - Router (nginx) → Frontend (React + React Flow/Cytoscape) → Backend API (Flask/FastAPI + Snowpark)
  - Job service (optional) or Snowflake Tasks for periodic lineage/metrics refresh
- App schemas
  - `app_public` (public objects, services)
  - `v1` (versioned code, procedures, secure views)
- Data persistence inside the application (no exfiltration): tables for edges, nodes, facts, rollups
- Open-source components
  - SQL parsing: sqlglot (preferred) or sqlfluff; optionally SQLLineage
  - dbt integration: ingest dbt artifacts (manifest.json, run_results.json) if available
  - Graph visualization: React Flow (primary) or Cytoscape.js

## 1) Privileges and security (consumer grants)
- Request in `manifest.yml` (already added in code):
  - CREATE COMPUTE POOL, BIND SERVICE ENDPOINT, CREATE WAREHOUSE
  - IMPORTED PRIVILEGES ON SNOWFLAKE DB (to read ACCOUNT_USAGE for lineage and FinOps)
- Consumer grants (ACCOUNTADMIN or similar):
  - GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION <app>;
  - GRANT USAGE ON COMPUTE POOL <pool> TO APPLICATION <app>;
  - GRANT USAGE ON WAREHOUSE <wh> TO APPLICATION <app>;
  - GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION <app>;
- UI for grants (“Grant Assistant”):
  - Frontend screen shows which privileges are requested (via SHOW PRIVILEGES IN APPLICATION) and grant status
  - Provides copyable SQL and instructions to the consumer admin

## 2) Data sources (core views/tables)
- Lineage
  - `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY` (SQL text, bytes scanned, etc.)
  - `SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY` (columns accessed)
  - `INFORMATION_SCHEMA.*` for object metadata
  - `OBJECT_DEPENDENCIES` and view definitions for non-column lineage
  - Optional: Horizon tags/classification if enabled in the consumer account
- Access lineage
  - `SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES`, `GRANTS_TO_USERS`, `OBJECT_PRIVILEGES`
  - `SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY`, `LOGIN_HISTORY`
- FinOps
  - `SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY`
  - `SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY`
  - `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY`
  - `SNOWFLAKE.ACCOUNT_USAGE.TABLE_STORAGE_METRICS`
  - (Optional org-level) `ORGANIZATION_USAGE.*` if present; otherwise rely on ACCOUNT_USAGE

## 3) Application storage (tables/views inside the app)
- Lineage graph tables
  - `v1.lineage_nodes(object_id, object_name, object_type, schema_name, database_name, column_name, tag_json, first_seen_ts, last_seen_ts)`
  - `v1.lineage_edges(edge_id, src_object_id, src_column, tgt_object_id, tgt_column, query_id, edge_kind, observed_ts)`
  - `v1.view_dependencies(src_object_id, tgt_object_id, dependency_kind)`
- Access lineage tables
  - `v1.role_object_priv(role_name, object_id, object_name, privilege, granted_on, grantor)`
  - `v1.usage_edges(user_name, role_name, object_id, column_name, access_count, first_seen_ts, last_seen_ts)`
- FinOps fact tables
  - `v1.fact_warehouse_cost(day, warehouse_name, credits_used, dollars_est, queries_executed, queue_pct)`
  - `v1.fact_query_cost(query_id, start_time, warehouse_name, user_name, role_name, bytes_scanned, spilled, queued, est_cost)`
  - `v1.fact_storage(day, database_name, schema_name, table_name, active_tb, time_travel_tb, failsafe_tb, cost_est)`
- Secure views
  - `app_public.*` views over the above with row/column masking where applicable

## 4) Procedures & tasks
- Parsing/Materialization procedures (Snowflake Scripting + Python via Snowpark)
  - `v1.sp_refresh_lineage(start_ts, end_ts, db_filter ARRAY, schema_filter ARRAY)`
    - Reads QUERY_HISTORY + ACCESS_HISTORY, parses SQL via sqlglot for column mappings
    - Populates `lineage_nodes` + `lineage_edges`; de-duplicates by `query_id`
  - `v1.sp_refresh_access_lineage(start_ts, end_ts)`
    - Loads GRANTS_* + ACCESS_HISTORY to build `role_object_priv` + `usage_edges`
  - `v1.sp_refresh_finops(start_date, end_date)`
    - Populates `fact_warehouse_cost`, `fact_query_cost`, `fact_storage`
- Optional scheduler
  - Snowflake TASKS with a 1–6 hour cadence, controlled by `app_public.sp_set_schedule(enable BOOLEAN, freq TEXT)`

## 5) Backend API (Flask/FastAPI)
- `/api/lineage/object?name=<db.schema.object>&column=<col?>` → upstream/downstream edges (paginated)
- `/api/lineage/impact?name=<db.schema.object>&depth=…` → impact analysis
- `/api/access/graph?role=<role?>&object=<obj?>` → access lineage (grants + usage)
- `/api/finops/summary?dim=warehouse|role|user&range=…` → cost/utilization rollups
- `/api/grants/status` → current requested privileges + instructions
- Security: API reads via Snowpark session in app context

## 6) Frontend (React + React Flow/Cytoscape)
- Navigation: Lineage | Access | FinOps | Grants
- Lineage view
  - Search for object/column; visualize upstream/downstream with collapsible depth
  - Edge details: query_id, time, bytes scanned; open Snowsight deep links for query
- Access lineage view
  - Graph: role → privilege → object/columns; overlay actual usage edges with hit counts
  - Drift detections: highlight unused privileges and sensitive tag exposure
- FinOps dashboards
  - Warehouse cost/utilization, query hotspots, storage breakdowns
  - KPI cards and SLO panels ($ per query, $ per TB, queue%)
- Grants UI
  - Shows which privileges are requested (from SHOW PRIVILEGES IN APPLICATION)
  - Provides copyable SQL for the consumer admin to grant/revoke

## 7) Build & deployment
- Continue current SPCS layout (router/frontend/backend) with image repo + `deploy.sh`
- Manifest already includes global privileges and container images
- Use `./deploy.sh` for rapid rebuild/push/run
- Consumer steps
  - Create/choose compute pool + warehouse
  - Grant usage + bind endpoint + imported privileges on SNOWFLAKE DB
  - Start service; open URL

### Dev/Prod parity
- Development (local): `./local-dev.sh`
  - Backend runs locally with `DEV_MODE=1`, chooses local connector (`USE_LOCAL_CONNECTOR=1`)
  - Auth priority: PAT from `snowflake-pat.token` → `SNOWFLAKE_OAUTH_TOKEN` → `SNOWFLAKE_PASSWORD`
  - Toggle `USE_ACCOUNT_USAGE=0` to avoid needing imported privileges; fallback uses SHOW queries
- Production (Native App SPCS): `./deploy.sh` then run `CALL app_public.start_app('<pool>', '<warehouse>')`
  - Requires consumer grants: IMPORTED PRIVILEGES ON SNOWFLAKE DB, BIND SERVICE ENDPOINT, USAGE on compute pool and warehouse
  - Service spec runs three containers (frontend, backend, router) behind a public endpoint

## 8) Milestones & detailed steps

### M1: Foundations (1–2 days)
- [x] Create app schemas/tables for lineage/access/finops
- [x] Add secure views (basic) in `app_public`
- [x] Wire backend endpoints to return stub data (metrics + grants status)
- [x] Add Grants UI (displays required grants and SQL statements)

### M2: FinOps MVP (1–2 days)
- [ ] Implement `sp_refresh_finops` (WAREHOUSE_METERING_HISTORY, METERING_DAILY_HISTORY, TABLE_STORAGE_METRICS, QUERY_HISTORY)
- [ ] Create summary views for warehouse/role/user rollups
- [ ] Frontend dashboards + filters

### M3: Lineage MVP (3–5 days)
- [ ] Implement `sp_refresh_lineage` using sqlglot for SELECT/INSERT/CTAS
- [ ] Build node/edge tables and API endpoints for object/column lineage
- [ ] Frontend graph (React Flow) with expand/collapse + impact analysis

### M4: Access lineage MVP (2–3 days)
- [ ] Implement `sp_refresh_access_lineage` (GRANTS_*, ACCESS_HISTORY)
- [ ] Access graph API + frontend overlay (grants vs actual usage)
- [ ] Drift detections + basic alerts (table of findings)

### M5: Hardening & UX (2–3 days)
- [ ] Performance tuning (filters, pagination, sampling)
- [ ] Secure views & optional tag-based masking for sensitive objects
- [ ] Snowsight deep links and documentation in the app
- [ ] Installer polish, tasks scheduling, and readme/help in-app

## 9) Open-source integration details
- sqlglot: vendor a minimal parser module into the backend image; no egress required
- dbt artifacts (optional): allow consumer to upload `manifest.json` to stage; provide a procedure `v1.sp_load_dbt_artifacts` to enrich column lineage
- React Flow: add `reactflow` to frontend; render graph with custom node/edge tooltips

## 10) Acceptance tests & validation
- Unit tests on parsing rules (CTE, aliasing, simple UDFs)
- Compare SHOW-based counts vs ACCOUNT_USAGE counts for sanity
- Validate grants flow: SHOW PRIVILEGES IN APPLICATION → grant → re-run refresh → data visible
- Load tests on medium-sized accounts (N queries/day)

## 11) Rollout & documentation
- Provider docs: required grants, configuration table, supported SQL patterns
- Consumer docs: how to grant, schedule refresh, and interpret dashboards
- Versioning: `manifest.yml` version bumps + change log in readme

---

Next step: M1 Foundations
- Create DDL for lineage/access/finops tables and secure views
- Add grants UI and endpoints returning requested privileges & grant snippets
- Wire the frontend sections (empty states)

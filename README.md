# snowsarva (Snowflake Native App with SPCS)

React + Flask behind Nginx, deployed via Snowpark Container Services inside a Snowflake Native App. Uses `config.toml` and `snowflake-pat.token` for CLI auth.

- Frontend: React (Vite) renders metrics from backend
- Backend: Flask + Snowpark exposes `/snowpark/metrics`
- Router: Nginx routes `/` → frontend and `/api` → backend
- App Artifacts: `app/src/manifest.yml`, `app/src/setup.sql`, `app/src/fullstack.yaml`

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

## One-command redeploy

```bash
./deploy.sh
```

What it does:
- Ensures Makefile is configured (prompts repo URL if needed)
- Logs in to image registry (PAT)
- Builds and pushes images
- Runs `snow app run -p app/src` to upgrade the app

## Local development without deploying to Snowflake

Run the backend and frontend locally with a dev proxy. This does not modify Snowflake objects or services.

```bash
./local-dev.sh
```

Details:
- Backend runs in a local container on port 8081 (env: `DEV_MODE=1`)
- Frontend Vite dev server runs on port 5173 (or next free port), proxies `/api/*` to `http://localhost:8081`
- Stop with Ctrl+C; no changes are pushed to Snowflake or the image repo

### Local authentication (important)

Snow CLI and the Python connector authenticate differently. CLI uses `authenticator = "PROGRAMMATIC_ACCESS_TOKEN"` with a token file, while the Python connector uses the PAT secret as the `password` value.

- Verify CLI connection:
  - `snow --config-file=config.toml connection test -c snowsarva`

- Local backend auth options (pick one):
  - PAT (Programmatic Access Token):
    - Paste the PAT secret into `snowflake-pat.token` (single line). The script mounts it into the container at `/run/secrets/snowflake-pat.token` and sets `SNOWFLAKE_TOKEN_FILE`.
    - The backend reads the file and passes the token to the Python connector as the `password`.
    - If the PAT is disabled/rotated, local fails with: “The Programmatic Access Token (PAT) has been disabled.” Generate a new PAT and update the file.
  - OAuth access token:
    - `export SNOWFLAKE_OAUTH_TOKEN='eyJ...' && ./local-dev.sh`
  - Username/password (local only):
    - `SNOWFLAKE_PASSWORD='<your_password>' ./local-dev.sh`

The local connector selection order is: PAT file → OAuth token → password. If none are present or a token is disabled/invalid, local returns HTTP 500 and logs the auth error.

Environment variables passed by `local-dev.sh`:
- `USE_LOCAL_CONNECTOR=1` (forces local connector; prod uses SPCS connector)
- `SNOWFLAKE_TOKEN_FILE=/run/secrets/snowflake-pat.token` (mounted if file exists)
- Account context is parsed from `config.toml` (account/user/warehouse/database/schema)
- Also forwards `SNOWFLAKE_ROLE`, `SNOWFLAKE_OAUTH_TOKEN`, and `SNOWFLAKE_PASSWORD` to the backend container

Configuration correct syntax: 
(base) akhilgurrapu@Mac snowsarva % snow --config-file=config.toml connection test -c snowsarva 
+-----------------------------------------------------------+
| key             | value                                   |
|-----------------+-----------------------------------------|
| Connection name | snowsarva                               |
| Status          | OK                                      |
| Host            | CHFWNRV-DDB48976.snowflakecomputing.com |
| Account         | CHFWNRV-DDB48976                        |
| User            | snowsarva_user                          |
| Role            | SNOWSARVA_ROLE                          |
| Database        | SNOWSARVA_IMAGE_DATABASE                |
| Warehouse       | SNOWSARVA_WAREHOUSE                     |
+-----------------------------------------------------------+

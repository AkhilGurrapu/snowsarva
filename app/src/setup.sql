CREATE APPLICATION ROLE IF NOT EXISTS app_admin;
CREATE APPLICATION ROLE IF NOT EXISTS app_user;
CREATE SCHEMA IF NOT EXISTS app_public;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;
CREATE OR ALTER VERSIONED SCHEMA v1;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_user;

CREATE OR REPLACE PROCEDURE v1.register_single_callback(ref_name STRING, operation STRING, ref_or_alias STRING)
 RETURNS STRING
 LANGUAGE SQL
 AS $$
      BEGIN
      CASE (operation)
         WHEN 'ADD' THEN
            SELECT system$set_reference(:ref_name, :ref_or_alias);
         WHEN 'REMOVE' THEN
            SELECT system$remove_reference(:ref_name);
         WHEN 'CLEAR' THEN
            SELECT system$remove_reference(:ref_name);
         ELSE
            RETURN 'Unknown operation: ' || operation;
      END CASE;
      RETURN 'Operation ' || operation || ' succeeds.';
      END;
   $$;
GRANT USAGE ON PROCEDURE v1.register_single_callback( STRING,  STRING,  STRING) TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE app_public.start_app(poolname VARCHAR, whname VARCHAR)
    RETURNS string
    LANGUAGE sql
AS $$
BEGIN
    EXECUTE IMMEDIATE 'CREATE SERVICE IF NOT EXISTS app_public.st_spcs
        IN COMPUTE POOL Identifier(''' || poolname || ''')
        FROM SPECIFICATION_FILE=''' || '/fullstack.yaml' || '''
        QUERY_WAREHOUSE=''' || whname || '''';
    GRANT USAGE ON SERVICE app_public.st_spcs TO APPLICATION ROLE app_user;
    GRANT SERVICE ROLE app_public.st_spcs!ALL_ENDPOINTS_USAGE TO APPLICATION ROLE app_user;
    RETURN 'Service started. Check status, then call app_url() to get endpoint.';
END;
$$;
GRANT USAGE ON PROCEDURE app_public.start_app(VARCHAR, VARCHAR) TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE app_public.stop_app()
    RETURNS string
    LANGUAGE sql
AS $$
BEGIN
    DROP SERVICE IF EXISTS app_public.st_spcs;
    RETURN 'Service stopped.';
END;
$$;
GRANT USAGE ON PROCEDURE app_public.stop_app() TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE app_public.app_url()
    RETURNS string
    LANGUAGE sql
AS $$
DECLARE
    ingress_url VARCHAR;
BEGIN
    SHOW ENDPOINTS IN SERVICE app_public.st_spcs;
    SELECT "ingress_url" INTO :ingress_url FROM TABLE (RESULT_SCAN (LAST_QUERY_ID())) LIMIT 1;
    RETURN ingress_url;
END;
$$;
GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_admin;
GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_user;

-- ==========================
-- M1 Foundations: App Tables
-- ==========================

-- Lineage graph tables
CREATE TABLE IF NOT EXISTS v1.lineage_nodes (
  object_id STRING,
  object_name STRING,
  object_type STRING,
  schema_name STRING,
  database_name STRING,
  column_name STRING,
  tag_json VARIANT,
  first_seen_ts TIMESTAMP_NTZ,
  last_seen_ts TIMESTAMP_NTZ
);

CREATE TABLE IF NOT EXISTS v1.lineage_edges (
  edge_id STRING,
  src_object_id STRING,
  src_column STRING,
  tgt_object_id STRING,
  tgt_column STRING,
  query_id STRING,
  edge_kind STRING,
  observed_ts TIMESTAMP_NTZ
);

CREATE TABLE IF NOT EXISTS v1.view_dependencies (
  src_object_id STRING,
  tgt_object_id STRING,
  dependency_kind STRING
);

-- Access lineage tables
CREATE TABLE IF NOT EXISTS v1.role_object_priv (
  role_name STRING,
  object_id STRING,
  object_name STRING,
  privilege STRING,
  granted_on TIMESTAMP_NTZ,
  grantor STRING
);

CREATE TABLE IF NOT EXISTS v1.usage_edges (
  user_name STRING,
  role_name STRING,
  object_id STRING,
  column_name STRING,
  access_count NUMBER,
  first_seen_ts TIMESTAMP_NTZ,
  last_seen_ts TIMESTAMP_NTZ
);

-- FinOps fact tables
CREATE TABLE IF NOT EXISTS v1.fact_warehouse_cost (
  day DATE,
  warehouse_name STRING,
  credits_used NUMBER,
  dollars_est NUMBER,
  queries_executed NUMBER,
  queue_pct NUMBER
);

CREATE TABLE IF NOT EXISTS v1.fact_query_cost (
  query_id STRING,
  start_time TIMESTAMP_NTZ,
  warehouse_name STRING,
  user_name STRING,
  role_name STRING,
  bytes_scanned NUMBER,
  spilled BOOLEAN,
  queued BOOLEAN,
  est_cost NUMBER
);

CREATE TABLE IF NOT EXISTS v1.fact_storage (
  day DATE,
  database_name STRING,
  schema_name STRING,
  table_name STRING,
  active_tb NUMBER,
  time_travel_tb NUMBER,
  failsafe_tb NUMBER,
  cost_est NUMBER
);

-- ==========================
-- Minimal app_public views (non-sensitive projections)
-- ==========================
CREATE OR REPLACE VIEW app_public.lineage_nodes AS
  SELECT object_id, object_name, object_type, schema_name, database_name, column_name, first_seen_ts, last_seen_ts
  FROM v1.lineage_nodes;

CREATE OR REPLACE VIEW app_public.lineage_edges AS
  SELECT edge_id, src_object_id, src_column, tgt_object_id, tgt_column, query_id, edge_kind, observed_ts
  FROM v1.lineage_edges;

CREATE OR REPLACE VIEW app_public.fact_warehouse_cost AS
  SELECT day, warehouse_name, credits_used, dollars_est, queries_executed, queue_pct
  FROM v1.fact_warehouse_cost;

-- Grants for app roles
GRANT SELECT ON VIEW app_public.lineage_nodes TO APPLICATION ROLE app_user;
GRANT SELECT ON VIEW app_public.lineage_edges TO APPLICATION ROLE app_user;
GRANT SELECT ON VIEW app_public.fact_warehouse_cost TO APPLICATION ROLE app_user;

CREATE APPLICATION ROLE IF NOT EXISTS app_admin;
CREATE APPLICATION ROLE IF NOT EXISTS app_user;
CREATE SCHEMA IF NOT EXISTS app_public;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;
CREATE OR ALTER VERSIONED SCHEMA v1;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_user;

CREATE OR REPLACE PROCEDURE app_public.start_app(poolname VARCHAR, whname VARCHAR)
    RETURNS STRING
    LANGUAGE SQL
    AS
    BEGIN
        EXECUTE IMMEDIATE 'CREATE SERVICE IF NOT EXISTS app_public.st_spcs
            IN COMPUTE POOL identifier(''' || poolname || ''')
            FROM SPECIFICATION_FILE=''/fullstack.yaml''
            QUERY_WAREHOUSE=''' || whname || '''';
        GRANT USAGE ON SERVICE app_public.st_spcs TO APPLICATION ROLE app_user;
        GRANT SERVICE ROLE app_public.st_spcs!ALL_ENDPOINTS_USAGE TO APPLICATION ROLE app_user;
        RETURN 'Service started. Check status, then call app_url() to get endpoint.';
    END;

GRANT USAGE ON PROCEDURE app_public.start_app(VARCHAR, VARCHAR) TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE app_public.stop_app()
    RETURNS STRING
    LANGUAGE SQL
    AS
    BEGIN
        DROP SERVICE IF EXISTS app_public.st_spcs;
        RETURN 'Service stopped.';
    END;

GRANT USAGE ON PROCEDURE app_public.stop_app() TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE app_public.app_url()
    RETURNS STRING
    LANGUAGE SQL
    AS
    DECLARE
        ingress_url VARCHAR;
    BEGIN
        SHOW ENDPOINTS IN SERVICE app_public.st_spcs;
        SELECT "ingress_url" INTO :ingress_url FROM TABLE (RESULT_SCAN (LAST_QUERY_ID())) LIMIT 1;
        RETURN ingress_url;
    END;

GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_admin;
GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_user;

-- Enhanced lineage graph tables
CREATE TABLE IF NOT EXISTS v1.lineage_nodes (
  object_id STRING,
  object_name STRING,
  object_type STRING,
  schema_name STRING,
  database_name STRING,
  column_name STRING,
  tag_json VARIANT,
  first_seen_ts TIMESTAMP_NTZ,
  last_seen_ts TIMESTAMP_NTZ,
  node_type VARCHAR(50) DEFAULT 'TABLE',
  parent_object_id VARCHAR(255),
  lineage_source VARCHAR(50) DEFAULT 'MANUAL',
  metadata VARIANT,
  created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS v1.lineage_edges (
  edge_id STRING,
  src_object_id STRING,
  src_column STRING,
  tgt_object_id STRING,
  tgt_column STRING,
  query_id STRING,
  edge_kind STRING,
  observed_ts TIMESTAMP_NTZ,
  confidence_score FLOAT DEFAULT 1.0,
  lineage_source VARCHAR(50) DEFAULT 'MANUAL',
  sql_text TEXT,
  metadata VARIANT,
  created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

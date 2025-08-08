-- Snowsarva Native App Setup Script
-- Data Observability and Cost Management Platform

-- Create application schemas
CREATE SCHEMA IF NOT EXISTS CONFIG;
CREATE SCHEMA IF NOT EXISTS LINEAGE;
CREATE SCHEMA IF NOT EXISTS ACCESS;
CREATE SCHEMA IF NOT EXISTS FINOPS;
CREATE SCHEMA IF NOT EXISTS STAGING;
CREATE SCHEMA IF NOT EXISTS METADATA;

-- Create configuration tables
CREATE TABLE IF NOT EXISTS CONFIG.APP_CONFIG (
    config_key STRING NOT NULL,
    config_value STRING,
    config_type STRING DEFAULT 'STRING',
    description STRING,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_app_config PRIMARY KEY (config_key)
);

-- Insert default configuration values
MERGE INTO CONFIG.APP_CONFIG AS target
USING (
    SELECT 'LINEAGE_PROCESSING_ENABLED' as config_key, 'true' as config_value, 'BOOLEAN' as config_type, 'Enable/disable lineage processing' as description
    UNION ALL
    SELECT 'COST_PROCESSING_ENABLED', 'true', 'BOOLEAN', 'Enable/disable cost analysis processing'
    UNION ALL
    SELECT 'PROCESSING_BATCH_SIZE', '1000', 'INTEGER', 'Number of queries to process in each batch'
    UNION ALL
    SELECT 'LINEAGE_RETENTION_DAYS', '90', 'INTEGER', 'Number of days to retain lineage data'
    UNION ALL
    SELECT 'MIN_CONFIDENCE_THRESHOLD', '0.7', 'FLOAT', 'Minimum confidence threshold for lineage edges'
    UNION ALL
    SELECT 'COST_REFRESH_INTERVAL_HOURS', '1', 'INTEGER', 'Interval in hours for cost data refresh'
    UNION ALL
    SELECT 'BUDGET_ALERT_EMAIL', '', 'STRING', 'Email address for budget alerts'
    UNION ALL
    SELECT 'WAREHOUSE_OPTIMIZATION_ENABLED', 'true', 'BOOLEAN', 'Enable warehouse optimization recommendations'
) AS source
ON target.config_key = source.config_key
WHEN NOT MATCHED THEN
    INSERT (config_key, config_value, config_type, description)
    VALUES (source.config_key, source.config_value, source.config_type, source.description);

-- Create lineage tables
CREATE TABLE IF NOT EXISTS LINEAGE.COLUMN_LINEAGE_EDGES (
    edge_id STRING NOT NULL,
    query_id STRING NOT NULL,
    source_database STRING,
    source_schema STRING,
    source_table STRING,
    source_column STRING,
    target_database STRING,
    target_schema STRING,
    target_table STRING,
    target_column STRING,
    transformation_type STRING,
    transformation_subtype STRING,
    transformation_description STRING,
    confidence_score FLOAT,
    is_masked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_column_lineage PRIMARY KEY (edge_id)
);

CREATE TABLE IF NOT EXISTS LINEAGE.OBJECT_LINEAGE_EDGES (
    edge_id STRING NOT NULL,
    source_database STRING,
    source_schema STRING,
    source_object STRING,
    target_database STRING,
    target_schema STRING,
    target_object STRING,
    relationship_type STRING,
    dependency_type STRING,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_object_lineage PRIMARY KEY (edge_id)
);

CREATE TABLE IF NOT EXISTS LINEAGE.PROCESSING_LOG (
    log_id STRING NOT NULL,
    query_id STRING,
    processing_status STRING,
    error_message STRING,
    parsing_method STRING,
    processed_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_processing_log PRIMARY KEY (log_id)
);

-- Create access control tables
CREATE TABLE IF NOT EXISTS ACCESS.ROLE_OBJECT_PRIVILEGES (
    privilege_id STRING NOT NULL,
    role_name STRING,
    object_database STRING,
    object_schema STRING,
    object_name STRING,
    object_type STRING,
    privilege_type STRING,
    granted_on TIMESTAMP_LTZ,
    granted_by STRING,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_role_privileges PRIMARY KEY (privilege_id)
);

CREATE TABLE IF NOT EXISTS ACCESS.ROLE_USAGE_TRACKING (
    usage_id STRING NOT NULL,
    role_name STRING,
    user_name STRING,
    object_database STRING,
    object_schema STRING,
    object_name STRING,
    object_type STRING,
    access_type STRING,
    query_id STRING,
    accessed_at TIMESTAMP_LTZ,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_role_usage PRIMARY KEY (usage_id)
);

-- Create cost management tables
CREATE TABLE IF NOT EXISTS FINOPS.WAREHOUSE_COST_METRICS (
    metric_id STRING NOT NULL,
    warehouse_name STRING,
    date_day DATE,
    credits_used FLOAT,
    credits_cost_usd FLOAT,
    query_count INTEGER,
    avg_execution_time_ms FLOAT,
    total_bytes_scanned BIGINT,
    auto_suspend_minutes INTEGER,
    auto_resume_count INTEGER,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_warehouse_metrics PRIMARY KEY (metric_id)
);

CREATE TABLE IF NOT EXISTS FINOPS.QUERY_COST_ANALYSIS (
    analysis_id STRING NOT NULL,
    query_id STRING,
    warehouse_name STRING,
    user_name STRING,
    role_name STRING,
    query_type STRING,
    execution_time_ms BIGINT,
    bytes_scanned BIGINT,
    partitions_scanned INTEGER,
    partitions_total INTEGER,
    estimated_cost_usd FLOAT,
    performance_score FLOAT,
    optimization_opportunities ARRAY,
    executed_at TIMESTAMP_LTZ,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_query_analysis PRIMARY KEY (analysis_id)
);

CREATE TABLE IF NOT EXISTS FINOPS.BUDGET_CONFIGURATION (
    budget_id STRING NOT NULL,
    budget_name STRING,
    budget_scope STRING,
    scope_value STRING,
    budget_amount_usd FLOAT,
    budget_period STRING,
    start_date DATE,
    end_date DATE,
    alert_thresholds ARRAY,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_budget_config PRIMARY KEY (budget_id)
);

CREATE TABLE IF NOT EXISTS FINOPS.BUDGET_ALERTS (
    alert_id STRING NOT NULL,
    budget_id STRING,
    alert_type STRING,
    threshold_percentage FLOAT,
    current_spend_usd FLOAT,
    budget_amount_usd FLOAT,
    variance_percentage FLOAT,
    alert_status STRING,
    alerted_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_budget_alerts PRIMARY KEY (alert_id)
);

CREATE TABLE IF NOT EXISTS FINOPS.STORAGE_COST_METRICS (
    metric_id STRING NOT NULL,
    database_name STRING,
    schema_name STRING,
    table_name STRING,
    date_day DATE,
    active_bytes BIGINT,
    time_travel_bytes BIGINT,
    failsafe_bytes BIGINT,
    total_storage_cost_usd FLOAT,
    classification_tags ARRAY,
    created_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_storage_metrics PRIMARY KEY (metric_id)
);

-- Create materialized views for performance
CREATE MATERIALIZED VIEW IF NOT EXISTS LINEAGE.COLUMN_LINEAGE_GRAPH AS
SELECT 
    source_database || '.' || source_schema || '.' || source_table || '.' || source_column as source_fqn,
    target_database || '.' || target_schema || '.' || target_table || '.' || target_column as target_fqn,
    transformation_type,
    transformation_subtype,
    COUNT(*) as edge_weight,
    MAX(confidence_score) as max_confidence,
    MAX(updated_at) as last_seen
FROM LINEAGE.COLUMN_LINEAGE_EDGES
WHERE confidence_score >= 0.5
GROUP BY 1,2,3,4;

CREATE MATERIALIZED VIEW IF NOT EXISTS FINOPS.WAREHOUSE_COST_SUMMARY AS
SELECT 
    warehouse_name,
    DATE_TRUNC('MONTH', date_day) as month,
    SUM(credits_used) as total_credits,
    SUM(credits_cost_usd) as total_cost_usd,
    AVG(avg_execution_time_ms) as avg_query_time_ms,
    SUM(query_count) as total_queries,
    SUM(total_bytes_scanned) as total_bytes_scanned
FROM FINOPS.WAREHOUSE_COST_METRICS
GROUP BY 1,2;

-- Create secure views over account usage
CREATE OR REPLACE SECURE VIEW STAGING.QUERY_HISTORY_ENHANCED AS
SELECT 
    query_id,
    query_text,
    database_name,
    schema_name,
    query_type,
    session_id,
    user_name,
    role_name,
    warehouse_name,
    warehouse_size,
    warehouse_type,
    cluster_number,
    query_tag,
    execution_status,
    error_code,
    error_message,
    start_time,
    end_time,
    total_elapsed_time,
    bytes_scanned,
    percentage_scanned_from_cache,
    bytes_written,
    bytes_written_to_result,
    bytes_read_from_result,
    rows_produced,
    rows_inserted,
    rows_updated,
    rows_deleted,
    rows_unloaded,
    bytes_deleted,
    partitions_scanned,
    partitions_total,
    bytes_spilled_to_local_storage,
    bytes_spilled_to_remote_storage,
    bytes_sent_over_the_network,
    compilation_time,
    execution_time,
    queued_provisioning_time,
    queued_repair_time,
    queued_overload_time,
    transaction_blocked_time,
    outbound_data_transfer_bytes,
    outbound_data_transfer_region,
    inbound_data_transfer_bytes,
    credits_used_cloud_services,
    list_external_files_time
-- FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY (temporarily disabled for initial deployment)
FROM (SELECT 
    NULL::VARCHAR as query_id,
    NULL::VARCHAR as query_text,
    NULL::VARCHAR as database_name,
    NULL::VARCHAR as schema_name,
    NULL::VARCHAR as query_type,
    NULL::NUMBER as session_id,
    NULL::VARCHAR as user_name,
    NULL::VARCHAR as role_name,
    NULL::VARCHAR as warehouse_name,
    NULL::VARCHAR as warehouse_size,
    NULL::VARCHAR as warehouse_type,
    NULL::NUMBER as cluster_number,
    NULL::VARCHAR as query_tag,
    NULL::VARCHAR as execution_status,
    NULL::NUMBER as error_code,
    NULL::VARCHAR as error_message,
    NULL::TIMESTAMP_LTZ as start_time,
    NULL::TIMESTAMP_LTZ as end_time,
    NULL::NUMBER as total_elapsed_time,
    NULL::NUMBER as bytes_scanned,
    NULL::FLOAT as percentage_scanned_from_cache,
    NULL::NUMBER as bytes_written,
    NULL::NUMBER as bytes_written_to_result,
    NULL::NUMBER as bytes_read_from_result,
    NULL::NUMBER as rows_produced,
    NULL::NUMBER as rows_inserted,
    NULL::NUMBER as rows_updated,
    NULL::NUMBER as rows_deleted,
    NULL::NUMBER as rows_unloaded,
    NULL::NUMBER as bytes_deleted,
    NULL::NUMBER as partitions_scanned,
    NULL::NUMBER as partitions_total,
    NULL::NUMBER as bytes_spilled_to_local_storage,
    NULL::NUMBER as bytes_spilled_to_remote_storage,
    NULL::NUMBER as bytes_sent_over_the_network,
    NULL::NUMBER as compilation_time,
    NULL::NUMBER as execution_time,
    NULL::NUMBER as queued_provisioning_time,
    NULL::NUMBER as queued_repair_time,
    NULL::NUMBER as queued_overload_time,
    NULL::NUMBER as transaction_blocked_time,
    NULL::NUMBER as outbound_data_transfer_bytes,
    NULL::VARCHAR as outbound_data_transfer_region,
    NULL::NUMBER as inbound_data_transfer_bytes,
    NULL::NUMBER as credits_used_cloud_services,
    NULL::NUMBER as list_external_files_time
LIMIT 0);

CREATE OR REPLACE SECURE VIEW STAGING.ACCESS_HISTORY_ENHANCED AS
SELECT 
    query_id,
    query_start_time,
    user_name,
    direct_objects_accessed,
    base_objects_accessed,
    objects_modified,
    object_modified_by_ddl,
    policies_referenced
-- FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY (temporarily disabled for initial deployment)
FROM (SELECT 
    NULL::TEXT as query_id,
    NULL::TIMESTAMP_LTZ as query_start_time,
    NULL::TEXT as user_name,
    NULL::ARRAY as direct_objects_accessed,
    NULL::ARRAY as base_objects_accessed,
    NULL::ARRAY as objects_modified,
    NULL::OBJECT as object_modified_by_ddl,
    NULL::ARRAY as policies_referenced
LIMIT 0);

-- Database reference callback procedure
CREATE OR REPLACE PROCEDURE CONFIG.REGISTER_DATABASE_CALLBACK(ref_name STRING, operation STRING, ref_or_alias STRING)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
    log_message STRING;
BEGIN
    CASE (operation)
        WHEN 'ADD' THEN
            INSERT INTO CONFIG.APP_CONFIG (config_key, config_value, config_type, description)
            VALUES ('DATABASE_REF_' || :ref_name, :ref_or_alias, 'DATABASE_REFERENCE', 'Database reference for lineage analysis');
            log_message := 'Added database reference: ' || ref_name || ' -> ' || ref_or_alias;
        WHEN 'REMOVE' THEN
            DELETE FROM CONFIG.APP_CONFIG WHERE config_key = 'DATABASE_REF_' || :ref_name;
            log_message := 'Removed database reference: ' || ref_name;
        WHEN 'CLEAR' THEN
            DELETE FROM CONFIG.APP_CONFIG WHERE config_key LIKE 'DATABASE_REF_%';
            log_message := 'Cleared all database references';
        ELSE
            log_message := 'Unknown operation: ' || operation;
    END CASE;
    
    RETURN log_message;
END;
$$;

-- Lineage processing stored procedure
CREATE OR REPLACE PROCEDURE LINEAGE.PROCESS_QUERY_BATCH(batch_size INTEGER DEFAULT 1000)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.8'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'process_batch'
AS
$$
import json
import uuid
from datetime import datetime

def process_query_batch(session, batch_size):
    """Process a batch of queries for lineage extraction"""
    
    # Get the last processed timestamp
    last_processed_query = """
    SELECT COALESCE(MAX(processed_at), '1900-01-01'::TIMESTAMP_LTZ) as last_processed
    FROM LINEAGE.PROCESSING_LOG
    WHERE processing_status = 'SUCCESS'
    """
    
    result = session.sql(last_processed_query).collect()
    last_processed = result[0]['LAST_PROCESSED']
    
    # Query for new queries to process
    new_queries_sql = f"""
    SELECT 
        query_id,
        query_text,
        database_name,
        schema_name,
        start_time,
        end_time,
        execution_status,
        query_type
    FROM STAGING.QUERY_HISTORY_ENHANCED
    WHERE start_time > '{last_processed}'
    AND execution_status = 'SUCCESS'
    AND query_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE_TABLE_AS_SELECT', 'MERGE')
    ORDER BY start_time
    LIMIT {batch_size}
    """
    
    new_queries = session.sql(new_queries_sql).collect()
    
    if not new_queries:
        return f"No new queries to process"
    
    processed_count = 0
    error_count = 0
    
    for query in new_queries:
        try:
            # Generate a unique edge ID
            edge_id = str(uuid.uuid4())
            log_id = str(uuid.uuid4())
            
            # For now, create a placeholder lineage edge
            # In a full implementation, this would use SQLLineage parsing
            lineage_sql = """
            INSERT INTO LINEAGE.COLUMN_LINEAGE_EDGES 
            (edge_id, query_id, source_database, source_schema, source_table, source_column,
             target_database, target_schema, target_table, target_column,
             transformation_type, confidence_score)
            VALUES (?, ?, ?, ?, 'PLACEHOLDER', 'PLACEHOLDER', 
                   ?, ?, 'PLACEHOLDER', 'PLACEHOLDER', 'PLACEHOLDER', 0.5)
            """
            
            session.sql(lineage_sql, [
                edge_id, query['QUERY_ID'], query['DATABASE_NAME'], query['SCHEMA_NAME'],
                query['DATABASE_NAME'], query['SCHEMA_NAME']
            ]).collect()
            
            # Log successful processing
            log_sql = """
            INSERT INTO LINEAGE.PROCESSING_LOG (log_id, query_id, processing_status, parsing_method, processed_at)
            VALUES (?, ?, 'SUCCESS', 'PLACEHOLDER', CURRENT_TIMESTAMP())
            """
            session.sql(log_sql, [log_id, query['QUERY_ID']]).collect()
            
            processed_count += 1
            
        except Exception as e:
            # Log processing error
            error_log_id = str(uuid.uuid4())
            error_sql = """
            INSERT INTO LINEAGE.PROCESSING_LOG (log_id, query_id, processing_status, error_message, processed_at)
            VALUES (?, ?, 'FAILED', ?, CURRENT_TIMESTAMP())
            """
            session.sql(error_sql, [error_log_id, query['QUERY_ID'], str(e)]).collect()
            error_count += 1
    
    return f"Processed {processed_count} queries successfully, {error_count} errors"

return process_query_batch(session, batch_size)
$$;

-- Cost analysis procedure
CREATE OR REPLACE PROCEDURE FINOPS.ANALYZE_WAREHOUSE_COSTS(analysis_date DATE DEFAULT CURRENT_DATE())
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
    result_message STRING;
BEGIN
    -- Insert warehouse cost metrics
    INSERT INTO FINOPS.WAREHOUSE_COST_METRICS (
        metric_id,
        warehouse_name,
        date_day,
        credits_used,
        credits_cost_usd,
        query_count,
        avg_execution_time_ms,
        total_bytes_scanned,
        auto_suspend_minutes,
        auto_resume_count
    )
    SELECT 
        UUID_STRING() as metric_id,
        warehouse_name,
        :analysis_date as date_day,
        SUM(credits_used) as credits_used,
        SUM(credits_used) * 3.0 as credits_cost_usd, -- Placeholder rate
        COUNT(*) as query_count,
        AVG(total_elapsed_time) as avg_execution_time_ms,
        SUM(bytes_scanned) as total_bytes_scanned,
        0 as auto_suspend_minutes, -- Placeholder
        0 as auto_resume_count -- Placeholder
    FROM STAGING.QUERY_HISTORY_ENHANCED
    WHERE DATE(start_time) = :analysis_date
    AND execution_status = 'SUCCESS'
    GROUP BY warehouse_name;
    
    result_message := SQLROWCOUNT;
    RETURN 'Analyzed costs for ' || result_message || ' warehouses on ' || analysis_date;
END;
$$;

-- Create scheduled tasks
-- Commented out tasks for initial deployment
-- CREATE OR REPLACE TASK LINEAGE.TASK_PROCESS_LINEAGE
--     WAREHOUSE = SNOWSARVA_WAREHOUSE
--     SCHEDULE = '15 MINUTE'
-- AS
--     CALL LINEAGE.PROCESS_QUERY_BATCH(1000);

-- CREATE OR REPLACE TASK FINOPS.TASK_ANALYZE_COSTS
--     WAREHOUSE = SNOWSARVA_WAREHOUSE
--     SCHEDULE = 'USING CRON 0 */1 * * * UTC' -- Every hour
-- AS
--     CALL FINOPS.ANALYZE_WAREHOUSE_COSTS(CURRENT_DATE());

-- Application management procedures
CREATE OR REPLACE PROCEDURE CONFIG.START_APP(
    pool_name STRING DEFAULT 'SNOWSARVA_COMPUTE_POOL',
    warehouse_name STRING DEFAULT 'snowsarva_warehouse'
)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
    service_status STRING;
BEGIN
    -- Create compute pool if it doesn't exist
    EXECUTE IMMEDIATE 'CREATE COMPUTE POOL IF NOT EXISTS ' || pool_name || 
        ' MIN_NODES = 1 MAX_NODES = 3 INSTANCE_FAMILY = CPU_X64_XS';
    
    -- Create warehouse if it doesn't exist
    EXECUTE IMMEDIATE 'CREATE WAREHOUSE IF NOT EXISTS ' || warehouse_name || 
        ' WITH WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE';
    
    -- Create the service
    CREATE SERVICE IF NOT EXISTS CONFIG.SNOWSARVA_SERVICE
    IN COMPUTE POOL IDENTIFIER(:pool_name)
    FROM SPECIFICATION_FILE = 'service-spec.yaml'
    MIN_INSTANCES = 1
    MAX_INSTANCES = 1;
    
    -- Start scheduled tasks
    -- optional: ALTER TASK LINEAGE.TASK_PROCESS_LINEAGE RESUME;
    -- optional: ALTER TASK FINOPS.TASK_ANALYZE_COSTS RESUME;
    
    RETURN 'Snowsarva application started successfully';
END;
$$;

CREATE OR REPLACE PROCEDURE CONFIG.STOP_APP()
RETURNS STRING
LANGUAGE SQL
AS
$$
BEGIN
    -- Stop scheduled tasks
    ALTER TASK LINEAGE.TASK_PROCESS_LINEAGE SUSPEND;
    ALTER TASK FINOPS.TASK_ANALYZE_COSTS SUSPEND;
    
    -- Stop the service
    ALTER SERVICE CONFIG.SNOWSARVA_SERVICE SUSPEND;
    
    RETURN 'Snowsarva application stopped successfully';
END;
$$;

-- Commented out for initial deployment - requires container service to be running
-- CREATE OR REPLACE FUNCTION CONFIG.APP_URL()
-- RETURNS STRING
-- LANGUAGE SQL
-- AS
-- $$
--     SELECT SYSTEM$GET_SERVICE_ENDPOINT_URL('SNOWSARVA_SERVICE', 'ui')
-- $$;

CREATE OR REPLACE FUNCTION CONFIG.APP_URL()
RETURNS STRING
LANGUAGE SQL
AS
$$
    SELECT 'Use SHOW ENDPOINTS IN SERVICE CONFIG.SNOWSARVA_SERVICE to get URL'::STRING
$$;

-- Create application roles
CREATE APPLICATION ROLE IF NOT EXISTS APP_PUBLIC;

-- Grant necessary privileges
GRANT USAGE ON SCHEMA CONFIG TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON SCHEMA LINEAGE TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON SCHEMA ACCESS TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON SCHEMA FINOPS TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON SCHEMA STAGING TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON SCHEMA METADATA TO APPLICATION ROLE APP_PUBLIC;

GRANT SELECT ON ALL TABLES IN SCHEMA CONFIG TO APPLICATION ROLE APP_PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA LINEAGE TO APPLICATION ROLE APP_PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA ACCESS TO APPLICATION ROLE APP_PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA FINOPS TO APPLICATION ROLE APP_PUBLIC;
GRANT SELECT ON ALL VIEWS IN SCHEMA STAGING TO APPLICATION ROLE APP_PUBLIC;

GRANT USAGE ON ALL PROCEDURES IN SCHEMA CONFIG TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON ALL PROCEDURES IN SCHEMA LINEAGE TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON ALL PROCEDURES IN SCHEMA FINOPS TO APPLICATION ROLE APP_PUBLIC;
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA CONFIG TO APPLICATION ROLE APP_PUBLIC;

-- Create version info
MERGE INTO CONFIG.APP_CONFIG AS target
USING (SELECT 'APP_VERSION' AS config_key, 'v1.0.2' AS config_value, 'STRING' AS config_type, 'Snowsarva application version' AS description) AS source
ON target.config_key = source.config_key
WHEN MATCHED THEN 
    UPDATE SET 
        config_value = source.config_value,
        updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN 
    INSERT (config_key, config_value, config_type, description)
    VALUES (source.config_key, source.config_value, source.config_type, source.description);
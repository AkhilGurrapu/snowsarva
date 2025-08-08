-- =====================================================================================
-- Snowsarva Cost Management Schema
-- Comprehensive cost management and FinOps database schema for Snowflake Native App
-- =====================================================================================

-- Create application schemas
CREATE SCHEMA IF NOT EXISTS app_cost_management;
CREATE SCHEMA IF NOT EXISTS app_budget;
CREATE SCHEMA IF NOT EXISTS app_optimization;
CREATE SCHEMA IF NOT EXISTS app_alerts;
CREATE SCHEMA IF NOT EXISTS app_reporting;

-- =====================================================================================
-- CORE COST MANAGEMENT TABLES
-- =====================================================================================

-- Cost metrics fact table for aggregated cost data
CREATE OR REPLACE TABLE app_cost_management.cost_metrics_fact (
    id STRING PRIMARY KEY,
    metric_date DATE NOT NULL,
    metric_hour TIMESTAMP_NTZ,
    warehouse_name STRING,
    database_name STRING,
    schema_name STRING,
    user_name STRING,
    role_name STRING,
    query_tag STRING,
    -- Cost metrics
    credits_used DECIMAL(18,6) DEFAULT 0,
    credits_used_compute DECIMAL(18,6) DEFAULT 0,
    credits_used_cloud_services DECIMAL(18,6) DEFAULT 0,
    estimated_cost_usd DECIMAL(18,2) DEFAULT 0,
    -- Performance metrics
    query_count INTEGER DEFAULT 0,
    avg_execution_time_ms DECIMAL(18,2),
    total_bytes_scanned BIGINT DEFAULT 0,
    total_partitions_scanned BIGINT DEFAULT 0,
    queued_queries INTEGER DEFAULT 0,
    failed_queries INTEGER DEFAULT 0,
    -- Efficiency metrics
    utilization_score DECIMAL(5,2),
    efficiency_score DECIMAL(5,2),
    cost_efficiency_score DECIMAL(5,2),
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Optimize table for analytical queries
ALTER TABLE app_cost_management.cost_metrics_fact 
    CLUSTER BY (metric_date, warehouse_name, database_name);

-- Query cost attribution for individual query tracking
CREATE OR REPLACE TABLE app_cost_management.query_cost_attribution (
    query_id STRING PRIMARY KEY,
    session_id STRING,
    warehouse_name STRING NOT NULL,
    warehouse_size STRING,
    database_name STRING,
    schema_name STRING,
    user_name STRING NOT NULL,
    role_name STRING,
    query_tag STRING,
    query_text STRING,
    query_hash STRING,
    -- Timing
    start_time TIMESTAMP_NTZ NOT NULL,
    end_time TIMESTAMP_NTZ,
    execution_time_ms BIGINT,
    compilation_time_ms BIGINT,
    queued_overload_time_ms BIGINT,
    queued_provisioning_time_ms BIGINT,
    -- Resource usage
    bytes_scanned BIGINT DEFAULT 0,
    bytes_written BIGINT DEFAULT 0,
    partitions_scanned INTEGER DEFAULT 0,
    partitions_total INTEGER DEFAULT 0,
    credits_used_cloud_services DECIMAL(18,6) DEFAULT 0,
    -- Cost calculation
    estimated_compute_cost DECIMAL(18,6) DEFAULT 0,
    estimated_cloud_services_cost DECIMAL(18,6) DEFAULT 0,
    total_estimated_cost DECIMAL(18,6) DEFAULT 0,
    cost_per_byte_scanned DECIMAL(18,10) DEFAULT 0,
    -- Classification
    query_type STRING, -- SELECT, INSERT, UPDATE, DELETE, DDL, etc.
    complexity_score INTEGER, -- 1-10 scale
    business_criticality STRING, -- HIGH, MEDIUM, LOW
    -- Status
    execution_status STRING,
    error_code INTEGER,
    error_message STRING,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cluster for efficient query performance analysis
ALTER TABLE app_cost_management.query_cost_attribution 
    CLUSTER BY (start_time, warehouse_name, user_name);

-- Warehouse efficiency metrics for performance tracking
CREATE OR REPLACE TABLE app_cost_management.warehouse_efficiency_metrics (
    id STRING PRIMARY KEY,
    warehouse_name STRING NOT NULL,
    warehouse_size STRING NOT NULL,
    metric_date DATE NOT NULL,
    metric_hour INTEGER, -- 0-23 for hourly granularity
    -- Usage metrics
    total_credits_used DECIMAL(18,6) DEFAULT 0,
    active_time_minutes INTEGER DEFAULT 0,
    idle_time_minutes INTEGER DEFAULT 0,
    suspended_time_minutes INTEGER DEFAULT 0,
    -- Performance metrics
    query_count INTEGER DEFAULT 0,
    concurrent_queries_avg DECIMAL(8,2) DEFAULT 0,
    concurrent_queries_max INTEGER DEFAULT 0,
    queued_queries_count INTEGER DEFAULT 0,
    avg_queue_time_ms DECIMAL(18,2) DEFAULT 0,
    -- Efficiency calculations
    utilization_percentage DECIMAL(5,2) DEFAULT 0, -- (active_time / (active_time + idle_time)) * 100
    efficiency_score DECIMAL(5,2) DEFAULT 0, -- Custom efficiency algorithm
    cost_per_query DECIMAL(18,6) DEFAULT 0,
    queries_per_credit DECIMAL(18,2) DEFAULT 0,
    -- Configuration
    auto_suspend_minutes INTEGER,
    auto_resume BOOLEAN DEFAULT TRUE,
    min_cluster_count INTEGER DEFAULT 1,
    max_cluster_count INTEGER DEFAULT 1,
    -- Recommendations tracking
    has_active_recommendations BOOLEAN DEFAULT FALSE,
    last_optimization_date DATE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cluster for warehouse analysis
ALTER TABLE app_cost_management.warehouse_efficiency_metrics 
    CLUSTER BY (metric_date, warehouse_name);

-- Storage cost breakdown for detailed storage analysis
CREATE OR REPLACE TABLE app_cost_management.storage_cost_breakdown (
    id STRING PRIMARY KEY,
    database_name STRING NOT NULL,
    schema_name STRING,
    table_name STRING,
    metric_date DATE NOT NULL,
    -- Storage sizes in bytes
    active_bytes BIGINT DEFAULT 0,
    time_travel_bytes BIGINT DEFAULT 0,
    failsafe_bytes BIGINT DEFAULT 0,
    clone_bytes BIGINT DEFAULT 0,
    -- Storage sizes in GB for easier reading
    active_gb DECIMAL(18,3) DEFAULT 0,
    time_travel_gb DECIMAL(18,3) DEFAULT 0,
    failsafe_gb DECIMAL(18,3) DEFAULT 0,
    clone_gb DECIMAL(18,3) DEFAULT 0,
    total_gb DECIMAL(18,3) DEFAULT 0,
    -- Cost calculations (monthly estimates)
    active_storage_cost DECIMAL(18,6) DEFAULT 0,
    time_travel_storage_cost DECIMAL(18,6) DEFAULT 0,
    failsafe_storage_cost DECIMAL(18,6) DEFAULT 0,
    clone_storage_cost DECIMAL(18,6) DEFAULT 0,
    total_storage_cost DECIMAL(18,6) DEFAULT 0,
    -- Optimization metrics
    compression_ratio DECIMAL(8,2),
    data_retention_days INTEGER,
    clustering_efficiency DECIMAL(5,2),
    -- Growth tracking
    daily_growth_gb DECIMAL(18,3) DEFAULT 0,
    weekly_growth_gb DECIMAL(18,3) DEFAULT 0,
    monthly_growth_gb DECIMAL(18,3) DEFAULT 0,
    -- Table metadata
    table_type STRING, -- TABLE, VIEW, MATERIALIZED VIEW
    clustering_key STRING,
    row_count BIGINT,
    created_date DATE,
    last_altered_date DATE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cluster for storage analysis
ALTER TABLE app_cost_management.storage_cost_breakdown 
    CLUSTER BY (metric_date, database_name, total_gb DESC);

-- =====================================================================================
-- BUDGET MANAGEMENT TABLES
-- =====================================================================================

-- Budget definitions and configurations
CREATE OR REPLACE TABLE app_budget.budget_definitions (
    id STRING PRIMARY KEY,
    name STRING NOT NULL,
    description STRING,
    -- Budget parameters
    amount DECIMAL(18,2) NOT NULL,
    currency STRING DEFAULT 'USD',
    period STRING NOT NULL, -- DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    -- Alert thresholds (as percentages)
    alert_threshold_1 DECIMAL(5,2) DEFAULT 75.0, -- First warning at 75%
    alert_threshold_2 DECIMAL(5,2) DEFAULT 90.0, -- Critical warning at 90%
    alert_threshold_3 DECIMAL(5,2) DEFAULT 100.0, -- Exceeded at 100%
    -- Scope definition
    scope_type STRING NOT NULL, -- ACCOUNT, WAREHOUSE, DATABASE, ROLE, USER, CUSTOM
    scope_values ARRAY, -- List of specific warehouses, databases, etc.
    scope_filter_sql STRING, -- Custom SQL filter for complex scoping
    -- Budget status
    status STRING DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, EXPIRED, EXCEEDED
    current_spend DECIMAL(18,2) DEFAULT 0,
    forecasted_spend DECIMAL(18,2) DEFAULT 0,
    last_calculated_at TIMESTAMP_NTZ,
    -- Automation settings
    auto_alert_enabled BOOLEAN DEFAULT TRUE,
    auto_suspend_enabled BOOLEAN DEFAULT FALSE,
    auto_suspend_threshold DECIMAL(5,2) DEFAULT 100.0,
    -- Approval workflow
    created_by STRING,
    approved_by STRING,
    approved_at TIMESTAMP_NTZ,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    deleted_at TIMESTAMP_NTZ
);

-- Budget tracking for daily spend monitoring
CREATE OR REPLACE TABLE app_budget.budget_tracking (
    id STRING PRIMARY KEY,
    budget_id STRING NOT NULL,
    tracking_date DATE NOT NULL,
    tracking_hour INTEGER, -- For hourly tracking granularity
    -- Actual spending
    actual_spend DECIMAL(18,2) DEFAULT 0,
    cumulative_spend DECIMAL(18,2) DEFAULT 0,
    -- Budget comparison
    daily_budget_amount DECIMAL(18,2), -- Pro-rated daily budget
    cumulative_budget_amount DECIMAL(18,2), -- Pro-rated cumulative budget
    variance_amount DECIMAL(18,2), -- actual - budget
    variance_percentage DECIMAL(8,2), -- (actual - budget) / budget * 100
    -- Forecasting
    forecasted_end_spend DECIMAL(18,2),
    days_remaining INTEGER,
    avg_daily_spend DECIMAL(18,2),
    projected_overage DECIMAL(18,2),
    -- Status flags
    threshold_1_breached BOOLEAN DEFAULT FALSE,
    threshold_2_breached BOOLEAN DEFAULT FALSE,
    threshold_3_breached BOOLEAN DEFAULT FALSE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    FOREIGN KEY (budget_id) REFERENCES app_budget.budget_definitions(id)
);

-- Cluster for efficient budget monitoring
ALTER TABLE app_budget.budget_tracking 
    CLUSTER BY (tracking_date, budget_id);

-- Budget forecasting models for predictive analysis
CREATE OR REPLACE TABLE app_budget.budget_forecasts (
    id STRING PRIMARY KEY,
    budget_id STRING NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_type STRING NOT NULL, -- LINEAR, SEASONAL, ML_MODEL, MANUAL
    -- Forecast parameters
    forecast_horizon_days INTEGER NOT NULL,
    confidence_level DECIMAL(5,2) DEFAULT 95.0,
    -- Forecast results
    forecasted_total_spend DECIMAL(18,2),
    forecasted_end_date DATE,
    predicted_overage DECIMAL(18,2),
    probability_of_exceeding DECIMAL(5,2),
    -- Model details
    model_version STRING,
    model_accuracy DECIMAL(5,2),
    training_data_points INTEGER,
    seasonal_factors OBJECT, -- JSON with seasonal adjustments
    trend_factors OBJECT, -- JSON with trend analysis
    -- Forecast validation
    actual_vs_forecast_variance DECIMAL(8,2), -- Filled as actual data comes in
    forecast_accuracy_score DECIMAL(5,2),
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    FOREIGN KEY (budget_id) REFERENCES app_budget.budget_definitions(id)
);

-- =====================================================================================
-- OPTIMIZATION RECOMMENDATIONS TABLES
-- =====================================================================================

-- Optimization recommendations from AI analysis
CREATE OR REPLACE TABLE app_optimization.recommendations (
    id STRING PRIMARY KEY,
    target_type STRING NOT NULL, -- WAREHOUSE, QUERY, STORAGE, ACCOUNT
    target_id STRING NOT NULL, -- Specific warehouse name, query ID, etc.
    target_name STRING,
    -- Recommendation details
    recommendation_type STRING NOT NULL, -- RESIZE, AUTO_SUSPEND, QUERY_OPTIMIZATION, etc.
    category STRING, -- COST_REDUCTION, PERFORMANCE, EFFICIENCY, GOVERNANCE
    priority STRING NOT NULL, -- HIGH, MEDIUM, LOW
    severity_score INTEGER, -- 1-10 scale
    -- Description and analysis
    title STRING NOT NULL,
    description STRING,
    root_cause_analysis STRING,
    -- Impact estimation
    estimated_cost_savings DECIMAL(18,2) DEFAULT 0,
    estimated_performance_improvement DECIMAL(5,2) DEFAULT 0,
    payback_period_days INTEGER,
    confidence_score DECIMAL(5,2) DEFAULT 0,
    -- Implementation details
    implementation_effort STRING, -- LOW, MEDIUM, HIGH
    implementation_time_estimate STRING, -- e.g., "< 1 hour", "1-3 days"
    implementation_steps ARRAY, -- Step-by-step instructions
    implementation_sql STRING, -- SQL commands to implement
    rollback_sql STRING, -- SQL commands to rollback
    prerequisites ARRAY, -- List of prerequisites
    risks ARRAY, -- List of potential risks
    -- Status tracking
    status STRING DEFAULT 'NEW', -- NEW, UNDER_REVIEW, APPROVED, IMPLEMENTED, REJECTED, EXPIRED
    assigned_to STRING,
    reviewed_by STRING,
    reviewed_at TIMESTAMP_NTZ,
    implemented_by STRING,
    implemented_at TIMESTAMP_NTZ,
    -- Validation and results
    actual_cost_savings DECIMAL(18,2),
    actual_performance_improvement DECIMAL(5,2),
    implementation_success BOOLEAN,
    lessons_learned STRING,
    -- AI generation metadata
    ai_model_version STRING,
    ai_confidence_score DECIMAL(5,2),
    generated_from_data_source STRING,
    generated_at TIMESTAMP_NTZ,
    -- Expiration and lifecycle
    expires_at TIMESTAMP_NTZ,
    auto_expire_enabled BOOLEAN DEFAULT TRUE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cluster for efficient recommendation management
ALTER TABLE app_optimization.recommendations 
    CLUSTER BY (created_at, target_type, priority);

-- Optimization baseline metrics for comparison
CREATE OR REPLACE TABLE app_optimization.baseline_metrics (
    id STRING PRIMARY KEY,
    target_type STRING NOT NULL,
    target_id STRING NOT NULL,
    baseline_date DATE NOT NULL,
    -- Performance baselines
    baseline_cost_per_hour DECIMAL(18,6),
    baseline_query_count_per_hour DECIMAL(8,2),
    baseline_avg_execution_time_ms DECIMAL(18,2),
    baseline_utilization_percentage DECIMAL(5,2),
    baseline_efficiency_score DECIMAL(5,2),
    baseline_queue_time_ms DECIMAL(18,2),
    -- Storage baselines (if applicable)
    baseline_storage_gb DECIMAL(18,3),
    baseline_storage_cost_monthly DECIMAL(18,2),
    baseline_compression_ratio DECIMAL(8,2),
    -- Custom metrics
    custom_metrics OBJECT, -- JSON for flexible metric storage
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Performance improvement tracking
CREATE OR REPLACE TABLE app_optimization.performance_tracking (
    id STRING PRIMARY KEY,
    recommendation_id STRING NOT NULL,
    baseline_id STRING NOT NULL,
    measurement_date DATE NOT NULL,
    -- Performance measurements
    current_cost_per_hour DECIMAL(18,6),
    current_query_count_per_hour DECIMAL(8,2),
    current_avg_execution_time_ms DECIMAL(18,2),
    current_utilization_percentage DECIMAL(5,2),
    current_efficiency_score DECIMAL(5,2),
    current_queue_time_ms DECIMAL(18,2),
    -- Improvement calculations
    cost_improvement_percentage DECIMAL(8,2),
    performance_improvement_percentage DECIMAL(8,2),
    efficiency_improvement_percentage DECIMAL(8,2),
    cost_savings_actual DECIMAL(18,2),
    -- Validation
    improvement_sustained BOOLEAN DEFAULT TRUE,
    regression_detected BOOLEAN DEFAULT FALSE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    FOREIGN KEY (recommendation_id) REFERENCES app_optimization.recommendations(id)
);

-- =====================================================================================
-- ALERTS AND NOTIFICATIONS
-- =====================================================================================

-- Cost alerts and anomaly detection
CREATE OR REPLACE TABLE app_alerts.cost_alerts (
    id STRING PRIMARY KEY,
    alert_type STRING NOT NULL, -- BUDGET_THRESHOLD, COST_SPIKE, ANOMALY, OPTIMIZATION
    severity STRING NOT NULL, -- HIGH, MEDIUM, LOW
    title STRING NOT NULL,
    message STRING NOT NULL,
    -- Target information
    target_type STRING, -- WAREHOUSE, QUERY, BUDGET, ACCOUNT
    target_id STRING,
    target_name STRING,
    -- Alert triggers
    trigger_condition STRING,
    trigger_threshold DECIMAL(18,6),
    actual_value DECIMAL(18,6),
    threshold_breached_by DECIMAL(18,6),
    -- Time information
    alert_timestamp TIMESTAMP_NTZ NOT NULL,
    detection_window_hours INTEGER DEFAULT 24,
    -- Status and acknowledgment
    status STRING DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED
    acknowledged_by STRING,
    acknowledged_at TIMESTAMP_NTZ,
    resolved_by STRING,
    resolved_at TIMESTAMP_NTZ,
    resolution_notes STRING,
    -- Notification tracking
    notification_channels ARRAY, -- EMAIL, SLACK, WEBHOOK, etc.
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMP_NTZ,
    notification_retry_count INTEGER DEFAULT 0,
    -- Related data
    budget_id STRING, -- If budget-related
    recommendation_id STRING, -- If optimization-related
    related_query_ids ARRAY, -- Related query IDs
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cluster for efficient alert management
ALTER TABLE app_alerts.cost_alerts 
    CLUSTER BY (alert_timestamp, severity, status);

-- Alert notification configuration
CREATE OR REPLACE TABLE app_alerts.notification_config (
    id STRING PRIMARY KEY,
    name STRING NOT NULL,
    description STRING,
    -- Notification channels
    channel_type STRING NOT NULL, -- EMAIL, SLACK, WEBHOOK, SMS
    channel_config OBJECT NOT NULL, -- JSON configuration specific to channel
    -- Alert filtering
    alert_types ARRAY, -- Which alert types to send
    severity_levels ARRAY, -- Which severity levels to send
    target_types ARRAY, -- Which target types to monitor
    -- Timing and frequency
    enabled BOOLEAN DEFAULT TRUE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    max_alerts_per_hour INTEGER DEFAULT 10,
    escalation_delay_minutes INTEGER DEFAULT 30,
    -- Recipients
    recipients ARRAY, -- List of email addresses, user IDs, etc.
    escalation_recipients ARRAY, -- Escalation contacts
    -- Metadata
    created_by STRING,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    deleted_at TIMESTAMP_NTZ
);

-- =====================================================================================
-- REPORTING AND ANALYTICS
-- =====================================================================================

-- Cost allocation rules for chargeback
CREATE OR REPLACE TABLE app_reporting.cost_allocation_rules (
    id STRING PRIMARY KEY,
    name STRING NOT NULL,
    description STRING,
    -- Allocation scope
    scope_type STRING NOT NULL, -- WAREHOUSE, DATABASE, ROLE, USER, QUERY_TAG
    scope_values ARRAY,
    -- Allocation target
    allocation_type STRING NOT NULL, -- DEPARTMENT, COST_CENTER, PROJECT, TEAM
    allocation_target STRING NOT NULL, -- Department name, cost center code, etc.
    allocation_percentage DECIMAL(5,2) DEFAULT 100.0,
    -- Rule logic
    filter_sql STRING, -- Custom SQL filter for complex allocation
    priority INTEGER DEFAULT 1, -- For handling overlapping rules
    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    -- Metadata
    created_by STRING,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cost allocation results
CREATE OR REPLACE TABLE app_reporting.cost_allocations (
    id STRING PRIMARY KEY,
    allocation_date DATE NOT NULL,
    allocation_rule_id STRING NOT NULL,
    -- Source cost information
    source_type STRING NOT NULL,
    source_id STRING NOT NULL,
    source_name STRING,
    total_cost DECIMAL(18,2) NOT NULL,
    -- Allocation details
    allocation_type STRING NOT NULL,
    allocation_target STRING NOT NULL,
    allocated_amount DECIMAL(18,2) NOT NULL,
    allocation_percentage DECIMAL(5,2) NOT NULL,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    FOREIGN KEY (allocation_rule_id) REFERENCES app_reporting.cost_allocation_rules(id)
);

-- Cluster for efficient reporting
ALTER TABLE app_reporting.cost_allocations 
    CLUSTER BY (allocation_date, allocation_type);

-- Executive reporting dashboard configuration
CREATE OR REPLACE TABLE app_reporting.dashboard_configs (
    id STRING PRIMARY KEY,
    dashboard_name STRING NOT NULL,
    dashboard_type STRING NOT NULL, -- EXECUTIVE, OPERATIONAL, DETAILED
    description STRING,
    -- Dashboard configuration
    config_json OBJECT NOT NULL, -- JSON configuration for dashboard
    default_time_range STRING DEFAULT '30d',
    auto_refresh_minutes INTEGER DEFAULT 15,
    -- Access control
    visibility STRING DEFAULT 'PRIVATE', -- PRIVATE, TEAM, PUBLIC
    owner_user STRING,
    shared_with_users ARRAY,
    shared_with_roles ARRAY,
    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- =====================================================================================
-- VIEWS FOR COMMON ANALYTICS
-- =====================================================================================

-- Daily cost summary view
CREATE OR REPLACE VIEW app_cost_management.daily_cost_summary AS
SELECT 
    metric_date,
    SUM(estimated_cost_usd) as total_cost,
    SUM(credits_used) as total_credits,
    SUM(credits_used_compute) as compute_credits,
    SUM(credits_used_cloud_services) as cloud_services_credits,
    COUNT(DISTINCT warehouse_name) as active_warehouses,
    SUM(query_count) as total_queries,
    AVG(utilization_score) as avg_utilization,
    AVG(efficiency_score) as avg_efficiency
FROM app_cost_management.cost_metrics_fact
GROUP BY metric_date
ORDER BY metric_date DESC;

-- Warehouse efficiency ranking view
CREATE OR REPLACE VIEW app_cost_management.warehouse_efficiency_ranking AS
SELECT 
    warehouse_name,
    warehouse_size,
    AVG(utilization_percentage) as avg_utilization,
    AVG(efficiency_score) as avg_efficiency,
    SUM(total_credits_used) as total_credits,
    SUM(query_count) as total_queries,
    AVG(cost_per_query) as avg_cost_per_query,
    RANK() OVER (ORDER BY AVG(efficiency_score) DESC) as efficiency_rank,
    CASE 
        WHEN AVG(efficiency_score) >= 80 THEN 'EXCELLENT'
        WHEN AVG(efficiency_score) >= 60 THEN 'GOOD'
        WHEN AVG(efficiency_score) >= 40 THEN 'FAIR'
        ELSE 'NEEDS_IMPROVEMENT'
    END as efficiency_grade
FROM app_cost_management.warehouse_efficiency_metrics
WHERE metric_date >= DATEADD('day', -30, CURRENT_DATE())
GROUP BY warehouse_name, warehouse_size
ORDER BY efficiency_rank;

-- Budget status summary view
CREATE OR REPLACE VIEW app_budget.budget_status_summary AS
SELECT 
    bd.id,
    bd.name,
    bd.amount as budget_amount,
    bd.period,
    bd.start_date,
    bd.end_date,
    bt.cumulative_spend as current_spend,
    bf.forecasted_total_spend,
    (bt.cumulative_spend / bd.amount * 100) as utilization_percentage,
    CASE 
        WHEN bt.threshold_3_breached THEN 'EXCEEDED'
        WHEN bt.threshold_2_breached THEN 'CRITICAL'
        WHEN bt.threshold_1_breached THEN 'WARNING'
        ELSE 'ON_TRACK'
    END as status,
    DATEDIFF('day', CURRENT_DATE(), bd.end_date) as days_remaining
FROM app_budget.budget_definitions bd
LEFT JOIN app_budget.budget_tracking bt ON bd.id = bt.budget_id 
    AND bt.tracking_date = CURRENT_DATE()
LEFT JOIN app_budget.budget_forecasts bf ON bd.id = bf.budget_id 
    AND bf.forecast_date = CURRENT_DATE()
WHERE bd.deleted_at IS NULL
    AND bd.status = 'ACTIVE';

-- Top optimization opportunities view
CREATE OR REPLACE VIEW app_optimization.top_opportunities AS
SELECT 
    id,
    target_type,
    target_name,
    recommendation_type,
    priority,
    estimated_cost_savings,
    estimated_performance_improvement,
    implementation_effort,
    confidence_score,
    created_at
FROM app_optimization.recommendations
WHERE status IN ('NEW', 'UNDER_REVIEW', 'APPROVED')
    AND expires_at > CURRENT_TIMESTAMP()
ORDER BY 
    CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
    estimated_cost_savings DESC,
    confidence_score DESC
LIMIT 20;

-- =====================================================================================
-- STORED PROCEDURES FOR DATA PROCESSING
-- =====================================================================================

-- Procedure to refresh cost metrics
CREATE OR REPLACE PROCEDURE app_cost_management.refresh_cost_metrics(TIME_RANGE_HOURS INTEGER DEFAULT 24)
RETURNS STRING
LANGUAGE SQL
AS
$$
BEGIN
    -- Insert/update cost metrics from account usage data
    MERGE INTO app_cost_management.cost_metrics_fact AS target
    USING (
        SELECT 
            CONCAT(DATE_TRUNC('hour', wm.start_time), '_', wm.warehouse_name) as id,
            DATE(wm.start_time) as metric_date,
            DATE_TRUNC('hour', wm.start_time) as metric_hour,
            wm.warehouse_name,
            NULL as database_name,
            NULL as schema_name,
            NULL as user_name,
            NULL as role_name,
            NULL as query_tag,
            wm.credits_used,
            wm.credits_used_compute,
            wm.credits_used_cloud_services,
            wm.credits_used * 4.0 as estimated_cost_usd, -- Assuming $4 per credit
            0 as query_count,
            0 as avg_execution_time_ms,
            0 as total_bytes_scanned,
            0 as total_partitions_scanned,
            0 as queued_queries,
            0 as failed_queries,
            NULL as utilization_score,
            NULL as efficiency_score,
            NULL as cost_efficiency_score,
            CURRENT_TIMESTAMP() as created_at,
            CURRENT_TIMESTAMP() as updated_at
        FROM TABLE(information_schema.warehouse_metering_history(
            date_range_start => DATEADD('hour', -:TIME_RANGE_HOURS, CURRENT_TIMESTAMP())
        )) wm
    ) AS source ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET 
        credits_used = source.credits_used,
        credits_used_compute = source.credits_used_compute,
        credits_used_cloud_services = source.credits_used_cloud_services,
        estimated_cost_usd = source.estimated_cost_usd,
        updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT VALUES (
        source.id, source.metric_date, source.metric_hour, source.warehouse_name,
        source.database_name, source.schema_name, source.user_name, source.role_name,
        source.query_tag, source.credits_used, source.credits_used_compute,
        source.credits_used_cloud_services, source.estimated_cost_usd, source.query_count,
        source.avg_execution_time_ms, source.total_bytes_scanned, source.total_partitions_scanned,
        source.queued_queries, source.failed_queries, source.utilization_score,
        source.efficiency_score, source.cost_efficiency_score, source.created_at, source.updated_at
    );
    
    RETURN 'Cost metrics refreshed successfully for last ' || :TIME_RANGE_HOURS || ' hours';
END;
$$;

-- Procedure to calculate budget variance
CREATE OR REPLACE PROCEDURE app_budget.calculate_budget_variance(BUDGET_ID STRING DEFAULT NULL)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
    budget_cursor CURSOR FOR 
        SELECT id, amount, start_date, end_date, scope_type, scope_values
        FROM app_budget.budget_definitions 
        WHERE (:BUDGET_ID IS NULL OR id = :BUDGET_ID)
            AND status = 'ACTIVE' 
            AND deleted_at IS NULL;
    
    budget_record RECORD;
    current_spend DECIMAL(18,2);
    days_total INTEGER;
    days_elapsed INTEGER;
    days_remaining INTEGER;
    daily_budget DECIMAL(18,2);
    cumulative_budget DECIMAL(18,2);
    variance_amount DECIMAL(18,2);
    variance_percentage DECIMAL(8,2);
    forecasted_spend DECIMAL(18,2);
    avg_daily_spend DECIMAL(18,2);
BEGIN
    
    FOR budget_record IN budget_cursor DO
        -- Calculate total days and elapsed days
        SELECT DATEDIFF('day', budget_record.start_date, budget_record.end_date) INTO days_total;
        SELECT DATEDIFF('day', budget_record.start_date, CURRENT_DATE()) INTO days_elapsed;
        SELECT GREATEST(0, DATEDIFF('day', CURRENT_DATE(), budget_record.end_date)) INTO days_remaining;
        
        -- Calculate current spend (this would need custom logic based on scope)
        SELECT COALESCE(SUM(estimated_cost_usd), 0) 
        INTO current_spend
        FROM app_cost_management.cost_metrics_fact
        WHERE metric_date >= budget_record.start_date
            AND metric_date <= CURRENT_DATE()
            AND (:BUDGET_ID IS NOT NULL OR warehouse_name = ANY(budget_record.scope_values)); -- Simplified scope
        
        -- Calculate budget metrics
        SELECT budget_record.amount / GREATEST(days_total, 1) INTO daily_budget;
        SELECT daily_budget * GREATEST(days_elapsed, 1) INTO cumulative_budget;
        SELECT current_spend - cumulative_budget INTO variance_amount;
        SELECT CASE WHEN cumulative_budget > 0 THEN (variance_amount / cumulative_budget * 100) ELSE 0 END INTO variance_percentage;
        
        -- Calculate forecast
        SELECT CASE WHEN days_elapsed > 0 THEN current_spend / days_elapsed ELSE 0 END INTO avg_daily_spend;
        SELECT current_spend + (avg_daily_spend * days_remaining) INTO forecasted_spend;
        
        -- Insert or update budget tracking
        MERGE INTO app_budget.budget_tracking AS target
        USING (
            SELECT 
                budget_record.id || '_' || CURRENT_DATE() as id,
                budget_record.id as budget_id,
                CURRENT_DATE() as tracking_date,
                NULL as tracking_hour,
                current_spend as actual_spend,
                current_spend as cumulative_spend,
                daily_budget as daily_budget_amount,
                cumulative_budget as cumulative_budget_amount,
                variance_amount,
                variance_percentage,
                forecasted_spend as forecasted_end_spend,
                days_remaining,
                avg_daily_spend,
                GREATEST(0, forecasted_spend - budget_record.amount) as projected_overage,
                (current_spend / budget_record.amount * 100) >= 75 as threshold_1_breached,
                (current_spend / budget_record.amount * 100) >= 90 as threshold_2_breached,
                (current_spend / budget_record.amount * 100) >= 100 as threshold_3_breached
        ) AS source ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET 
            actual_spend = source.actual_spend,
            cumulative_spend = source.cumulative_spend,
            variance_amount = source.variance_amount,
            variance_percentage = source.variance_percentage,
            forecasted_end_spend = source.forecasted_end_spend,
            days_remaining = source.days_remaining,
            avg_daily_spend = source.avg_daily_spend,
            projected_overage = source.projected_overage,
            threshold_1_breached = source.threshold_1_breached,
            threshold_2_breached = source.threshold_2_breached,
            threshold_3_breached = source.threshold_3_breached,
            updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT VALUES (
            source.id, source.budget_id, source.tracking_date, source.tracking_hour,
            source.actual_spend, source.cumulative_spend, source.daily_budget_amount,
            source.cumulative_budget_amount, source.variance_amount, source.variance_percentage,
            source.forecasted_end_spend, source.days_remaining, source.avg_daily_spend,
            source.projected_overage, source.threshold_1_breached, source.threshold_2_breached,
            source.threshold_3_breached, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        );
        
    END FOR;
    
    RETURN 'Budget variance calculated successfully';
END;
$$;

-- =====================================================================================
-- SCHEDULED TASKS
-- =====================================================================================

-- Task to refresh cost metrics hourly
CREATE OR REPLACE TASK app_cost_management.task_refresh_cost_metrics
    WAREHOUSE = COMPUTE_WH
    SCHEDULE = 'USING CRON 0 * * * * UTC' -- Every hour
AS
CALL app_cost_management.refresh_cost_metrics(2); -- Refresh last 2 hours

-- Task to calculate budget variance daily
CREATE OR REPLACE TASK app_budget.task_calculate_budget_variance
    WAREHOUSE = COMPUTE_WH
    SCHEDULE = 'USING CRON 0 6 * * * UTC' -- Daily at 6 AM UTC
AS
CALL app_budget.calculate_budget_variance(NULL);

-- Task to detect cost anomalies
CREATE OR REPLACE TASK app_alerts.task_detect_cost_anomalies
    WAREHOUSE = COMPUTE_WH
    SCHEDULE = 'USING CRON 0 */4 * * * UTC' -- Every 4 hours
AS
INSERT INTO app_alerts.cost_alerts (
    id, alert_type, severity, title, message, target_type, target_id, target_name,
    trigger_condition, actual_value, alert_timestamp, created_at
)
SELECT 
    CONCAT('ANOMALY_', warehouse_name, '_', CURRENT_TIMESTAMP()) as id,
    'COST_SPIKE' as alert_type,
    'HIGH' as severity,
    'Unusual cost spike detected' as title,
    CONCAT('Warehouse ', warehouse_name, ' cost increased by ', 
           ROUND((current_cost - avg_cost) / avg_cost * 100, 1), 
           '% compared to average') as message,
    'WAREHOUSE' as target_type,
    warehouse_name as target_id,
    warehouse_name as target_name,
    'COST_DEVIATION > 2_SIGMA' as trigger_condition,
    current_cost as actual_value,
    CURRENT_TIMESTAMP() as alert_timestamp,
    CURRENT_TIMESTAMP() as created_at
FROM (
    SELECT 
        warehouse_name,
        SUM(CASE WHEN metric_date = CURRENT_DATE() THEN estimated_cost_usd ELSE 0 END) as current_cost,
        AVG(CASE WHEN metric_date >= DATEADD('day', -7, CURRENT_DATE()) 
                  AND metric_date < CURRENT_DATE() 
                  THEN estimated_cost_usd ELSE NULL END) as avg_cost,
        STDDEV(CASE WHEN metric_date >= DATEADD('day', -7, CURRENT_DATE()) 
                    AND metric_date < CURRENT_DATE() 
                    THEN estimated_cost_usd ELSE NULL END) as stddev_cost
    FROM app_cost_management.cost_metrics_fact
    WHERE metric_date >= DATEADD('day', -8, CURRENT_DATE())
    GROUP BY warehouse_name
) anomaly_analysis
WHERE current_cost > (avg_cost + 2 * stddev_cost)
    AND avg_cost > 0
    AND stddev_cost > 0;

-- Start the tasks
ALTER TASK app_cost_management.task_refresh_cost_metrics RESUME;
ALTER TASK app_budget.task_calculate_budget_variance RESUME;
ALTER TASK app_alerts.task_detect_cost_anomalies RESUME;

-- =====================================================================================
-- GRANTS AND PERMISSIONS
-- =====================================================================================

-- Grant permissions to application roles
GRANT USAGE ON SCHEMA app_cost_management TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_budget TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_optimization TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_alerts TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_reporting TO APPLICATION ROLE app_admin;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_cost_management TO APPLICATION ROLE app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_budget TO APPLICATION ROLE app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_optimization TO APPLICATION ROLE app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_alerts TO APPLICATION ROLE app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_reporting TO APPLICATION ROLE app_admin;

-- Grant view permissions
GRANT SELECT ON ALL VIEWS IN SCHEMA app_cost_management TO APPLICATION ROLE app_admin;
GRANT SELECT ON ALL VIEWS IN SCHEMA app_budget TO APPLICATION ROLE app_admin;
GRANT SELECT ON ALL VIEWS IN SCHEMA app_optimization TO APPLICATION ROLE app_admin;

-- Grant procedure permissions
GRANT USAGE ON ALL PROCEDURES IN SCHEMA app_cost_management TO APPLICATION ROLE app_admin;
GRANT USAGE ON ALL PROCEDURES IN SCHEMA app_budget TO APPLICATION ROLE app_admin;

-- =====================================================================================
-- INITIAL DATA SETUP
-- =====================================================================================

-- Insert default notification configurations
INSERT INTO app_alerts.notification_config (
    id, name, description, channel_type, channel_config, alert_types, 
    severity_levels, enabled, created_by, created_at
) VALUES 
(
    'default_email_config',
    'Default Email Notifications',
    'Default email notifications for cost alerts',
    'EMAIL',
    {'smtp_server': 'localhost', 'from_email': 'snowsarva@company.com'},
    ['BUDGET_THRESHOLD', 'COST_SPIKE', 'ANOMALY'],
    ['HIGH', 'MEDIUM'],
    TRUE,
    'system',
    CURRENT_TIMESTAMP()
);

-- Insert default cost allocation rules
INSERT INTO app_reporting.cost_allocation_rules (
    id, name, description, scope_type, scope_values, allocation_type, 
    allocation_target, enabled, effective_start_date, created_by, created_at
) VALUES 
(
    'default_warehouse_allocation',
    'Default Warehouse Allocation',
    'Allocate warehouse costs to departments',
    'WAREHOUSE',
    ['COMPUTE_WH', 'ANALYTICS_WH'],
    'DEPARTMENT',
    'IT',
    TRUE,
    CURRENT_DATE(),
    'system',
    CURRENT_TIMESTAMP()
);

-- =====================================================================================
-- DOCUMENTATION AND COMMENTS
-- =====================================================================================

COMMENT ON SCHEMA app_cost_management IS 'Core cost management functionality including metrics aggregation and cost calculation';
COMMENT ON SCHEMA app_budget IS 'Budget management, tracking, and forecasting capabilities';
COMMENT ON SCHEMA app_optimization IS 'AI-powered optimization recommendations and performance tracking';
COMMENT ON SCHEMA app_alerts IS 'Cost alerts, anomaly detection, and notification management';
COMMENT ON SCHEMA app_reporting IS 'Cost reporting, allocation, and executive dashboards';

COMMENT ON TABLE app_cost_management.cost_metrics_fact IS 'Aggregated cost metrics with multiple dimensions for analytical queries';
COMMENT ON TABLE app_cost_management.query_cost_attribution IS 'Individual query cost tracking and attribution';
COMMENT ON TABLE app_cost_management.warehouse_efficiency_metrics IS 'Warehouse performance and efficiency metrics';
COMMENT ON TABLE app_cost_management.storage_cost_breakdown IS 'Detailed storage cost analysis including time travel and fail-safe';

COMMENT ON TABLE app_budget.budget_definitions IS 'Budget configurations with scope, thresholds, and automation settings';
COMMENT ON TABLE app_budget.budget_tracking IS 'Daily budget spend tracking and variance monitoring';
COMMENT ON TABLE app_budget.budget_forecasts IS 'Predictive budget forecasting using multiple models';

-- =====================================================================================
-- END OF SCHEMA
-- =====================================================================================

SELECT 'Cost Management Schema created successfully' as result;
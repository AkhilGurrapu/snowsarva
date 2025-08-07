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

Main Ideas - Build a full functional snowflake native application using container services where we build custom full functional application that runs on these containers using the framework provided by snowflake

I have this repository, take this repo "https://github.com/Snowflake-Labs/sfguide-build-a-native-app-with-spcs" use github mcp to get all details on this repo, consider this repo as reference for initial setup but don't inspire from it for full functional, it's an working repo provided by snowflake how to setup the app and make it working.

where ask to user these mcp for relevant and maily snowflake cortex to get any information on snowflake as well we have docs folder that needed about snowflake native app and snowflake. the list of mcp we have - ""github, context7, sequential-thinking, playwright.""


Snowsarva - for data discoverability/trace/metrics/data catalog/observability
Data tagging, Classification, Roles, Lineage, ETL/ELT with DBT, testing anomoly detection

This app should use all the metadata in snowflake - mainly 'Snowflake' database - shared with this app, and this app uses these data for all metrics

1. Cost Management and Predictability
2. Data Discovery and Navigation for Business Users
3. Query Performance Optimization Tools
4. Warehouse Management and Auto-Optimization
5. Column level lineage and Roles lineage more simple clear with using any of the open source tools as suggested below.

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

Native App Solution: A cost management application that:
* Provides real-time monitoring of warehouse usage and costs
* Identifies optimization opportunities based on query patterns
* Offers budget alerting and forecasting
* Helps right-size warehouses for specific workloads
* Allocates costs to different departments or projects
* Recommends caching and materialization strategies

A cost management application that:
* Provides real-time monitoring of warehouse usage and costs
* Identifies optimization opportunities based on query patterns
* Offers budget alerting and forecasting
* Helps right-size warehouses for specific workloads
* Allocates costs to different departments or projects
* Recommends caching and materialization strategies
Real-time Cost Monitoring & Alerting
Query Performance Advisor
Data Quality Assurance & Remediation
Governance & Access-Control Auditor
Schema Migration Assistant
Metadata Catalog & Lineage Tracker
Natural-Language Query Assistant

USE REACT FOR THIS AS FRAMEWORK WITH BACKEND TOO

* Real-time Cost Monitoring & Alerting Many organizations face unpredictable Snowflake bills due to inefficient queries and lack of credit tracking1. A native app can continuously ingest usage data, apply anomaly detection (via an ML model in a container), and send budget-breach alerts through email or Slack. Built with Snowpark Container Services, the app runs in a dedicated compute pool and exposes a secure service endpoint for on-demand cost reports.

* Query Performance Advisor Slow queries, overloaded warehouses and poor clustering are common performance bottlenecks. This app analyzes query history and micro-partition metadata, then generates recommendations-such as new clustering keys, warehouse resizing or query rewrites. The containerized service uses Snowflake UDFs to access metadata and writes advisories to a Snowflake table or dashboard.
* Data Quality Assurance & Remediation Duplicate records, schema drift and missing data can undermine analytics1. A Snowflake Native App can run customizable quality checks on tables via scheduled container jobs, detect anomalies (e.g., unexpected null rates or pattern violations), and even auto-remediate by merging duplicates or casting drifting schemas. Results and fixes are logged in Snowflake for audit and traceability.
* Governance & Access-Control Auditor Overly broad privileges and missing audit trails pose security and compliance risks1. This app scans roles, grants and ACCOUNT_USAGE views to identify privilege creep and policy violations. It then offers one-click SQL scripts to revoke or tighten permissions. Implemented as a container service, it writes findings to a governance dashboard and can integrate with existing SIEM tools.
* Schema Migration Assistant Migrating from legacy systems often involves schema mismatches and transformation errors1. A containerized migration assistant can compare source and target schemas, generate DDLs, map data-type conversions, and even preview ETL scripts. Providers can bundle it as a native app so consumers can validate and execute migration plans entirely inside Snowflake.
* Metadata Catalog & Lineage Tracker Lack of built-in lineage makes impact analysis hard1. This native app harvests metadata from INFORMATION_SCHEMA and ACCOUNT_USAGE, constructs a dependency graph, and stores lineage info in Snowflake tables. A REST-style endpoint (hosted in a container) serves lineage queries to BI tools or governance portals.
* Natural-Language Query Assistant Business users often struggle to write SQL. Embedding an LLM in a Snowpark Container Service lets users submit plain-English prompts and receive optimized SQL back, all without data leaving Snowflake. The service runs within the customer’s compute pool and is exposed via a UDF for seamless adoption.


Use any of the Open source tools:

* dbt (Core & Artifacts) – For model metadata and source-to-model relationships
* sqlglot or sqlfluff – For SQL parsing and extracting column-level lineage
* dbt-column-lineage-extractor – Ready-made tool for dbt projects
* OpenMetadata – Open-source lineage framework with built-in lineage APIs and UI
* SQLLineage – Python package for parsing SQL statements and producing lineage graphs
* Neo4j (or similar graph DB) – For storing column-level nodes and edges
* React Flow, Cytoscape.js, or D3.js – For frontend lineage graph visualization
* Tokern/Recce/Spline (optional) – Additional open-source lineage toolkits for inspiration or integration

To build 
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
Snowflake features and references
* Snowflake Native Apps framework: packaging, secure deployment, and distribution to consumers snowflake.com.
* Horizon Catalog and governance: discovery, classification, policies, and monitoring docs.snowflake.com, plus hands-on quickstart for roles/personas and setup quickstarts.snowflake.com.
* Built-in lineage in Snowsight (object-level) to complement or deep-link from your app docs.snowflake.com.
* Context: third-party native observability apps (e.g., Metaplane pioneered Snowflake-native approach) metaplane.dev.
Core objects and queries
1. Lineage materialization
* Consume QUERY_HISTORY and ACCESS_HISTORY to build a lineage edge table:
    * Parse query text for column-level mappings (SELECT list, aliases, UDFs/UDAFs). For complex SQL, use Snowflake SQL parser logic in a Python stored procedure or apply pattern rules for common transforms.
    * Store edges: source_object, source_column, target_object, target_column, query_id, timestamp.
* Join with OBJECT_DEPENDENCIES/INFORMATION_SCHEMA for view dependencies.
* Optional: enrich with Horizon tags (e.g., PII classification) to flag sensitive flows.
1. Role-access lineage
* GRANTS_TO_ROLES / GRANTS_TO_USERS from ACCOUNT_USAGE and INFORMATION_SCHEMA to map roles -> objects and privileges.
* ACCESS_HISTORY to connect roles/users -> actual accessed objects and columns.
* Build a graph: role -> privilege -> object -> columns; plus actual usage edges with counts.
* Policies: detect excessive privileges vs. actual usage, sensitive-tag exposure, dormant grants.
1. FinOps metrics
* Compute and persist fact tables:
    * Warehouse cost/utilization: ORGANIZATION_USAGE.METERING_DAILY_HISTORY + ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY.
    * Query cost signals: ACCOUNT_USAGE.QUERY_HISTORY (bytes scanned, partitions pruned, spilled, queued).
    * Storage: ORGANIZATION_USAGE.STORAGE_DAILY_HISTORY and ACCOUNT_USAGE.TABLE_STORAGE_METRICS.
    * Per-dimension rollups: by warehouse, role, user, database/schema, task, query_tag, query_type.
* KPIs:
    * $ per query / per TB scanned.
    * Warehouse efficiency: avg/peak concurrency, queue time %, auto-suspend gaps, auto-resume frequency.
    * Storage growth: active vs. time travel vs. failsafe, orphaned objects, unused clones.
    * Right-sizing: candidate warehouses to scale down, split, or use multi-cluster.
    * Policy-based alerts: budget thresholds, anomalous spikes.
Security and packaging for a Native App
* Use application package with versioned schemas, secure views, and UDFs.
* Avoid exfiltration: only expose results via secure views and tables in the application’s schema. Leverage shared access to ACCOUNT_USAGE/ORGANIZATION_USAGE as allowed by the Native Apps framework.
* Provide setup sproc to request required privileges and create needed application roles.
* Offer opt-in for parsing query text for column-level lineage (document data handling).
* Provide configuration table for customers to set:
    * Which databases/schemas to index.
    * Data classification levels to monitor.
    * Cost centers (via TAGS) to attribute charges.
Example implementation sketch
* Schemas: APP_CONFIG, APP_STAGE, APP_LINEAGE, APP_ACCESS, APP_FINOPS, APP_UI.
* Tasks:
    * TASK_REFRESH_LINEAGE: runs every 15 min to ingest latest QUERY_HISTORY and update lineage edges.
    * TASK_REFRESH_ACCESS: runs hourly to sync grants and ACCESS_HISTORY usage.
    * TASK_REFRESH_FINOPS: runs daily for cost/storage rollups and hourly for warehouse metering.
* Key tables:
    * APP_LINEAGE.COLUMN_EDGES(src_db, src_schema, src_obj, src_col, tgt_db, tgt_schema, tgt_obj, tgt_col, query_id, ts).
    * APP_LINEAGE.OBJECT_EDGES(src_obj, tgt_obj, relation, ts).
    * APP_ACCESS.ROLE_OBJECT_PRIVS(role, object, privilege, granted_on, granted_by).
    * APP_ACCESS.ROLE_USAGE(role, object, column, last_used, use_count, users_count).
    * APP_FINOPS.WH_COST(day, warehouse, credits, cost_usd, queries, bytes_scanned, queue_pct).
    * APP_FINOPS.STORAGE_COST(day, db, schema, object, bytes, cost_usd, classification_tag).
    * APP_FINOPS.QUERY_FACT(query_id, warehouse, user, role, query_tag, bytes_scanned, partitions_scanned, spilled, queued_sec, est_cost_usd).
* Views and dashboards:
    * Lineage graph views with filters by tag, database, time window.
    * Role-effective-access matrix and “actual usage vs grant” variance.
    * FinOps scorecards and savings recommendations.
Developer steps to build and distribute
1. Prototype lineage using Snowsight lineage and ACCOUNT_USAGE
* Validate lineage coverage and column parsing; provide Snowsight deep links for each object docs.snowflake.com.
1. Governance integration via Horizon
* Pull catalog metadata, tags, and ownership; display trust indicators and owners in the app docs.snowflake.com.
* Use the Horizon quickstart to model roles/personas for evaluation quickstarts.snowflake.com.
1. Package as a Snowflake Native App
* Follow the Native Apps quickstarts to define the application package, setup scripts, and secure artifacts snowflake.com.
* Implement upgrade-safe versioning and migration scripts.
1. Performance and costs
* Use incremental ingestion from ACCOUNT_USAGE/ACCESS_HISTORY.
* Partition tables by day and object; cluster by object and ts.
* Guardrail configs: max history window, object allowlist, sampling options.
1. Publishing
* Provide a free “lite” mode with object-level lineage and summary FinOps.
* Paid tier with column-level lineage parsing, anomaly detection, and custom alerts.
* Consider marketplace distribution and metering events.
Notes and caveats
* Column-level lineage quality depends on SQL parsing coverage; document unsupported patterns and UDF handling.
* Access to some ORGANIZATION_USAGE views may require org-level privileges in the target account.
* Align cost estimation to Snowflake pricing and customer contracts; show credits and optionally derive USD with customer-provided rate.
If helpful, I can provide starter DDL, a Python sproc template for column-level lineage parsing, and a minimal Native App package skeleton next. References: snowflake.com, docs.snowflake.com, docs.snowflake.com, quickstarts.snowflake.com, metaplane.dev.






Use this githrepo open source for reference
https://github.com/open-metadata/OpenMetadata
https://github.com/OpenLineage/OpenLineage
https://github.com/elementary-data/elementary
https://github.com/datachecks/dcs-core

build this native apps examples
https://github.com/snowflakedb/native-apps-examples
https://github.com/Snowflake-Labs/sfguide-getting-started-with-native-apps
https://github.com/Snowflake-Labs/sfguide-native-apps-chairlift
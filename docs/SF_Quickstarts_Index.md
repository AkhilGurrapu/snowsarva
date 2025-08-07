# Snowflake Quickstarts – Curated Guide Index

Source Commit: <https://github.com/Snowflake-Labs/sfquickstarts/commit/8cab51dce55011d1a626648de2c1a14f8614ca85>

This document provides a categorized index of the guides available in the `sfquickstarts/site/sfguides/src/` directory. These quickstarts offer practical, hands-on examples for various Snowflake features and partner integrations.

---

## AI & Machine Learning
| Guide | Description | Relevance to SnowSarva |
|-------|-------------|------------------------|
|`a_faster_path_to_operational_ai_with_continual_and_snowflake.md`|Operational AI with Continual.ai.|Patterns for ML model deployment in **Quality Engine**.|
|`automated_machine_learning_with_snowflake_and_datarobot.md`|AutoML integration with DataRobot.|Informs MLOps lifecycle for custom models.|
|`data_science_with_dataiku.md`|End-to-end data science projects with Dataiku.|Example of external ML tool integration.|
|`end_to_end_machine_learning_with_dataiku.md`|Another Dataiku E2E example.|See above.|

## Data Engineering & ELT/ETL
| Guide | Description | Relevance to SnowSarva |
|-------|-------------|------------------------|
|`accelerating_data_teams_with_snowflake_and_dbt_cloud_hands_on_lab.md`|Hands-on-lab for dbt Cloud.|Core patterns for **Lineage Tracker** and **ETL/ELT Automation**.|
|`data_teams_with_dbt_cloud.md`|High-level guide to dbt Cloud.|See above.|
|`data_teams_with_dbt_core.md`|Guide for open-source dbt Core.|See above; useful for self-hosted runners.|
|`cloud_native_data_engineering_with_matillion_and_snowflake.md`|ETL with Matillion.|Example of parsing lineage from a 3rd party ETL tool.|
|`data_engineering_with_apache_airflow.md`|Orchestration using Airflow.|Alternative scheduling patterns for Snowpark Tasks.|
|`database_modeling_with_sqldbm.md`|Data modeling with SqlDBM.|Informs the **Schema Migration Assistant** by showing how external modeling tools work.|
|`getting_started_datameer.md`|Data transformation with Datameer.|Another data transformation tool integration example.|

## API & Application Development
| Guide | Description | Relevance to SnowSarva |
|-------|-------------|------------------------|
|`a_postman_tutorial_for_snowflake_sql_api.md`|Using the Snowflake SQL API via Postman.|Foundation for building external clients against SnowSarva's API.|
|`build_a_custom_api_in_java_on_aws.md`|Building a custom API with Java on AWS.|Architectural patterns for the **API & Interface Layer**.|
|`build_a_custom_api_in_python_on_aws.md`|Building a custom API with Python on AWS.|See above. Closer to SnowSarva's tech stack (FastAPI in SPCS).|
|`data_app.md` / `data_apps_summit_lab.md`|Building data applications on Snowflake.|Core concepts for Native App development.|
|`external-functions-aws.md`|Using External Functions with AWS Lambda.|Pattern for invoking external logic if SPCS is not suitable.|
|`getting_started_external_functions_azure.md`|Using External Functions with Azure Functions.|See above.|

## Performance & Cost Management
| Guide | Description | Relevance to SnowSarva |
|-------|-------------|------------------------|
|`determining_warehouse_size.md`|A guide to right-sizing virtual warehouses.|Directly informs the logic for the **Cost Management** & **Query Performance Advisor** modules.|

## BI & Security
| Guide | Description | Relevance to SnowSarva |
|-------|-------------|------------------------|
|`attaining_consumer_insights_with_snowflake_microsoft_power_bi.md`|Connecting Power BI for analytics.|Example of a BI tool consuming data; informs API design.|
|`build_2021_journey_to_processing_pii.md`|Handling Personally Identifiable Information.|Security patterns for the **Governance & Access-Control Auditor**.|
|`cross_cloud_business_continuity.md`|BCP/DR strategies with replication.|Advanced feature for a future version of SnowSarva.| 
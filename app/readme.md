# Snowsarva - Data Observability and Cost Management Platform

Snowsarva is a comprehensive Snowflake Native Application that provides data observability, lineage tracking, and cost management capabilities. Built with modern React frontend and Python backend, it runs entirely within your Snowflake environment using Container Services.

## Features

### 🔍 Data Lineage and Observability
- **Column-level lineage** tracking across databases and schemas
- **Interactive lineage visualization** with drill-down capabilities
- **Impact analysis** for understanding downstream effects of changes
- **Real-time processing** of query history for lineage extraction
- **Integration** with dbt artifacts and external metadata sources

### 💰 Cost Management and FinOps
- **Real-time cost monitoring** with warehouse utilization tracking
- **Budget management** with automated alerts and forecasting
- **Query performance analysis** with optimization recommendations
- **Storage cost breakdown** including time travel and fail-safe
- **AI-powered optimization** using Snowflake Cortex

### 🔐 Access Control and Governance
- **Role-based access analysis** and privilege tracking
- **Usage monitoring** with compliance reporting
- **Data classification** and sensitive data identification
- **Audit trails** for data access and modifications

### 📊 Advanced Analytics
- **Anomaly detection** for cost and performance patterns
- **Predictive forecasting** for budget planning
- **Multi-dimensional analysis** by role, user, department
- **Executive dashboards** with KPI tracking

## Getting Started

### Prerequisites
- Snowflake account with ACCOUNTADMIN privileges
- Access to ACCOUNT_USAGE and ORGANIZATION_USAGE shares
- Sufficient credits for compute pool operation

### Installation

1. **Install the Native App**
   ```sql
   -- Install from your application package
   CREATE APPLICATION snowsarva FROM APPLICATION PACKAGE snowsarva_app_pkg;
   ```

2. **Grant Required Privileges**
   ```sql
   -- Grant access to account usage views
   GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION snowsarva;
   
   -- Grant access to your databases for lineage analysis
   GRANT USAGE ON DATABASE your_database TO APPLICATION snowsarva;
   GRANT SELECT ON ALL TABLES IN DATABASE your_database TO APPLICATION snowsarva;
   ```

3. **Configure Database References**
   ```sql
   -- Add database references for lineage analysis
   ALTER APPLICATION snowsarva ADD DATABASE REFERENCE your_database_ref FROM your_database;
   ```

4. **Start the Application**
   ```sql
   -- Start Snowsarva services
   CALL snowsarva.config.start_app('snowsarva_pool', 'snowsarva_warehouse');
   ```

5. **Access the UI**
   ```sql
   -- Get the application URL
   SELECT snowsarva.config.app_url();
   ```

### Configuration

Configure the application through the CONFIG schema:

```sql
-- Enable/disable features
UPDATE snowsarva.config.app_config 
SET config_value = 'true' 
WHERE config_key = 'LINEAGE_PROCESSING_ENABLED';

-- Set cost analysis parameters
UPDATE snowsarva.config.app_config 
SET config_value = '2000' 
WHERE config_key = 'PROCESSING_BATCH_SIZE';

-- Configure budget alerts
UPDATE snowsarva.config.app_config 
SET config_value = 'your-email@company.com' 
WHERE config_key = 'BUDGET_ALERT_EMAIL';
```

## Architecture

Snowsarva follows a three-tier containerized architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   FastAPI       │    │   Nginx         │
│   Frontend      │◄──►│   Backend       │◄──►│   Router        │
│   (Port 3000)   │    │   (Port 8081)   │    │   (Port 8000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────▼───────────────────────┐
         │           Snowflake Native App                │
         │     ┌─────────────┐ ┌─────────────┐          │
         │     │  Lineage    │ │   FinOps    │          │
         │     │   Schema    │ │   Schema    │          │
         │     └─────────────┘ └─────────────┘          │
         │                                               │
         │     ┌─────────────────────────────────────┐   │
         │     │      Account Usage Views            │   │
         │     │   (Query History, Access History)   │   │
         │     └─────────────────────────────────────┘   │
         └───────────────────────────────────────────────┘
```

### Data Flow

1. **Data Ingestion**: Scheduled tasks process QUERY_HISTORY and ACCESS_HISTORY
2. **Lineage Extraction**: SQL parsing using SQLLineage for column-level dependencies
3. **Cost Analysis**: Warehouse metering and query performance analysis
4. **Storage & Caching**: Materialized views for fast query performance
5. **API Layer**: FastAPI backend provides RESTful endpoints
6. **Visualization**: React frontend with interactive charts and graphs

## API Reference

### Lineage Endpoints

- `GET /api/v1/lineage/column/{fqn}` - Get column lineage
- `GET /api/v1/lineage/table/{fqn}` - Get table lineage
- `POST /api/v1/lineage/impact-analysis` - Analyze impact of changes
- `GET /api/v1/lineage/search` - Search lineage graph

### Cost Management Endpoints

- `GET /api/v1/costs/warehouses` - Get warehouse cost metrics
- `GET /api/v1/costs/queries` - Get query cost analysis
- `POST /api/v1/costs/budgets` - Create budget configuration
- `GET /api/v1/costs/forecasts` - Get cost forecasts

### Governance Endpoints

- `GET /api/v1/access/roles` - Get role-based access analysis
- `GET /api/v1/access/usage` - Get usage tracking data
- `POST /api/v1/access/audit` - Generate audit reports

## Monitoring and Troubleshooting

### Health Checks

```sql
-- Check service status
SELECT SYSTEM$GET_SERVICE_STATUS('SNOWSARVA_SERVICE');

-- Check task status
SHOW TASKS IN SCHEMA snowsarva.lineage;

-- View processing logs
SELECT * FROM snowsarva.lineage.processing_log 
ORDER BY processed_at DESC LIMIT 100;
```

### Common Issues

1. **Service not starting**: Check compute pool status and resource allocation
2. **No lineage data**: Verify database references and processing task status
3. **Cost data missing**: Ensure ORGANIZATION_USAGE access is granted
4. **Performance issues**: Review materialized view refresh and indexing

## Support and Maintenance

### Updating Configuration

The application can be reconfigured without restart:

```sql
-- Update processing parameters
UPDATE snowsarva.config.app_config 
SET config_value = 'new_value' 
WHERE config_key = 'parameter_name';
```

### Scaling

Adjust compute pool size based on workload:

```sql
-- Scale compute pool
ALTER COMPUTE POOL snowsarva_pool SET MAX_NODES = 5;

-- Scale service instances
ALTER SERVICE snowsarva_service SET MAX_INSTANCES = 3;
```

### Backup and Recovery

Application data is stored within Snowflake schemas and benefits from:
- Automatic backups through Time Travel
- Fail-safe recovery capabilities
- Cross-region replication (if configured)

## Security Considerations

- All data processing occurs within your Snowflake account
- No data egress or external API calls
- Role-based access control for application features
- Comprehensive audit logging for all operations
- Secure container isolation through SPCS

## Version History

- **v1.0.0**: Initial release with core lineage and cost management features
- **v1.1.0**: Enhanced visualization and AI-powered recommendations (planned)
- **v1.2.0**: Advanced governance and compliance features (planned)

## License

This application is proprietary software. Contact your Snowflake administrator for licensing information.

---

For technical support, please contact your organization's Snowflake administrator or create a support ticket through the Snowflake support portal.
"""
Access lineage analyzer for roles, grants, and usage patterns.
Processes ACCOUNT_USAGE data to build comprehensive access graphs.
"""

import snowflake.snowpark.functions as f
from snowflake.snowpark.types import StructType, StructField, StringType, TimestampType, IntegerType
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional


class AccessLineageAnalyzer:
    def __init__(self, session):
        self.session = session
        
    def analyze_grants_and_privileges(self, days_back: int = 30) -> Dict[str, Any]:
        """Analyze current grants and object privileges"""
        try:
            # Query ACCOUNT_USAGE.GRANTS_TO_ROLES for role grants
            grants_df = self.session.table("snowflake.account_usage.grants_to_roles") \
                .filter(f.col('DELETED_ON').isNull()) \
                .select(
                    'CREATED_ON',
                    'ROLE',
                    'GRANTED_TO',
                    'GRANTED_BY',
                    'PRIVILEGE',
                    'GRANTED_ON_TYPE',
                    'NAME'
                )
            
            # Query OBJECT_PRIVILEGES for detailed object access
            object_privs_df = self.session.table("snowflake.account_usage.object_privileges") \
                .filter(f.col('DELETED_ON').isNull()) \
                .select(
                    'CREATED_ON',
                    'GRANTEE_NAME',
                    'GRANTEE_TYPE', 
                    'PRIVILEGE',
                    'OBJECT_TYPE',
                    'OBJECT_NAME',
                    'OBJECT_SCHEMA',
                    'OBJECT_DATABASE',
                    'GRANTED_BY'
                )
            
            grants_data = [r.as_dict() for r in grants_df.limit(10000).to_local_iterator()]
            object_privs_data = [r.as_dict() for r in object_privs_df.limit(10000).to_local_iterator()]
            
            return {
                'grants': grants_data,
                'object_privileges': object_privs_data,
                'analysis_timestamp': datetime.now().isoformat(),
                'grants_count': len(grants_data),
                'object_privileges_count': len(object_privs_data)
            }
            
        except Exception as e:
            return {'error': f'grants_analysis_failed: {str(e)}'}
    
    def analyze_access_history(self, days_back: int = 7, limit: int = 5000) -> Dict[str, Any]:
        """Enhanced access history analysis with comprehensive ACCOUNT_USAGE patterns"""
        try:
            # Enhanced ACCESS_HISTORY analysis with aggregated patterns
            access_summary = self.session.sql(f"""
                SELECT 
                    user_name,
                    role_name,
                    object_name,
                    object_domain,
                    COUNT(*) as access_count,
                    COUNT(DISTINCT query_id) as unique_queries,
                    MIN(query_start_time) as first_access,
                    MAX(query_start_time) as last_access
                FROM snowflake.account_usage.access_history 
                WHERE query_start_time >= DATEADD('day', -{days_back}, CURRENT_TIMESTAMP())
                    AND object_name IS NOT NULL
                GROUP BY user_name, role_name, object_name, object_domain
                ORDER BY access_count DESC
                LIMIT 1000
            """).collect()
            
            # User activity patterns
            user_activity = self.session.sql(f"""
                SELECT 
                    user_name,
                    COUNT(DISTINCT role_name) as roles_used,
                    COUNT(DISTINCT object_name) as objects_accessed,
                    COUNT(*) as total_accesses,
                    COUNT(DISTINCT DATE(query_start_time)) as active_days
                FROM snowflake.account_usage.access_history 
                WHERE query_start_time >= DATEADD('day', -{days_back}, CURRENT_TIMESTAMP())
                GROUP BY user_name
                ORDER BY total_accesses DESC
                LIMIT 100
            """).collect()
            
            # Role usage patterns
            role_usage = self.session.sql(f"""
                SELECT 
                    role_name,
                    COUNT(DISTINCT user_name) as users_count,
                    COUNT(DISTINCT object_name) as objects_accessed,
                    COUNT(*) as total_role_usage
                FROM snowflake.account_usage.access_history 
                WHERE query_start_time >= DATEADD('day', -{days_back}, CURRENT_TIMESTAMP())
                    AND role_name IS NOT NULL
                GROUP BY role_name
                ORDER BY total_role_usage DESC
                LIMIT 50
            """).collect()
            
            # Object popularity patterns
            object_popularity = self.session.sql(f"""
                SELECT 
                    object_name,
                    object_domain,
                    COUNT(DISTINCT user_name) as unique_users,
                    COUNT(DISTINCT role_name) as unique_roles,
                    COUNT(*) as total_accesses
                FROM snowflake.account_usage.access_history 
                WHERE query_start_time >= DATEADD('day', -{days_back}, CURRENT_TIMESTAMP())
                    AND object_name IS NOT NULL
                GROUP BY object_name, object_domain
                ORDER BY total_accesses DESC
                LIMIT 100
            """).collect()
            
            # Process results
            access_data = [r.as_dict() for r in access_summary]
            user_data = [r.as_dict() for r in user_activity]
            role_data = [r.as_dict() for r in role_usage]
            object_data = [r.as_dict() for r in object_popularity]
            
            # Legacy aggregation for backward compatibility
            role_object_access = {}
            user_role_access = {}
            
            for record in access_data:
                role = record.get('ROLE_NAME')
                user = record.get('USER_NAME')
                obj = record.get('OBJECT_NAME')
                count = record.get('ACCESS_COUNT', 1)
                
                # Track role -> object access
                if role and obj:
                    if role not in role_object_access:
                        role_object_access[role] = {}
                    role_object_access[role][obj] = count
                
                # Track user -> role usage
                if user and role:
                    if user not in user_role_access:
                        user_role_access[user] = {}
                    if role not in user_role_access[user]:
                        user_role_access[user][role] = 0
                    user_role_access[user][role] += count
            
            # Generate insights
            insights = {
                'most_active_user': user_data[0]['USER_NAME'] if user_data else None,
                'most_used_role': role_data[0]['ROLE_NAME'] if role_data else None,
                'most_accessed_object': object_data[0]['OBJECT_NAME'] if object_data else None,
                'total_unique_users': len(user_data),
                'total_active_roles': len(role_data),
                'total_accessed_objects': len(object_data)
            }
            
            return {
                'access_summary': access_data,
                'user_activity_patterns': user_data,
                'role_usage_patterns': role_data,
                'object_popularity': object_data,
                'insights': insights,
                'role_object_access': role_object_access,
                'user_role_access': user_role_access,
                'analysis_timestamp': datetime.now().isoformat(),
                'records_analyzed': len(access_data),
                'days_back': days_back,
                'data_source': 'ACCOUNT_USAGE.ACCESS_HISTORY'
            }
            
        except Exception as e:
            return {'error': f'enhanced_access_history_analysis_failed: {str(e)}'}
    
    def build_role_hierarchy(self) -> Dict[str, Any]:
        """Build role inheritance hierarchy"""
        try:
            # Query role grants to build hierarchy
            role_grants_df = self.session.table("snowflake.account_usage.grants_to_roles") \
                .filter(f.col('GRANTED_TO') == 'ROLE') \
                .filter(f.col('DELETED_ON').isNull()) \
                .select('ROLE', 'GRANTEE_NAME', 'CREATED_ON')
            
            role_grants = [r.as_dict() for r in role_grants_df.to_local_iterator()]
            
            # Build parent -> children mapping
            hierarchy = {}
            for grant in role_grants:
                parent_role = grant.get('GRANTEE_NAME')  # Role that receives the grant
                child_role = grant.get('ROLE')           # Role being granted
                
                if parent_role and child_role:
                    if parent_role not in hierarchy:
                        hierarchy[parent_role] = []
                    hierarchy[parent_role].append(child_role)
            
            return {
                'role_hierarchy': hierarchy,
                'role_grants': role_grants,
                'hierarchy_edges': len(role_grants),
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'error': f'role_hierarchy_failed: {str(e)}'}
    
    def store_access_lineage(self, grants_data: Dict, access_data: Dict, hierarchy_data: Dict) -> Dict[str, Any]:
        """Store access lineage data in app tables"""
        try:
            stored_grants = 0
            stored_usage = 0
            
            # Store role-object privileges
            if 'object_privileges' in grants_data:
                for priv in grants_data['object_privileges']:
                    try:
                        object_id = f"{priv.get('OBJECT_DATABASE', '')}.{priv.get('OBJECT_SCHEMA', '')}.{priv.get('OBJECT_NAME', '')}"
                        
                        merge_sql = f"""
                            MERGE INTO v1.role_object_priv AS target
                            USING (SELECT 
                                '{priv.get('GRANTEE_NAME', '')}' AS role_name,
                                '{object_id}' AS object_id,
                                '{priv.get('OBJECT_NAME', '')}' AS object_name,
                                '{priv.get('PRIVILEGE', '')}' AS privilege,
                                '{priv.get('CREATED_ON', '')}' AS granted_on,
                                '{priv.get('GRANTED_BY', '')}' AS grantor
                            ) AS source
                            ON target.role_name = source.role_name 
                               AND target.object_id = source.object_id 
                               AND target.privilege = source.privilege
                            WHEN NOT MATCHED THEN 
                                INSERT (role_name, object_id, object_name, privilege, granted_on, grantor)
                                VALUES (source.role_name, source.object_id, source.object_name, 
                                       source.privilege, source.granted_on, source.grantor)
                        """
                        
                        self.session.sql(merge_sql).collect()
                        stored_grants += 1
                        
                    except Exception as grant_error:
                        print(f"Error storing grant {priv}: {grant_error}")
                        continue
            
            # Store usage patterns  
            if 'role_object_access' in access_data:
                for role, objects in access_data['role_object_access'].items():
                    for obj, count in objects.items():
                        try:
                            merge_sql = f"""
                                MERGE INTO v1.usage_edges AS target
                                USING (SELECT 
                                    NULL AS user_name,
                                    '{role}' AS role_name,
                                    '{obj}' AS object_id,
                                    NULL AS column_name,
                                    {count} AS access_count,
                                    CURRENT_TIMESTAMP() AS first_seen_ts,
                                    CURRENT_TIMESTAMP() AS last_seen_ts
                                ) AS source
                                ON target.role_name = source.role_name AND target.object_id = source.object_id
                                WHEN MATCHED THEN 
                                    UPDATE SET 
                                        access_count = target.access_count + source.access_count,
                                        last_seen_ts = CURRENT_TIMESTAMP()
                                WHEN NOT MATCHED THEN 
                                    INSERT (user_name, role_name, object_id, column_name, access_count, first_seen_ts, last_seen_ts)
                                    VALUES (source.user_name, source.role_name, source.object_id, source.column_name,
                                           source.access_count, source.first_seen_ts, source.last_seen_ts)
                            """
                            
                            self.session.sql(merge_sql).collect()
                            stored_usage += 1
                            
                        except Exception as usage_error:
                            print(f"Error storing usage {role}->{obj}: {usage_error}")
                            continue
            
            return {
                'status': 'success',
                'grants_stored': stored_grants,
                'usage_patterns_stored': stored_usage,
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'status': 'error', 'error': f'access_storage_failed: {str(e)}'}
    
    def get_role_access_graph(self, role_name: str = None, object_filter: str = None) -> Dict[str, Any]:
        """Get access graph for specific role or object"""
        try:
            # Build the query with optional filters
            grants_query = "SELECT * FROM v1.role_object_priv WHERE 1=1"
            usage_query = "SELECT * FROM v1.usage_edges WHERE 1=1"
            
            if role_name:
                grants_query += f" AND UPPER(role_name) = '{role_name.upper()}'"
                usage_query += f" AND UPPER(role_name) = '{role_name.upper()}'"
                
            if object_filter:
                grants_query += f" AND UPPER(object_name) LIKE '%{object_filter.upper()}%'"
                usage_query += f" AND UPPER(object_id) LIKE '%{object_filter.upper()}%'"
            
            grants_query += " LIMIT 5000"
            usage_query += " LIMIT 5000"
            
            grants_result = self.session.sql(grants_query).collect()
            usage_result = self.session.sql(usage_query).collect()
            
            return {
                'grants': [r.as_dict() for r in grants_result],
                'usage': [r.as_dict() for r in usage_result],
                'role_filter': role_name,
                'object_filter': object_filter,
                'grants_count': len(grants_result),
                'usage_count': len(usage_result)
            }
            
        except Exception as e:
            return {'error': f'role_access_graph_failed: {str(e)}'}
    
    def analyze_sensitive_data_access(self, tags: List[str] = None) -> Dict[str, Any]:
        """Analyze access to sensitive/tagged data"""
        try:
            if not tags:
                tags = ['PII', 'SENSITIVE', 'CONFIDENTIAL', 'PERSONAL_DATA']
            
            # This would require integration with Snowflake's tag-based governance
            # For now, return a placeholder structure
            return {
                'sensitive_objects': [],
                'role_access_to_sensitive': {},
                'policy_violations': [],
                'tags_analyzed': tags,
                'analysis_timestamp': datetime.now().isoformat(),
                'note': 'Sensitive data analysis requires tag-based governance setup'
            }
            
        except Exception as e:
            return {'error': f'sensitive_data_analysis_failed: {str(e)}'}


class FinOpsAnalyzer:
    """Analyze warehouse costs, query performance, and storage metrics"""
    
    def __init__(self, session):
        self.session = session
        
    def analyze_warehouse_costs(self, days_back: int = 30) -> Dict[str, Any]:
        """Analyze warehouse usage and costs"""
        try:
            # Query WAREHOUSE_METERING_HISTORY
            metering_df = self.session.table("snowflake.account_usage.warehouse_metering_history") \
                .filter(f.col('START_TIME') >= f.dateadd('day', f.lit(-days_back), f.current_timestamp())) \
                .select(
                    'START_TIME',
                    'END_TIME', 
                    'WAREHOUSE_NAME',
                    'CREDITS_USED',
                    'CREDITS_USED_COMPUTE',
                    'CREDITS_USED_CLOUD_SERVICES'
                )
            
            metering_data = [r.as_dict() for r in metering_df.limit(10000).to_local_iterator()]
            
            # Aggregate by warehouse
            warehouse_costs = {}
            total_credits = 0
            
            for record in metering_data:
                wh = record.get('WAREHOUSE_NAME')
                credits = record.get('CREDITS_USED', 0) or 0
                
                if wh:
                    if wh not in warehouse_costs:
                        warehouse_costs[wh] = {'total_credits': 0, 'compute_credits': 0, 'cloud_services_credits': 0, 'usage_periods': 0}
                    
                    warehouse_costs[wh]['total_credits'] += credits
                    warehouse_costs[wh]['compute_credits'] += record.get('CREDITS_USED_COMPUTE', 0) or 0
                    warehouse_costs[wh]['cloud_services_credits'] += record.get('CREDITS_USED_CLOUD_SERVICES', 0) or 0
                    warehouse_costs[wh]['usage_periods'] += 1
                    
                total_credits += credits
            
            return {
                'warehouse_costs': warehouse_costs,
                'total_credits_used': total_credits,
                'raw_metering_records': metering_data,
                'days_analyzed': days_back,
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'error': f'warehouse_cost_analysis_failed: {str(e)}'}
    
    def analyze_query_costs(self, days_back: int = 7, limit: int = 1000) -> Dict[str, Any]:
        """Analyze individual query costs and performance"""
        try:
            # Query QUERY_HISTORY for cost analysis
            query_df = self.session.table("snowflake.account_usage.query_history") \
                .filter(f.col('START_TIME') >= f.dateadd('day', f.lit(-days_back), f.current_timestamp())) \
                .filter(f.col('EXECUTION_STATUS') == 'SUCCESS') \
                .select(
                    'QUERY_ID',
                    'START_TIME',
                    'END_TIME',
                    'WAREHOUSE_NAME',
                    'USER_NAME',
                    'ROLE_NAME',
                    'EXECUTION_TIME',
                    'COMPILATION_TIME',
                    'QUEUED_PROVISIONING_TIME',
                    'QUEUED_REPAIR_TIME', 
                    'QUEUED_OVERLOAD_TIME',
                    'BYTES_SCANNED',
                    'BYTES_WRITTEN',
                    'BYTES_SPILLED_TO_LOCAL_STORAGE',
                    'BYTES_SPILLED_TO_REMOTE_STORAGE',
                    'CREDITS_USED_CLOUD_SERVICES'
                ) \
                .limit(limit)
            
            query_data = [r.as_dict() for r in query_df.to_local_iterator()]
            
            # Analyze patterns
            user_costs = {}
            role_costs = {}
            expensive_queries = []
            
            for record in query_data:
                user = record.get('USER_NAME')
                role = record.get('ROLE_NAME') 
                exec_time = record.get('EXECUTION_TIME', 0) or 0
                bytes_scanned = record.get('BYTES_SCANNED', 0) or 0
                credits = record.get('CREDITS_USED_CLOUD_SERVICES', 0) or 0
                
                # Track user costs (estimated by execution time and bytes scanned)
                if user:
                    if user not in user_costs:
                        user_costs[user] = {'queries': 0, 'total_exec_time': 0, 'total_bytes_scanned': 0}
                    user_costs[user]['queries'] += 1
                    user_costs[user]['total_exec_time'] += exec_time
                    user_costs[user]['total_bytes_scanned'] += bytes_scanned
                
                # Track role costs
                if role:
                    if role not in role_costs:
                        role_costs[role] = {'queries': 0, 'total_exec_time': 0, 'total_bytes_scanned': 0}
                    role_costs[role]['queries'] += 1
                    role_costs[role]['total_exec_time'] += exec_time
                    role_costs[role]['total_bytes_scanned'] += bytes_scanned
                
                # Track expensive queries (top 10% by execution time)
                if exec_time > 60000:  # > 1 minute
                    expensive_queries.append({
                        'query_id': record.get('QUERY_ID'),
                        'user': user,
                        'role': role,
                        'warehouse': record.get('WAREHOUSE_NAME'),
                        'execution_time': exec_time,
                        'bytes_scanned': bytes_scanned,
                        'start_time': record.get('START_TIME')
                    })
            
            # Sort expensive queries by execution time
            expensive_queries.sort(key=lambda x: x['execution_time'], reverse=True)
            
            return {
                'user_costs': user_costs,
                'role_costs': role_costs,
                'expensive_queries': expensive_queries[:50],  # Top 50
                'total_queries_analyzed': len(query_data),
                'days_analyzed': days_back,
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'error': f'query_cost_analysis_failed: {str(e)}'}
    
    def analyze_storage_costs(self) -> Dict[str, Any]:
        """Analyze storage costs and usage patterns"""
        try:
            # Query TABLE_STORAGE_METRICS
            storage_df = self.session.table("snowflake.account_usage.table_storage_metrics") \
                .select(
                    'ID',
                    'TABLE_NAME',
                    'TABLE_SCHEMA',
                    'TABLE_DATABASE',
                    'ACTIVE_BYTES',
                    'TIME_TRAVEL_BYTES',
                    'FAILSAFE_BYTES',
                    'RETAINED_FOR_CLONE_BYTES'
                )
            
            storage_data = [r.as_dict() for r in storage_df.limit(5000).to_local_iterator()]
            
            # Aggregate by database and schema
            database_storage = {}
            schema_storage = {}
            total_storage = {'active': 0, 'time_travel': 0, 'failsafe': 0, 'clone': 0}
            
            for record in storage_data:
                db = record.get('TABLE_DATABASE')
                schema = record.get('TABLE_SCHEMA')
                active = record.get('ACTIVE_BYTES', 0) or 0
                tt = record.get('TIME_TRAVEL_BYTES', 0) or 0
                fs = record.get('FAILSAFE_BYTES', 0) or 0
                clone = record.get('RETAINED_FOR_CLONE_BYTES', 0) or 0
                
                # Database-level aggregation
                if db:
                    if db not in database_storage:
                        database_storage[db] = {'active': 0, 'time_travel': 0, 'failsafe': 0, 'clone': 0, 'tables': 0}
                    database_storage[db]['active'] += active
                    database_storage[db]['time_travel'] += tt
                    database_storage[db]['failsafe'] += fs
                    database_storage[db]['clone'] += clone
                    database_storage[db]['tables'] += 1
                
                # Schema-level aggregation
                schema_key = f"{db}.{schema}" if db and schema else None
                if schema_key:
                    if schema_key not in schema_storage:
                        schema_storage[schema_key] = {'active': 0, 'time_travel': 0, 'failsafe': 0, 'clone': 0, 'tables': 0}
                    schema_storage[schema_key]['active'] += active
                    schema_storage[schema_key]['time_travel'] += tt
                    schema_storage[schema_key]['failsafe'] += fs
                    schema_storage[schema_key]['clone'] += clone
                    schema_storage[schema_key]['tables'] += 1
                
                # Total aggregation
                total_storage['active'] += active
                total_storage['time_travel'] += tt
                total_storage['failsafe'] += fs
                total_storage['clone'] += clone
            
            return {
                'database_storage': database_storage,
                'schema_storage': schema_storage,
                'total_storage': total_storage,
                'tables_analyzed': len(storage_data),
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'error': f'storage_cost_analysis_failed: {str(e)}'}
    
    def store_finops_data(self, warehouse_data: Dict, query_data: Dict, storage_data: Dict) -> Dict[str, Any]:
        """Store FinOps analysis in app tables"""
        try:
            stored_warehouse_records = 0
            stored_query_records = 0
            stored_storage_records = 0
            
            # Store warehouse cost data
            if 'warehouse_costs' in warehouse_data:
                for wh_name, costs in warehouse_data['warehouse_costs'].items():
                    try:
                        merge_sql = f"""
                            MERGE INTO v1.fact_warehouse_cost AS target
                            USING (SELECT 
                                CURRENT_DATE() AS day,
                                '{wh_name}' AS warehouse_name,
                                {costs['total_credits']} AS credits_used,
                                {costs['total_credits'] * 2.0} AS dollars_est,
                                {costs['usage_periods']} AS queries_executed,
                                0.0 AS queue_pct
                            ) AS source
                            ON target.day = source.day AND target.warehouse_name = source.warehouse_name
                            WHEN MATCHED THEN 
                                UPDATE SET 
                                    credits_used = source.credits_used,
                                    dollars_est = source.dollars_est,
                                    queries_executed = source.queries_executed
                            WHEN NOT MATCHED THEN 
                                INSERT (day, warehouse_name, credits_used, dollars_est, queries_executed, queue_pct)
                                VALUES (source.day, source.warehouse_name, source.credits_used, source.dollars_est,
                                       source.queries_executed, source.queue_pct)
                        """
                        
                        self.session.sql(merge_sql).collect()
                        stored_warehouse_records += 1
                        
                    except Exception as wh_error:
                        print(f"Error storing warehouse cost {wh_name}: {wh_error}")
                        continue
            
            return {
                'status': 'success',
                'warehouse_records_stored': stored_warehouse_records,
                'query_records_stored': stored_query_records,
                'storage_records_stored': stored_storage_records
            }
            
        except Exception as e:
            return {'status': 'error', 'error': f'finops_storage_failed: {str(e)}'}
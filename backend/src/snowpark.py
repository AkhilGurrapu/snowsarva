from flask import Blueprint, request, abort, make_response, jsonify
import os
import datetime
import snowflake.snowpark.functions as f
from typing import List, Dict, Any
import json
import tempfile
from lineage_parser import SnowflakeLineageExtractor, DbtArtifactsProcessor
from access_analyzer import AccessLineageAnalyzer, FinOpsAnalyzer
from data_quality_monitor import DataQualityMonitor, MonitorConfig, AlertManager
from notification_system import NotificationManager, AlertNotification

# Choose connector based on environment to keep prod and local isolated
# Default to SPCS connector; local-dev.sh sets USE_LOCAL_CONNECTOR=1
use_local = os.getenv('USE_LOCAL_CONNECTOR', '0') in ('1', 'true', 'True')
if use_local:
    from spcs_helpers.connection_local import session as snow_session
else:
    from spcs_helpers.connection_spcs import session as snow_session

# Lazy session initialization with resiliency for dev
_session = None
_last_session_error = None

def get_session():
    global _session
    global _last_session_error
    if _session is not None:
        return _session
    try:
        _session = snow_session()
        _last_session_error = None
        return _session
    except Exception as e:
        # In dev, avoid crashing; return None so handlers can respond gracefully
        if os.getenv('DEV_MODE') in ('1','true','True'):
            print(f"Snowflake session init failed: {e}")
        _last_session_error = str(e)
        return None

def reset_session():
    global _session, _last_session_error
    _session = None
    _last_session_error = None
    return get_session()

snowpark = Blueprint('snowpark', __name__)

dateformat = '%Y-%m-%d'

@snowpark.route('/metrics')
def metrics():
    use_account_usage = os.getenv('USE_ACCOUNT_USAGE', '1') in ('1', 'true', 'True')
    path = 'ACCOUNT_USAGE' if use_account_usage else 'SHOW'
    try:
        databases_count = None
        schemas_count = None
        s = get_session()
        if s is None:
            raise RuntimeError('no_session')

        if use_account_usage:
            try:
                databases_count = s.table("snowflake.account_usage.databases").count()
                schemas_count = s.table("snowflake.account_usage.schemata").count()
            except Exception as e:
                path = 'SHOW'
                err = str(e)
                if 'Session no longer exists' in err or 'invalid session' in err:
                    s = reset_session() or s
                try:
                    s.sql("SHOW DATABASES").collect()
                    databases_count = s.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                    # SHOW SCHEMAS might be restricted; guard with try/except and return 0 if denied
                    try:
                        s.sql("SHOW SCHEMAS IN ACCOUNT").collect()
                        schemas_count = s.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                    except Exception:
                        schemas_count = 0
                except Exception as e2:
                    return make_response(jsonify({
                        'databases': 0,
                        'schemas': 0,
                        'path': 'ERROR',
                        'error': f"metrics_show_failed: {str(e2)}"
                    }))
        else:
            try:
                s.sql("SHOW DATABASES").collect()
                databases_count = s.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                try:
                    s.sql("SHOW SCHEMAS IN ACCOUNT").collect()
                    schemas_count = s.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                except Exception:
                    schemas_count = 0
            except Exception as e3:
                # Try once with a fresh session
                if 'Session no longer exists' in str(e3) or 'invalid session' in str(e3):
                    s = reset_session() or s
                    try:
                        s.sql("SHOW DATABASES").collect()
                        databases_count = s.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                    except Exception:
                        databases_count = 0
                else:
                    databases_count = 0

        return make_response(jsonify({
            'databases': int(databases_count),
            'schemas': int(schemas_count),
            'path': path
        }))
    except Exception as e:
        # Never 500 in dev: return safe payload with error info
        return make_response(jsonify({
            'databases': 0,
            'schemas': 0,
            'path': 'ERROR',
            'error': f"metrics_failed: {str(e)}"
        }), 200)


@snowpark.route('/metrics/enhanced')
def metrics_enhanced():
    """Enhanced metrics using comprehensive SNOWFLAKE.ACCOUNT_USAGE data"""
    try:
        s = get_session()
        if s is None:
            raise RuntimeError('no_session')

        # Test ACCOUNT_USAGE access first
        try:
            s.table("snowflake.account_usage.databases").limit(1).collect()
            account_usage_available = True
        except Exception:
            account_usage_available = False

        if account_usage_available:
            try:
                # Database and schema counts
                databases_count = s.table("snowflake.account_usage.databases").filter(f.col('DELETED').isNull()).count()
                schemas_count = s.table("snowflake.account_usage.schemata").filter(f.col('DELETED').isNull()).count()
                
                # Table and view counts
                tables_count = s.table("snowflake.account_usage.tables").filter(f.col('DELETED').isNull()).count()
                views_count = s.table("snowflake.account_usage.views").filter(f.col('DELETED').isNull()).count()
                
                # Warehouse metrics (last 7 days)
                warehouse_metrics = s.sql("""
                    SELECT 
                        COUNT(DISTINCT warehouse_name) as active_warehouses,
                        ROUND(SUM(credits_used), 2) as total_credits_last_7d,
                        ROUND(AVG(credits_used), 4) as avg_credits_per_hour,
                        ROUND(SUM(credits_used) * 2.00, 2) as estimated_cost_usd
                    FROM snowflake.account_usage.warehouse_metering_history 
                    WHERE start_time >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                """).collect()[0].as_dict()
                
                # Query activity (last 24 hours)
                query_metrics = s.sql("""
                    SELECT 
                        COUNT(*) as queries_last_24h,
                        COUNT(DISTINCT user_name) as active_users,
                        ROUND(AVG(total_elapsed_time), 0) as avg_query_time_ms,
                        SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) as failed_queries,
                        ROUND(AVG(bytes_scanned) / POWER(1024, 3), 2) as avg_gb_scanned
                    FROM snowflake.account_usage.query_history 
                    WHERE start_time >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
                """).collect()[0].as_dict()
                
                # Storage metrics (latest available)
                storage_metrics = s.sql("""
                    SELECT 
                        ROUND(SUM(storage_bytes) / POWER(1024, 4), 3) as storage_tb,
                        ROUND(SUM(stage_bytes) / POWER(1024, 4), 3) as stage_storage_tb,
                        ROUND(SUM(failsafe_bytes) / POWER(1024, 4), 3) as failsafe_storage_tb,
                        MAX(usage_date) as latest_date
                    FROM snowflake.account_usage.storage_usage 
                    WHERE usage_date >= DATEADD('day', -7, CURRENT_DATE())
                """).collect()[0].as_dict()
                
                # User activity (last 30 days)
                user_metrics = s.sql("""
                    SELECT 
                        COUNT(DISTINCT user_name) as total_users,
                        COUNT(DISTINCT CASE WHEN is_success = 'YES' THEN user_name END) as successful_login_users,
                        COUNT(*) as total_login_attempts,
                        ROUND(
                            (COUNT(DISTINCT CASE WHEN is_success = 'YES' THEN user_name END) * 100.0) / 
                            NULLIF(COUNT(DISTINCT user_name), 0), 1
                        ) as login_success_rate
                    FROM snowflake.account_usage.login_history 
                    WHERE event_timestamp >= DATEADD('day', -30, CURRENT_TIMESTAMP())
                """).collect()[0].as_dict()
                
                # Role and privilege counts
                security_metrics = s.sql("""
                    SELECT 
                        COUNT(DISTINCT grantee_name) as total_roles,
                        COUNT(DISTINCT name) as objects_with_grants,
                        COUNT(*) as total_active_grants
                    FROM snowflake.account_usage.grants_to_roles 
                    WHERE modified_on IS NOT NULL
                """).collect()[0].as_dict()
                
                return make_response(jsonify({
                    'databases': databases_count,
                    'schemas': schemas_count,
                    'tables': tables_count,
                    'views': views_count,
                    'warehouse_metrics': warehouse_metrics,
                    'query_metrics': query_metrics,
                    'storage_metrics': storage_metrics,
                    'user_metrics': user_metrics,
                    'security_metrics': security_metrics,
                    'data_source': 'ACCOUNT_USAGE',
                    'timestamp': datetime.datetime.now().isoformat()
                }))
                
            except Exception as e:
                return make_response(jsonify({
                    'error': f'account_usage_query_failed: {str(e)}',
                    'data_source': 'ACCOUNT_USAGE_FAILED'
                }), 200)
        else:
            # Fallback to basic metrics
            return make_response(jsonify({
                'error': 'account_usage_not_available',
                'message': 'ACCOUNT_USAGE access not granted. Please grant IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE.',
                'data_source': 'UNAVAILABLE'
            }), 200)

    except Exception as e:
        return make_response(jsonify({
            'error': f'enhanced_metrics_failed: {str(e)}',
            'data_source': 'ERROR'
        }), 200)


@snowpark.route('/health')
def health():
    s = get_session()
    return make_response(jsonify({'ok': True, 'has_session': bool(s)}))

@snowpark.route('/debug/session')
def debug_session():
    s = get_session()
    return make_response(jsonify({
        'has_session': bool(s),
        'last_error': _last_session_error
    }))

@snowpark.route('/top_clerks')
def top_clerks():
    sdt_str = request.args.get('start_range') or '2024-01-01'
    edt_str = request.args.get('end_range') or '2024-12-31'
    topn_str = request.args.get('topn') or '10'
    try:
        sdt = datetime.datetime.strptime(sdt_str, dateformat)
        edt = datetime.datetime.strptime(edt_str, dateformat)
        topn = int(topn_str)
    except Exception:
        abort(400, "Invalid arguments.")
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify([]))
        df = s.table("snowflake.account_usage.query_history") \
            .filter(f.col('START_TIME') >= sdt) \
            .filter(f.col('START_TIME') <= edt) \
            .filter(f.col('USER_NAME').isNotNull()) \
            .group_by(f.col('USER_NAME')) \
            .agg(f.sum(f.col('TOTAL_ELAPSED_TIME')).as_('TOTAL_ELAPSED_TIME')) \
            .select(
                f.col('USER_NAME').as_('O_CLERK'),
                f.col('TOTAL_ELAPSED_TIME').as_('CLERK_TOTAL')
            ) \
            .order_by(f.col('CLERK_TOTAL').desc()) \
            .limit(topn)
        return make_response(jsonify([x.as_dict() for x in df.to_local_iterator()]))
    except Exception as e:
        abort(500, f"Error reading from Snowflake: {str(e)}")


@snowpark.route('/grants/status')
def grants_status():
    try:
        # SHOW PRIVILEGES IN APPLICATION <app_name> only works outside app; within, list requested names
        # Here, test if ACCOUNT_USAGE access works; if not, return required grants snippet
        can_account_usage = False
        try:
            s = get_session()
            if s is not None:
                s.table("snowflake.account_usage.databases").limit(1).collect()
            can_account_usage = True
        except Exception:
            can_account_usage = False

        required = [
            {
                "privilege": "IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE",
                "granted": can_account_usage,
                "grant_sql": "GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION <your_app_name>;"
            },
            {
                "privilege": "USAGE ON COMPUTE POOL <pool>",
                "granted": None,
                "grant_sql": "GRANT USAGE ON COMPUTE POOL <pool> TO APPLICATION <your_app_name>;"
            },
            {
                "privilege": "BIND SERVICE ENDPOINT ON ACCOUNT",
                "granted": None,
                "grant_sql": "GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO APPLICATION <your_app_name>;"
            },
            {
                "privilege": "USAGE ON WAREHOUSE <warehouse>",
                "granted": None,
                "grant_sql": "GRANT USAGE ON WAREHOUSE <warehouse> TO APPLICATION <your_app_name>;"
            }
        ]
        return make_response(jsonify({"required": required}))
    except Exception as e:
        abort(500, f"Error determining grant status: {str(e)}")


# =============================
# MVP endpoints for lineage/access/finops backed by v1.* tables
# =============================


@snowpark.route('/lineage/object')
def lineage_object():
    """Return upstream/downstream edges for a given object (and optional column)."""
    name = request.args.get('name')
    column = request.args.get('column')
    depth_str = request.args.get('depth') or '1'
    try:
        depth = int(depth_str)
    except Exception:
        abort(400, 'Invalid depth')

    if not name:
        abort(400, 'Missing required param: name (format: DB.SCHEMA.OBJECT)')

    try:
        # Resolve object_id(s) from name
        s = get_session()
        if s is None:
            return make_response(jsonify({'nodes': [], 'edges': [], 'info': 'no_session'}))
        nodes = s.table('app_public.lineage_nodes') \
            .filter(f.upper(f.col('OBJECT_NAME')) == name.upper())
        if column:
            nodes = nodes.filter(f.upper(f.col('COLUMN_NAME')) == column.upper())

        node_ids = [r['OBJECT_ID'] for r in nodes.select('OBJECT_ID').to_local_iterator()]
        if not node_ids:
            return make_response(jsonify({
                'nodes': [],
                'edges': [],
                'info': 'No matching nodes found'
            }))

        # Start with direct edges; simple 1..depth expansion (MVP)
        edges = s.table('app_public.lineage_edges') \
            .filter((f.col('SRC_OBJECT_ID').isin(node_ids)) | (f.col('TGT_OBJECT_ID').isin(node_ids)))

        # For depth>1, iteratively expand by joining edges to nodes
        current_ids = set(node_ids)
        all_edge_rows: List[Dict[str, Any]] = [r.as_dict() for r in edges.to_local_iterator()]
        all_node_ids = set(current_ids)

        for _ in range(max(0, depth - 1)):
            if not all_edge_rows:
                break
            next_ids = set()
            for e in all_edge_rows:
                if e.get('SRC_OBJECT_ID') in current_ids:
                    next_ids.add(e.get('TGT_OBJECT_ID'))
                if e.get('TGT_OBJECT_ID') in current_ids:
                    next_ids.add(e.get('SRC_OBJECT_ID'))
            next_ids = next_ids - all_node_ids
            if not next_ids:
                break
            all_node_ids |= next_ids
            current_ids = next_ids
            extra_edges = s.table('app_public.lineage_edges') \
                .filter((f.col('SRC_OBJECT_ID').isin(list(current_ids))) | (f.col('TGT_OBJECT_ID').isin(list(current_ids))))
            all_edge_rows.extend([r.as_dict() for r in extra_edges.to_local_iterator()])

        # Return nodes and edges limited to involved ids
        involved_ids = list(all_node_ids)
        out_nodes = s.table('app_public.lineage_nodes') \
            .filter(f.col('OBJECT_ID').isin(involved_ids))
        return make_response(jsonify({
            'nodes': [r.as_dict() for r in out_nodes.to_local_iterator()],
            'edges': all_edge_rows
        }))
    except Exception as e:
        # In dev, return an empty result with an error message instead of HTTP 500
        return make_response(jsonify({
            'nodes': [],
            'edges': [],
            'error': f'lineage_failed: {str(e)}'
        }), 200)


@snowpark.route('/lineage/impact')
def lineage_impact():
    """Return downstream consumers for an object (impact analysis)."""
    name = request.args.get('name')
    if not name:
        abort(400, 'Missing required param: name')
    depth_str = request.args.get('depth') or '2'
    try:
        depth = int(depth_str)
    except Exception:
        abort(400, 'Invalid depth')
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'nodes': [], 'edges': [], 'info': 'no_session'}))
        seed_nodes = s.table('app_public.lineage_nodes') 
        seed_nodes = seed_nodes.filter(f.upper(f.col('OBJECT_NAME')) == name.upper())
        seed_ids = [r['OBJECT_ID'] for r in seed_nodes.select('OBJECT_ID').to_local_iterator()]
        if not seed_ids:
            return make_response(jsonify({'nodes': [], 'edges': []}))
        # Only follow downstream (SRC -> TGT)
        current_ids = set(seed_ids)
        all_node_ids = set(seed_ids)
        all_edge_rows: List[Dict[str, Any]] = []
        for _ in range(max(1, depth)):
            e_df = s.table('app_public.lineage_edges').filter(f.col('SRC_OBJECT_ID').isin(list(current_ids)))
            e_rows = [r.as_dict() for r in e_df.to_local_iterator()]
            all_edge_rows.extend(e_rows)
            next_ids = {e['TGT_OBJECT_ID'] for e in e_rows if e.get('TGT_OBJECT_ID')}
            next_ids = next_ids - all_node_ids
            if not next_ids:
                break
            all_node_ids |= next_ids
            current_ids = next_ids
        out_nodes = s.table('app_public.lineage_nodes').filter(f.col('OBJECT_ID').isin(list(all_node_ids)))
        return make_response(jsonify({'nodes': [r.as_dict() for r in out_nodes.to_local_iterator()], 'edges': all_edge_rows}))
    except Exception as e:
        return make_response(jsonify({
            'nodes': [],
            'edges': [],
            'error': f'impact_failed: {str(e)}'
        }), 200)


# =============================
# Enhanced lineage endpoints with SQL parsing
# =============================

@snowpark.route('/lineage/sql-parse', methods=['GET', 'POST'])
def lineage_sql_parse():
    """Parse SQL text for column-level lineage using sqlglot"""
    if request.method == 'POST':
        sql_text = request.form.get('sql') or request.json.get('sql') if request.json else None
    else:
        sql_text = request.args.get('sql')
        
    if not sql_text:
        abort(400, 'Missing SQL text parameter')
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session', 'nodes': [], 'edges': []}))
            
        extractor = SnowflakeLineageExtractor(s)
        result = extractor.extract_column_lineage(sql_text)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'sql_parse_failed: {str(e)}', 'nodes': [], 'edges': []}), 200)


@snowpark.route('/lineage/auto-discover')
def lineage_auto_discover():
    """Auto-discover lineage from query history"""
    limit = int(request.args.get('limit', '100'))
    days_back = int(request.args.get('days', '7'))
    store = request.args.get('store', 'false').lower() in ('true', '1')
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'nodes': [], 'edges': [], 'error': 'no_session'}))
            
        extractor = SnowflakeLineageExtractor(s)
        result = extractor.analyze_query_history_lineage(limit=limit, days_back=days_back)
        
        # Optionally store discovered lineage
        if store and 'error' not in result and len(result.get('nodes', [])) > 0:
            storage_result = extractor.store_lineage_data(result, 'QUERY_HISTORY')
            result['storage_result'] = storage_result
            
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'auto_discover_failed: {str(e)}', 'nodes': [], 'edges': []}), 200)


@snowpark.route('/lineage/enhanced-object')
def lineage_enhanced_object():
    """Enhanced object lineage using recursive SQL queries"""
    object_id = request.args.get('object_id') or request.args.get('name')
    depth = int(request.args.get('depth', '3'))
    
    if not object_id:
        abort(400, 'Missing object_id parameter')
        
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session', 'nodes': [], 'edges': []}))
            
        extractor = SnowflakeLineageExtractor(s)
        result = extractor.get_object_lineage(object_id, depth)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'enhanced_object_lineage_failed: {str(e)}'}), 200)


@snowpark.route('/lineage/dbt-upload', methods=['POST'])
def lineage_dbt_upload():
    """Upload and process dbt artifacts for lineage"""
    try:
        if 'manifest' not in request.files:
            abort(400, 'Missing manifest.json file')
            
        manifest_file = request.files['manifest']
        
        # Process the uploaded manifest
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as temp_file:
            manifest_content = manifest_file.read().decode('utf-8')
            temp_file.write(manifest_content)
            temp_file.flush()
            
            try:
                manifest_data = json.loads(manifest_content)
            except json.JSONDecodeError as e:
                return make_response(jsonify({'error': f'invalid_json: {str(e)}'}), 400)
        
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        processor = DbtArtifactsProcessor(s)
        lineage_data = processor.process_manifest_json(manifest_data)
        
        if 'error' not in lineage_data:
            # Store in database
            storage_result = processor.store_dbt_lineage(lineage_data)
            return make_response(jsonify({
                'lineage_extracted': lineage_data,
                'storage_result': storage_result
            }))
        else:
            return make_response(jsonify(lineage_data), 400)
            
    except Exception as e:
        return make_response(jsonify({'error': f'dbt_upload_failed: {str(e)}'}), 500)


@snowpark.route('/access/graph')
def access_graph():
    """Return access lineage (grants and usage) for an optional role/object filter."""
    role = request.args.get('role')
    obj = request.args.get('object')
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'grants': [], 'usage': []}))
        grants = s.table('v1.role_object_priv')
        usage = s.table('v1.usage_edges')
        if role:
            grants = grants.filter(f.upper(f.col('ROLE_NAME')) == role.upper())
            usage = usage.filter(f.upper(f.col('ROLE_NAME')) == role.upper())
        if obj:
            grants = grants.filter(f.upper(f.col('OBJECT_NAME')) == obj.upper())
            usage = usage.filter(f.upper(f.col('OBJECT_ID')) == obj.upper())
        return make_response(jsonify({
            'grants': [r.as_dict() for r in grants.limit(5000).to_local_iterator()],
            'usage': [r.as_dict() for r in usage.limit(5000).to_local_iterator()]
        }))
    except Exception as e:
        abort(500, f'Error reading access lineage: {str(e)}')


# =============================
# Enhanced access and FinOps endpoints
# =============================

@snowpark.route('/access/analyze-grants')
def access_analyze_grants():
    """Analyze current grants and privileges from ACCOUNT_USAGE"""
    days_back = int(request.args.get('days', '30'))
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session', 'grants': [], 'object_privileges': []}))
            
        analyzer = AccessLineageAnalyzer(s)
        result = analyzer.analyze_grants_and_privileges(days_back)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'grants_analysis_failed: {str(e)}'}), 200)


@snowpark.route('/access/analyze-history')
def access_analyze_history():
    """Analyze actual access patterns from ACCESS_HISTORY"""
    days_back = int(request.args.get('days', '7'))
    limit = int(request.args.get('limit', '5000'))
    store = request.args.get('store', 'false').lower() in ('true', '1')
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        analyzer = AccessLineageAnalyzer(s)
        
        # Get both grants and access history
        grants_result = analyzer.analyze_grants_and_privileges(days_back)
        access_result = analyzer.analyze_access_history(days_back, limit)
        hierarchy_result = analyzer.build_role_hierarchy()
        
        # Optionally store the analysis
        if store and 'error' not in access_result and 'error' not in grants_result:
            storage_result = analyzer.store_access_lineage(grants_result, access_result, hierarchy_result)
        else:
            storage_result = None
            
        return make_response(jsonify({
            'grants_analysis': grants_result,
            'access_analysis': access_result,
            'role_hierarchy': hierarchy_result,
            'storage_result': storage_result
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'access_history_analysis_failed: {str(e)}'}), 200)


@snowpark.route('/access/role-graph')
def access_role_graph():
    """Get access graph for specific role or object"""
    role_name = request.args.get('role')
    object_filter = request.args.get('object')
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session', 'grants': [], 'usage': []}))
            
        analyzer = AccessLineageAnalyzer(s)
        result = analyzer.get_role_access_graph(role_name, object_filter)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'role_graph_failed: {str(e)}'}), 200)


@snowpark.route('/finops/warehouse-analysis')
def finops_warehouse_analysis():
    """Analyze warehouse costs and usage patterns"""
    days_back = int(request.args.get('days', '30'))
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        analyzer = FinOpsAnalyzer(s)
        result = analyzer.analyze_warehouse_costs(days_back)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'warehouse_analysis_failed: {str(e)}'}), 200)


@snowpark.route('/finops/query-analysis')
def finops_query_analysis():
    """Analyze query costs and performance patterns"""
    days_back = int(request.args.get('days', '7'))
    limit = int(request.args.get('limit', '1000'))
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        analyzer = FinOpsAnalyzer(s)
        result = analyzer.analyze_query_costs(days_back, limit)
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'query_analysis_failed: {str(e)}'}), 200)


@snowpark.route('/finops/storage-analysis')
def finops_storage_analysis():
    """Analyze storage costs and usage patterns"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        analyzer = FinOpsAnalyzer(s)
        result = analyzer.analyze_storage_costs()
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'storage_analysis_failed: {str(e)}'}), 200)


@snowpark.route('/finops/comprehensive-analysis')
def finops_comprehensive_analysis():
    """Comprehensive FinOps analysis with storage option"""
    days_back = int(request.args.get('days', '7'))
    store = request.args.get('store', 'false').lower() in ('true', '1')
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
            
        analyzer = FinOpsAnalyzer(s)
        
        # Run all analyses
        warehouse_result = analyzer.analyze_warehouse_costs(days_back)
        query_result = analyzer.analyze_query_costs(days_back)
        storage_result = analyzer.analyze_storage_costs()
        
        # Optionally store results
        if store and all('error' not in r for r in [warehouse_result, query_result, storage_result]):
            storage_result = analyzer.store_finops_data(warehouse_result, query_result, storage_result)
        else:
            storage_result = None
            
        return make_response(jsonify({
            'warehouse_analysis': warehouse_result,
            'query_analysis': query_result,
            'storage_analysis': storage_result,
            'storage_result': storage_result,
            'days_analyzed': days_back
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'comprehensive_analysis_failed: {str(e)}'}), 200)


# =============================
# Management and status endpoints
# =============================

@snowpark.route('/admin/refresh-lineage', methods=['POST'])
def admin_refresh_lineage():
    """Manually trigger lineage data refresh"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Call the stored procedure
        result = s.sql("CALL app_public.refresh_lineage_data()").collect()
        return make_response(jsonify({
            'status': 'success',
            'message': result[0][0] if result else 'Refresh completed',
            'timestamp': datetime.datetime.now().isoformat()
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'refresh_lineage_failed: {str(e)}'}), 200)


@snowpark.route('/admin/refresh-finops', methods=['POST'])
def admin_refresh_finops():
    """Manually trigger FinOps data refresh"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Call the stored procedure
        result = s.sql("CALL app_public.refresh_finops_data()").collect()
        return make_response(jsonify({
            'status': 'success',
            'message': result[0][0] if result else 'FinOps refresh completed',
            'timestamp': datetime.datetime.now().isoformat()
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'refresh_finops_failed: {str(e)}'}), 200)


@snowpark.route('/admin/cleanup-data', methods=['POST'])
def admin_cleanup_data():
    """Manually trigger data cleanup"""
    retention_days = int(request.form.get('retention_days') or request.args.get('retention_days', '90'))
    
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Call the cleanup procedure
        result = s.sql(f"CALL app_public.cleanup_old_data({retention_days})").collect()
        return make_response(jsonify({
            'status': 'success',
            'message': result[0][0] if result else 'Cleanup completed',
            'retention_days': retention_days,
            'timestamp': datetime.datetime.now().isoformat()
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'cleanup_data_failed: {str(e)}'}), 200)


@snowpark.route('/status/data-summary')
def status_data_summary():
    """Get summary of data in the application tables"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Get counts from all major tables
        summary = {}
        
        tables_to_check = [
            ('lineage_nodes', 'v1.lineage_nodes'),
            ('lineage_edges', 'v1.lineage_edges'), 
            ('role_object_priv', 'v1.role_object_priv'),
            ('usage_edges', 'v1.usage_edges'),
            ('fact_warehouse_cost', 'v1.fact_warehouse_cost'),
            ('fact_query_cost', 'v1.fact_query_cost'),
            ('fact_storage', 'v1.fact_storage')
        ]
        
        for table_name, table_path in tables_to_check:
            try:
                count_result = s.sql(f"SELECT COUNT(*) as count FROM {table_path}").collect()
                summary[table_name] = count_result[0]['COUNT'] if count_result else 0
            except Exception as table_error:
                summary[table_name] = f"error: {str(table_error)}"
        
        # Get some recent data timestamps
        try:
            recent_lineage = s.sql("SELECT MAX(created_at) as latest FROM v1.lineage_nodes").collect()
            summary['latest_lineage_data'] = recent_lineage[0]['LATEST'].isoformat() if recent_lineage and recent_lineage[0]['LATEST'] else None
        except:
            summary['latest_lineage_data'] = None
            
        try:
            recent_finops = s.sql("SELECT MAX(day) as latest FROM v1.fact_warehouse_cost").collect()
            summary['latest_finops_data'] = recent_finops[0]['LATEST'].isoformat() if recent_finops and recent_finops[0]['LATEST'] else None
        except:
            summary['latest_finops_data'] = None
        
        summary['generated_at'] = datetime.datetime.now().isoformat()
        return make_response(jsonify(summary))
        
    except Exception as e:
        return make_response(jsonify({'error': f'data_summary_failed: {str(e)}'}), 200)


@snowpark.route('/status/health')
def status_health():
    """Comprehensive health check of the application"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({
                'status': 'unhealthy',
                'session': 'failed',
                'timestamp': datetime.datetime.now().isoformat()
            }))
        
        health_status = {
            'status': 'healthy',
            'session': 'connected',
            'account_usage_access': False,
            'services': {},
            'timestamp': datetime.datetime.now().isoformat()
        }
        
        # Test ACCOUNT_USAGE access
        try:
            s.sql("SELECT COUNT(*) FROM snowflake.account_usage.databases LIMIT 1").collect()
            health_status['account_usage_access'] = True
        except:
            health_status['account_usage_access'] = False
        
        # Test each service component
        services = [
            ('lineage_tables', 'SELECT COUNT(*) FROM v1.lineage_nodes LIMIT 1'),
            ('finops_tables', 'SELECT COUNT(*) FROM v1.fact_warehouse_cost LIMIT 1'),
            ('access_tables', 'SELECT COUNT(*) FROM v1.role_object_priv LIMIT 1')
        ]
        
        for service_name, test_query in services:
            try:
                s.sql(test_query).collect()
                health_status['services'][service_name] = 'healthy'
            except Exception as service_error:
                health_status['services'][service_name] = f'error: {str(service_error)}'
                health_status['status'] = 'degraded'
        
        return make_response(jsonify(health_status))
        
    except Exception as e:
        return make_response(jsonify({
            'status': 'unhealthy', 
            'error': f'health_check_failed: {str(e)}',
            'timestamp': datetime.datetime.now().isoformat()
        }), 200)


@snowpark.route('/finops/summary')
def finops_summary():
    """Return simple rollups over fact tables by dim=warehouse|role|user."""
    dim = (request.args.get('dim') or 'warehouse').lower()
    valid = {'warehouse', 'role', 'user'}
    if dim not in valid:
        abort(400, f'Invalid dim. Choose one of {sorted(list(valid))}')
    try:
        if dim == 'warehouse':
            s = get_session()
            if s is None:
                return make_response(jsonify([]))
            df = s.table('v1.fact_warehouse_cost').group_by('WAREHOUSE_NAME') \
                .agg(
                    f.sum(f.col('CREDITS_USED')).as_('CREDITS_USED'),
                    f.sum(f.col('DOLLARS_EST')).as_('DOLLARS_EST'),
                    f.avg(f.col('QUEUE_PCT')).as_('QUEUE_PCT'),
                    f.sum(f.col('QUERIES_EXECUTED')).as_('QUERIES')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        elif dim == 'role':
            df = s.table('v1.fact_query_cost').group_by('ROLE_NAME') \
                .agg(
                    f.sum(f.col('EST_COST')).as_('DOLLARS_EST'),
                    f.sum(f.col('BYTES_SCANNED')).as_('BYTES_SCANNED')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        else:
            df = s.table('v1.fact_query_cost').group_by('USER_NAME') \
                .agg(
                    f.sum(f.col('EST_COST')).as_('DOLLARS_EST'),
                    f.sum(f.col('BYTES_SCANNED')).as_('BYTES_SCANNED')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        return make_response(jsonify([r.as_dict() for r in df.limit(5000).to_local_iterator()]))
    except Exception as e:
        abort(500, f'Error reading finops summary: {str(e)}')


# =============================================================================
# Data Quality Monitoring Endpoints (Elementary Features Integration)
# =============================================================================

@snowpark.route('/data-quality/monitor/volume', methods=['POST'])
def data_quality_monitor_volume():
    """Execute volume anomaly monitoring for a table"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Get request parameters
        table_name = request.json.get('table_name')
        timestamp_column = request.json.get('timestamp_column')
        config_params = request.json.get('config', {})
        
        if not table_name:
            return make_response(jsonify({'error': 'table_name is required'}), 400)
        
        # Create monitor configuration
        config = MonitorConfig(
            sensitivity=int(config_params.get('sensitivity', 3)),
            training_period_days=int(config_params.get('training_period_days', 14)),
            detection_period_days=int(config_params.get('detection_period_days', 2)),
            anomaly_direction=config_params.get('anomaly_direction', 'both'),
            ignore_small_changes_threshold=float(config_params.get('ignore_small_changes_threshold', 0.05))
        )
        
        # Execute monitoring
        monitor = DataQualityMonitor(s, config)
        result = monitor.execute_volume_monitoring(table_name, timestamp_column)
        
        # Store alert if detected
        if result.get('alert'):
            alert_manager = AlertManager(s)
            alert_data = result['alert']
            from data_quality_monitor import DataQualityAlert
            from datetime import datetime
            
            alert = DataQualityAlert(
                id=alert_data['id'],
                alert_type=alert_data['alert_type'],
                table_full_name=alert_data['table_full_name'],
                column_name=alert_data['column_name'],
                metric_name=alert_data['metric_name'],
                current_value=alert_data['current_value'],
                expected_range=tuple(alert_data['expected_range']),
                severity=alert_data['severity'],
                detected_at=datetime.fromisoformat(alert_data['detected_at']),
                description=alert_data['description'],
                test_params=alert_data['test_params']
            )
            alert_manager.store_alert(alert)
        
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'volume_monitoring_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/monitor/freshness', methods=['POST'])
def data_quality_monitor_freshness():
    """Execute freshness anomaly monitoring for a table"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Get request parameters
        table_name = request.json.get('table_name')
        timestamp_column = request.json.get('timestamp_column')
        config_params = request.json.get('config', {})
        
        if not table_name or not timestamp_column:
            return make_response(jsonify({'error': 'table_name and timestamp_column are required'}), 400)
        
        # Create monitor configuration
        config = MonitorConfig(
            sensitivity=int(config_params.get('sensitivity', 3)),
            training_period_days=int(config_params.get('training_period_days', 14)),
            detection_period_days=int(config_params.get('detection_period_days', 2))
        )
        
        # Execute monitoring
        monitor = DataQualityMonitor(s, config)
        result = monitor.execute_freshness_monitoring(table_name, timestamp_column)
        
        # Store alert if detected
        if result.get('alert'):
            alert_manager = AlertManager(s)
            alert_data = result['alert']
            from data_quality_monitor import DataQualityAlert
            from datetime import datetime
            
            alert = DataQualityAlert(
                id=alert_data['id'],
                alert_type=alert_data['alert_type'],
                table_full_name=alert_data['table_full_name'],
                column_name=alert_data['column_name'],
                metric_name=alert_data['metric_name'],
                current_value=alert_data['current_value'],
                expected_range=tuple(alert_data['expected_range']),
                severity=alert_data['severity'],
                detected_at=datetime.fromisoformat(alert_data['detected_at']),
                description=alert_data['description'],
                test_params=alert_data['test_params']
            )
            alert_manager.store_alert(alert)
        
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'freshness_monitoring_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/monitor/column-quality', methods=['POST'])
def data_quality_monitor_column_quality():
    """Execute column-level quality monitoring"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Get request parameters
        table_name = request.json.get('table_name')
        column_name = request.json.get('column_name')
        timestamp_column = request.json.get('timestamp_column')
        config_params = request.json.get('config', {})
        
        if not table_name or not column_name:
            return make_response(jsonify({'error': 'table_name and column_name are required'}), 400)
        
        # Create monitor configuration
        config = MonitorConfig(
            sensitivity=int(config_params.get('sensitivity', 3)),
            training_period_days=int(config_params.get('training_period_days', 14)),
            detection_period_days=int(config_params.get('detection_period_days', 2))
        )
        
        # Execute monitoring
        monitor = DataQualityMonitor(s, config)
        result = monitor.execute_column_quality_monitoring(table_name, column_name, timestamp_column)
        
        # Store alerts if detected
        if result.get('alerts'):
            alert_manager = AlertManager(s)
            from data_quality_monitor import DataQualityAlert
            from datetime import datetime
            
            for alert_data in result['alerts']:
                alert = DataQualityAlert(
                    id=alert_data['id'],
                    alert_type=alert_data['alert_type'],
                    table_full_name=alert_data['table_full_name'],
                    column_name=alert_data['column_name'],
                    metric_name=alert_data['metric_name'],
                    current_value=alert_data['current_value'],
                    expected_range=tuple(alert_data['expected_range']),
                    severity=alert_data['severity'],
                    detected_at=datetime.fromisoformat(alert_data['detected_at']),
                    description=alert_data['description'],
                    test_params=alert_data['test_params']
                )
                alert_manager.store_alert(alert)
        
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'column_quality_monitoring_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/monitor/comprehensive', methods=['POST'])
def data_quality_monitor_comprehensive():
    """Run comprehensive monitoring across multiple tables and metrics"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Get request parameters
        tables_config = request.json.get('tables_config', [])
        config_params = request.json.get('config', {})
        
        if not tables_config:
            return make_response(jsonify({'error': 'tables_config is required'}), 400)
        
        # Create monitor configuration
        config = MonitorConfig(
            sensitivity=int(config_params.get('sensitivity', 3)),
            training_period_days=int(config_params.get('training_period_days', 14)),
            detection_period_days=int(config_params.get('detection_period_days', 2)),
            anomaly_direction=config_params.get('anomaly_direction', 'both')
        )
        
        # Execute comprehensive monitoring
        monitor = DataQualityMonitor(s, config)
        result = monitor.run_comprehensive_monitoring(tables_config)
        
        # Store all alerts detected
        alert_manager = AlertManager(s)
        from data_quality_monitor import DataQualityAlert
        from datetime import datetime
        
        for table_result in result['table_results']:
            for monitor_result in table_result['monitors']:
                if monitor_result.get('alert'):
                    alert_data = monitor_result['alert']
                    alert = DataQualityAlert(
                        id=alert_data['id'],
                        alert_type=alert_data['alert_type'],
                        table_full_name=alert_data['table_full_name'],
                        column_name=alert_data['column_name'],
                        metric_name=alert_data['metric_name'],
                        current_value=alert_data['current_value'],
                        expected_range=tuple(alert_data['expected_range']),
                        severity=alert_data['severity'],
                        detected_at=datetime.fromisoformat(alert_data['detected_at']),
                        description=alert_data['description'],
                        test_params=alert_data['test_params']
                    )
                    alert_manager.store_alert(alert)
                
                if monitor_result.get('alerts'):
                    for alert_data in monitor_result['alerts']:
                        alert = DataQualityAlert(
                            id=alert_data['id'],
                            alert_type=alert_data['alert_type'],
                            table_full_name=alert_data['table_full_name'],
                            column_name=alert_data['column_name'],
                            metric_name=alert_data['metric_name'],
                            current_value=alert_data['current_value'],
                            expected_range=tuple(alert_data['expected_range']),
                            severity=alert_data['severity'],
                            detected_at=datetime.fromisoformat(alert_data['detected_at']),
                            description=alert_data['description'],
                            test_params=alert_data['test_params']
                        )
                        alert_manager.store_alert(alert)
        
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'comprehensive_monitoring_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/monitor/suggestions')
def data_quality_monitor_suggestions():
    """Get monitoring setup suggestions based on available tables"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        monitor = DataQualityMonitor(s)
        result = monitor.get_monitoring_suggestions()
        
        return make_response(jsonify(result))
        
    except Exception as e:
        return make_response(jsonify({'error': f'suggestions_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/alerts')
def data_quality_alerts():
    """Get active data quality alerts"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        limit = int(request.args.get('limit', 50))
        
        alert_manager = AlertManager(s)
        alerts = alert_manager.get_active_alerts(limit)
        
        return make_response(jsonify({
            'alerts': alerts,
            'total_count': len(alerts),
            'limit': limit
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'get_alerts_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/alerts/<alert_id>/status', methods=['PUT'])
def data_quality_alert_status(alert_id):
    """Update alert status (active, resolved, suppressed)"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        status = request.json.get('status')
        
        if status not in ['active', 'resolved', 'suppressed']:
            return make_response(jsonify({'error': 'Invalid status. Must be active, resolved, or suppressed'}), 400)
        
        alert_manager = AlertManager(s)
        success = alert_manager.update_alert_status(alert_id, status)
        
        if success:
            return make_response(jsonify({'status': 'success', 'alert_id': alert_id, 'new_status': status}))
        else:
            return make_response(jsonify({'error': 'Failed to update alert status'}), 500)
        
    except Exception as e:
        return make_response(jsonify({'error': f'update_alert_status_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/notifications/test', methods=['POST'])
def data_quality_notifications_test():
    """Test notification channels"""
    try:
        # Initialize notification manager
        notification_manager = NotificationManager()
        
        # Load configuration from environment or request
        config_from_request = request.json.get('config', {})
        
        if config_from_request.get('slack_webhook'):
            notification_manager.add_slack_channel(config_from_request['slack_webhook'])
        
        if config_from_request.get('teams_webhook'):
            notification_manager.add_teams_channel(config_from_request['teams_webhook'])
        
        if config_from_request.get('webhook_url'):
            notification_manager.add_webhook_channel(config_from_request['webhook_url'])
        
        # If no config provided, try to load from environment
        if not config_from_request:
            notification_manager.load_config_from_env()
        
        # Test all channels
        results = notification_manager.test_channels()
        
        return make_response(jsonify({
            'test_results': results,
            'channels_tested': len(results),
            'successful_channels': len([r for r in results.values() if r])
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'notification_test_failed: {str(e)}'}), 500)


@snowpark.route('/data-quality/notifications/send', methods=['POST'])
def data_quality_notifications_send():
    """Send notification for an alert"""
    try:
        # Get alert details from request
        alert_data = request.json.get('alert')
        notification_config = request.json.get('config', {})
        
        if not alert_data:
            return make_response(jsonify({'error': 'alert data is required'}), 400)
        
        # Create notification object
        from datetime import datetime
        notification = AlertNotification(
            alert_id=alert_data['alert_id'],
            alert_type=alert_data['alert_type'],
            table_name=alert_data['table_name'],
            metric_name=alert_data['metric_name'],
            severity=alert_data['severity'],
            current_value=float(alert_data['current_value']),
            expected_range=(float(alert_data['expected_min']), float(alert_data['expected_max'])),
            description=alert_data['description'],
            detected_at=datetime.fromisoformat(alert_data['detected_at']),
            environment=alert_data.get('environment', 'production')
        )
        
        # Initialize notification manager
        notification_manager = NotificationManager()
        
        # Configure channels
        if notification_config.get('slack_webhook'):
            notification_manager.add_slack_channel(notification_config['slack_webhook'])
        
        if notification_config.get('teams_webhook'):
            notification_manager.add_teams_channel(notification_config['teams_webhook'])
        
        if notification_config.get('webhook_url'):
            notification_manager.add_webhook_channel(notification_config['webhook_url'])
        
        # Load from environment if no config provided
        if not notification_config:
            notification_manager.load_config_from_env()
        
        # Send notification
        results = notification_manager.send_alert_notification(notification)
        
        return make_response(jsonify({
            'notification_results': results,
            'channels_notified': len([r for r in results.values() if r]),
            'total_channels': len(results)
        }))
        
    except Exception as e:
        return make_response(jsonify({'error': f'send_notification_failed: {str(e)}'}), 500)


# LineageVisualizer specific endpoints for Snowflake integration

@snowpark.route('/databases')
def get_databases():
    """Get all databases from Snowflake INFORMATION_SCHEMA or ACCOUNT_USAGE"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        use_account_usage = os.getenv('USE_ACCOUNT_USAGE', '1') in ('1', 'true', 'True')
        
        if use_account_usage:
            try:
                # Use ACCOUNT_USAGE for comprehensive database list
                result = s.sql("""
                    SELECT 
                        DATABASE_NAME,
                        DATABASE_OWNER,
                        CREATED,
                        COMMENT
                    FROM SNOWFLAKE.ACCOUNT_USAGE.DATABASES 
                    WHERE DELETED IS NULL 
                    ORDER BY DATABASE_NAME
                """).collect()
                
                databases = []
                for row in result:
                    databases.append({
                        'id': row['DATABASE_NAME'],
                        'name': row['DATABASE_NAME'], 
                        'database_name': row['DATABASE_NAME'],
                        'owner': row['DATABASE_OWNER'],
                        'created': row['CREATED'].isoformat() if row['CREATED'] else None,
                        'comment': row['COMMENT']
                    })
                
                return make_response(jsonify(databases))
                
            except Exception as e:
                # Fallback to SHOW DATABASES
                pass
        
        # Fallback: Use SHOW DATABASES
        s.sql("SHOW DATABASES").collect()
        result = s.sql("SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()
        
        databases = []
        for row in result:
            databases.append({
                'id': row['name'],
                'name': row['name'],
                'database_name': row['name'],
                'owner': row.get('owner', ''),
                'created': row.get('created_on', ''),
                'comment': row.get('comment', '')
            })
        
        return make_response(jsonify(databases))
        
    except Exception as e:
        return make_response(jsonify({'error': f'get_databases_failed: {str(e)}'}), 500)


@snowpark.route('/schemas')
def get_schemas():
    """Get all schemas from Snowflake INFORMATION_SCHEMA"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        database = request.args.get('database')
        
        schemas = []
        
        if database:
            # Get schemas for specific database
            try:
                result = s.sql(f"""
                    SELECT 
                        SCHEMA_NAME,
                        SCHEMA_OWNER,
                        CREATED
                    FROM {database}.INFORMATION_SCHEMA.SCHEMATA
                    ORDER BY SCHEMA_NAME
                """).collect()
                
                for row in result:
                    schemas.append({
                        'id': row['SCHEMA_NAME'],
                        'name': row['SCHEMA_NAME'],
                        'schema_name': row['SCHEMA_NAME'],
                        'database_name': database,
                        'databaseId': database,
                        'owner': row.get('SCHEMA_OWNER', ''),
                        'created': row.get('CREATED', '')
                    })
            except Exception as e:
                # Fallback to SHOW SCHEMAS
                s.sql(f"SHOW SCHEMAS IN DATABASE {database}").collect()
                result = s.sql("SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()
                
                for row in result:
                    schemas.append({
                        'id': row['name'],
                        'name': row['name'],
                        'schema_name': row['name'],
                        'database_name': database,
                        'databaseId': database,
                        'owner': row.get('owner', ''),
                        'created': row.get('created_on', '')
                    })
        else:
            # Get all schemas using ACCOUNT_USAGE if available
            use_account_usage = os.getenv('USE_ACCOUNT_USAGE', '1') in ('1', 'true', 'True')
            
            if use_account_usage:
                try:
                    result = s.sql("""
                        SELECT 
                            DATABASE_NAME,
                            SCHEMA_NAME,
                            SCHEMA_OWNER,
                            CREATED
                        FROM SNOWFLAKE.ACCOUNT_USAGE.SCHEMATA
                        WHERE DELETED IS NULL
                        ORDER BY DATABASE_NAME, SCHEMA_NAME
                    """).collect()
                    
                    for row in result:
                        schemas.append({
                            'id': f"{row['DATABASE_NAME']}.{row['SCHEMA_NAME']}",
                            'name': row['SCHEMA_NAME'],
                            'schema_name': row['SCHEMA_NAME'],
                            'database_name': row['DATABASE_NAME'],
                            'databaseId': row['DATABASE_NAME'],
                            'owner': row.get('SCHEMA_OWNER', ''),
                            'created': row.get('CREATED', '')
                        })
                except Exception as e:
                    # Could not use ACCOUNT_USAGE, return empty for now
                    pass
        
        return make_response(jsonify(schemas))
        
    except Exception as e:
        return make_response(jsonify({'error': f'get_schemas_failed: {str(e)}'}), 500)


@snowpark.route('/tables')  
def get_tables():
    """Get all tables from Snowflake INFORMATION_SCHEMA"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        database = request.args.get('database')
        schema = request.args.get('schema')
        
        tables = []
        
        if database and schema:
            # Get tables for specific database.schema
            try:
                result = s.sql(f"""
                    SELECT 
                        TABLE_NAME,
                        TABLE_TYPE,
                        ROW_COUNT,
                        BYTES,
                        CREATED,
                        COMMENT
                    FROM {database}.INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = '{schema}'
                    ORDER BY TABLE_NAME
                """).collect()
                
                for row in result:
                    tables.append({
                        'id': f"{database}.{schema}.{row['TABLE_NAME']}",
                        'name': row['TABLE_NAME'],
                        'table_name': row['TABLE_NAME'],
                        'database_name': database,
                        'schema_name': schema,
                        'databaseId': database,
                        'schemaId': schema,
                        'tableType': row.get('TABLE_TYPE', 'BASE TABLE'),
                        'rowCount': row.get('ROW_COUNT', 0),
                        'bytes': row.get('BYTES', 0),
                        'created': row.get('CREATED', ''),
                        'description': row.get('COMMENT', ''),
                        'columns': []
                    })
            except Exception as e:
                # Fallback to SHOW TABLES
                s.sql(f"SHOW TABLES IN SCHEMA {database}.{schema}").collect()
                result = s.sql("SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()
                
                for row in result:
                    tables.append({
                        'id': f"{database}.{schema}.{row['name']}",
                        'name': row['name'],
                        'table_name': row['name'],
                        'database_name': database,
                        'schema_name': schema,
                        'databaseId': database,
                        'schemaId': schema,
                        'tableType': row.get('kind', 'TABLE'),
                        'rowCount': row.get('rows', 0),
                        'bytes': row.get('bytes', 0),
                        'created': row.get('created_on', ''),
                        'description': row.get('comment', ''),
                        'columns': []
                    })
        elif database:
            # Get all tables in database across all schemas  
            try:
                result = s.sql(f"""
                    SELECT 
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        TABLE_TYPE,
                        ROW_COUNT,
                        BYTES,
                        CREATED,
                        COMMENT
                    FROM {database}.INFORMATION_SCHEMA.TABLES
                    ORDER BY TABLE_SCHEMA, TABLE_NAME
                """).collect()
                
                for row in result:
                    tables.append({
                        'id': f"{database}.{row['TABLE_SCHEMA']}.{row['TABLE_NAME']}",
                        'name': row['TABLE_NAME'],
                        'table_name': row['TABLE_NAME'],
                        'database_name': database,
                        'schema_name': row['TABLE_SCHEMA'],
                        'databaseId': database,
                        'schemaId': row['TABLE_SCHEMA'],
                        'tableType': row.get('TABLE_TYPE', 'BASE TABLE'),
                        'rowCount': row.get('ROW_COUNT', 0),
                        'bytes': row.get('BYTES', 0),
                        'created': row.get('CREATED', ''),
                        'description': row.get('COMMENT', ''),
                        'columns': []
                    })
            except Exception as e:
                # Could not query specific database
                pass
        else:
            # Get all tables using ACCOUNT_USAGE if available
            use_account_usage = os.getenv('USE_ACCOUNT_USAGE', '1') in ('1', 'true', 'True')
            
            if use_account_usage:
                try:
                    result = s.sql("""
                        SELECT 
                            TABLE_CATALOG,
                            TABLE_SCHEMA,
                            TABLE_NAME,
                            TABLE_TYPE,
                            ROW_COUNT,
                            BYTES,
                            CREATED,
                            COMMENT
                        FROM SNOWFLAKE.ACCOUNT_USAGE.TABLES
                        WHERE DELETED IS NULL
                        ORDER BY TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
                        LIMIT 1000
                    """).collect()
                    
                    for row in result:
                        tables.append({
                            'id': f"{row['TABLE_CATALOG']}.{row['TABLE_SCHEMA']}.{row['TABLE_NAME']}",
                            'name': row['TABLE_NAME'],
                            'table_name': row['TABLE_NAME'],
                            'database_name': row['TABLE_CATALOG'],
                            'schema_name': row['TABLE_SCHEMA'],
                            'databaseId': row['TABLE_CATALOG'],
                            'schemaId': row['TABLE_SCHEMA'],
                            'tableType': row.get('TABLE_TYPE', 'BASE TABLE'),
                            'rowCount': row.get('ROW_COUNT', 0),
                            'bytes': row.get('BYTES', 0),
                            'created': row.get('CREATED', ''),
                            'description': row.get('COMMENT', ''),
                            'columns': []
                        })
                except Exception as e:
                    # Could not use ACCOUNT_USAGE
                    pass
        
        return make_response(jsonify(tables))
        
    except Exception as e:
        return make_response(jsonify({'error': f'get_tables_failed: {str(e)}'}), 500)


@snowpark.route('/tables/<table_id>/columns')
def get_table_columns(table_id):
    """Get columns for a specific table"""
    try:
        s = get_session()
        if s is None:
            return make_response(jsonify({'error': 'no_session'}))
        
        # Parse table_id (format: database.schema.table)
        parts = table_id.split('.')
        if len(parts) != 3:
            return make_response(jsonify({'error': 'Invalid table_id format. Expected: database.schema.table'}), 400)
        
        database, schema, table = parts
        columns = []
        
        try:
            # Get columns from INFORMATION_SCHEMA
            result = s.sql(f"""
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT,
                    COMMENT,
                    ORDINAL_POSITION
                FROM {database}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{schema}' 
                  AND TABLE_NAME = '{table}'
                ORDER BY ORDINAL_POSITION
            """).collect()
            
            for row in result:
                columns.append({
                    'id': f"{table_id}.{row['COLUMN_NAME']}",
                    'name': row['COLUMN_NAME'],
                    'column_name': row['COLUMN_NAME'],
                    'dataType': row['DATA_TYPE'],
                    'data_type': row['DATA_TYPE'],
                    'isNullable': row['IS_NULLABLE'] == 'YES',
                    'defaultValue': row.get('COLUMN_DEFAULT'),
                    'description': row.get('COMMENT', ''),
                    'ordinalPosition': row.get('ORDINAL_POSITION', 0),
                    'isPrimaryKey': False,  # Would need additional query for PK info
                    'table_id': table_id,
                    'table_name': table,
                    'database_name': database,
                    'schema_name': schema
                })
                
        except Exception as e:
            # Fallback to DESCRIBE TABLE  
            try:
                s.sql(f"DESCRIBE TABLE {database}.{schema}.{table}").collect()
                result = s.sql("SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()
                
                for idx, row in enumerate(result):
                    columns.append({
                        'id': f"{table_id}.{row['name']}",
                        'name': row['name'],
                        'column_name': row['name'],
                        'dataType': row.get('type', ''),
                        'data_type': row.get('type', ''),
                        'isNullable': row.get('null?') == 'Y',
                        'defaultValue': row.get('default'),
                        'description': row.get('comment', ''),
                        'ordinalPosition': idx + 1,
                        'isPrimaryKey': row.get('primary key') == 'Y',
                        'table_id': table_id,
                        'table_name': table,
                        'database_name': database,
                        'schema_name': schema
                    })
            except Exception as e2:
                return make_response(jsonify({'error': f'Could not get columns: {str(e2)}'}), 500)
        
        return make_response(jsonify(columns))
        
    except Exception as e:
        return make_response(jsonify({'error': f'get_table_columns_failed: {str(e)}'}), 500)

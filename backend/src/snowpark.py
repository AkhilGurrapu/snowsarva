from flask import Blueprint, request, abort, make_response, jsonify
import os
import datetime
import snowflake.snowpark.functions as f
from typing import List, Dict, Any
import json
import tempfile
from lineage_parser import SnowflakeLineageExtractor, DbtArtifactsProcessor
from access_analyzer import AccessLineageAnalyzer, FinOpsAnalyzer

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

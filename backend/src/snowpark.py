from flask import Blueprint, request, abort, make_response, jsonify
import os
import datetime
import snowflake.snowpark.functions as f
from typing import List, Dict, Any

# Choose connector based on environment to keep prod and local isolated
# Default to SPCS connector; local-dev.sh sets USE_LOCAL_CONNECTOR=1
use_local = os.getenv('USE_LOCAL_CONNECTOR', '0') in ('1', 'true', 'True')
if use_local:
    from spcs_helpers.connection_local import session as snow_session
else:
    from spcs_helpers.connection_spcs import session as snow_session
session = snow_session()

snowpark = Blueprint('snowpark', __name__)

dateformat = '%Y-%m-%d'

@snowpark.route('/metrics')
def metrics():
    try:
        use_account_usage = os.getenv('USE_ACCOUNT_USAGE', '1') in ('1', 'true', 'True')
        path = 'ACCOUNT_USAGE' if use_account_usage else 'SHOW'
        databases_count = None
        schemas_count = None

        if use_account_usage:
            try:
                # Preferred path in production (requires imported privileges on SNOWFLAKE DB)
                databases_count = session.table("snowflake.account_usage.databases").count()
                schemas_count = session.table("snowflake.account_usage.schemata").count()
            except Exception:
                # Auto-fallback if not granted locally
                path = 'SHOW'
                # SHOW DATABASES -> RESULT_SCAN(LAST_QUERY_ID()) for counting
                session.sql("SHOW DATABASES").collect()
                databases_count = session.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
                session.sql("SHOW SCHEMAS IN ACCOUNT").collect()
                schemas_count = session.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
        else:
            # Local/dev fallback that doesn't require imported privileges
            session.sql("SHOW DATABASES").collect()
            databases_count = session.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
            session.sql("SHOW SCHEMAS IN ACCOUNT").collect()
            schemas_count = session.sql("SELECT COUNT(*) AS CNT FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))").collect()[0]['CNT']
        return make_response(jsonify({
            'databases': int(databases_count),
            'schemas': int(schemas_count),
            'path': path
        }))
    except Exception as e:
        abort(500, f"Error reading metrics from Snowflake: {str(e)}")

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
        df = session.table("snowflake.account_usage.query_history") \
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
            session.table("snowflake.account_usage.databases").limit(1).collect()
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
        nodes = session.table('app_public.lineage_nodes') \
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
        edges = session.table('app_public.lineage_edges') \
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
            extra_edges = session.table('app_public.lineage_edges') \
                .filter((f.col('SRC_OBJECT_ID').isin(list(current_ids))) | (f.col('TGT_OBJECT_ID').isin(list(current_ids))))
            all_edge_rows.extend([r.as_dict() for r in extra_edges.to_local_iterator()])

        # Return nodes and edges limited to involved ids
        involved_ids = list(all_node_ids)
        out_nodes = session.table('app_public.lineage_nodes') \
            .filter(f.col('OBJECT_ID').isin(involved_ids))
        return make_response(jsonify({
            'nodes': [r.as_dict() for r in out_nodes.to_local_iterator()],
            'edges': all_edge_rows
        }))
    except Exception as e:
        abort(500, f'Error reading lineage: {str(e)}')


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
        seed_nodes = session.table('app_public.lineage_nodes') 
        seed_nodes = seed_nodes.filter(f.upper(f.col('OBJECT_NAME')) == name.upper())
        seed_ids = [r['OBJECT_ID'] for r in seed_nodes.select('OBJECT_ID').to_local_iterator()]
        if not seed_ids:
            return make_response(jsonify({'nodes': [], 'edges': []}))
        # Only follow downstream (SRC -> TGT)
        current_ids = set(seed_ids)
        all_node_ids = set(seed_ids)
        all_edge_rows: List[Dict[str, Any]] = []
        for _ in range(max(1, depth)):
            e_df = session.table('app_public.lineage_edges').filter(f.col('SRC_OBJECT_ID').isin(list(current_ids)))
            e_rows = [r.as_dict() for r in e_df.to_local_iterator()]
            all_edge_rows.extend(e_rows)
            next_ids = {e['TGT_OBJECT_ID'] for e in e_rows if e.get('TGT_OBJECT_ID')}
            next_ids = next_ids - all_node_ids
            if not next_ids:
                break
            all_node_ids |= next_ids
            current_ids = next_ids
        out_nodes = session.table('app_public.lineage_nodes').filter(f.col('OBJECT_ID').isin(list(all_node_ids)))
        return make_response(jsonify({'nodes': [r.as_dict() for r in out_nodes.to_local_iterator()], 'edges': all_edge_rows}))
    except Exception as e:
        abort(500, f'Error reading impact: {str(e)}')


@snowpark.route('/access/graph')
def access_graph():
    """Return access lineage (grants and usage) for an optional role/object filter."""
    role = request.args.get('role')
    obj = request.args.get('object')
    try:
        grants = session.table('v1.role_object_priv')
        usage = session.table('v1.usage_edges')
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


@snowpark.route('/finops/summary')
def finops_summary():
    """Return simple rollups over fact tables by dim=warehouse|role|user."""
    dim = (request.args.get('dim') or 'warehouse').lower()
    valid = {'warehouse', 'role', 'user'}
    if dim not in valid:
        abort(400, f'Invalid dim. Choose one of {sorted(list(valid))}')
    try:
        if dim == 'warehouse':
            df = session.table('v1.fact_warehouse_cost').group_by('WAREHOUSE_NAME') \
                .agg(
                    f.sum(f.col('CREDITS_USED')).as_('CREDITS_USED'),
                    f.sum(f.col('DOLLARS_EST')).as_('DOLLARS_EST'),
                    f.avg(f.col('QUEUE_PCT')).as_('QUEUE_PCT'),
                    f.sum(f.col('QUERIES_EXECUTED')).as_('QUERIES')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        elif dim == 'role':
            df = session.table('v1.fact_query_cost').group_by('ROLE_NAME') \
                .agg(
                    f.sum(f.col('EST_COST')).as_('DOLLARS_EST'),
                    f.sum(f.col('BYTES_SCANNED')).as_('BYTES_SCANNED')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        else:
            df = session.table('v1.fact_query_cost').group_by('USER_NAME') \
                .agg(
                    f.sum(f.col('EST_COST')).as_('DOLLARS_EST'),
                    f.sum(f.col('BYTES_SCANNED')).as_('BYTES_SCANNED')
                ) \
                .order_by(f.col('DOLLARS_EST').desc())
        return make_response(jsonify([r.as_dict() for r in df.limit(5000).to_local_iterator()]))
    except Exception as e:
        abort(500, f'Error reading finops summary: {str(e)}')

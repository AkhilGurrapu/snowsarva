from flask import Blueprint, request, abort, make_response, jsonify
import os
import datetime
import snowflake.snowpark.functions as f

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
        if use_account_usage:
            # Preferred path in production (requires imported privileges on SNOWFLAKE DB)
            databases_count = session.table("snowflake.account_usage.databases").count()
            schemas_count = session.table("snowflake.account_usage.schemata").count()
        else:
            # Local/dev fallback that doesn't require imported privileges
            databases_count = session.sql("SHOW DATABASES").count()
            schemas_count = session.sql("SHOW SCHEMAS IN ACCOUNT").count()
        return make_response(jsonify({
            'databases': int(databases_count),
            'schemas': int(schemas_count)
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

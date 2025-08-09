from flask import Blueprint, request, abort, make_response, jsonify
import datetime
import snowflake.snowpark.functions as f

from spcs_helpers.connection import session as snow_session
session = snow_session()

snowpark = Blueprint('snowpark', __name__)

dateformat = '%Y-%m-%d'

@snowpark.route('/metrics')
def metrics():
    try:
        # Query SNOWFLAKE.ACCOUNT_USAGE (requires consumer to grant imported privileges)
        databases_count = session.table("snowflake.account_usage.databases").count()
        schemas_count = session.table("snowflake.account_usage.schemata").count()
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

import os
import snowflake.connector
from snowflake.snowpark import Session

def connection() -> snowflake.connector.SnowflakeConnection:
    # Priority 1: Token file path provided via env (local dev using PAT)
    token_file_env = os.getenv('SNOWFLAKE_TOKEN_FILE')
    if token_file_env and os.path.isfile(token_file_env):
        token_str = open(token_file_env, 'r').read().strip()
        creds = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'authenticator': 'oauth',
            'token': token_str,
            'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA'),
            'client_session_keep_alive': True,
            'user': os.getenv('SNOWFLAKE_USER'),
        }
        return snowflake.connector.connect(**creds)

    # Priority 2: Token provided via env var
    token_env = os.getenv('SNOWFLAKE_OAUTH_TOKEN')
    if token_env:
        creds = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'authenticator': 'oauth',
            'token': token_env,
            'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA'),
            'client_session_keep_alive': True,
            'user': os.getenv('SNOWFLAKE_USER'),
        }
        return snowflake.connector.connect(**creds)

    # Priority 3: SPCS runtime token
    if os.path.isfile("/snowflake/session/token"):
        creds = {
            'host': os.getenv('SNOWFLAKE_HOST'),
            'port': os.getenv('SNOWFLAKE_PORT'),
            'protocol': "https",
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'authenticator': "oauth",
            'token': open('/snowflake/session/token', 'r').read(),
            'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA'),
            'client_session_keep_alive': True,
            'user': os.getenv('SNOWFLAKE_USER'),
        }
        return snowflake.connector.connect(**creds)

    # Priority 4: Username/password (for local where permitted)
    creds = {
        'account': os.getenv('SNOWFLAKE_ACCOUNT'),
        'user': os.getenv('SNOWFLAKE_USER'),
        'password': os.getenv('SNOWFLAKE_PASSWORD'),
        'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
        'database': os.getenv('SNOWFLAKE_DATABASE'),
        'schema': os.getenv('SNOWFLAKE_SCHEMA'),
        'client_session_keep_alive': True
    }
    return snowflake.connector.connect(**creds)


def session() -> Session:
    return Session.builder.configs({"connection": connection()}).create()

import os
import snowflake.connector
from snowflake.snowpark import Session


def connection() -> snowflake.connector.SnowflakeConnection:
    # Priority 1: Explicit password (can be PAT secret for local dev)
    password_env = os.getenv('SNOWFLAKE_PASSWORD')
    if password_env:
        creds = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'user': os.getenv('SNOWFLAKE_USER'),
            'password': password_env,
            'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA'),
            'client_session_keep_alive': True,
            'role': os.getenv('SNOWFLAKE_ROLE')
        }
        return snowflake.connector.connect(**creds)

    # Priority 2: Programmatic Access Token (PAT) file, used as password with Python connector in dev
    token_file_env = os.getenv('SNOWFLAKE_TOKEN_FILE')
    if token_file_env and os.path.isfile(token_file_env):
        try:
            token_str = open(token_file_env, 'r').read().strip()
            creds = {
                'account': os.getenv('SNOWFLAKE_ACCOUNT'),
                'user': os.getenv('SNOWFLAKE_USER'),
                'password': token_str,
                'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
                'database': os.getenv('SNOWFLAKE_DATABASE'),
                'schema': os.getenv('SNOWFLAKE_SCHEMA'),
                'client_session_keep_alive': True,
                'role': os.getenv('SNOWFLAKE_ROLE')
            }
            return snowflake.connector.connect(**creds)
        except Exception as e:
            if os.getenv('DEV_MODE') in ('1', 'true', 'True'):
                print(f"PAT file auth failed: {e}")
            pass

    # Priority 3: OAuth access token path
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
            'role': os.getenv('SNOWFLAKE_ROLE')
        }
        return snowflake.connector.connect(**creds)

    raise RuntimeError('No valid Snowflake auth for local dev. Provide PAT (SNOWFLAKE_TOKEN_FILE) or SNOWFLAKE_PASSWORD or SNOWFLAKE_OAUTH_TOKEN.')


def session() -> Session:
    return Session.builder.configs({"connection": connection()}).create()



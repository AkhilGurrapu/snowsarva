import os
import snowflake.connector
from snowflake.snowpark import Session


def connection() -> snowflake.connector.SnowflakeConnection:
    # Prefer Programmatic Access Token (PAT) from file when available
    token_file_env = os.getenv('SNOWFLAKE_TOKEN_FILE')
    if token_file_env and os.path.isfile(token_file_env):
        try:
            token_str = open(token_file_env, 'r').read().strip()
            creds = {
                'account': os.getenv('SNOWFLAKE_ACCOUNT'),
                'user': os.getenv('SNOWFLAKE_USER'),
                # Use PAT as password per Python connector support
                'password': token_str,
                'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
                'database': os.getenv('SNOWFLAKE_DATABASE'),
                'schema': os.getenv('SNOWFLAKE_SCHEMA'),
                'client_session_keep_alive': True,
                'role': os.getenv('SNOWFLAKE_ROLE')
            }
            return snowflake.connector.connect(**creds)
        except Exception as e:
            # Fall through to OAuth or password if PAT is invalid/disabled
            if os.getenv('DEV_MODE') in ('1', 'true', 'True'):
                print(f"PAT auth failed: {e}")
            pass

    # Next: OAuth access token path
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

    password = os.getenv('SNOWFLAKE_PASSWORD')
    if password:
        creds = {
            'account': os.getenv('SNOWFLAKE_ACCOUNT'),
            'user': os.getenv('SNOWFLAKE_USER'),
            'password': password,
            'warehouse': os.getenv('SNOWFLAKE_WAREHOUSE'),
            'database': os.getenv('SNOWFLAKE_DATABASE'),
            'schema': os.getenv('SNOWFLAKE_SCHEMA'),
            'client_session_keep_alive': True,
            'role': os.getenv('SNOWFLAKE_ROLE')
        }
        return snowflake.connector.connect(**creds)

    raise RuntimeError('No valid Snowflake auth for local dev. Provide PAT (SNOWFLAKE_TOKEN_FILE) or SNOWFLAKE_PASSWORD or SNOWFLAKE_OAUTH_TOKEN.')


def session() -> Session:
    return Session.builder.configs({"connection": connection()}).create()



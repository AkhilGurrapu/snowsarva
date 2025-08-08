-- Snowflake PAT Troubleshooting Script
-- Run these commands in Snowflake UI as ACCOUNTADMIN

-- 1. Check if the user exists and is configured correctly
DESC USER snowsarva_user;

-- 2. Check if the role exists
SHOW ROLES LIKE 'snowsarva_role';

-- 3. Check current network policies (might be blocking PAT)
SHOW NETWORK POLICIES;

-- 4. Check authentication policies
SHOW AUTHENTICATION POLICIES;

-- 5. Check if PAT authentication method is allowed
SELECT name, authentication_methods 
FROM TABLE(INFORMATION_SCHEMA.AUTHENTICATION_POLICIES()) 
WHERE authentication_methods IS NOT NULL;

-- 6. Check existing programmatic access tokens for the user
-- (Run as ACCOUNTADMIN)
SHOW PROGRAMMATIC ACCESS TOKENS FOR USER snowsarva_user;

-- 7. Check if user has required privileges
SHOW GRANTS TO USER snowsarva_user;
SHOW GRANTS TO ROLE snowsarva_role;

-- === FIXES IF NEEDED ===

-- 8. Create or modify authentication policy to allow PAT
CREATE OR REPLACE AUTHENTICATION POLICY snowsarva_auth_policy
  AUTHENTICATION_METHODS = ('PASSWORD', 'PROGRAMMATIC_ACCESS_TOKEN')
  PAT_POLICY=(
    NETWORK_POLICY_EVALUATION = NOT_ENFORCED,
    MAX_EXPIRY_IN_DAYS = 365,
    DEFAULT_EXPIRY_IN_DAYS = 90
  );

-- 9. Apply the authentication policy to the user
ALTER USER snowsarva_user SET AUTHENTICATION_POLICY = snowsarva_auth_policy;

-- 10. If needed, create a more permissive network policy
CREATE OR REPLACE NETWORK POLICY snowsarva_network_policy
  ALLOWED_IP_LIST = ('0.0.0.0/0')  -- Allow all IPs (adjust as needed)
  COMMENT = 'Network policy for SnowSarva application';

-- 11. Apply network policy to user (if required)
-- ALTER USER snowsarva_user SET NETWORK_POLICY = snowsarva_network_policy;

-- 12. Generate a new PAT token (if current one is invalid)
-- This will show you the new token - copy it to snowflake-pat.token file
CREATE PROGRAMMATIC ACCESS TOKEN FOR USER snowsarva_user
  EXPIRES_IN = 7776000  -- 90 days in seconds
  ROLE = snowsarva_role
  COMMENT = 'Token for SnowSarva application deployment';

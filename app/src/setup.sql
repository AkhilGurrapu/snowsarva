-- Create application roles
CREATE APPLICATION ROLE app_admin;
CREATE APPLICATION ROLE app_user;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS app_public;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;

CREATE OR ALTER VERSIONED SCHEMA v1;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_admin;

-- Create procedure to start the Snowsarva Hello World app
CREATE OR REPLACE PROCEDURE app_public.start_app(poolname VARCHAR, whname VARCHAR)
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    EXECUTE IMMEDIATE 'CREATE SERVICE IF NOT EXISTS app_public.snowsarva_service
        IN COMPUTE POOL Identifier(''' || poolname || ''')
        FROM SPECIFICATION_FILE=''/snowsarva.yaml''
        QUERY_WAREHOUSE=''' || whname || '''';
    
    GRANT USAGE ON SERVICE app_public.snowsarva_service TO APPLICATION ROLE app_user;
    GRANT SERVICE ROLE app_public.snowsarva_service!ALL_ENDPOINTS_USAGE TO APPLICATION ROLE app_user;
    
    RETURN 'Snowsarva Hello World service started successfully. Check status with SHOW SERVICES, and when ready, get URL with app_url()';
END;
$$;
GRANT USAGE ON PROCEDURE app_public.start_app(VARCHAR, VARCHAR) TO APPLICATION ROLE app_admin;

-- Create procedure to stop the app
CREATE OR REPLACE PROCEDURE app_public.stop_app()
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    DROP SERVICE IF EXISTS app_public.snowsarva_service;
    RETURN 'Snowsarva service stopped successfully';
END;
$$;
GRANT USAGE ON PROCEDURE app_public.stop_app() TO APPLICATION ROLE app_admin;

-- Create procedure to get the app URL
CREATE OR REPLACE PROCEDURE app_public.app_url()
    RETURNS string
    LANGUAGE sql
    AS $$
DECLARE
    ingress_url VARCHAR;
BEGIN
    SHOW ENDPOINTS IN SERVICE app_public.snowsarva_service;
    SELECT "ingress_url" INTO :ingress_url FROM TABLE (RESULT_SCAN (LAST_QUERY_ID())) LIMIT 1;
    RETURN ingress_url;
END;
$$;
GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_admin;
GRANT USAGE ON PROCEDURE app_public.app_url() TO APPLICATION ROLE app_user;

-- Create procedure to check service status
CREATE OR REPLACE PROCEDURE app_public.service_status()
    RETURNS string
    LANGUAGE sql
    AS $$
DECLARE
    service_status VARCHAR;
BEGIN
    SHOW SERVICES IN SCHEMA app_public;
    SELECT "status" INTO :service_status FROM TABLE (RESULT_SCAN (LAST_QUERY_ID())) WHERE "name" = 'SNOWSARVA_SERVICE' LIMIT 1;
    RETURN COALESCE(service_status, 'Service not found');
END;
$$;
GRANT USAGE ON PROCEDURE app_public.service_status() TO APPLICATION ROLE app_admin;
GRANT USAGE ON PROCEDURE app_public.service_status() TO APPLICATION ROLE app_user;
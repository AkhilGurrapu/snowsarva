-- Snowsarva Deployment Script
-- Deploy the Native App to Snowflake

USE ROLE snowsarva_role;
USE WAREHOUSE snowsarva_warehouse;
USE DATABASE snowsarva_image_database;
USE SCHEMA snowsarva_image_schema;

-- Show current context
SELECT CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA();

-- Create image repository if it doesn't exist
CREATE IMAGE REPOSITORY IF NOT EXISTS snowsarva_img_repo;

-- Show repository details
SHOW IMAGE REPOSITORIES;

-- Create stage for application files if needed
CREATE STAGE IF NOT EXISTS snowsarva_app_stage;

-- List existing applications
SHOW APPLICATIONS;

-- Create application package
CREATE APPLICATION PACKAGE IF NOT EXISTS snowsarva_app_pkg;

-- Show the package
SHOW APPLICATION PACKAGES;

-- Check if we can use the package
USE APPLICATION PACKAGE snowsarva_app_pkg;

-- Add version to the package (this would typically be done via PUT/COPY commands for files)
-- For now, let's just show the structure
DESC APPLICATION PACKAGE snowsarva_app_pkg;
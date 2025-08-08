# Snowsarva Hello World Native App

A simple Hello World React application built as a Snowflake Native App using Snowpark Container Services.

## Features
- Simple React Hello World interface
- Containerized using Docker
- Runs on Snowpark Container Services
- Public web endpoint

## Usage

After installing the application, use these procedures to manage your Snowsarva Hello World app:

### Start the Application
```sql
CALL app_public.start_app('your_compute_pool', 'your_warehouse');
```

### Check Service Status
```sql
CALL app_public.service_status();
```

### Get Application URL
```sql
CALL app_public.app_url();
```

### Stop the Application
```sql
CALL app_public.stop_app();
```

## Requirements
- A compute pool for running the container service
- A warehouse for query processing
- Appropriate privileges for creating services

## Version
1.0.0 - Initial Hello World release
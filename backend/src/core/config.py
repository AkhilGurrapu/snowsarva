"""
Configuration management for Snowsarva backend
"""

import os
from functools import lru_cache
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    # Application settings
    APP_NAME: str = "Snowsarva"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    ENVIRONMENT: str = Field(default="production", env="ENVIRONMENT")
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    
    # API settings
    API_PORT: int = Field(default=8081, env="API_PORT")
    ALLOWED_ORIGINS: str = Field(default="*", env="ALLOWED_ORIGINS")
    API_RATE_LIMIT: int = Field(default=1000, env="API_RATE_LIMIT")
    
    # Snowflake connection settings
    SNOWFLAKE_ACCOUNT: str = Field(env="SNOWFLAKE_ACCOUNT")
    SNOWFLAKE_DATABASE: str = Field(env="SNOWFLAKE_DATABASE") 
    SNOWFLAKE_SCHEMA: str = Field(env="SNOWFLAKE_SCHEMA")
    SNOWFLAKE_WAREHOUSE: str = Field(default="snowsarva_warehouse", env="SNOWFLAKE_WAREHOUSE")
    SNOWFLAKE_ROLE: str = Field(default="snowsarva_role", env="SNOWFLAKE_ROLE")
    
    # Authentication settings - SPCS provides OAuth token
    SNOWFLAKE_TOKEN_PATH: str = Field(default="/snowflake/session/token", env="SNOWFLAKE_TOKEN_PATH")
    SNOWFLAKE_USER: Optional[str] = Field(default=None, env="SNOWFLAKE_USER")
    SNOWFLAKE_PASSWORD: Optional[str] = Field(default=None, env="SNOWFLAKE_PASSWORD")
    
    # Application-specific settings
    LINEAGE_PROCESSING_ENABLED: bool = Field(default=True, env="LINEAGE_PROCESSING_ENABLED")
    COST_PROCESSING_ENABLED: bool = Field(default=True, env="COST_PROCESSING_ENABLED")
    PROCESSING_BATCH_SIZE: int = Field(default=1000, env="PROCESSING_BATCH_SIZE")
    LINEAGE_RETENTION_DAYS: int = Field(default=90, env="LINEAGE_RETENTION_DAYS")
    MIN_CONFIDENCE_THRESHOLD: float = Field(default=0.7, env="MIN_CONFIDENCE_THRESHOLD")
    
    # Background task settings
    COST_REFRESH_INTERVAL_HOURS: int = Field(default=1, env="COST_REFRESH_INTERVAL_HOURS")
    LINEAGE_REFRESH_INTERVAL_MINUTES: int = Field(default=15, env="LINEAGE_REFRESH_INTERVAL_MINUTES")
    METADATA_REFRESH_INTERVAL_HOURS: int = Field(default=24, env="METADATA_REFRESH_INTERVAL_HOURS")
    
    # Performance settings
    DATABASE_POOL_SIZE: int = Field(default=10, env="DATABASE_POOL_SIZE")
    DATABASE_MAX_OVERFLOW: int = Field(default=20, env="DATABASE_MAX_OVERFLOW")
    QUERY_TIMEOUT_SECONDS: int = Field(default=300, env="QUERY_TIMEOUT_SECONDS")
    
    # Caching settings
    CACHE_ENABLED: bool = Field(default=True, env="CACHE_ENABLED")
    CACHE_TTL_SECONDS: int = Field(default=300, env="CACHE_TTL_SECONDS")
    REDIS_URL: Optional[str] = Field(default=None, env="REDIS_URL")
    
    # Monitoring and alerting
    MONITORING_ENABLED: bool = Field(default=True, env="MONITORING_ENABLED")
    METRICS_PORT: int = Field(default=8082, env="METRICS_PORT")
    HEALTH_CHECK_TIMEOUT: int = Field(default=30, env="HEALTH_CHECK_TIMEOUT")
    
    # Budget and alerting
    BUDGET_ALERT_EMAIL: Optional[str] = Field(default=None, env="BUDGET_ALERT_EMAIL")
    SLACK_WEBHOOK_URL: Optional[str] = Field(default=None, env="SLACK_WEBHOOK_URL")
    EMAIL_SMTP_SERVER: Optional[str] = Field(default=None, env="EMAIL_SMTP_SERVER")
    EMAIL_SMTP_PORT: int = Field(default=587, env="EMAIL_SMTP_PORT")
    EMAIL_USERNAME: Optional[str] = Field(default=None, env="EMAIL_USERNAME")
    EMAIL_PASSWORD: Optional[str] = Field(default=None, env="EMAIL_PASSWORD")
    
    # Security settings
    SECRET_KEY: str = Field(default="snowsarva-secret-key-change-in-production", env="SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440, env="ACCESS_TOKEN_EXPIRE_MINUTES")  # 24 hours
    ALLOWED_IPS: Optional[str] = Field(default=None, env="ALLOWED_IPS")
    
    # Feature flags
    ENABLE_COLUMN_LEVEL_LINEAGE: bool = Field(default=True, env="ENABLE_COLUMN_LEVEL_LINEAGE")
    ENABLE_COST_ANOMALY_DETECTION: bool = Field(default=True, env="ENABLE_COST_ANOMALY_DETECTION")
    ENABLE_AI_RECOMMENDATIONS: bool = Field(default=True, env="ENABLE_AI_RECOMMENDATIONS")
    ENABLE_DBT_INTEGRATION: bool = Field(default=True, env="ENABLE_DBT_INTEGRATION")
    
    # External integrations
    DBT_CLOUD_API_TOKEN: Optional[str] = Field(default=None, env="DBT_CLOUD_API_TOKEN")
    DBT_CLOUD_ACCOUNT_ID: Optional[str] = Field(default=None, env="DBT_CLOUD_ACCOUNT_ID")
    OPENMETADATA_SERVER_URL: Optional[str] = Field(default=None, env="OPENMETADATA_SERVER_URL")
    OPENMETADATA_API_TOKEN: Optional[str] = Field(default=None, env="OPENMETADATA_API_TOKEN")
    
    # Neo4j settings (optional)
    NEO4J_URI: Optional[str] = Field(default=None, env="NEO4J_URI")
    NEO4J_USER: Optional[str] = Field(default=None, env="NEO4J_USER")
    NEO4J_PASSWORD: Optional[str] = Field(default=None, env="NEO4J_PASSWORD")
    
    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENVIRONMENT.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.ENVIRONMENT.lower() in ("development", "dev")
    
    @property
    def snowflake_connection_params(self) -> dict:
        """Get Snowflake connection parameters"""
        # SPCS provides OAuth token authentication
        if os.path.isfile(self.SNOWFLAKE_TOKEN_PATH):
            return {
                "account": self.SNOWFLAKE_ACCOUNT,
                "authenticator": "oauth",
                "token": open(self.SNOWFLAKE_TOKEN_PATH, 'r').read().strip(),
                "database": self.SNOWFLAKE_DATABASE,
                "schema": self.SNOWFLAKE_SCHEMA,
                "warehouse": self.SNOWFLAKE_WAREHOUSE,
                "role": self.SNOWFLAKE_ROLE,
                "application": f"{self.APP_NAME}-{self.APP_VERSION}",
                "session_parameters": {
                    "QUERY_TAG": "SNOWSARVA_BACKEND",
                    "TIMEZONE": "UTC"
                }
            }
        else:
            # Fallback to username/password authentication
            return {
                "account": self.SNOWFLAKE_ACCOUNT,
                "user": self.SNOWFLAKE_USER,
                "password": self.SNOWFLAKE_PASSWORD,
                "database": self.SNOWFLAKE_DATABASE,
                "schema": self.SNOWFLAKE_SCHEMA,
                "warehouse": self.SNOWFLAKE_WAREHOUSE,
                "role": self.SNOWFLAKE_ROLE,
                "application": f"{self.APP_NAME}-{self.APP_VERSION}",
                "session_parameters": {
                    "QUERY_TAG": "SNOWSARVA_BACKEND",
                    "TIMEZONE": "UTC"
                }
            }
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """Get allowed origins as a list"""
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    def get_database_url(self) -> str:
        """Get database URL for SQLAlchemy (if needed)"""
        params = self.snowflake_connection_params
        if "token" in params:
            # OAuth token authentication
            return f"snowflake://{params['account']}/{params['database']}/{params['schema']}?warehouse={params['warehouse']}&role={params['role']}&authenticator=oauth&token={params['token']}"
        else:
            # Username/password authentication
            return f"snowflake://{params['user']}:{params['password']}@{params['account']}/{params['database']}/{params['schema']}?warehouse={params['warehouse']}&role={params['role']}"


@lru_cache()
def get_settings() -> Settings:
    """Get application settings (cached)"""
    return Settings()
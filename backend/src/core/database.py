"""
Database connection and query management for Snowsarva
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Union
from contextlib import asynccontextmanager
import structlog
import snowflake.connector
from snowflake.snowpark import Session
from snowflake.connector.errors import Error as SnowflakeError
import pandas as pd

from .config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class SnowflakeConnection:
    """Snowflake connection manager with connection pooling"""
    
    def __init__(self):
        self._connection_pool = []
        self._pool_size = settings.DATABASE_POOL_SIZE
        self._max_overflow = settings.DATABASE_MAX_OVERFLOW
        self._connection_params = settings.snowflake_connection_params
        self._session = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize connection pool and Snowpark session"""
        if self._initialized:
            return
            
        try:
            # Create Snowpark session for advanced operations
            self._session = Session.builder.configs(self._connection_params).create()
            logger.info("Snowpark session created successfully")
            
            # Pre-populate connection pool
            for _ in range(min(3, self._pool_size)):  # Start with 3 connections
                conn = await self._create_connection()
                if conn:
                    self._connection_pool.append(conn)
            
            self._initialized = True
            logger.info("Database connection pool initialized", 
                       pool_size=len(self._connection_pool))
            
        except Exception as e:
            logger.error("Failed to initialize database connections", error=str(e))
            raise
    
    async def _create_connection(self) -> Optional[snowflake.connector.SnowflakeConnection]:
        """Create a new Snowflake connection"""
        try:
            conn = snowflake.connector.connect(**self._connection_params)
            logger.debug("Created new database connection")
            return conn
        except SnowflakeError as e:
            logger.error("Failed to create Snowflake connection", error=str(e))
            return None
    
    @asynccontextmanager
    async def get_connection(self):
        """Get a connection from the pool (context manager)"""
        conn = None
        try:
            # Try to get connection from pool
            if self._connection_pool:
                conn = self._connection_pool.pop()
                
                # Test connection
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    cursor.close()
                except:
                    # Connection is stale, create new one
                    try:
                        conn.close()
                    except:
                        pass
                    conn = await self._create_connection()
            else:
                # Pool is empty, create new connection
                conn = await self._create_connection()
            
            if not conn:
                raise Exception("Unable to obtain database connection")
                
            yield conn
            
        finally:
            # Return connection to pool if it's healthy
            if conn and len(self._connection_pool) < self._pool_size:
                try:
                    # Test connection health
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    cursor.close()
                    self._connection_pool.append(conn)
                except:
                    # Connection is unhealthy, close it
                    try:
                        conn.close()
                    except:
                        pass
            elif conn:
                # Pool is full or connection is unhealthy
                try:
                    conn.close()
                except:
                    pass
    
    async def execute_query(
        self, 
        query: str, 
        params: Optional[List[Any]] = None,
        fetch_results: bool = True
    ) -> List[Dict[str, Any]]:
        """Execute a query and return results"""
        
        async with self.get_connection() as conn:
            try:
                cursor = conn.cursor()
                
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                
                if fetch_results:
                    # Fetch all results and convert to dict format
                    columns = [desc[0] for desc in cursor.description] if cursor.description else []
                    rows = cursor.fetchall()
                    results = [dict(zip(columns, row)) for row in rows]
                else:
                    results = []
                
                cursor.close()
                logger.debug("Executed query successfully", 
                           query_length=len(query),
                           result_count=len(results) if fetch_results else "N/A")
                
                return results
                
            except SnowflakeError as e:
                logger.error("Snowflake query error", 
                           error=str(e), 
                           query=query[:200] + "..." if len(query) > 200 else query)
                raise
            except Exception as e:
                logger.error("Database query error", 
                           error=str(e),
                           query=query[:200] + "..." if len(query) > 200 else query)
                raise
    
    async def execute_query_pandas(
        self, 
        query: str, 
        params: Optional[List[Any]] = None
    ) -> pd.DataFrame:
        """Execute a query and return results as pandas DataFrame"""
        
        async with self.get_connection() as conn:
            try:
                if params:
                    df = pd.read_sql(query, conn, params=params)
                else:
                    df = pd.read_sql(query, conn)
                
                logger.debug("Executed query with pandas", 
                           query_length=len(query),
                           result_shape=df.shape)
                
                return df
                
            except Exception as e:
                logger.error("Pandas query error", 
                           error=str(e),
                           query=query[:200] + "..." if len(query) > 200 else query)
                raise
    
    async def execute_snowpark(self, operation_func):
        """Execute Snowpark operations using the session"""
        if not self._session:
            raise Exception("Snowpark session not initialized")
        
        try:
            result = operation_func(self._session)
            logger.debug("Executed Snowpark operation successfully")
            return result
        except Exception as e:
            logger.error("Snowpark operation error", error=str(e))
            raise
    
    async def call_stored_procedure(
        self, 
        procedure_name: str, 
        *args
    ) -> Any:
        """Call a stored procedure"""
        
        # Format procedure call
        placeholders = ", ".join(["?" for _ in args])
        query = f"CALL {procedure_name}({placeholders})"
        
        async with self.get_connection() as conn:
            try:
                cursor = conn.cursor()
                cursor.execute(query, list(args))
                
                # Get the result
                result = cursor.fetchone()
                cursor.close()
                
                logger.debug("Called stored procedure successfully", 
                           procedure=procedure_name,
                           args_count=len(args))
                
                return result[0] if result else None
                
            except SnowflakeError as e:
                logger.error("Stored procedure error", 
                           error=str(e),
                           procedure=procedure_name)
                raise
    
    async def get_schema_info(self, database: str, schema: str) -> Dict[str, Any]:
        """Get schema information including tables and views"""
        query = """
        SELECT 
            table_catalog as database_name,
            table_schema as schema_name,
            table_name,
            table_type,
            row_count,
            bytes,
            created,
            last_altered,
            comment
        FROM information_schema.tables 
        WHERE table_catalog = ? AND table_schema = ?
        ORDER BY table_name
        """
        
        results = await self.execute_query(query, [database, schema])
        
        # Get column information
        columns_query = """
        SELECT 
            table_catalog as database_name,
            table_schema as schema_name,
            table_name,
            column_name,
            ordinal_position,
            data_type,
            is_nullable,
            column_default,
            comment
        FROM information_schema.columns
        WHERE table_catalog = ? AND table_schema = ?
        ORDER BY table_name, ordinal_position
        """
        
        columns = await self.execute_query(columns_query, [database, schema])
        
        # Group columns by table
        tables_columns = {}
        for col in columns:
            table_key = f"{col['DATABASE_NAME']}.{col['SCHEMA_NAME']}.{col['TABLE_NAME']}"
            if table_key not in tables_columns:
                tables_columns[table_key] = []
            tables_columns[table_key].append(col)
        
        # Enhance table results with column information
        for table in results:
            table_key = f"{table['DATABASE_NAME']}.{table['SCHEMA_NAME']}.{table['TABLE_NAME']}"
            table['columns'] = tables_columns.get(table_key, [])
        
        return {
            'database': database,
            'schema': schema,
            'tables': results,
            'table_count': len(results),
            'column_count': len(columns)
        }
    
    async def test_connection(self) -> bool:
        """Test database connectivity"""
        try:
            await self.execute_query("SELECT CURRENT_TIMESTAMP() as test_time")
            return True
        except Exception as e:
            logger.error("Connection test failed", error=str(e))
            return False
    
    async def get_account_usage_access(self) -> Dict[str, bool]:
        """Check access to various ACCOUNT_USAGE views"""
        views_to_check = [
            'QUERY_HISTORY',
            'ACCESS_HISTORY',
            'WAREHOUSE_METERING_HISTORY',
            'STORAGE_USAGE',
            'OBJECT_DEPENDENCIES',
            'GRANTS_TO_ROLES',
            'GRANTS_TO_USERS'
        ]
        
        access_status = {}
        
        for view in views_to_check:
            try:
                query = f"SELECT 1 FROM SNOWFLAKE.ACCOUNT_USAGE.{view} LIMIT 1"
                await self.execute_query(query)
                access_status[view] = True
            except Exception:
                access_status[view] = False
        
        return access_status
    
    async def close(self):
        """Close all connections and cleanup"""
        logger.info("Closing database connections")
        
        # Close connection pool
        for conn in self._connection_pool:
            try:
                conn.close()
            except:
                pass
        self._connection_pool.clear()
        
        # Close Snowpark session
        if self._session:
            try:
                self._session.close()
            except:
                pass
            self._session = None
        
        self._initialized = False
        logger.info("Database connections closed")


# Utility functions
async def get_database() -> SnowflakeConnection:
    """Dependency to get database connection"""
    # This will be injected by the FastAPI app
    return None

class QueryBuilder:
    """Helper class for building complex queries"""
    
    @staticmethod
    def build_lineage_query(
        source_fqn: Optional[str] = None,
        target_fqn: Optional[str] = None,
        direction: str = "both",
        depth: int = 3,
        confidence_threshold: float = 0.7
    ) -> str:
        """Build lineage query with filters"""
        base_query = """
        WITH RECURSIVE lineage_cte AS (
            -- Base case
            SELECT 
                source_fqn,
                target_fqn,
                transformation_type,
                confidence_score,
                1 as depth_level,
                ARRAY_CONSTRUCT(source_fqn, target_fqn) as path
            FROM LINEAGE.COLUMN_LINEAGE_GRAPH
            WHERE confidence_score >= ?
        """
        
        if source_fqn and direction in ["downstream", "both"]:
            base_query += " AND source_fqn = ?"
        elif target_fqn and direction in ["upstream", "both"]:
            base_query += " AND target_fqn = ?"
        
        base_query += f"""
            
            UNION ALL
            
            -- Recursive case
            SELECT 
                clg.source_fqn,
                clg.target_fqn,
                clg.transformation_type,
                clg.confidence_score,
                lc.depth_level + 1,
                ARRAY_APPEND(lc.path, clg.target_fqn)
            FROM LINEAGE.COLUMN_LINEAGE_GRAPH clg
            JOIN lineage_cte lc ON """
        
        if direction == "downstream":
            base_query += "clg.source_fqn = lc.target_fqn"
        elif direction == "upstream":
            base_query += "clg.target_fqn = lc.source_fqn"
        else:  # both
            base_query += "(clg.source_fqn = lc.target_fqn OR clg.target_fqn = lc.source_fqn)"
        
        base_query += f"""
            WHERE lc.depth_level < {depth}
            AND clg.confidence_score >= ?
            AND NOT ARRAY_CONTAINS(lc.path, clg.target_fqn) -- Prevent cycles
        )
        SELECT * FROM lineage_cte
        ORDER BY depth_level, confidence_score DESC
        """
        
        return base_query
    
    @staticmethod
    def build_cost_analysis_query(
        start_date: str,
        end_date: str,
        warehouse_name: Optional[str] = None,
        user_name: Optional[str] = None,
        groupby_columns: List[str] = None
    ) -> str:
        """Build cost analysis query"""
        
        groupby_columns = groupby_columns or ['warehouse_name']
        groupby_clause = ', '.join(groupby_columns)
        
        query = f"""
        SELECT 
            {groupby_clause},
            SUM(credits_used) as total_credits,
            SUM(credits_cost_usd) as total_cost_usd,
            COUNT(*) as query_count,
            AVG(avg_execution_time_ms) as avg_execution_time,
            SUM(total_bytes_scanned) as total_bytes_scanned,
            MIN(date_day) as start_date,
            MAX(date_day) as end_date
        FROM FINOPS.WAREHOUSE_COST_METRICS
        WHERE date_day BETWEEN ? AND ?
        """
        
        if warehouse_name:
            query += " AND warehouse_name = ?"
        
        query += f" GROUP BY {groupby_clause} ORDER BY total_cost_usd DESC"
        
        return query
"""
Cost Management Service for SnowSarva
Provides comprehensive cost monitoring, budgeting, and optimization capabilities.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from decimal import Decimal
import logging
from abc import ABC, abstractmethod

import snowflake.connector
from snowflake.connector.pandas_tools import write_pandas
import pandas as pd
import numpy as np
from sqlalchemy import text

from ..database import get_snowflake_connection
from ..utils.cortex_helper import query_cortex_complete

logger = logging.getLogger(__name__)

@dataclass
class CostMetrics:
    """Cost metrics data structure"""
    total_cost: float
    daily_cost: float
    monthly_cost: float
    cost_trend: float
    budget_utilization: float
    active_warehouses: int
    total_queries: int
    avg_query_cost: float
    storage_gb: float
    storage_cost: float
    compute_cost: float
    cloud_services_cost: float
    cost_by_warehouse: List[Dict[str, Any]]
    cost_trend_data: List[Dict[str, Any]]
    top_cost_queries: List[Dict[str, Any]]
    cost_anomalies: List[Dict[str, Any]]

@dataclass
class Budget:
    """Budget configuration and tracking"""
    id: str
    name: str
    amount: float
    spent: float
    period: str
    start_date: str
    end_date: str
    alert_thresholds: List[float]
    scope: Dict[str, Any]
    status: str
    forecast: Dict[str, Any]

@dataclass
class WarehouseMetrics:
    """Warehouse performance and cost metrics"""
    id: str
    name: str
    size: str
    status: str
    credits_used: float
    queries_executed: int
    avg_execution_time: float
    queued_queries: int
    concurrent_queries: int
    max_concurrent_queries: int
    utilization: float
    efficiency: float
    auto_suspend: int
    auto_resume: bool
    last_activity: str
    cost_per_hour: float
    total_cost: float
    idle_time: int
    recommendations: List[Dict[str, Any]]

class CostCalculationEngine:
    """Core cost calculation and analysis engine"""
    
    def __init__(self, connection):
        self.connection = connection
        self.credit_rate = 4.0  # Default credit rate - should be configurable
    
    async def get_warehouse_metering_data(self, time_range: str = '7d') -> pd.DataFrame:
        """Get warehouse metering data from Snowflake"""
        
        # Convert time range to SQL format
        days = {'24h': 1, '7d': 7, '30d': 30, '90d': 90}.get(time_range, 7)
        
        query = f"""
        SELECT 
            warehouse_name,
            start_time,
            end_time,
            credits_used,
            credits_used_compute,
            credits_used_cloud_services
        FROM TABLE(information_schema.warehouse_metering_history(
            date_range_start => dateadd('day', -{days}, current_date())
        ))
        ORDER BY start_time DESC
        """
        
        return pd.read_sql(query, self.connection)
    
    async def get_query_history_data(self, time_range: str = '7d') -> pd.DataFrame:
        """Get query history with cost attribution"""
        
        days = {'24h': 1, '7d': 7, '30d': 30, '90d': 90}.get(time_range, 7)
        
        query = f"""
        SELECT 
            query_id,
            query_text,
            user_name,
            role_name,
            warehouse_name,
            warehouse_size,
            start_time,
            end_time,
            execution_status,
            execution_time,
            queued_overload_time,
            queued_provisioning_time,
            bytes_scanned,
            bytes_written,
            partitions_scanned,
            partitions_total,
            credits_used_cloud_services,
            query_tag
        FROM account_usage.query_history 
        WHERE start_time >= dateadd('day', -{days}, current_date())
            AND execution_status = 'SUCCESS'
            AND warehouse_name IS NOT NULL
        ORDER BY start_time DESC
        """
        
        return pd.read_sql(query, self.connection)
    
    async def get_storage_metrics(self) -> pd.DataFrame:
        """Get storage cost and usage metrics"""
        
        query = """
        SELECT 
            table_catalog as database_name,
            table_schema as schema_name,
            table_name,
            active_bytes,
            time_travel_bytes,
            failsafe_bytes,
            retained_for_clone_bytes,
            table_created,
            table_altered
        FROM account_usage.table_storage_metrics
        WHERE deleted IS NULL
        ORDER BY active_bytes DESC
        """
        
        return pd.read_sql(query, self.connection)
    
    def calculate_query_cost(self, query_data: Dict[str, Any]) -> float:
        """Calculate estimated cost for a single query"""
        
        # Get warehouse size and corresponding credit cost per hour
        warehouse_sizes = {
            'X-Small': 1, 'Small': 2, 'Medium': 4, 'Large': 8,
            'X-Large': 16, '2X-Large': 32, '3X-Large': 64, '4X-Large': 128
        }
        
        size_multiplier = warehouse_sizes.get(query_data.get('warehouse_size', 'X-Small'), 1)
        execution_time_hours = query_data.get('execution_time', 0) / 3600000  # Convert ms to hours
        
        # Calculate compute cost
        compute_cost = size_multiplier * self.credit_rate * execution_time_hours
        
        # Add cloud services cost if available
        cloud_services_cost = query_data.get('credits_used_cloud_services', 0) * self.credit_rate
        
        return compute_cost + cloud_services_cost
    
    def detect_cost_anomalies(self, cost_data: pd.DataFrame) -> List[Dict[str, Any]]:
        """Detect cost anomalies using statistical analysis"""
        
        anomalies = []
        
        if len(cost_data) < 7:  # Need at least a week of data
            return anomalies
        
        # Calculate rolling statistics
        cost_data['daily_cost'] = cost_data.groupby(cost_data['start_time'].dt.date)['credits_used'].sum() * self.credit_rate
        daily_costs = cost_data['daily_cost'].dropna()
        
        if len(daily_costs) > 0:
            mean_cost = daily_costs.mean()
            std_cost = daily_costs.std()
            threshold = mean_cost + (2 * std_cost)  # 2 sigma threshold
            
            for date, cost in daily_costs.items():
                if cost > threshold:
                    severity = 'high' if cost > mean_cost + (3 * std_cost) else 'medium'
                    anomalies.append({
                        'type': 'cost_spike',
                        'severity': severity,
                        'message': f'Unusually high cost detected: ${cost:.2f} vs avg ${mean_cost:.2f}',
                        'timestamp': str(date),
                        'value': cost,
                        'threshold': threshold
                    })
        
        return anomalies

class BudgetManager:
    """Budget management and tracking"""
    
    def __init__(self, connection):
        self.connection = connection
    
    async def create_budget(self, budget_data: Dict[str, Any]) -> Budget:
        """Create a new budget"""
        
        budget_id = f"budget_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Store budget in application database
        query = """
        INSERT INTO app_cost_management.budgets (
            id, name, amount, period, start_date, end_date, 
            alert_thresholds, scope_type, scope_values, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        cursor = self.connection.cursor()
        cursor.execute(query, (
            budget_id,
            budget_data['name'],
            budget_data['amount'],
            budget_data['period'],
            budget_data['start_date'],
            budget_data['end_date'],
            ','.join(map(str, budget_data['alert_thresholds'])),
            budget_data['scope_type'],
            ','.join(budget_data['scope_values']),
            datetime.now().isoformat()
        ))
        
        # Calculate initial metrics
        spent, forecast = await self._calculate_budget_metrics(budget_id, budget_data)
        
        return Budget(
            id=budget_id,
            name=budget_data['name'],
            amount=budget_data['amount'],
            spent=spent,
            period=budget_data['period'],
            start_date=budget_data['start_date'],
            end_date=budget_data['end_date'],
            alert_thresholds=budget_data['alert_thresholds'],
            scope=budget_data['scope'],
            status=self._get_budget_status(spent, budget_data['amount'], forecast),
            forecast=forecast
        )
    
    async def get_budgets(self) -> List[Budget]:
        """Get all budgets with current status"""
        
        query = """
        SELECT id, name, amount, period, start_date, end_date, 
               alert_thresholds, scope_type, scope_values
        FROM app_cost_management.budgets
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        """
        
        cursor = self.connection.cursor()
        cursor.execute(query)
        results = cursor.fetchall()
        
        budgets = []
        for row in results:
            spent, forecast = await self._calculate_budget_metrics(row[0], {
                'start_date': row[4],
                'end_date': row[5],
                'scope_type': row[7],
                'scope_values': row[8].split(',') if row[8] else []
            })
            
            budgets.append(Budget(
                id=row[0],
                name=row[1],
                amount=row[2],
                spent=spent,
                period=row[3],
                start_date=row[4],
                end_date=row[5],
                alert_thresholds=[float(x) for x in row[6].split(',')],
                scope={
                    'type': row[7],
                    'values': row[8].split(',') if row[8] else []
                },
                status=self._get_budget_status(spent, row[2], forecast),
                forecast=forecast
            ))
        
        return budgets
    
    async def _calculate_budget_metrics(self, budget_id: str, budget_config: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
        """Calculate current spend and forecast for a budget"""
        
        # Build scope filter
        scope_filter = self._build_scope_filter(budget_config)
        
        # Calculate current spend
        query = f"""
        SELECT SUM(credits_used * 4.0) as total_cost
        FROM TABLE(information_schema.warehouse_metering_history(
            date_range_start => '{budget_config["start_date"]}',
            date_range_end => current_date()
        ))
        {scope_filter}
        """
        
        cursor = self.connection.cursor()
        cursor.execute(query)
        result = cursor.fetchone()
        current_spend = result[0] if result and result[0] else 0.0
        
        # Calculate forecast
        start_date = datetime.fromisoformat(budget_config['start_date'])
        end_date = datetime.fromisoformat(budget_config['end_date'])
        total_days = (end_date - start_date).days
        elapsed_days = (datetime.now() - start_date).days
        remaining_days = max(0, total_days - elapsed_days)
        
        if elapsed_days > 0:
            daily_burn_rate = current_spend / elapsed_days
            projected_spend = current_spend + (daily_burn_rate * remaining_days)
        else:
            daily_burn_rate = 0
            projected_spend = 0
        
        forecast = {
            'projected_spend': projected_spend,
            'days_remaining': remaining_days,
            'burn_rate': daily_burn_rate
        }
        
        return current_spend, forecast
    
    def _build_scope_filter(self, budget_config: Dict[str, Any]) -> str:
        """Build SQL filter for budget scope"""
        
        scope_type = budget_config.get('scope_type', 'account')
        scope_values = budget_config.get('scope_values', [])
        
        if scope_type == 'account' or not scope_values:
            return ""
        
        if scope_type == 'warehouse':
            values_str = "', '".join(scope_values)
            return f"WHERE warehouse_name IN ('{values_str}')"
        
        # For other scope types, we'd need to join with additional tables
        return ""
    
    def _get_budget_status(self, spent: float, budget: float, forecast: Dict[str, Any]) -> str:
        """Determine budget status"""
        
        utilization = (spent / budget) * 100 if budget > 0 else 0
        projected_utilization = (forecast['projected_spend'] / budget) * 100 if budget > 0 else 0
        
        if utilization >= 100:
            return 'exceeded'
        elif utilization >= 90 or projected_utilization >= 100:
            return 'warning'
        elif forecast['days_remaining'] > 0:
            return 'active'
        else:
            return 'inactive'

class OptimizationEngine:
    """AI-powered optimization recommendations"""
    
    def __init__(self, connection):
        self.connection = connection
    
    async def generate_warehouse_recommendations(self, warehouse_metrics: WarehouseMetrics) -> List[Dict[str, Any]]:
        """Generate optimization recommendations for a warehouse"""
        
        recommendations = []
        
        # Right-sizing recommendations
        if warehouse_metrics.utilization < 30 and warehouse_metrics.avg_execution_time > 60:
            recommendations.append({
                'id': f"resize_{warehouse_metrics.id}_downsize",
                'type': 'resize',
                'severity': 'medium',
                'title': 'Consider Downsizing Warehouse',
                'description': f'Warehouse {warehouse_metrics.name} has low utilization ({warehouse_metrics.utilization:.1f}%) and may benefit from downsizing.',
                'impact': {
                    'cost_saving': warehouse_metrics.cost_per_hour * 0.5 * 24 * 30,  # Estimated monthly savings
                    'performance_improvement': 0
                },
                'implementation': 'Use ALTER WAREHOUSE command to resize to a smaller size and monitor performance.',
                'effort': 'low'
            })
        
        # Auto-suspend optimization
        if warehouse_metrics.idle_time > 600 and warehouse_metrics.auto_suspend > 60:  # More than 10 min idle, auto-suspend > 1 min
            estimated_savings = (warehouse_metrics.idle_time / 3600) * warehouse_metrics.cost_per_hour * 30
            recommendations.append({
                'id': f"autosuspend_{warehouse_metrics.id}_optimize",
                'type': 'auto_suspend',
                'severity': 'high',
                'title': 'Optimize Auto-Suspend Setting',
                'description': f'Warehouse has {warehouse_metrics.idle_time/60:.1f} minutes of idle time. Reducing auto-suspend from {warehouse_metrics.auto_suspend} to 30 seconds could save costs.',
                'impact': {
                    'cost_saving': estimated_savings,
                    'performance_improvement': 0
                },
                'implementation': 'ALTER WAREHOUSE SET AUTO_SUSPEND = 30;',
                'effort': 'low'
            })
        
        # Query queuing recommendations
        if warehouse_metrics.queued_queries > 10:
            recommendations.append({
                'id': f"scaling_{warehouse_metrics.id}_multicluster",
                'type': 'workload_split',
                'severity': 'high',
                'title': 'Enable Multi-Cluster Warehousing',
                'description': f'High queue count ({warehouse_metrics.queued_queries}) suggests need for multi-cluster scaling.',
                'impact': {
                    'cost_saving': 0,
                    'performance_improvement': 40
                },
                'implementation': 'Enable multi-cluster warehousing with MIN_CLUSTER_COUNT=1, MAX_CLUSTER_COUNT=3',
                'effort': 'medium'
            })
        
        # Use AI to generate additional insights
        try:
            ai_recommendations = await self._get_ai_optimization_insights(warehouse_metrics)
            recommendations.extend(ai_recommendations)
        except Exception as e:
            logger.warning(f"Failed to get AI recommendations: {e}")
        
        return recommendations
    
    async def _get_ai_optimization_insights(self, warehouse_metrics: WarehouseMetrics) -> List[Dict[str, Any]]:
        """Use Snowflake Cortex to generate additional optimization insights"""
        
        prompt = f"""
        Analyze this Snowflake warehouse performance data and suggest optimization strategies:
        
        Warehouse: {warehouse_metrics.name}
        Size: {warehouse_metrics.size}
        Utilization: {warehouse_metrics.utilization}%
        Efficiency: {warehouse_metrics.efficiency}%
        Avg Execution Time: {warehouse_metrics.avg_execution_time}s
        Queued Queries: {warehouse_metrics.queued_queries}
        Concurrent Queries: {warehouse_metrics.concurrent_queries}/{warehouse_metrics.max_concurrent_queries}
        Auto-suspend: {warehouse_metrics.auto_suspend} minutes
        Idle Time: {warehouse_metrics.idle_time} minutes
        Cost per Hour: ${warehouse_metrics.cost_per_hour}
        
        Provide specific, actionable optimization recommendations focusing on:
        1. Cost reduction opportunities
        2. Performance improvements
        3. Capacity planning
        4. Query optimization
        
        Format as JSON array with fields: type, severity, title, description, impact_cost_saving, impact_performance_improvement, implementation, effort_level
        """
        
        try:
            response = await query_cortex_complete(prompt, max_tokens=1000)
            # Parse AI response and convert to recommendation format
            # This is a simplified implementation - real implementation would parse JSON
            return []  # Placeholder
        except Exception as e:
            logger.error(f"Failed to get AI recommendations: {e}")
            return []

class CostManagementService:
    """Main service class for cost management functionality"""
    
    def __init__(self):
        self.connection = None
        self.cost_engine = None
        self.budget_manager = None
        self.optimization_engine = None
    
    async def initialize(self):
        """Initialize the service with database connection"""
        self.connection = await get_snowflake_connection()
        self.cost_engine = CostCalculationEngine(self.connection)
        self.budget_manager = BudgetManager(self.connection)
        self.optimization_engine = OptimizationEngine(self.connection)
    
    async def get_cost_overview(self, time_range: str = '24h') -> CostMetrics:
        """Get comprehensive cost overview"""
        
        # Get base data
        warehouse_data = await self.cost_engine.get_warehouse_metering_data(time_range)
        query_data = await self.cost_engine.get_query_history_data(time_range)
        storage_data = await self.cost_engine.get_storage_metrics()
        
        # Calculate aggregate metrics
        total_credits = warehouse_data['credits_used'].sum()
        total_cost = total_credits * self.cost_engine.credit_rate
        
        # Calculate storage costs (simplified - actual storage pricing is complex)
        storage_gb = storage_data['active_bytes'].sum() / (1024**3)
        storage_cost = storage_gb * 0.025  # Approximate storage cost per GB
        
        # Calculate compute vs storage vs cloud services breakdown
        compute_cost = warehouse_data['credits_used_compute'].sum() * self.cost_engine.credit_rate
        cloud_services_cost = warehouse_data['credits_used_cloud_services'].sum() * self.cost_engine.credit_rate
        
        # Calculate trends (simplified)
        cost_trend = 5.2  # Placeholder - would calculate actual trend
        
        # Get cost by warehouse
        cost_by_warehouse = []
        for warehouse in warehouse_data['warehouse_name'].unique():
            wh_data = warehouse_data[warehouse_data['warehouse_name'] == warehouse]
            cost_by_warehouse.append({
                'name': warehouse,
                'cost': wh_data['credits_used'].sum() * self.cost_engine.credit_rate,
                'utilization': 75.0  # Placeholder
            })
        
        # Generate cost trend data
        cost_trend_data = []
        for i in range(7):  # Last 7 days
            date = datetime.now() - timedelta(days=i)
            cost_trend_data.append({
                'date': date.isoformat(),
                'compute': compute_cost / 7,
                'storage': storage_cost / 7,
                'cloudServices': cloud_services_cost / 7
            })
        
        # Get top cost queries
        query_data['estimated_cost'] = query_data.apply(
            lambda row: self.cost_engine.calculate_query_cost(row.to_dict()), axis=1
        )
        top_queries = query_data.nlargest(10, 'estimated_cost')
        top_cost_queries = []
        for _, query in top_queries.iterrows():
            top_cost_queries.append({
                'queryId': query['query_id'],
                'cost': query['estimated_cost'],
                'warehouse': query['warehouse_name'],
                'executionTime': query['execution_time'] / 1000  # Convert to seconds
            })
        
        # Detect anomalies
        cost_anomalies = self.cost_engine.detect_cost_anomalies(warehouse_data)
        
        return CostMetrics(
            total_cost=total_cost,
            daily_cost=total_cost / {'24h': 1, '7d': 7, '30d': 30, '90d': 90}.get(time_range, 1),
            monthly_cost=total_cost * (30 / {'24h': 1, '7d': 7, '30d': 30, '90d': 90}.get(time_range, 1)),
            cost_trend=cost_trend,
            budget_utilization=85.0,  # Placeholder
            active_warehouses=len(warehouse_data['warehouse_name'].unique()),
            total_queries=len(query_data),
            avg_query_cost=query_data['estimated_cost'].mean() if len(query_data) > 0 else 0,
            storage_gb=storage_gb,
            storage_cost=storage_cost,
            compute_cost=compute_cost,
            cloud_services_cost=cloud_services_cost,
            cost_by_warehouse=cost_by_warehouse,
            cost_trend_data=cost_trend_data,
            top_cost_queries=top_cost_queries,
            cost_anomalies=cost_anomalies
        )
    
    async def get_warehouse_metrics(self, time_range: str = '7d') -> List[WarehouseMetrics]:
        """Get detailed warehouse performance and cost metrics"""
        
        # Get warehouse list and metrics
        warehouse_query = """
        SELECT warehouse_name, warehouse_size
        FROM account_usage.warehouse_metering_history
        WHERE start_time >= dateadd('day', -7, current_date())
        GROUP BY warehouse_name, warehouse_size
        """
        
        cursor = self.connection.cursor()
        cursor.execute(warehouse_query)
        warehouses = cursor.fetchall()
        
        warehouse_metrics = []
        for wh_name, wh_size in warehouses:
            # Calculate detailed metrics for each warehouse
            metrics = await self._calculate_warehouse_metrics(wh_name, wh_size, time_range)
            
            # Generate recommendations
            recommendations = await self.optimization_engine.generate_warehouse_recommendations(metrics)
            metrics.recommendations = recommendations
            
            warehouse_metrics.append(metrics)
        
        return warehouse_metrics
    
    async def _calculate_warehouse_metrics(self, warehouse_name: str, warehouse_size: str, time_range: str) -> WarehouseMetrics:
        """Calculate detailed metrics for a specific warehouse"""
        
        days = {'24h': 1, '7d': 7, '30d': 30}.get(time_range, 7)
        
        # Get warehouse metering data
        metering_query = f"""
        SELECT 
            SUM(credits_used) as total_credits,
            COUNT(*) as periods,
            AVG(credits_used) as avg_credits_per_period
        FROM TABLE(information_schema.warehouse_metering_history(
            date_range_start => dateadd('day', -{days}, current_date()),
            warehouse_name => '{warehouse_name}'
        ))
        """
        
        cursor = self.connection.cursor()
        cursor.execute(metering_query)
        metering_result = cursor.fetchone()
        
        # Get query metrics
        query_query = f"""
        SELECT 
            COUNT(*) as total_queries,
            AVG(execution_time) as avg_execution_time,
            SUM(CASE WHEN queued_overload_time > 0 OR queued_provisioning_time > 0 THEN 1 ELSE 0 END) as queued_queries,
            MAX(CASE WHEN execution_status = 'RUNNING' THEN 1 ELSE 0 END) as is_running
        FROM account_usage.query_history
        WHERE warehouse_name = '{warehouse_name}'
            AND start_time >= dateadd('day', -{days}, current_date())
        """
        
        cursor.execute(query_query)
        query_result = cursor.fetchone()
        
        # Calculate derived metrics
        credits_used = metering_result[0] if metering_result[0] else 0
        total_cost = credits_used * 4.0  # Assuming $4 per credit
        
        # Warehouse size cost mapping
        size_credits_per_hour = {
            'X-Small': 1, 'Small': 2, 'Medium': 4, 'Large': 8,
            'X-Large': 16, '2X-Large': 32, '3X-Large': 64, '4X-Large': 128
        }
        cost_per_hour = size_credits_per_hour.get(warehouse_size, 1) * 4.0
        
        # Mock some metrics that would require more complex calculations
        utilization = min(100, (credits_used / (days * 24)) * 100) if days > 0 else 0
        efficiency = max(0, 100 - (query_result[3] * 10)) if query_result else 75
        
        return WarehouseMetrics(
            id=warehouse_name.lower().replace(' ', '_'),
            name=warehouse_name,
            size=warehouse_size,
            status='running' if query_result and query_result[3] else 'suspended',
            credits_used=credits_used,
            queries_executed=query_result[0] if query_result else 0,
            avg_execution_time=query_result[1] / 1000 if query_result and query_result[1] else 0,
            queued_queries=query_result[2] if query_result else 0,
            concurrent_queries=1 if query_result and query_result[3] else 0,
            max_concurrent_queries=size_credits_per_hour.get(warehouse_size, 1),
            utilization=utilization,
            efficiency=efficiency,
            auto_suspend=60,  # Default value - would query SHOW WAREHOUSES
            auto_resume=True,
            last_activity=datetime.now().isoformat(),
            cost_per_hour=cost_per_hour,
            total_cost=total_cost,
            idle_time=300,  # Placeholder
            recommendations=[]  # Will be filled by caller
        )
    
    async def create_budget(self, budget_data: Dict[str, Any]) -> Budget:
        """Create a new budget"""
        return await self.budget_manager.create_budget(budget_data)
    
    async def get_budgets(self) -> List[Budget]:
        """Get all budgets"""
        return await self.budget_manager.get_budgets()
    
    async def get_optimization_summary(self) -> Dict[str, Any]:
        """Get optimization summary metrics"""
        
        # This would aggregate data across all warehouses
        return {
            'total_potential_savings': 15000.0,
            'implemented_optimizations': 12,
            'pending_recommendations': 8,
            'avg_efficiency_improvement': 23.5
        }

# Global service instance
cost_management_service = CostManagementService()
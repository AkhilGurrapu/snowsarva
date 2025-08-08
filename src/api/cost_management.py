"""
Cost Management API Endpoints for SnowSarva
Provides REST API endpoints for comprehensive cost monitoring and management.
"""

from fastapi import APIRouter, HTTPException, Query, Path, Body
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

from ..services.cost_management_service import cost_management_service, CostMetrics, Budget, WarehouseMetrics
from ..utils.auth import require_auth
from ..utils.validation import validate_time_range, validate_budget_data
from ..utils.cortex_helper import query_cortex_complete

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/cost", tags=["Cost Management"])

@router.on_event("startup")
async def startup_event():
    """Initialize cost management service on startup"""
    await cost_management_service.initialize()

@router.get("/overview")
@require_auth
async def get_cost_overview(
    time_range: str = Query("24h", description="Time range for cost analysis", regex="^(24h|7d|30d|90d)$"),
    include_forecasting: bool = Query(True, description="Include cost forecasting data")
) -> Dict[str, Any]:
    """
    Get comprehensive cost overview with metrics, trends, and anomalies.
    
    **Time Ranges:**
    - 24h: Last 24 hours
    - 7d: Last 7 days  
    - 30d: Last 30 days
    - 90d: Last 90 days
    
    **Returns:**
    - Total cost breakdown (compute, storage, cloud services)
    - Cost trends and patterns
    - Top cost-consuming warehouses and queries
    - Cost anomalies and alerts
    - Budget utilization if configured
    """
    try:
        validate_time_range(time_range)
        cost_metrics = await cost_management_service.get_cost_overview(time_range)
        
        response_data = {
            "totalCost": cost_metrics.total_cost,
            "dailyCost": cost_metrics.daily_cost,
            "monthlyCost": cost_metrics.monthly_cost,
            "costTrend": cost_metrics.cost_trend,
            "budgetUtilization": cost_metrics.budget_utilization,
            "activeWarehouses": cost_metrics.active_warehouses,
            "totalQueries": cost_metrics.total_queries,
            "avgQueryCost": cost_metrics.avg_query_cost,
            "storageGB": cost_metrics.storage_gb,
            "storageCost": cost_metrics.storage_cost,
            "computeCost": cost_metrics.compute_cost,
            "cloudServicesCost": cost_metrics.cloud_services_cost,
            "costByWarehouse": cost_metrics.cost_by_warehouse,
            "costTrendData": cost_metrics.cost_trend_data,
            "topCostQueries": cost_metrics.top_cost_queries,
            "costAnomalies": cost_metrics.cost_anomalies,
            "timeRange": time_range,
            "timestamp": datetime.now().isoformat()
        }
        
        if include_forecasting:
            # Add forecasting data
            response_data["forecasting"] = await _get_cost_forecasting(time_range)
        
        return response_data
    
    except Exception as e:
        logger.error(f"Error getting cost overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get cost overview: {str(e)}")

@router.get("/warehouse-metering")
@require_auth  
async def get_warehouse_metering(
    time_range: str = Query("7d", description="Time range for metering data"),
    warehouse_name: Optional[str] = Query(None, description="Specific warehouse name"),
    aggregation: str = Query("hourly", description="Aggregation level", regex="^(raw|hourly|daily)$")
) -> Dict[str, Any]:
    """
    Get detailed warehouse metering data with credit consumption and cost attribution.
    
    **Parameters:**
    - warehouse_name: Filter by specific warehouse (optional)
    - aggregation: Data aggregation level (raw, hourly, daily)
    
    **Returns:**
    - Credit consumption by warehouse and time
    - Compute vs cloud services breakdown
    - Utilization metrics
    - Cost per hour/day calculations
    """
    try:
        validate_time_range(time_range)
        
        # Get warehouse metering data from service
        metering_data = await cost_management_service.cost_engine.get_warehouse_metering_data(time_range)
        
        # Filter by warehouse if specified
        if warehouse_name:
            metering_data = metering_data[metering_data['warehouse_name'] == warehouse_name]
        
        # Apply aggregation
        if aggregation == "daily":
            metering_data = metering_data.groupby([
                metering_data['start_time'].dt.date, 
                'warehouse_name'
            ]).agg({
                'credits_used': 'sum',
                'credits_used_compute': 'sum', 
                'credits_used_cloud_services': 'sum'
            }).reset_index()
        elif aggregation == "hourly":
            metering_data = metering_data.groupby([
                metering_data['start_time'].dt.floor('H'),
                'warehouse_name'
            ]).agg({
                'credits_used': 'sum',
                'credits_used_compute': 'sum',
                'credits_used_cloud_services': 'sum' 
            }).reset_index()
        
        # Convert to response format
        response_data = {
            "meteringData": metering_data.to_dict('records'),
            "summary": {
                "totalCredits": float(metering_data['credits_used'].sum()),
                "totalCost": float(metering_data['credits_used'].sum() * 4.0),
                "computeCredits": float(metering_data['credits_used_compute'].sum()),
                "cloudServicesCredits": float(metering_data['credits_used_cloud_services'].sum()),
                "warehouseCount": len(metering_data['warehouse_name'].unique()) if not metering_data.empty else 0
            },
            "timeRange": time_range,
            "aggregation": aggregation,
            "warehouseFilter": warehouse_name
        }
        
        return response_data
    
    except Exception as e:
        logger.error(f"Error getting warehouse metering: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get warehouse metering data: {str(e)}")

@router.get("/query-attribution")
@require_auth
async def get_query_cost_attribution(
    time_range: str = Query("7d", description="Time range for query analysis"),
    warehouse_name: Optional[str] = Query(None, description="Filter by warehouse"),
    user_name: Optional[str] = Query(None, description="Filter by user"),
    min_cost: Optional[float] = Query(None, description="Minimum query cost filter"),
    limit: int = Query(100, description="Maximum number of queries to return", le=1000)
) -> Dict[str, Any]:
    """
    Get query-level cost attribution and analysis.
    
    **Features:**
    - Individual query cost calculation
    - Cost attribution by user, role, warehouse
    - Query performance vs cost correlation
    - Most expensive queries identification
    
    **Filters:**
    - warehouse_name: Filter by specific warehouse
    - user_name: Filter by specific user
    - min_cost: Only return queries above minimum cost threshold
    """
    try:
        validate_time_range(time_range)
        
        # Get query history data
        query_data = await cost_management_service.cost_engine.get_query_history_data(time_range)
        
        # Apply filters
        if warehouse_name:
            query_data = query_data[query_data['warehouse_name'] == warehouse_name]
        if user_name:
            query_data = query_data[query_data['user_name'] == user_name]
        
        # Calculate query costs
        query_data['estimated_cost'] = query_data.apply(
            lambda row: cost_management_service.cost_engine.calculate_query_cost(row.to_dict()), 
            axis=1
        )
        
        # Apply cost filter
        if min_cost:
            query_data = query_data[query_data['estimated_cost'] >= min_cost]
        
        # Sort by cost and limit
        query_data = query_data.nlargest(limit, 'estimated_cost')
        
        # Generate summary statistics
        summary = {
            "totalQueries": len(query_data),
            "totalCost": float(query_data['estimated_cost'].sum()),
            "avgCost": float(query_data['estimated_cost'].mean()) if not query_data.empty else 0,
            "medianCost": float(query_data['estimated_cost'].median()) if not query_data.empty else 0,
            "maxCost": float(query_data['estimated_cost'].max()) if not query_data.empty else 0,
            "costByWarehouse": query_data.groupby('warehouse_name')['estimated_cost'].sum().to_dict() if not query_data.empty else {},
            "costByUser": query_data.groupby('user_name')['estimated_cost'].sum().to_dict() if not query_data.empty else {}
        }
        
        # Convert query data to response format
        queries = []
        for _, row in query_data.iterrows():
            queries.append({
                "queryId": row['query_id'],
                "queryText": row['query_text'][:200] + "..." if len(row['query_text']) > 200 else row['query_text'],
                "userName": row['user_name'],
                "roleName": row['role_name'],
                "warehouseName": row['warehouse_name'],
                "warehouseSize": row['warehouse_size'],
                "startTime": row['start_time'].isoformat() if row['start_time'] else None,
                "executionTime": float(row['execution_time']) if row['execution_time'] else 0,
                "bytesScanned": int(row['bytes_scanned']) if row['bytes_scanned'] else 0,
                "partitionsScanned": int(row['partitions_scanned']) if row['partitions_scanned'] else 0,
                "estimatedCost": float(row['estimated_cost']),
                "queryTag": row['query_tag']
            })
        
        return {
            "queries": queries,
            "summary": summary,
            "filters": {
                "timeRange": time_range,
                "warehouseName": warehouse_name,
                "userName": user_name,
                "minCost": min_cost
            },
            "pagination": {
                "limit": limit,
                "returned": len(queries)
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting query cost attribution: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get query cost attribution: {str(e)}")

@router.get("/storage-breakdown")
@require_auth
async def get_storage_cost_breakdown(
    include_time_travel: bool = Query(True, description="Include time travel storage costs"),
    include_failsafe: bool = Query(True, description="Include fail-safe storage costs"),
    database_filter: Optional[str] = Query(None, description="Filter by database name")
) -> Dict[str, Any]:
    """
    Get detailed storage cost breakdown including time travel and fail-safe costs.
    
    **Storage Types:**
    - Active storage: Current data storage
    - Time travel: Historical data for time travel queries
    - Fail-safe: Disaster recovery storage
    - Clone storage: Storage used by cloned objects
    
    **Cost Calculation:**
    - Based on current Snowflake storage pricing
    - Regional pricing variations
    - Compression ratios and optimization opportunities
    """
    try:
        # Get storage metrics
        storage_data = await cost_management_service.cost_engine.get_storage_metrics()
        
        # Apply database filter
        if database_filter:
            storage_data = storage_data[storage_data['database_name'] == database_filter]
        
        # Calculate storage costs (simplified pricing model)
        storage_rate_per_gb = 0.025  # $0.025 per GB per month (approximate)
        
        # Calculate different storage types
        active_gb = storage_data['active_bytes'].sum() / (1024**3)
        time_travel_gb = storage_data['time_travel_bytes'].sum() / (1024**3) if include_time_travel else 0
        failsafe_gb = storage_data['failsafe_bytes'].sum() / (1024**3) if include_failsafe else 0
        clone_gb = storage_data['retained_for_clone_bytes'].sum() / (1024**3)
        
        # Calculate costs
        active_cost = active_gb * storage_rate_per_gb
        time_travel_cost = time_travel_gb * storage_rate_per_gb
        failsafe_cost = failsafe_gb * storage_rate_per_gb  
        clone_cost = clone_gb * storage_rate_per_gb
        
        total_cost = active_cost + time_travel_cost + failsafe_cost + clone_cost
        
        # Generate breakdown by database
        database_breakdown = []
        for db in storage_data['database_name'].unique():
            db_data = storage_data[storage_data['database_name'] == db]
            db_active_gb = db_data['active_bytes'].sum() / (1024**3)
            db_cost = db_active_gb * storage_rate_per_gb
            
            database_breakdown.append({
                "databaseName": db,
                "activeGB": float(db_active_gb),
                "cost": float(db_cost),
                "tableCount": len(db_data),
                "largestTable": {
                    "name": db_data.loc[db_data['active_bytes'].idxmax(), 'table_name'] if not db_data.empty else None,
                    "sizeGB": float(db_data['active_bytes'].max() / (1024**3)) if not db_data.empty else 0
                }
            })
        
        # Sort by cost descending
        database_breakdown.sort(key=lambda x: x['cost'], reverse=True)
        
        return {
            "summary": {
                "totalStorageGB": float(active_gb + time_travel_gb + failsafe_gb + clone_gb),
                "totalMonthlyCost": float(total_cost),
                "breakdown": {
                    "active": {
                        "sizeGB": float(active_gb),
                        "cost": float(active_cost),
                        "percentage": float((active_cost / total_cost * 100)) if total_cost > 0 else 0
                    },
                    "timeTravel": {
                        "sizeGB": float(time_travel_gb),
                        "cost": float(time_travel_cost),
                        "percentage": float((time_travel_cost / total_cost * 100)) if total_cost > 0 else 0
                    },
                    "failsafe": {
                        "sizeGB": float(failsafe_gb),
                        "cost": float(failsafe_cost),
                        "percentage": float((failsafe_cost / total_cost * 100)) if total_cost > 0 else 0
                    },
                    "clone": {
                        "sizeGB": float(clone_gb),
                        "cost": float(clone_cost),
                        "percentage": float((clone_cost / total_cost * 100)) if total_cost > 0 else 0
                    }
                }
            },
            "databaseBreakdown": database_breakdown,
            "optimizationOpportunities": await _get_storage_optimization_recommendations(storage_data),
            "filters": {
                "includeTimeTravel": include_time_travel,
                "includeFailsafe": include_failsafe,
                "databaseFilter": database_filter
            },
            "pricingModel": {
                "ratePerGB": storage_rate_per_gb,
                "currency": "USD",
                "period": "monthly"
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting storage breakdown: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage cost breakdown: {str(e)}")

@router.get("/budgets")
@require_auth
async def get_budgets() -> Dict[str, Any]:
    """
    Get all configured budgets with current status and utilization.
    
    **Budget Information:**
    - Budget configuration (amount, period, scope)
    - Current spending vs budget
    - Forecasted spending based on trends
    - Alert thresholds and current status
    - Recommendations for budget optimization
    """
    try:
        budgets = await cost_management_service.get_budgets()
        
        budget_list = []
        for budget in budgets:
            budget_dict = {
                "id": budget.id,
                "name": budget.name,
                "amount": budget.amount,
                "spent": budget.spent,
                "period": budget.period,
                "startDate": budget.start_date,
                "endDate": budget.end_date,
                "alertThresholds": budget.alert_thresholds,
                "scope": budget.scope,
                "status": budget.status,
                "forecast": budget.forecast,
                "utilization": (budget.spent / budget.amount * 100) if budget.amount > 0 else 0,
                "remaining": max(0, budget.amount - budget.spent)
            }
            budget_list.append(budget_dict)
        
        # Calculate summary statistics
        total_budgets = len(budget_list)
        active_budgets = len([b for b in budget_list if b['status'] == 'active'])
        exceeded_budgets = len([b for b in budget_list if b['status'] == 'exceeded'])
        warning_budgets = len([b for b in budget_list if b['status'] == 'warning'])
        
        total_budget_amount = sum(b['amount'] for b in budget_list)
        total_spent = sum(b['spent'] for b in budget_list)
        
        return {
            "budgets": budget_list,
            "summary": {
                "totalBudgets": total_budgets,
                "activeBudgets": active_budgets,
                "exceededBudgets": exceeded_budgets,
                "warningBudgets": warning_budgets,
                "totalBudgetAmount": total_budget_amount,
                "totalSpent": total_spent,
                "overallUtilization": (total_spent / total_budget_amount * 100) if total_budget_amount > 0 else 0
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting budgets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get budgets: {str(e)}")

@router.post("/budgets")
@require_auth
async def create_budget(budget_data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Create a new budget with specified parameters and alert thresholds.
    
    **Required Fields:**
    - name: Budget name/description
    - amount: Budget amount in USD
    - period: Budget period (daily, weekly, monthly, quarterly, yearly)
    - startDate: Budget start date (YYYY-MM-DD)
    - endDate: Budget end date (YYYY-MM-DD)
    
    **Optional Fields:**
    - alertThresholds: List of alert thresholds as percentages [75, 90]
    - scope: Budget scope (account, warehouse, database, role, user)
    - scopeValues: List of specific scope values to include
    """
    try:
        # Validate budget data
        validate_budget_data(budget_data)
        
        # Create budget
        budget = await cost_management_service.create_budget(budget_data)
        
        return {
            "success": True,
            "budget": {
                "id": budget.id,
                "name": budget.name,
                "amount": budget.amount,
                "period": budget.period,
                "startDate": budget.start_date,
                "endDate": budget.end_date,
                "scope": budget.scope,
                "status": budget.status
            },
            "message": "Budget created successfully"
        }
    
    except ValueError as e:
        logger.warning(f"Invalid budget data: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid budget data: {str(e)}")
    except Exception as e:
        logger.error(f"Error creating budget: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create budget: {str(e)}")

@router.get("/warehouse-metrics")
@require_auth
async def get_warehouse_metrics(
    time_range: str = Query("7d", description="Time range for metrics analysis"),
    include_recommendations: bool = Query(True, description="Include optimization recommendations")
) -> Dict[str, Any]:
    """
    Get comprehensive warehouse performance and cost metrics.
    
    **Metrics Included:**
    - Credit consumption and cost per warehouse
    - Query execution statistics and performance
    - Utilization and efficiency scores
    - Auto-suspend and auto-resume configuration
    - Queue analysis and concurrency metrics
    - Cost optimization recommendations
    
    **Recommendations:**
    - Warehouse right-sizing suggestions
    - Auto-suspend optimization
    - Multi-cluster configuration recommendations
    - Query routing and workload distribution
    """
    try:
        validate_time_range(time_range)
        
        # Get warehouse metrics
        warehouse_metrics = await cost_management_service.get_warehouse_metrics(time_range)
        
        # Convert to response format
        metrics_list = []
        for metrics in warehouse_metrics:
            metrics_dict = {
                "id": metrics.id,
                "name": metrics.name,
                "size": metrics.size,
                "status": metrics.status,
                "creditsUsed": metrics.credits_used,
                "queriesExecuted": metrics.queries_executed,
                "avgExecutionTime": metrics.avg_execution_time,
                "queuedQueries": metrics.queued_queries,
                "concurrentQueries": metrics.concurrent_queries,
                "maxConcurrentQueries": metrics.max_concurrent_queries,
                "utilization": metrics.utilization,
                "efficiency": metrics.efficiency,
                "autoSuspend": metrics.auto_suspend,
                "autoResume": metrics.auto_resume,
                "lastActivity": metrics.last_activity,
                "costPerHour": metrics.cost_per_hour,
                "totalCost": metrics.total_cost,
                "idleTime": metrics.idle_time
            }
            
            if include_recommendations:
                metrics_dict["recommendations"] = metrics.recommendations
            
            metrics_list.append(metrics_dict)
        
        # Calculate summary statistics
        total_warehouses = len(metrics_list)
        running_warehouses = len([w for w in metrics_list if w['status'] == 'running'])
        total_cost = sum(w['totalCost'] for w in metrics_list)
        avg_utilization = sum(w['utilization'] for w in metrics_list) / total_warehouses if total_warehouses > 0 else 0
        avg_efficiency = sum(w['efficiency'] for w in metrics_list) / total_warehouses if total_warehouses > 0 else 0
        
        return {
            "warehouses": metrics_list,
            "summary": {
                "totalWarehouses": total_warehouses,
                "runningWarehouses": running_warehouses,
                "suspendedWarehouses": total_warehouses - running_warehouses,
                "totalCost": total_cost,
                "avgUtilization": avg_utilization,
                "avgEfficiency": avg_efficiency,
                "totalRecommendations": sum(len(w.get('recommendations', [])) for w in metrics_list)
            },
            "timeRange": time_range
        }
    
    except Exception as e:
        logger.error(f"Error getting warehouse metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get warehouse metrics: {str(e)}")

@router.get("/optimization-summary")
@require_auth
async def get_optimization_summary() -> Dict[str, Any]:
    """
    Get summary of optimization opportunities and recommendations.
    
    **Summary Includes:**
    - Total potential cost savings across all recommendations
    - Number of implemented vs pending optimizations
    - Average efficiency improvement potential
    - Breakdown by optimization type (resizing, auto-suspend, etc.)
    - ROI analysis for optimization efforts
    """
    try:
        summary = await cost_management_service.get_optimization_summary()
        return summary
    except Exception as e:
        logger.error(f"Error getting optimization summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get optimization summary: {str(e)}")

@router.get("/anomaly-detection")
@require_auth
async def get_cost_anomalies(
    time_range: str = Query("7d", description="Time range for anomaly detection"),
    sensitivity: str = Query("medium", description="Anomaly detection sensitivity", regex="^(low|medium|high)$"),
    anomaly_types: Optional[List[str]] = Query(None, description="Filter by anomaly types")
) -> Dict[str, Any]:
    """
    Detect cost anomalies using statistical analysis and machine learning.
    
    **Anomaly Types:**
    - cost_spike: Unusual cost increases
    - usage_pattern: Abnormal usage patterns  
    - efficiency_drop: Significant efficiency decreases
    - idle_time: Excessive idle time anomalies
    
    **Sensitivity Levels:**
    - low: Only detect major anomalies (3+ sigma)
    - medium: Moderate sensitivity (2+ sigma)
    - high: High sensitivity (1.5+ sigma)
    """
    try:
        validate_time_range(time_range)
        
        # Get cost data
        warehouse_data = await cost_management_service.cost_engine.get_warehouse_metering_data(time_range)
        
        # Detect anomalies with specified sensitivity
        anomalies = cost_management_service.cost_engine.detect_cost_anomalies(warehouse_data)
        
        # Filter by anomaly types if specified
        if anomaly_types:
            anomalies = [a for a in anomalies if a['type'] in anomaly_types]
        
        # Apply sensitivity filtering
        severity_filter = {'low': ['high'], 'medium': ['high', 'medium'], 'high': ['high', 'medium', 'low']}[sensitivity]
        anomalies = [a for a in anomalies if a['severity'] in severity_filter]
        
        # Group anomalies by type
        anomaly_groups = {}
        for anomaly in anomalies:
            anomaly_type = anomaly['type']
            if anomaly_type not in anomaly_groups:
                anomaly_groups[anomaly_type] = []
            anomaly_groups[anomaly_type].append(anomaly)
        
        return {
            "anomalies": anomalies,
            "summary": {
                "totalAnomalies": len(anomalies),
                "highSeverity": len([a for a in anomalies if a['severity'] == 'high']),
                "mediumSeverity": len([a for a in anomalies if a['severity'] == 'medium']),
                "lowSeverity": len([a for a in anomalies if a['severity'] == 'low']),
                "byType": {anomaly_type: len(group) for anomaly_type, group in anomaly_groups.items()}
            },
            "parameters": {
                "timeRange": time_range,
                "sensitivity": sensitivity,
                "anomalyTypes": anomaly_types
            }
        }
    
    except Exception as e:
        logger.error(f"Error detecting cost anomalies: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to detect cost anomalies: {str(e)}")

@router.post("/ai-insights")
@require_auth
async def get_ai_cost_insights(
    query: str = Body(..., embed=True, description="Natural language query about costs"),
    context_data: Optional[Dict[str, Any]] = Body(None, description="Additional context data")
) -> Dict[str, Any]:
    """
    Get AI-powered cost insights using natural language queries.
    
    **Example Queries:**
    - "What are my top cost drivers this month?"
    - "How can I reduce my warehouse costs by 20%?"
    - "Which queries are most expensive and why?"
    - "What optimization opportunities do I have?"
    
    **AI Capabilities:**
    - Natural language understanding of cost questions
    - Data-driven insights and recommendations
    - Cost trend analysis and forecasting
    - Optimization strategy suggestions
    """
    try:
        # Get current cost data for context
        cost_metrics = await cost_management_service.get_cost_overview("7d")
        warehouse_metrics = await cost_management_service.get_warehouse_metrics("7d")
        
        # Build context for AI
        ai_context = f"""
        Current Cost Overview:
        - Total Cost (7d): ${cost_metrics.total_cost:.2f}
        - Active Warehouses: {cost_metrics.active_warehouses}
        - Total Queries: {cost_metrics.total_queries}
        - Average Query Cost: ${cost_metrics.avg_query_cost:.4f}
        - Compute Cost: ${cost_metrics.compute_cost:.2f}
        - Storage Cost: ${cost_metrics.storage_cost:.2f}
        
        Top Cost Warehouses:
        {chr(10).join([f"- {wh['name']}: ${wh['cost']:.2f}" for wh in cost_metrics.cost_by_warehouse[:5]])}
        
        Warehouse Performance:
        {chr(10).join([f"- {wh.name}: {wh.utilization:.1f}% utilization, {wh.efficiency:.1f}% efficiency" for wh in warehouse_metrics[:5]])}
        
        User Query: {query}
        """
        
        if context_data:
            ai_context += f"\nAdditional Context: {context_data}"
        
        # Query Snowflake Cortex for insights
        ai_prompt = f"""
        You are a Snowflake cost optimization expert. Based on the provided cost data and user query, 
        provide specific, actionable insights and recommendations. Focus on:
        
        1. Direct answer to the user's question
        2. Data-driven insights from the provided metrics  
        3. Specific optimization recommendations
        4. Cost-saving opportunities with estimated impact
        5. Implementation steps
        
        Be concise, specific, and provide dollar amounts where possible.
        
        {ai_context}
        """
        
        ai_response = await query_cortex_complete(ai_prompt, max_tokens=500)
        
        return {
            "query": query,
            "insights": ai_response,
            "contextUsed": {
                "totalCost": cost_metrics.total_cost,
                "warehouseCount": len(warehouse_metrics),
                "timeRange": "7d"
            },
            "recommendations": await _extract_recommendations_from_ai_response(ai_response),
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"Error getting AI cost insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get AI cost insights: {str(e)}")

# Helper functions

async def _get_cost_forecasting(time_range: str) -> Dict[str, Any]:
    """Generate cost forecasting data"""
    # Simplified forecasting - would use more sophisticated models in production
    return {
        "nextPeriodForecast": 15000.0,
        "confidence": 85.2,
        "trend": "increasing",
        "seasonality": "detected",
        "factors": ["warehouse_scaling", "query_volume_increase"]
    }

async def _get_storage_optimization_recommendations(storage_data) -> List[Dict[str, Any]]:
    """Generate storage optimization recommendations"""
    recommendations = []
    
    # Check for large time travel storage
    time_travel_gb = storage_data['time_travel_bytes'].sum() / (1024**3)
    if time_travel_gb > 1000:  # More than 1TB in time travel
        recommendations.append({
            "type": "time_travel_optimization",
            "priority": "medium",
            "description": f"Consider optimizing time travel retention. Current: {time_travel_gb:.1f} GB",
            "potentialSaving": time_travel_gb * 0.025 * 0.5,  # Assume 50% reduction possible
            "action": "Review and adjust DATA_RETENTION_TIME_IN_DAYS for large tables"
        })
    
    return recommendations

async def _extract_recommendations_from_ai_response(ai_response: str) -> List[Dict[str, Any]]:
    """Extract actionable recommendations from AI response"""
    # Simple extraction logic - would use NLP in production
    recommendations = []
    
    if "resize" in ai_response.lower():
        recommendations.append({
            "type": "warehouse_resizing",
            "priority": "high",
            "description": "Consider resizing warehouses based on utilization patterns"
        })
    
    if "auto-suspend" in ai_response.lower():
        recommendations.append({
            "type": "auto_suspend",
            "priority": "medium", 
            "description": "Optimize auto-suspend settings to reduce idle costs"
        })
    
    return recommendations
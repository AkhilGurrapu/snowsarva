"""
Cost Management API endpoints for Snowsarva
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field
import structlog

from ...core.auth import User, get_current_user, check_permission
from ...core.database import SnowflakeConnection
from ...services.cost_service import CostManagementService
from ...models.cost_management import (
    WarehouseCostMetrics, QueryCostAnalysis, BudgetConfiguration,
    CostForecast, CostOptimizationRecommendation, BudgetAlert
)

logger = structlog.get_logger(__name__)
router = APIRouter()

# Response models
class CostResponse(BaseModel):
    """Base cost response"""
    success: bool = True
    message: str = "Success"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class WarehouseCostResponse(CostResponse):
    """Warehouse cost response"""
    metrics: List[WarehouseCostMetrics]
    total_cost: float
    total_credits: float
    time_range: Dict[str, Any]

class QueryCostResponse(CostResponse):
    """Query cost analysis response"""
    queries: List[QueryCostAnalysis]
    total_queries: int
    avg_cost: float
    cost_distribution: Dict[str, Any]

class BudgetResponse(CostResponse):
    """Budget response"""
    budget: BudgetConfiguration
    current_spend: float
    remaining_budget: float
    utilization_percentage: float

class ForecastResponse(CostResponse):
    """Cost forecast response"""
    forecast: CostForecast
    confidence_level: float
    factors: List[str]

# Request models
class DateRangeRequest(BaseModel):
    """Date range request"""
    start_date: date
    end_date: date
    
    def validate_range(self):
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        if (self.end_date - self.start_date).days > 365:
            raise ValueError("Date range cannot exceed 365 days")

class CostAnalysisRequest(DateRangeRequest):
    """Cost analysis request"""
    warehouse_names: Optional[List[str]] = None
    user_names: Optional[List[str]] = None
    groupby: List[str] = ["warehouse_name"]
    include_query_details: bool = False

class BudgetRequest(BaseModel):
    """Budget creation request"""
    budget_name: str = Field(..., min_length=1, max_length=100)
    budget_scope: str = Field(..., description="warehouse, user, role, or global")
    scope_value: Optional[str] = None
    budget_amount_usd: float = Field(..., gt=0)
    budget_period: str = Field(..., regex="^(daily|weekly|monthly|quarterly|yearly)$")
    start_date: date
    end_date: Optional[date] = None
    alert_thresholds: List[float] = Field(default=[75.0, 90.0, 100.0])

# Dependency to get cost service
async def get_cost_service() -> CostManagementService:
    """Get cost management service instance"""
    db = SnowflakeConnection()
    return CostManagementService(db)

@router.get("/health")
async def cost_health_check():
    """Health check for cost management service"""
    return {"status": "healthy", "service": "cost-management"}

@router.get("/warehouses", response_model=WarehouseCostResponse)
async def get_warehouse_costs(
    start_date: date = Query(..., description="Start date for analysis"),
    end_date: date = Query(..., description="End date for analysis"),
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    groupby: str = Query("day", regex="^(day|week|month)$", description="Grouping period"),
    include_idle_time: bool = Query(True, description="Include idle time costs"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get warehouse cost metrics and analysis"""
    
    try:
        logger.info("Getting warehouse costs", 
                   start_date=start_date,
                   end_date=end_date,
                   warehouse_names=warehouse_names,
                   user=current_user.username)
        
        # Validate date range
        request = DateRangeRequest(start_date=start_date, end_date=end_date)
        request.validate_range()
        
        metrics, summary = await cost_service.get_warehouse_costs(
            start_date=start_date,
            end_date=end_date,
            warehouse_names=warehouse_names,
            groupby=groupby,
            include_idle_time=include_idle_time
        )
        
        return WarehouseCostResponse(
            metrics=metrics,
            total_cost=summary.get("total_cost", 0.0),
            total_credits=summary.get("total_credits", 0.0),
            time_range={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "days": (end_date - start_date).days
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get warehouse costs", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queries", response_model=QueryCostResponse)
async def get_query_costs(
    start_date: date = Query(..., description="Start date for analysis"),
    end_date: date = Query(..., description="End date for analysis"),
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    user_names: Optional[List[str]] = Query(None, description="Filter by user names"),
    min_cost_threshold: float = Query(0.01, ge=0, description="Minimum cost threshold"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of queries"),
    order_by: str = Query("cost", regex="^(cost|execution_time|bytes_scanned)$"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get query-level cost analysis"""
    
    try:
        logger.info("Getting query costs", 
                   start_date=start_date,
                   end_date=end_date,
                   user=current_user.username)
        
        request = DateRangeRequest(start_date=start_date, end_date=end_date)
        request.validate_range()
        
        queries, distribution = await cost_service.get_query_costs(
            start_date=start_date,
            end_date=end_date,
            warehouse_names=warehouse_names,
            user_names=user_names,
            min_cost_threshold=min_cost_threshold,
            limit=limit,
            order_by=order_by
        )
        
        avg_cost = sum(q.estimated_cost_usd for q in queries) / len(queries) if queries else 0.0
        
        return QueryCostResponse(
            queries=queries,
            total_queries=len(queries),
            avg_cost=avg_cost,
            cost_distribution=distribution
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get query costs", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/budgets", response_model=BudgetResponse)
async def create_budget(
    budget_request: BudgetRequest,
    current_user: User = Depends(check_permission("write")),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Create a new budget configuration"""
    
    try:
        logger.info("Creating budget", 
                   budget_name=budget_request.budget_name,
                   amount=budget_request.budget_amount_usd,
                   user=current_user.username)
        
        budget = await cost_service.create_budget(
            budget_name=budget_request.budget_name,
            budget_scope=budget_request.budget_scope,
            scope_value=budget_request.scope_value,
            budget_amount_usd=budget_request.budget_amount_usd,
            budget_period=budget_request.budget_period,
            start_date=budget_request.start_date,
            end_date=budget_request.end_date,
            alert_thresholds=budget_request.alert_thresholds,
            created_by=current_user.username
        )
        
        # Get current spend for this budget
        current_spend = await cost_service.get_budget_current_spend(budget.budget_id)
        
        return BudgetResponse(
            budget=budget,
            current_spend=current_spend,
            remaining_budget=budget.budget_amount_usd - current_spend,
            utilization_percentage=(current_spend / budget.budget_amount_usd) * 100
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to create budget", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/budgets")
async def get_budgets(
    is_active: bool = Query(True, description="Filter by active status"),
    budget_scope: Optional[str] = Query(None, description="Filter by budget scope"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get all budgets with current status"""
    
    try:
        logger.info("Getting budgets", user=current_user.username)
        
        budgets = await cost_service.get_budgets(
            is_active=is_active,
            budget_scope=budget_scope
        )
        
        # Enhance with current spend information
        enhanced_budgets = []
        for budget in budgets:
            current_spend = await cost_service.get_budget_current_spend(budget.budget_id)
            enhanced_budgets.append({
                "budget": budget,
                "current_spend": current_spend,
                "remaining_budget": budget.budget_amount_usd - current_spend,
                "utilization_percentage": (current_spend / budget.budget_amount_usd) * 100,
                "status": "over_budget" if current_spend > budget.budget_amount_usd else "on_track"
            })
        
        return {
            "budgets": enhanced_budgets,
            "total_count": len(budgets)
        }
        
    except Exception as e:
        logger.error("Failed to get budgets", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/budgets/{budget_id}", response_model=BudgetResponse)
async def get_budget(
    budget_id: str = Path(..., description="Budget ID"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get specific budget details"""
    
    try:
        logger.info("Getting budget details", budget_id=budget_id, user=current_user.username)
        
        budget = await cost_service.get_budget(budget_id)
        if not budget:
            raise HTTPException(status_code=404, detail="Budget not found")
        
        current_spend = await cost_service.get_budget_current_spend(budget_id)
        
        return BudgetResponse(
            budget=budget,
            current_spend=current_spend,
            remaining_budget=budget.budget_amount_usd - current_spend,
            utilization_percentage=(current_spend / budget.budget_amount_usd) * 100
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get budget", budget_id=budget_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/budgets/{budget_id}")
async def update_budget(
    budget_id: str = Path(..., description="Budget ID"),
    budget_request: BudgetRequest = None,
    current_user: User = Depends(check_permission("write")),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Update budget configuration"""
    
    try:
        logger.info("Updating budget", budget_id=budget_id, user=current_user.username)
        
        updated_budget = await cost_service.update_budget(
            budget_id=budget_id,
            updates=budget_request.dict(exclude_unset=True),
            updated_by=current_user.username
        )
        
        return {"message": "Budget updated successfully", "budget": updated_budget}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to update budget", budget_id=budget_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/budgets/{budget_id}")
async def delete_budget(
    budget_id: str = Path(..., description="Budget ID"),
    current_user: User = Depends(check_permission("write")),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Delete budget configuration"""
    
    try:
        logger.info("Deleting budget", budget_id=budget_id, user=current_user.username)
        
        await cost_service.delete_budget(budget_id)
        
        return {"message": "Budget deleted successfully"}
        
    except Exception as e:
        logger.error("Failed to delete budget", budget_id=budget_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/forecast", response_model=ForecastResponse)
async def get_cost_forecast(
    forecast_days: int = Query(30, ge=7, le=365, description="Number of days to forecast"),
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    include_seasonality: bool = Query(True, description="Include seasonal patterns"),
    confidence_level: float = Query(0.95, ge=0.5, le=0.99, description="Forecast confidence level"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get cost forecast based on historical patterns"""
    
    try:
        logger.info("Getting cost forecast", 
                   forecast_days=forecast_days,
                   warehouse_names=warehouse_names,
                   user=current_user.username)
        
        forecast, factors = await cost_service.get_cost_forecast(
            forecast_days=forecast_days,
            warehouse_names=warehouse_names,
            include_seasonality=include_seasonality,
            confidence_level=confidence_level
        )
        
        return ForecastResponse(
            forecast=forecast,
            confidence_level=confidence_level,
            factors=factors
        )
        
    except Exception as e:
        logger.error("Failed to get cost forecast", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/optimization/recommendations")
async def get_optimization_recommendations(
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    analysis_days: int = Query(30, ge=7, le=90, description="Days of data to analyze"),
    min_potential_savings: float = Query(10.0, ge=0, description="Minimum potential savings in USD"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get cost optimization recommendations"""
    
    try:
        logger.info("Getting optimization recommendations", 
                   warehouse_names=warehouse_names,
                   analysis_days=analysis_days,
                   user=current_user.username)
        
        recommendations = await cost_service.get_optimization_recommendations(
            warehouse_names=warehouse_names,
            analysis_days=analysis_days,
            min_potential_savings=min_potential_savings
        )
        
        total_potential_savings = sum(r.potential_savings_usd for r in recommendations)
        
        return {
            "recommendations": recommendations,
            "total_recommendations": len(recommendations),
            "total_potential_savings": total_potential_savings,
            "analysis_period_days": analysis_days
        }
        
    except Exception as e:
        logger.error("Failed to get optimization recommendations", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/alerts")
async def get_budget_alerts(
    is_active: bool = Query(True, description="Filter by active alerts"),
    budget_id: Optional[str] = Query(None, description="Filter by budget ID"),
    alert_type: Optional[str] = Query(None, description="Filter by alert type"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get budget alerts"""
    
    try:
        logger.info("Getting budget alerts", user=current_user.username)
        
        alerts = await cost_service.get_budget_alerts(
            is_active=is_active,
            budget_id=budget_id,
            alert_type=alert_type
        )
        
        return {
            "alerts": alerts,
            "total_count": len(alerts),
            "critical_alerts": len([a for a in alerts if a.threshold_percentage >= 100])
        }
        
    except Exception as e:
        logger.error("Failed to get budget alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/trends")
async def get_cost_trends(
    start_date: date = Query(..., description="Start date for trend analysis"),
    end_date: date = Query(..., description="End date for trend analysis"),
    granularity: str = Query("day", regex="^(hour|day|week|month)$"),
    metric: str = Query("cost", regex="^(cost|credits|queries|efficiency)$"),
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get cost trends and patterns"""
    
    try:
        logger.info("Getting cost trends", 
                   start_date=start_date,
                   end_date=end_date,
                   metric=metric,
                   user=current_user.username)
        
        request = DateRangeRequest(start_date=start_date, end_date=end_date)
        request.validate_range()
        
        trends = await cost_service.get_cost_trends(
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
            metric=metric,
            warehouse_names=warehouse_names
        )
        
        return trends
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get cost trends", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/anomalies")
async def detect_cost_anomalies(
    start_date: date = Query(..., description="Start date for anomaly detection"),
    end_date: date = Query(..., description="End date for anomaly detection"),
    sensitivity: float = Query(0.8, ge=0.1, le=1.0, description="Anomaly detection sensitivity"),
    warehouse_names: Optional[List[str]] = Query(None, description="Filter by warehouse names"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Detect cost anomalies using statistical analysis"""
    
    try:
        logger.info("Detecting cost anomalies", 
                   start_date=start_date,
                   end_date=end_date,
                   user=current_user.username)
        
        request = DateRangeRequest(start_date=start_date, end_date=end_date)
        request.validate_range()
        
        anomalies = await cost_service.detect_cost_anomalies(
            start_date=start_date,
            end_date=end_date,
            sensitivity=sensitivity,
            warehouse_names=warehouse_names
        )
        
        return {
            "anomalies": anomalies,
            "total_anomalies": len(anomalies),
            "detection_period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            "sensitivity": sensitivity
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to detect cost anomalies", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage")
async def get_storage_costs(
    start_date: date = Query(..., description="Start date for analysis"),
    end_date: date = Query(..., description="End date for analysis"),
    database_names: Optional[List[str]] = Query(None, description="Filter by database names"),
    include_time_travel: bool = Query(True, description="Include time travel costs"),
    include_failsafe: bool = Query(True, description="Include fail-safe costs"),
    current_user: User = Depends(get_current_user),
    cost_service: CostManagementService = Depends(get_cost_service)
):
    """Get storage cost analysis"""
    
    try:
        logger.info("Getting storage costs", 
                   start_date=start_date,
                   end_date=end_date,
                   user=current_user.username)
        
        request = DateRangeRequest(start_date=start_date, end_date=end_date)
        request.validate_range()
        
        storage_costs = await cost_service.get_storage_costs(
            start_date=start_date,
            end_date=end_date,
            database_names=database_names,
            include_time_travel=include_time_travel,
            include_failsafe=include_failsafe
        )
        
        return storage_costs
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get storage costs", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
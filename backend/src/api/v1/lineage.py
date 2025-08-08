"""
Lineage API endpoints for Snowsarva
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field
import structlog

from ...core.auth import User, get_current_user, check_permission
from ...core.database import SnowflakeConnection, QueryBuilder
from ...services.lineage_service import LineageService
from ...models.lineage import (
    LineageNode, LineageEdge, LineageGraph, 
    ColumnLineageRequest, ImpactAnalysisRequest, 
    LineageSearchRequest, LineagePathRequest
)

logger = structlog.get_logger(__name__)
router = APIRouter()

# Response models
class LineageResponse(BaseModel):
    """Base lineage response"""
    success: bool = True
    message: str = "Success"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ColumnLineageResponse(LineageResponse):
    """Column lineage response"""
    column_fqn: str
    lineage: LineageGraph
    metadata: Dict[str, Any]

class TableLineageResponse(LineageResponse):
    """Table lineage response"""
    table_fqn: str
    lineage: LineageGraph
    metadata: Dict[str, Any]

class ImpactAnalysisResponse(LineageResponse):
    """Impact analysis response"""
    source_objects: List[str]
    impact_analysis: Dict[str, Any]

class LineageSearchResponse(LineageResponse):
    """Lineage search response"""
    query: str
    results: List[Dict[str, Any]]
    total_count: int
    page: int
    page_size: int

# Dependency to get lineage service
async def get_lineage_service() -> LineageService:
    """Get lineage service instance"""
    # This would normally be injected from the app state
    db = SnowflakeConnection()
    return LineageService(db)

@router.get("/health")
async def lineage_health_check():
    """Health check for lineage service"""
    return {"status": "healthy", "service": "lineage"}

@router.get("/column/{column_fqn:path}", response_model=ColumnLineageResponse)
async def get_column_lineage(
    column_fqn: str = Path(..., description="Fully qualified column name (database.schema.table.column)"),
    direction: str = Query("both", regex="^(upstream|downstream|both)$", description="Lineage direction"),
    depth: int = Query(3, ge=1, le=10, description="Maximum lineage depth"),
    include_transformations: bool = Query(True, description="Include transformation details"),
    confidence_threshold: float = Query(0.7, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get column-level lineage for a specific column"""
    
    try:
        logger.info("Getting column lineage", 
                   column_fqn=column_fqn,
                   direction=direction,
                   depth=depth,
                   user=current_user.username)
        
        lineage = await lineage_service.get_column_lineage(
            column_fqn=column_fqn,
            direction=direction,
            depth=depth,
            include_transformations=include_transformations,
            confidence_threshold=confidence_threshold
        )
        
        metadata = await lineage_service.get_column_metadata(column_fqn)
        
        return ColumnLineageResponse(
            column_fqn=column_fqn,
            lineage=lineage,
            metadata=metadata
        )
        
    except Exception as e:
        logger.error("Failed to get column lineage", 
                    column_fqn=column_fqn, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/table/{table_fqn:path}", response_model=TableLineageResponse)
async def get_table_lineage(
    table_fqn: str = Path(..., description="Fully qualified table name (database.schema.table)"),
    direction: str = Query("both", regex="^(upstream|downstream|both)$", description="Lineage direction"),
    depth: int = Query(3, ge=1, le=10, description="Maximum lineage depth"),
    include_columns: bool = Query(False, description="Include column-level lineage"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get table-level lineage for a specific table"""
    
    try:
        logger.info("Getting table lineage", 
                   table_fqn=table_fqn,
                   direction=direction,
                   depth=depth,
                   user=current_user.username)
        
        lineage = await lineage_service.get_table_lineage(
            table_fqn=table_fqn,
            direction=direction,
            depth=depth,
            include_columns=include_columns
        )
        
        metadata = await lineage_service.get_table_metadata(table_fqn)
        
        return TableLineageResponse(
            table_fqn=table_fqn,
            lineage=lineage,
            metadata=metadata
        )
        
    except Exception as e:
        logger.error("Failed to get table lineage", 
                    table_fqn=table_fqn, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/impact-analysis", response_model=ImpactAnalysisResponse)
async def analyze_impact(
    request: ImpactAnalysisRequest,
    current_user: User = Depends(check_permission("read")),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Analyze the impact of changes to specified objects"""
    
    try:
        logger.info("Performing impact analysis", 
                   source_objects=request.source_objects,
                   change_type=request.change_type,
                   user=current_user.username)
        
        impact_analysis = await lineage_service.analyze_impact(
            source_objects=request.source_objects,
            change_type=request.change_type,
            scope=request.scope,
            include_downstream=request.include_downstream,
            max_depth=request.max_depth
        )
        
        return ImpactAnalysisResponse(
            source_objects=request.source_objects,
            impact_analysis=impact_analysis
        )
        
    except Exception as e:
        logger.error("Failed to perform impact analysis", 
                    source_objects=request.source_objects, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", response_model=LineageSearchResponse)
async def search_lineage(
    query: str = Query(..., min_length=2, description="Search query"),
    object_types: Optional[List[str]] = Query(None, description="Filter by object types"),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Page size"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Search lineage graph by name, pattern, or metadata"""
    
    try:
        logger.info("Searching lineage", 
                   query=query,
                   object_types=object_types,
                   user=current_user.username)
        
        results, total_count = await lineage_service.search_lineage(
            query=query,
            object_types=object_types,
            confidence_threshold=confidence_threshold,
            page=page,
            page_size=page_size
        )
        
        return LineageSearchResponse(
            query=query,
            results=results,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
        
    except Exception as e:
        logger.error("Failed to search lineage", 
                    query=query, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/path")
async def get_lineage_path(
    source_fqn: str = Query(..., description="Source column/table FQN"),
    target_fqn: str = Query(..., description="Target column/table FQN"),
    max_hops: int = Query(10, ge=1, le=20, description="Maximum number of hops"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get lineage path between two objects"""
    
    try:
        logger.info("Getting lineage path", 
                   source_fqn=source_fqn,
                   target_fqn=target_fqn,
                   max_hops=max_hops,
                   user=current_user.username)
        
        paths = await lineage_service.get_lineage_path(
            source_fqn=source_fqn,
            target_fqn=target_fqn,
            max_hops=max_hops
        )
        
        return {
            "source_fqn": source_fqn,
            "target_fqn": target_fqn,
            "paths": paths,
            "path_count": len(paths)
        }
        
    except Exception as e:
        logger.error("Failed to get lineage path", 
                    source_fqn=source_fqn,
                    target_fqn=target_fqn,
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def get_lineage_stats(
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get lineage statistics and metrics"""
    
    try:
        logger.info("Getting lineage statistics", user=current_user.username)
        
        stats = await lineage_service.get_lineage_stats()
        
        return stats
        
    except Exception as e:
        logger.error("Failed to get lineage statistics", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/processing-status")
async def get_processing_status(
    current_user: User = Depends(check_permission("read")),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get lineage processing status and recent logs"""
    
    try:
        logger.info("Getting processing status", user=current_user.username)
        
        status = await lineage_service.get_processing_status()
        
        return status
        
    except Exception as e:
        logger.error("Failed to get processing status", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refresh")
async def trigger_lineage_refresh(
    scope: Optional[str] = Query(None, description="Scope to refresh (database, schema, or table FQN)"),
    force: bool = Query(False, description="Force refresh even if recently processed"),
    current_user: User = Depends(check_permission("write")),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Trigger manual lineage refresh"""
    
    try:
        logger.info("Triggering lineage refresh", 
                   scope=scope,
                   force=force,
                   user=current_user.username)
        
        task_id = await lineage_service.trigger_refresh(
            scope=scope,
            force=force,
            user=current_user.username
        )
        
        return {
            "message": "Lineage refresh triggered successfully",
            "task_id": task_id,
            "scope": scope,
            "force": force
        }
        
    except Exception as e:
        logger.error("Failed to trigger lineage refresh", 
                    scope=scope, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/confidence-distribution")
async def get_confidence_distribution(
    object_type: Optional[str] = Query(None, description="Filter by object type"),
    time_range_days: int = Query(30, ge=1, le=365, description="Time range in days"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get confidence score distribution for lineage edges"""
    
    try:
        logger.info("Getting confidence distribution", 
                   object_type=object_type,
                   time_range_days=time_range_days,
                   user=current_user.username)
        
        distribution = await lineage_service.get_confidence_distribution(
            object_type=object_type,
            time_range_days=time_range_days
        )
        
        return distribution
        
    except Exception as e:
        logger.error("Failed to get confidence distribution", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transformations")
async def get_transformation_types(
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get available transformation types and their frequencies"""
    
    try:
        logger.info("Getting transformation types", user=current_user.username)
        
        transformations = await lineage_service.get_transformation_types()
        
        return transformations
        
    except Exception as e:
        logger.error("Failed to get transformation types", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/database/{database_name}/schemas")
async def get_database_schemas(
    database_name: str = Path(..., description="Database name"),
    current_user: User = Depends(get_current_user),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Get schemas in a database with lineage information"""
    
    try:
        logger.info("Getting database schemas", 
                   database_name=database_name,
                   user=current_user.username)
        
        schemas = await lineage_service.get_database_schemas(database_name)
        
        return schemas
        
    except Exception as e:
        logger.error("Failed to get database schemas", 
                    database_name=database_name, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export")
async def export_lineage(
    format: str = Query("json", regex="^(json|csv|graphml)$", description="Export format"),
    scope: Optional[str] = Query(None, description="Scope to export"),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    current_user: User = Depends(check_permission("read")),
    lineage_service: LineageService = Depends(get_lineage_service)
):
    """Export lineage data in various formats"""
    
    try:
        logger.info("Exporting lineage data", 
                   format=format,
                   scope=scope,
                   user=current_user.username)
        
        export_data = await lineage_service.export_lineage(
            format=format,
            scope=scope,
            confidence_threshold=confidence_threshold
        )
        
        return export_data
        
    except Exception as e:
        logger.error("Failed to export lineage data", 
                    format=format, 
                    scope=scope, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
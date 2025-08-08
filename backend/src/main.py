"""
Snowsarva Backend Application
Data Observability and Cost Management Platform
"""

import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import structlog
from prometheus_client import make_asgi_app, Counter, Histogram, Gauge
import time

from .core.config import get_settings
from .core.database import SnowflakeConnection
from .core.auth import get_current_user
from .api.v1.lineage import router as lineage_router
from .api.v1.cost_management import router as cost_router
from .api.v1.governance import router as governance_router
from .api.v1.metadata import router as metadata_router
from .services.background_tasks import BackgroundTaskManager

# Configure structured logging
logger = structlog.get_logger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('snowsarva_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('snowsarva_request_duration_seconds', 'Request duration')
ACTIVE_CONNECTIONS = Gauge('snowsarva_active_connections', 'Active database connections')

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Snowsarva backend application", version="1.0.0")
    
    # Initialize background task manager
    task_manager = BackgroundTaskManager()
    app.state.task_manager = task_manager
    
    # Start background tasks
    await task_manager.start()
    logger.info("Background tasks started")
    
    # Initialize database connection pool
    db = SnowflakeConnection()
    app.state.db = db
    await db.initialize()
    logger.info("Database connection pool initialized")
    
    yield
    
    # Cleanup
    logger.info("Shutting down Snowsarva backend application")
    await task_manager.stop()
    await db.close()
    logger.info("Application shutdown complete")

# Create FastAPI application
app = FastAPI(
    title="Snowsarva API",
    description="Data Observability and Cost Management Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add metrics middleware
@app.middleware("http")
async def metrics_middleware(request, call_next):
    """Add Prometheus metrics to all requests"""
    start_time = time.time()
    
    response = await call_next(request)
    
    # Record metrics
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    REQUEST_DURATION.observe(time.time() - start_time)
    
    return response

# Health check endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "snowsarva-backend", "version": "1.0.0"}

@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint"""
    try:
        # Check database connectivity
        db = app.state.db
        await db.execute_query("SELECT 1")
        
        return {"status": "ready", "checks": {"database": "ok"}}
    except Exception as e:
        logger.error("Readiness check failed", error=str(e))
        raise HTTPException(status_code=503, detail="Service not ready")

# Include API routers
app.include_router(
    lineage_router,
    prefix="/api/v1/lineage",
    tags=["lineage"],
    dependencies=[Depends(get_current_user)]
)

app.include_router(
    cost_router,
    prefix="/api/v1/costs",
    tags=["cost-management"],
    dependencies=[Depends(get_current_user)]
)

app.include_router(
    governance_router,
    prefix="/api/v1/governance",
    tags=["governance"],
    dependencies=[Depends(get_current_user)]
)

app.include_router(
    metadata_router,
    prefix="/api/v1/metadata",
    tags=["metadata"],
    dependencies=[Depends(get_current_user)]
)

# Mount Prometheus metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error("Unhandled exception", 
                path=request.url.path, 
                method=request.method,
                error=str(exc),
                exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """HTTP exception handler with logging"""
    logger.warning("HTTP exception",
                  path=request.url.path,
                  method=request.method,
                  status_code=exc.status_code,
                  detail=exc.detail)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Snowsarva Backend API",
        "version": "1.0.0",
        "description": "Data Observability and Cost Management Platform",
        "docs_url": "/api/docs",
        "health_url": "/health",
        "metrics_url": "/metrics"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", 8081)),
        reload=os.getenv("ENVIRONMENT") == "development",
        workers=1 if os.getenv("ENVIRONMENT") == "development" else 4,
        log_level=os.getenv("LOG_LEVEL", "info").lower()
    )
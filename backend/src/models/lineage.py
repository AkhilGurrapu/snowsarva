"""
Pydantic models for lineage data structures
"""

from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, validator


class LineageDirection(str, Enum):
    """Lineage direction enumeration"""
    UPSTREAM = "upstream"
    DOWNSTREAM = "downstream"
    BOTH = "both"


class ObjectType(str, Enum):
    """Object type enumeration"""
    TABLE = "table"
    VIEW = "view"
    MATERIALIZED_VIEW = "materialized_view"
    COLUMN = "column"
    FUNCTION = "function"
    PROCEDURE = "procedure"


class TransformationType(str, Enum):
    """Transformation type enumeration"""
    IDENTITY = "identity"
    CAST = "cast"
    CONCAT = "concat"
    AGGREGATE = "aggregate"
    FILTER = "filter"
    JOIN = "join"
    UNION = "union"
    WINDOW = "window"
    CASE = "case"
    UDF = "udf"
    UNKNOWN = "unknown"


class ChangeType(str, Enum):
    """Change type for impact analysis"""
    SCHEMA_CHANGE = "schema_change"
    DATA_TYPE_CHANGE = "data_type_change"
    COLUMN_DROP = "column_drop"
    COLUMN_ADD = "column_add"
    TABLE_DROP = "table_drop"
    TABLE_RENAME = "table_rename"


class LineageNode(BaseModel):
    """Lineage graph node"""
    id: str = Field(..., description="Unique node identifier")
    fqn: str = Field(..., description="Fully qualified name")
    name: str = Field(..., description="Object name")
    object_type: ObjectType = Field(..., description="Type of object")
    database: Optional[str] = None
    schema: Optional[str] = None
    table: Optional[str] = None
    column: Optional[str] = None
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None
    default_value: Optional[str] = None
    comment: Optional[str] = None
    tags: Optional[List[str]] = []
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    @validator('fqn')
    def validate_fqn(cls, v):
        """Validate fully qualified name format"""
        parts = v.split('.')
        if len(parts) < 2:
            raise ValueError("FQN must have at least 2 parts (schema.object)")
        return v


class LineageEdge(BaseModel):
    """Lineage graph edge"""
    id: str = Field(..., description="Unique edge identifier")
    source_id: str = Field(..., description="Source node ID")
    target_id: str = Field(..., description="Target node ID")
    source_fqn: str = Field(..., description="Source fully qualified name")
    target_fqn: str = Field(..., description="Target fully qualified name")
    transformation_type: TransformationType = Field(..., description="Type of transformation")
    transformation_subtype: Optional[str] = None
    transformation_description: Optional[str] = None
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    query_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class LineageGraph(BaseModel):
    """Complete lineage graph"""
    nodes: List[LineageNode] = []
    edges: List[LineageEdge] = []
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @property
    def node_count(self) -> int:
        return len(self.nodes)
    
    @property
    def edge_count(self) -> int:
        return len(self.edges)
    
    def get_node_by_fqn(self, fqn: str) -> Optional[LineageNode]:
        """Get node by fully qualified name"""
        for node in self.nodes:
            if node.fqn == fqn:
                return node
        return None


class LineagePath(BaseModel):
    """Path between two nodes in lineage graph"""
    source_fqn: str
    target_fqn: str
    path: List[str] = Field(..., description="Ordered list of FQNs in the path")
    hops: int = Field(..., description="Number of hops in the path")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    transformations: List[str] = []


# Request models
class ColumnLineageRequest(BaseModel):
    """Request for column lineage"""
    column_fqn: str = Field(..., description="Fully qualified column name")
    direction: LineageDirection = LineageDirection.BOTH
    depth: int = Field(3, ge=1, le=10)
    include_transformations: bool = True
    confidence_threshold: float = Field(0.7, ge=0.0, le=1.0)


class TableLineageRequest(BaseModel):
    """Request for table lineage"""
    table_fqn: str = Field(..., description="Fully qualified table name")
    direction: LineageDirection = LineageDirection.BOTH
    depth: int = Field(3, ge=1, le=10)
    include_columns: bool = False


class ImpactAnalysisRequest(BaseModel):
    """Request for impact analysis"""
    source_objects: List[str] = Field(..., description="List of source object FQNs")
    change_type: ChangeType = Field(..., description="Type of change")
    scope: Optional[str] = Field(None, description="Scope of analysis")
    include_downstream: bool = True
    max_depth: int = Field(5, ge=1, le=20)


class LineageSearchRequest(BaseModel):
    """Request for lineage search"""
    query: str = Field(..., min_length=2, description="Search query")
    object_types: Optional[List[ObjectType]] = None
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0)
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=500)


class LineagePathRequest(BaseModel):
    """Request for lineage path"""
    source_fqn: str
    target_fqn: str
    max_hops: int = Field(10, ge=1, le=20)


# Statistics and metrics models
class LineageStats(BaseModel):
    """Lineage statistics"""
    total_nodes: int = 0
    total_edges: int = 0
    node_types: Dict[str, int] = Field(default_factory=dict)
    transformation_types: Dict[str, int] = Field(default_factory=dict)
    confidence_distribution: Dict[str, int] = Field(default_factory=dict)
    processing_stats: Dict[str, Any] = Field(default_factory=dict)
    last_updated: Optional[datetime] = None


class ProcessingStatus(BaseModel):
    """Lineage processing status"""
    is_processing: bool = False
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    queries_processed: int = 0
    queries_failed: int = 0
    success_rate: float = 0.0
    avg_processing_time_ms: float = 0.0
    recent_errors: List[Dict[str, Any]] = []


class ImpactAnalysisResult(BaseModel):
    """Impact analysis result"""
    source_objects: List[str]
    affected_objects: List[str]
    impact_paths: List[LineagePath]
    risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    recommendations: List[str] = []
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Column and table metadata models
class ColumnMetadata(BaseModel):
    """Column metadata"""
    fqn: str
    name: str
    data_type: str
    is_nullable: bool = True
    default_value: Optional[str] = None
    comment: Optional[str] = None
    table_fqn: str
    ordinal_position: int
    character_maximum_length: Optional[int] = None
    numeric_precision: Optional[int] = None
    numeric_scale: Optional[int] = None
    tags: List[str] = []
    classification: Optional[str] = None
    sensitivity_level: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TableMetadata(BaseModel):
    """Table metadata"""
    fqn: str
    name: str
    database: str
    schema: str
    table_type: str  # TABLE, VIEW, MATERIALIZED_VIEW
    row_count: Optional[int] = None
    bytes_size: Optional[int] = None
    comment: Optional[str] = None
    owner: Optional[str] = None
    columns: List[ColumnMetadata] = []
    tags: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_altered: Optional[datetime] = None


# Confidence and quality models
class ConfidenceMetrics(BaseModel):
    """Confidence metrics for lineage"""
    parsing_success: float = Field(..., ge=0.0, le=1.0)
    pattern_match: float = Field(..., ge=0.0, le=1.0)
    metadata_consistency: float = Field(..., ge=0.0, le=1.0)
    user_validation: float = Field(0.0, ge=0.0, le=1.0)
    overall_confidence: float = Field(..., ge=0.0, le=1.0)


class LineageQuality(BaseModel):
    """Lineage quality metrics"""
    completeness: float = Field(..., ge=0.0, le=1.0, description="Percentage of objects with lineage")
    accuracy: float = Field(..., ge=0.0, le=1.0, description="Accuracy of lineage relationships")
    freshness: float = Field(..., ge=0.0, le=1.0, description="How up-to-date the lineage is")
    coverage: float = Field(..., ge=0.0, le=1.0, description="Coverage of data landscape")
    confidence_avg: float = Field(..., ge=0.0, le=1.0, description="Average confidence score")


# Export models
class LineageExport(BaseModel):
    """Lineage export model"""
    format: str = Field(..., regex="^(json|csv|graphml)$")
    scope: Optional[str] = None
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0)
    include_metadata: bool = True
    compress: bool = False


# Validation and error models
class ValidationResult(BaseModel):
    """Lineage validation result"""
    is_valid: bool
    issues: List[str] = []
    warnings: List[str] = []
    suggestions: List[str] = []
    confidence_impact: Optional[float] = None


class LineageError(BaseModel):
    """Lineage processing error"""
    query_id: Optional[str] = None
    error_type: str
    error_message: str
    query_text: Optional[str] = None
    suggested_fix: Optional[str] = None
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
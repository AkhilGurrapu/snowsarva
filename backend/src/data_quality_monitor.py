"""
Elementary Data Quality Monitoring Implementation for SnowSarva
=============================================================

This module implements data quality monitoring features inspired by elementary-data,
including anomaly detection, data quality tests, and alerting capabilities.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
import uuid
import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


@dataclass
class MonitorConfig:
    """Configuration for data quality monitors"""
    sensitivity: int = 3  # Standard deviations for anomaly detection
    training_period_days: int = 14
    detection_period_days: int = 2
    time_bucket_hours: int = 24
    anomaly_direction: str = "both"  # both, spike, drop
    ignore_small_changes_threshold: float = 0.05  # 5% threshold
    fail_on_zero: bool = False
    seasonality: Optional[str] = None  # day_of_week, etc.


@dataclass
class DataQualityAlert:
    """Data quality alert model"""
    id: str
    alert_type: str
    table_full_name: str
    column_name: Optional[str]
    metric_name: str
    current_value: float
    expected_range: Tuple[float, float]
    severity: str
    detected_at: datetime
    description: str
    test_params: Dict[str, Any]
    status: str = "active"


class AnomalyDetector:
    """Statistical anomaly detection engine based on Z-score analysis"""
    
    def __init__(self, config: MonitorConfig):
        self.config = config
    
    def detect_volume_anomalies(self, historical_data: List[Dict]) -> Optional[DataQualityAlert]:
        """Detect volume anomalies in row counts"""
        if not historical_data or len(historical_data) < 3:
            return None
            
        # Extract values and timestamps
        values = [float(row['row_count']) for row in historical_data]
        timestamps = [datetime.fromisoformat(row['bucket_start']) for row in historical_data]
        
        # Split into training and detection periods
        cutoff_date = max(timestamps) - timedelta(days=self.config.detection_period_days)
        training_values = [v for i, v in enumerate(values) if timestamps[i] < cutoff_date]
        detection_values = [v for i, v in enumerate(values) if timestamps[i] >= cutoff_date]
        
        if len(training_values) < 3:
            return None
            
        # Calculate statistical metrics
        mean_val = np.mean(training_values)
        std_val = np.std(training_values)
        
        if std_val == 0:
            return None
            
        # Check for anomalies in detection period
        for i, current_value in enumerate(detection_values):
            z_score = abs(current_value - mean_val) / std_val
            
            if z_score > self.config.sensitivity:
                # Check direction constraints
                is_spike = current_value > mean_val
                is_drop = current_value < mean_val
                
                if (self.config.anomaly_direction == "spike" and not is_spike) or \
                   (self.config.anomaly_direction == "drop" and not is_drop):
                    continue
                
                # Check ignore small changes
                percent_change = abs(current_value - mean_val) / mean_val
                if percent_change < self.config.ignore_small_changes_threshold:
                    continue
                
                # Create alert
                table_name = historical_data[-1].get('table_name', 'unknown')
                expected_range = (
                    mean_val - self.config.sensitivity * std_val,
                    mean_val + self.config.sensitivity * std_val
                )
                
                return DataQualityAlert(
                    id=str(uuid.uuid4()),
                    alert_type="volume_anomaly",
                    table_full_name=table_name,
                    column_name=None,
                    metric_name="row_count",
                    current_value=current_value,
                    expected_range=expected_range,
                    severity="error" if z_score > 5 else "warning",
                    detected_at=datetime.utcnow(),
                    description=f"Volume anomaly detected: {current_value:.0f} rows (expected: {mean_val:.0f} ± {std_val:.0f})",
                    test_params={"z_score": z_score, "training_period": len(training_values)}
                )
        
        return None
    
    def detect_freshness_anomalies(self, historical_data: List[Dict], timestamp_column: str) -> Optional[DataQualityAlert]:
        """Detect freshness anomalies in data updates"""
        if not historical_data:
            return None
            
        # Calculate freshness (time since last update) for each bucket
        freshness_values = []
        for row in historical_data:
            last_update = datetime.fromisoformat(row['max_timestamp'])
            bucket_end = datetime.fromisoformat(row['bucket_end'])
            freshness_hours = (bucket_end - last_update).total_seconds() / 3600
            freshness_values.append(freshness_hours)
        
        # Apply anomaly detection to freshness values
        if len(freshness_values) < 3:
            return None
            
        mean_freshness = np.mean(freshness_values)
        std_freshness = np.std(freshness_values)
        current_freshness = freshness_values[-1]
        
        if std_freshness == 0:
            return None
            
        z_score = abs(current_freshness - mean_freshness) / std_freshness
        
        if z_score > self.config.sensitivity:
            table_name = historical_data[-1].get('table_name', 'unknown')
            expected_range = (
                mean_freshness - self.config.sensitivity * std_freshness,
                mean_freshness + self.config.sensitivity * std_freshness
            )
            
            return DataQualityAlert(
                id=str(uuid.uuid4()),
                alert_type="freshness_anomaly",
                table_full_name=table_name,
                column_name=timestamp_column,
                metric_name="freshness_hours",
                current_value=current_freshness,
                expected_range=expected_range,
                severity="error" if z_score > 5 else "warning",
                detected_at=datetime.utcnow(),
                description=f"Freshness anomaly detected: {current_freshness:.1f} hours since last update (expected: {mean_freshness:.1f} ± {std_freshness:.1f})",
                test_params={"z_score": z_score, "timestamp_column": timestamp_column}
            )
        
        return None
    
    def detect_column_anomalies(self, historical_data: List[Dict], column_name: str, metric_type: str) -> Optional[DataQualityAlert]:
        """Detect anomalies in column-level metrics (null_rate, distinct_count, etc.)"""
        if not historical_data or len(historical_data) < 3:
            return None
            
        values = [float(row[metric_type]) for row in historical_data if row.get(metric_type) is not None]
        
        if len(values) < 3:
            return None
            
        mean_val = np.mean(values)
        std_val = np.std(values)
        current_value = values[-1]
        
        if std_val == 0:
            return None
            
        z_score = abs(current_value - mean_val) / std_val
        
        if z_score > self.config.sensitivity:
            table_name = historical_data[-1].get('table_name', 'unknown')
            expected_range = (
                mean_val - self.config.sensitivity * std_val,
                mean_val + self.config.sensitivity * std_val
            )
            
            return DataQualityAlert(
                id=str(uuid.uuid4()),
                alert_type="column_anomaly",
                table_full_name=table_name,
                column_name=column_name,
                metric_name=metric_type,
                current_value=current_value,
                expected_range=expected_range,
                severity="error" if z_score > 5 else "warning",
                detected_at=datetime.utcnow(),
                description=f"Column anomaly detected in {column_name}.{metric_type}: {current_value:.4f} (expected: {mean_val:.4f} ± {std_val:.4f})",
                test_params={"z_score": z_score, "column_name": column_name}
            )
        
        return None


class DataQualityMonitor:
    """Main data quality monitoring orchestrator"""
    
    def __init__(self, session, config: Optional[MonitorConfig] = None):
        self.session = session
        self.config = config or MonitorConfig()
        self.detector = AnomalyDetector(self.config)
        
    def execute_volume_monitoring(self, table_name: str, timestamp_column: Optional[str] = None) -> Dict[str, Any]:
        """Execute volume anomaly monitoring for a table"""
        try:
            # Build SQL query for volume monitoring
            where_clause = ""
            if timestamp_column:
                cutoff_date = datetime.utcnow() - timedelta(days=self.config.training_period_days + self.config.detection_period_days)
                where_clause = f"WHERE {timestamp_column} >= '{cutoff_date.isoformat()}'"
            
            time_bucket_sql = ""
            if timestamp_column:
                time_bucket_sql = f"""
                    DATE_TRUNC('day', {timestamp_column}) as bucket_start,
                    DATE_TRUNC('day', {timestamp_column}) + INTERVAL '1 day' as bucket_end,
                """
            else:
                time_bucket_sql = "CURRENT_DATE as bucket_start, CURRENT_DATE as bucket_end,"
            
            sql = f"""
            SELECT 
                {time_bucket_sql}
                COUNT(*) as row_count,
                '{table_name}' as table_name
            FROM {table_name}
            {where_clause}
            GROUP BY bucket_start, bucket_end
            ORDER BY bucket_start
            """
            
            result = self.session.sql(sql).collect()
            historical_data = [row.as_dict() for row in result]
            
            # Run anomaly detection
            alert = self.detector.detect_volume_anomalies(historical_data)
            
            return {
                "success": True,
                "table_name": table_name,
                "metric_type": "volume",
                "data_points": len(historical_data),
                "alert": alert.__dict__ if alert else None,
                "summary": f"Analyzed {len(historical_data)} data points for volume anomalies"
            }
            
        except Exception as e:
            logger.error(f"Volume monitoring failed for {table_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "table_name": table_name
            }
    
    def execute_freshness_monitoring(self, table_name: str, timestamp_column: str) -> Dict[str, Any]:
        """Execute freshness anomaly monitoring for a table"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.config.training_period_days + self.config.detection_period_days)
            
            sql = f"""
            SELECT 
                DATE_TRUNC('day', {timestamp_column}) as bucket_start,
                DATE_TRUNC('day', {timestamp_column}) + INTERVAL '1 day' as bucket_end,
                MAX({timestamp_column}) as max_timestamp,
                '{table_name}' as table_name
            FROM {table_name}
            WHERE {timestamp_column} >= '{cutoff_date.isoformat()}'
            GROUP BY bucket_start, bucket_end
            ORDER BY bucket_start
            """
            
            result = self.session.sql(sql).collect()
            historical_data = [row.as_dict() for row in result]
            
            # Run anomaly detection
            alert = self.detector.detect_freshness_anomalies(historical_data, timestamp_column)
            
            return {
                "success": True,
                "table_name": table_name,
                "metric_type": "freshness",
                "timestamp_column": timestamp_column,
                "data_points": len(historical_data),
                "alert": alert.__dict__ if alert else None,
                "summary": f"Analyzed {len(historical_data)} data points for freshness anomalies"
            }
            
        except Exception as e:
            logger.error(f"Freshness monitoring failed for {table_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "table_name": table_name
            }
    
    def execute_column_quality_monitoring(self, table_name: str, column_name: str, timestamp_column: Optional[str] = None) -> Dict[str, Any]:
        """Execute column-level quality monitoring"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.config.training_period_days + self.config.detection_period_days)
            
            time_bucket_sql = ""
            where_clause = ""
            if timestamp_column:
                time_bucket_sql = f"DATE_TRUNC('day', {timestamp_column}) as bucket_start,"
                where_clause = f"WHERE {timestamp_column} >= '{cutoff_date.isoformat()}'"
            else:
                time_bucket_sql = "CURRENT_DATE as bucket_start,"
            
            sql = f"""
            SELECT 
                {time_bucket_sql}
                COUNT(*) as total_rows,
                COUNT({column_name}) as non_null_count,
                COUNT(DISTINCT {column_name}) as distinct_count,
                (COUNT(*) - COUNT({column_name})) / COUNT(*)::float as null_rate,
                '{table_name}' as table_name
            FROM {table_name}
            {where_clause}
            GROUP BY bucket_start
            ORDER BY bucket_start
            """
            
            result = self.session.sql(sql).collect()
            historical_data = [row.as_dict() for row in result]
            
            # Detect anomalies in multiple metrics
            alerts = []
            
            # Null rate anomalies
            null_rate_alert = self.detector.detect_column_anomalies(historical_data, column_name, "null_rate")
            if null_rate_alert:
                alerts.append(null_rate_alert)
            
            # Distinct count anomalies
            distinct_alert = self.detector.detect_column_anomalies(historical_data, column_name, "distinct_count")
            if distinct_alert:
                alerts.append(distinct_alert)
            
            return {
                "success": True,
                "table_name": table_name,
                "column_name": column_name,
                "metric_type": "column_quality",
                "data_points": len(historical_data),
                "alerts": [alert.__dict__ for alert in alerts],
                "summary": f"Analyzed {len(historical_data)} data points for column quality anomalies"
            }
            
        except Exception as e:
            logger.error(f"Column quality monitoring failed for {table_name}.{column_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "table_name": table_name,
                "column_name": column_name
            }
    
    def run_comprehensive_monitoring(self, tables_config: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Run comprehensive monitoring across multiple tables and metrics"""
        results = {
            "total_tables": len(tables_config),
            "successful_monitors": 0,
            "failed_monitors": 0,
            "total_alerts": 0,
            "alerts_by_severity": {"error": 0, "warning": 0},
            "table_results": []
        }
        
        for table_config in tables_config:
            table_name = table_config["table_name"]
            timestamp_column = table_config.get("timestamp_column")
            monitor_types = table_config.get("monitor_types", ["volume"])
            
            table_result = {
                "table_name": table_name,
                "monitors": [],
                "total_alerts": 0
            }
            
            # Volume monitoring
            if "volume" in monitor_types:
                volume_result = self.execute_volume_monitoring(table_name, timestamp_column)
                table_result["monitors"].append(volume_result)
                
                if volume_result["success"]:
                    results["successful_monitors"] += 1
                    if volume_result.get("alert"):
                        results["total_alerts"] += 1
                        table_result["total_alerts"] += 1
                        severity = volume_result["alert"]["severity"]
                        results["alerts_by_severity"][severity] += 1
                else:
                    results["failed_monitors"] += 1
            
            # Freshness monitoring
            if "freshness" in monitor_types and timestamp_column:
                freshness_result = self.execute_freshness_monitoring(table_name, timestamp_column)
                table_result["monitors"].append(freshness_result)
                
                if freshness_result["success"]:
                    results["successful_monitors"] += 1
                    if freshness_result.get("alert"):
                        results["total_alerts"] += 1
                        table_result["total_alerts"] += 1
                        severity = freshness_result["alert"]["severity"]
                        results["alerts_by_severity"][severity] += 1
                else:
                    results["failed_monitors"] += 1
            
            # Column quality monitoring
            columns_to_monitor = table_config.get("columns", [])
            for column_name in columns_to_monitor:
                column_result = self.execute_column_quality_monitoring(table_name, column_name, timestamp_column)
                table_result["monitors"].append(column_result)
                
                if column_result["success"]:
                    results["successful_monitors"] += 1
                    alert_count = len(column_result.get("alerts", []))
                    if alert_count > 0:
                        results["total_alerts"] += alert_count
                        table_result["total_alerts"] += alert_count
                        for alert in column_result["alerts"]:
                            results["alerts_by_severity"][alert["severity"]] += 1
                else:
                    results["failed_monitors"] += 1
            
            results["table_results"].append(table_result)
        
        return results
    
    def get_monitoring_suggestions(self) -> Dict[str, Any]:
        """Provide monitoring setup suggestions based on available tables"""
        try:
            # Get sample of tables with row counts and column info
            sql = """
            SELECT 
                t.table_catalog as database_name,
                t.table_schema as schema_name, 
                t.table_name,
                t.table_type,
                COUNT(c.column_name) as column_count,
                MAX(CASE WHEN c.data_type IN ('TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ', 'DATE') 
                         THEN c.column_name END) as potential_timestamp_column
            FROM information_schema.tables t
            LEFT JOIN information_schema.columns c ON 
                t.table_catalog = c.table_catalog AND 
                t.table_schema = c.table_schema AND 
                t.table_name = c.table_name
            WHERE t.table_schema NOT IN ('INFORMATION_SCHEMA', 'ACCOUNT_USAGE')
            GROUP BY t.table_catalog, t.table_schema, t.table_name, t.table_type
            ORDER BY column_count DESC
            LIMIT 20
            """
            
            result = self.session.sql(sql).collect()
            tables = [row.as_dict() for row in result]
            
            suggestions = []
            for table in tables:
                table_full_name = f"{table['DATABASE_NAME']}.{table['SCHEMA_NAME']}.{table['TABLE_NAME']}"
                
                suggestion = {
                    "table_name": table_full_name,
                    "timestamp_column": table['POTENTIAL_TIMESTAMP_COLUMN'],
                    "monitor_types": ["volume"],
                    "columns": [],  # Would need additional logic to suggest columns
                    "rationale": f"Table with {table['COLUMN_COUNT']} columns"
                }
                
                if table['POTENTIAL_TIMESTAMP_COLUMN']:
                    suggestion["monitor_types"].append("freshness")
                    suggestion["rationale"] += f", has timestamp column {table['POTENTIAL_TIMESTAMP_COLUMN']}"
                
                suggestions.append(suggestion)
            
            return {
                "success": True,
                "total_tables_analyzed": len(tables),
                "suggested_configurations": suggestions,
                "summary": f"Found {len(tables)} tables suitable for monitoring"
            }
            
        except Exception as e:
            logger.error(f"Failed to generate monitoring suggestions: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }


class AlertManager:
    """Alert management system for data quality alerts"""
    
    def __init__(self, session):
        self.session = session
    
    def store_alert(self, alert: DataQualityAlert) -> bool:
        """Store alert in database"""
        try:
            # Create alerts table if not exists
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS v1.data_quality_alerts (
                id VARCHAR(36) PRIMARY KEY,
                alert_type VARCHAR(50),
                table_full_name VARCHAR(500),
                column_name VARCHAR(255),
                metric_name VARCHAR(100),
                current_value FLOAT,
                expected_min FLOAT,
                expected_max FLOAT,
                severity VARCHAR(20),
                detected_at TIMESTAMP_NTZ,
                description TEXT,
                test_params VARIANT,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
            )
            """
            self.session.sql(create_table_sql).collect()
            
            # Insert alert
            insert_sql = """
            INSERT INTO v1.data_quality_alerts 
            (id, alert_type, table_full_name, column_name, metric_name, 
             current_value, expected_min, expected_max, severity, detected_at, 
             description, test_params, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            self.session.sql(insert_sql, params=[
                alert.id,
                alert.alert_type,
                alert.table_full_name,
                alert.column_name,
                alert.metric_name,
                alert.current_value,
                alert.expected_range[0],
                alert.expected_range[1],
                alert.severity,
                alert.detected_at,
                alert.description,
                json.dumps(alert.test_params),
                alert.status
            ]).collect()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to store alert {alert.id}: {str(e)}")
            return False
    
    def get_active_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get active alerts from database"""
        try:
            sql = """
            SELECT * FROM v1.data_quality_alerts 
            WHERE status = 'active'
            ORDER BY detected_at DESC
            LIMIT ?
            """
            
            result = self.session.sql(sql, params=[limit]).collect()
            return [row.as_dict() for row in result]
            
        except Exception as e:
            logger.error(f"Failed to get active alerts: {str(e)}")
            return []
    
    def update_alert_status(self, alert_id: str, status: str) -> bool:
        """Update alert status (active, resolved, suppressed)"""
        try:
            sql = """
            UPDATE v1.data_quality_alerts 
            SET status = ?, updated_at = CURRENT_TIMESTAMP()
            WHERE id = ?
            """
            
            self.session.sql(sql, params=[status, alert_id]).collect()
            return True
            
        except Exception as e:
            logger.error(f"Failed to update alert status: {str(e)}")
            return False
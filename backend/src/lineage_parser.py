"""
Column-level lineage extraction using sqlglot and query history analysis.
Integrates with existing Snowpark session management.
"""

import sqlglot
from sqlglot import exp
from sqlglot.lineage import lineage
from sqllineage.runner import LineageRunner
import snowflake.snowpark.functions as f
from snowflake.snowpark.types import StructType, StructField, StringType, TimestampType, FloatType
import json
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional


class SnowflakeLineageExtractor:
    def __init__(self, session):
        self.session = session
        
    def extract_column_lineage(self, sql_text: str, dialect='snowflake') -> Dict[str, Any]:
        """Extract column-level lineage using sqlglot"""
        try:
            # Clean and normalize SQL
            sql_text = sql_text.strip()
            if not sql_text:
                return {'nodes': [], 'edges': [], 'error': 'empty_sql'}
            
            # Parse SQL with sqlglot for Snowflake dialect
            try:
                parsed = sqlglot.parse_one(sql_text, dialect=dialect)
            except Exception as parse_error:
                return {'nodes': [], 'edges': [], 'error': f'sqlglot_parse_failed: {str(parse_error)}'}
            
            # Extract column lineage using built-in lineage module
            try:
                lineage_result = lineage(sql_text, dialect=dialect)
            except Exception as lineage_error:
                return {'nodes': [], 'edges': [], 'error': f'lineage_extraction_failed: {str(lineage_error)}'}
            
            nodes = []
            edges = []
            
            # Process nodes (tables/columns)
            for node in lineage_result.nodes:
                node_dict = {
                    'id': str(node),
                    'table': getattr(node, 'table', None),
                    'column': getattr(node, 'column', None) if hasattr(node, 'column') else None,
                    'database': getattr(node, 'db', None) if hasattr(node, 'db') else None,
                    'schema': getattr(node, 'schema', None) if hasattr(node, 'schema') else None,
                    'node_type': 'COLUMN' if hasattr(node, 'column') and node.column else 'TABLE'
                }
                nodes.append(node_dict)
            
            # Process edges (relationships)
            for edge in lineage_result.edges:
                edge_dict = {
                    'source': str(edge[0]),
                    'target': str(edge[1]),
                    'edge_type': 'COLUMN_LINEAGE'
                }
                edges.append(edge_dict)
                
            return {
                'nodes': nodes, 
                'edges': edges, 
                'sql_text': sql_text,
                'extraction_method': 'sqlglot'
            }
            
        except Exception as e:
            return {'nodes': [], 'edges': [], 'error': f'general_extraction_failed: {str(e)}'}
    
    def analyze_query_history_lineage(self, limit: int = 1000, days_back: int = 7) -> Dict[str, Any]:
        """Analyze recent query history for lineage patterns"""
        try:
            # Query ACCOUNT_USAGE.QUERY_HISTORY for DDL/DML statements
            query_hist_df = self.session.table("snowflake.account_usage.query_history") \
                .filter(f.col('QUERY_TYPE').isin(['CREATE_TABLE_AS_SELECT', 'INSERT', 'MERGE', 'UPDATE', 'CREATE_VIEW'])) \
                .filter(f.col('START_TIME') >= f.dateadd('day', f.lit(-days_back), f.current_timestamp())) \
                .select('QUERY_ID', 'QUERY_TEXT', 'DATABASE_NAME', 'SCHEMA_NAME', 'USER_NAME', 'START_TIME') \
                .limit(limit)
            
            all_lineage = {'nodes': [], 'edges': [], 'queries_processed': 0, 'queries_with_lineage': 0}
            
            for row in query_hist_df.to_local_iterator():
                sql_text = row['QUERY_TEXT']
                if sql_text and len(sql_text.strip()) > 10:  # Skip trivial queries
                    all_lineage['queries_processed'] += 1
                    
                    result = self.extract_column_lineage(sql_text)
                    if 'nodes' in result and len(result['nodes']) > 0:
                        all_lineage['queries_with_lineage'] += 1
                        
                        # Enrich nodes with query context
                        for node in result['nodes']:
                            node['query_id'] = row['QUERY_ID']
                            node['user_name'] = row['USER_NAME']
                            node['observed_at'] = row['START_TIME']
                            
                        # Enrich edges with query context  
                        for edge in result['edges']:
                            edge['query_id'] = row['QUERY_ID']
                            edge['user_name'] = row['USER_NAME']
                            edge['observed_at'] = row['START_TIME']
                        
                        all_lineage['nodes'].extend(result['nodes'])
                        all_lineage['edges'].extend(result['edges'])
            
            return all_lineage
            
        except Exception as e:
            return {'nodes': [], 'edges': [], 'error': f'query_history_analysis_failed: {str(e)}'}
    
    def store_lineage_data(self, lineage_data: Dict[str, Any], source: str = 'SQLGLOT') -> Dict[str, Any]:
        """Store extracted lineage data in app tables"""
        try:
            nodes_stored = 0
            edges_stored = 0
            
            # Store nodes
            for node in lineage_data.get('nodes', []):
                try:
                    # Generate consistent object_id
                    if node.get('column'):
                        object_id = f"{node.get('database', '')}.{node.get('schema', '')}.{node.get('table', '')}.{node['column']}"
                    else:
                        object_id = f"{node.get('database', '')}.{node.get('schema', '')}.{node.get('table', '')}"
                    
                    # Prepare metadata
                    metadata = {
                        'extraction_method': lineage_data.get('extraction_method', source),
                        'query_id': node.get('query_id'),
                        'user_name': node.get('user_name'),
                        'observed_at': str(node.get('observed_at')) if node.get('observed_at') else None
                    }
                    
                    # MERGE into lineage_nodes table
                    merge_sql = f"""
                        MERGE INTO v1.lineage_nodes AS target
                        USING (SELECT 
                            '{object_id}' AS object_id,
                            '{node.get('table', '')}' AS object_name,
                            'TABLE' AS object_type,
                            '{node.get('schema', '')}' AS schema_name,
                            '{node.get('database', '')}' AS database_name,
                            '{node.get('column', '') or ''}' AS column_name,
                            '{node.get('node_type', 'TABLE')}' AS node_type,
                            NULL AS parent_object_id,
                            '{source}' AS lineage_source,
                            PARSE_JSON('{json.dumps(metadata)}') AS metadata,
                            CURRENT_TIMESTAMP() AS first_seen_ts,
                            CURRENT_TIMESTAMP() AS last_seen_ts
                        ) AS source
                        ON target.object_id = source.object_id
                        WHEN MATCHED THEN 
                            UPDATE SET 
                                last_seen_ts = CURRENT_TIMESTAMP(),
                                metadata = source.metadata,
                                updated_at = CURRENT_TIMESTAMP()
                        WHEN NOT MATCHED THEN 
                            INSERT (object_id, object_name, object_type, schema_name, database_name, column_name, 
                                   node_type, parent_object_id, lineage_source, metadata, first_seen_ts, last_seen_ts, created_at, updated_at)
                            VALUES (source.object_id, source.object_name, source.object_type, source.schema_name, 
                                   source.database_name, source.column_name, source.node_type, source.parent_object_id,
                                   source.lineage_source, source.metadata, source.first_seen_ts, source.last_seen_ts, 
                                   CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
                    """
                    
                    self.session.sql(merge_sql).collect()
                    nodes_stored += 1
                    
                except Exception as node_error:
                    print(f"Error storing node {node}: {node_error}")
                    continue
            
            # Store edges
            for edge in lineage_data.get('edges', []):
                try:
                    edge_id = str(uuid.uuid4())
                    
                    # Prepare metadata
                    metadata = {
                        'extraction_method': lineage_data.get('extraction_method', source),
                        'query_id': edge.get('query_id'),
                        'user_name': edge.get('user_name'),
                        'observed_at': str(edge.get('observed_at')) if edge.get('observed_at') else None,
                        'sql_text': lineage_data.get('sql_text', '')[:1000]  # Truncate for storage
                    }
                    
                    # INSERT into lineage_edges table
                    insert_sql = f"""
                        INSERT INTO v1.lineage_edges 
                        (edge_id, src_object_id, tgt_object_id, edge_kind, observed_ts, 
                         confidence_score, lineage_source, sql_text, metadata, created_at)
                        VALUES (
                            '{edge_id}',
                            '{edge['source']}',
                            '{edge['target']}', 
                            '{edge.get('edge_type', 'LINEAGE')}',
                            CURRENT_TIMESTAMP(),
                            1.0,
                            '{source}',
                            '{lineage_data.get('sql_text', '')[:500]}',
                            PARSE_JSON('{json.dumps(metadata)}'),
                            CURRENT_TIMESTAMP()
                        )
                    """
                    
                    self.session.sql(insert_sql).collect()
                    edges_stored += 1
                    
                except Exception as edge_error:
                    print(f"Error storing edge {edge}: {edge_error}")
                    continue
                    
            return {
                'status': 'success',
                'nodes_stored': nodes_stored,
                'edges_stored': edges_stored,
                'source': source
            }
            
        except Exception as e:
            return {'status': 'error', 'error': f'lineage_storage_failed: {str(e)}'}
    
    def get_object_lineage(self, object_id: str, depth: int = 3) -> Dict[str, Any]:
        """Get lineage for a specific object using recursive queries"""
        try:
            # Recursive CTE for upstream lineage
            upstream_sql = f"""
                WITH RECURSIVE upstream_lineage AS (
                    -- Base case: direct parents
                    SELECT src_object_id, tgt_object_id, edge_kind, 1 AS level
                    FROM v1.lineage_edges 
                    WHERE tgt_object_id = '{object_id}'
                    
                    UNION ALL
                    
                    -- Recursive case: parents of parents
                    SELECT e.src_object_id, e.tgt_object_id, e.edge_kind, u.level + 1
                    FROM v1.lineage_edges e
                    JOIN upstream_lineage u ON e.tgt_object_id = u.src_object_id
                    WHERE u.level < {depth}
                )
                SELECT * FROM upstream_lineage
            """
            
            upstream_result = self.session.sql(upstream_sql).collect()
            
            # Recursive CTE for downstream lineage
            downstream_sql = f"""
                WITH RECURSIVE downstream_lineage AS (
                    -- Base case: direct children
                    SELECT src_object_id, tgt_object_id, edge_kind, 1 AS level
                    FROM v1.lineage_edges 
                    WHERE src_object_id = '{object_id}'
                    
                    UNION ALL
                    
                    -- Recursive case: children of children
                    SELECT e.src_object_id, e.tgt_object_id, e.edge_kind, d.level + 1
                    FROM v1.lineage_edges e
                    JOIN downstream_lineage d ON e.src_object_id = d.tgt_object_id
                    WHERE d.level < {depth}
                )
                SELECT * FROM downstream_lineage
            """
            
            downstream_result = self.session.sql(downstream_sql).collect()
            
            # Get node details for all involved objects
            all_object_ids = set([object_id])
            for row in upstream_result + downstream_result:
                all_object_ids.add(row['SRC_OBJECT_ID'])
                all_object_ids.add(row['TGT_OBJECT_ID'])
            
            if all_object_ids:
                object_ids_list = "', '".join(all_object_ids)
                nodes_sql = f"""
                    SELECT object_id, object_name, object_type, schema_name, database_name, 
                           column_name, node_type, lineage_source, metadata
                    FROM v1.lineage_nodes 
                    WHERE object_id IN ('{object_ids_list}')
                """
                nodes_result = self.session.sql(nodes_sql).collect()
            else:
                nodes_result = []
            
            return {
                'target_object': object_id,
                'upstream_edges': [r.as_dict() for r in upstream_result],
                'downstream_edges': [r.as_dict() for r in downstream_result], 
                'nodes': [r.as_dict() for r in nodes_result],
                'depth': depth
            }
            
        except Exception as e:
            return {'error': f'object_lineage_query_failed: {str(e)}'}


class DbtArtifactsProcessor:
    """Process dbt artifacts for lineage extraction"""
    
    def __init__(self, session):
        self.session = session
        
    def process_manifest_json(self, manifest_data: dict) -> Dict[str, Any]:
        """Process dbt manifest.json for model lineage"""
        try:
            nodes = []
            edges = []
            
            # Process models
            for node_id, node_data in manifest_data.get('nodes', {}).items():
                if node_data.get('resource_type') == 'model':
                    node_dict = {
                        'id': node_id,
                        'name': node_data.get('name'),
                        'database': node_data.get('database'),
                        'schema': node_data.get('schema'),
                        'table_name': node_data.get('alias') or node_data.get('name'),
                        'description': node_data.get('description', ''),
                        'columns': [
                            {'name': col_name, 'description': col_data.get('description', '')} 
                            for col_name, col_data in node_data.get('columns', {}).items()
                        ],
                        'node_type': 'DBT_MODEL',
                        'sql': node_data.get('raw_code', ''),
                        'tags': node_data.get('tags', [])
                    }
                    nodes.append(node_dict)
                    
                    # Process dependencies as edges
                    for dep_node in node_data.get('depends_on', {}).get('nodes', []):
                        edge_dict = {
                            'source': dep_node,
                            'target': node_id,
                            'edge_type': 'DBT_DEPENDENCY'
                        }
                        edges.append(edge_dict)
            
            return {
                'nodes': nodes,
                'edges': edges,
                'extraction_method': 'dbt_manifest',
                'models_processed': len(nodes)
            }
            
        except Exception as e:
            return {'error': f'dbt_manifest_processing_failed: {str(e)}'}
    
    def store_dbt_lineage(self, lineage_data: Dict[str, Any]) -> Dict[str, Any]:
        """Store processed dbt lineage in app tables"""
        extractor = SnowflakeLineageExtractor(self.session)
        return extractor.store_lineage_data(lineage_data, 'DBT_ARTIFACTS')
import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import EnhancedTableNode from './EnhancedTableNode';
import ColumnLineagePanel from './ColumnLineagePanel';

const nodeTypes = {
  table: EnhancedTableNode,
  column: ({ data }) => (
    <div className="px-3 py-1 shadow-sm rounded border bg-blue-50 border-blue-200 min-w-[150px]">
      <div className="text-sm font-medium text-blue-900">{data.label}</div>
      <div className="text-xs text-gray-500">{data.table}</div>
      {data.description && (
        <div className="text-xs text-gray-600 mt-1">{data.description}</div>
      )}
    </div>
  ),
  dbtModel: EnhancedTableNode
};

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 150, nodesep: 100 });

  nodes.forEach((node) => {
    g.setNode(node.id, { 
      width: node.measured?.width ?? 300, 
      height: node.measured?.height ?? 200 
    });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = g.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.measured?.width ?? 300) / 2,
          y: nodeWithPosition.y - (node.measured?.height ?? 200) / 2,
        },
      };
    }),
    edges,
  };
};

export default function EnhancedLineageGraph({ data, level = 'table', onNodeClick }) {
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [highlightedColumns, setHighlightedColumns] = useState(new Set());
  const [showLineagePanel, setShowLineagePanel] = useState(false);
  const [lineagePanelPosition, setLineagePanelPosition] = useState(null);

  // Handle column selection with enhanced lineage highlighting
  const handleColumnSelect = useCallback(async (columnId, tableId) => {
    setSelectedColumn(columnId);
    setSelectedTable(tableId);
    setShowLineagePanel(true);
    
    // Position panel near the selected node
    const nodeElement = document.querySelector(`[data-id="${tableId}"]`);
    if (nodeElement) {
      const rect = nodeElement.getBoundingClientRect();
      setLineagePanelPosition({ 
        x: rect.right + 20,
        y: rect.top 
      });
    }

    try {
      // Fetch column lineage to highlight related columns
      const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';
      const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${columnId}&depth=2`);
      
      if (response.ok) {
        const lineageData = await response.json();
        const highlighted = new Set();
        
        if (lineageData.edges) {
          lineageData.edges.forEach(edge => {
            highlighted.add(edge.src_object_id || edge.source);
            highlighted.add(edge.tgt_object_id || edge.target);
          });
        }
        
        highlighted.add(columnId);
        setHighlightedColumns(highlighted);
      }
    } catch (error) {
      console.error('Failed to fetch column lineage:', error);
    }
  }, []);

  const handleCloseLineagePanel = useCallback(() => {
    setShowLineagePanel(false);
    setLineagePanelPosition(null);
    setSelectedColumn(null);
    setHighlightedColumns(new Set());
  }, []);

  // Transform backend data to React Flow format
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (!data || !data.nodes) {
      return { nodes: [], edges: [] };
    }

    const nodes = data.nodes.map(node => {
      // Determine node type based on data
      let nodeType = 'table';
      let label = node.object_name || node.name || node.id;
      
      if (node.node_type === 'COLUMN' || (level === 'column' && node.column_name)) {
        nodeType = 'column';
        label = node.column_name || node.column || label;
      } else if (node.node_type === 'DBT_MODEL' || node.object_type === 'DBT_MODEL') {
        nodeType = 'dbtModel';
      }

      return {
        id: node.object_id || node.id,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: {
          label,
          database: node.database_name || node.database,
          schema: node.schema_name || node.schema,
          table: node.object_name || node.table_name,
          columns: node.columns || [],
          node_type: node.node_type || node.object_type,
          description: node.description || '',
          object_id: node.object_id || node.id,
          object_name: node.object_name || node.name,
          database_name: node.database_name,
          schema_name: node.schema_name,
          onColumnSelect: handleColumnSelect,
          selectedColumn,
          highlightedColumns,
          isHighlighted: highlightedColumns.size > 0,
          ...node
        }
      };
    });

    const edges = (data.edges || []).map(edge => ({
      id: edge.edge_id || `${edge.src_object_id || edge.source}-${edge.tgt_object_id || edge.target}`,
      source: edge.src_object_id || edge.source,
      target: edge.tgt_object_id || edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      style: { 
        stroke: edge.edge_kind === 'DBT_DEPENDENCY' ? '#10b981' : '#64748b',
        strokeWidth: 2
      },
      label: edge.edge_kind || edge.edge_type || '',
      animated: edge.lineage_source === 'QUERY_HISTORY'
    }));

    return getLayoutedElements(nodes, edges);
  }, [data, level, selectedColumn, highlightedColumns, handleColumnSelect]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  const handleNodeClick = useCallback((event, node) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
  }, [onNodeClick]);

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="text-gray-500 text-lg">No lineage data available</div>
          <div className="text-gray-400 text-sm mt-2">
            Try parsing SQL, uploading dbt artifacts, or auto-discovering from query history
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '600px' }} className="border rounded bg-gray-50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'dbtModel': return '#10b981';
              case 'column': return '#3b82f6';
              default: return '#6b7280';
            }
          }}
        />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
      
      {/* Column Lineage Panel */}
      {showLineagePanel && selectedColumn && (
        <ColumnLineagePanel
          columnId={selectedColumn}
          tableId={selectedTable}
          position={lineagePanelPosition}
          onClose={handleCloseLineagePanel}
        />
      )}
      
      {/* Enhanced Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-4 rounded-lg shadow-lg border text-sm">
        <div className="font-semibold mb-3 text-gray-800">Enhanced Data Lineage</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <span className="text-gray-700">Tables & Views</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg">🔧</span>
            <span className="text-gray-700">dbt Models</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-gray-700">Columns</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-0.5 bg-gray-600"></div>
            <span className="text-gray-700">Data Flow</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t text-xs text-gray-600">
          <div className="space-y-1">
            <div>💡 Click tables to expand columns</div>
            <div>🔍 Click columns to view lineage</div>
            <div>📈 Real Snowflake data integration</div>
          </div>
        </div>
      </div>
    </div>
  );
}
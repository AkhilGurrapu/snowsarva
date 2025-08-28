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
import EnhancedTableNode from './EnhancedTableNode';
import ColumnLineagePanel from './ColumnLineagePanel';
import { useColumnSelection } from '../hooks/use-column-selection';
import { getLayoutedElements, getEdgeStyle, transformationTypes } from '../utils/graph-utils';

// Simple column node for column-level lineage
const ColumnNode = ({ data }) => (
  <div className="px-3 py-1 shadow-sm rounded border bg-blue-50 border-blue-200 min-w-[150px]">
    <div className="text-sm font-medium text-blue-900">{data.label}</div>
    <div className="text-xs text-gray-500">{data.table}</div>
    {data.description && (
      <div className="text-xs text-gray-600 mt-1">{data.description}</div>
    )}
  </div>
);

// dbt Model node
const DbtModelNode = ({ data }) => (
  <div className="px-4 py-2 shadow-md rounded-md bg-green-50 border-2 border-green-300 min-w-[200px]">
    <div className="flex">
      <div className="ml-2">
        <div className="text-lg font-bold text-green-900">{data.label}</div>
        <div className="text-green-600 text-sm">
          {data.database && data.schema ? `${data.database}.${data.schema}` : 'dbt model'}
        </div>
        <div className="text-xs text-green-500 mt-1">DBT_MODEL</div>
        {data.description && (
          <div className="text-xs text-gray-600 mt-1 max-w-[200px] truncate">
            {data.description}
          </div>
        )}
      </div>
    </div>
  </div>
);

const nodeTypes = {
  table: EnhancedTableNode,
  column: ColumnNode,
  dbtModel: DbtModelNode
};


export default function LineageGraph({ data, level = 'table', onNodeClick }) {
  const {
    selectedColumn,
    highlightedPaths,
    selectColumn,
    clearSelection,
    highlightLineagePath,
    isColumnSelected,
    isPathHighlighted
  } = useColumnSelection();
  
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [columnLineagePanel, setColumnLineagePanel] = useState(null);
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
      
      const nodeId = node.object_id || node.id;
      const isExpanded = expandedNodes.has(nodeId);
      const isHighlighted = selectedColumn?.nodeId === nodeId;

      return {
        id: nodeId,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: {
          ...node,
          label,
          isExpanded,
          isHighlighted,
          selectedColumn: selectedColumn?.columnName,
          highlightedColumns: new Set(highlightedPaths),
          onColumnSelect: handleColumnSelect,
          onToggleExpand: handleToggleExpand
        }
      };
    });

    const edges = (data.edges || []).map(edge => {
      const edgeId = edge.edge_id || `${edge.src_object_id || edge.source}-${edge.tgt_object_id || edge.target}`;
      const isHighlighted = isPathHighlighted(edgeId);
      
      // Determine transformation type for styling
      let transformationType = transformationTypes.UNKNOWN;
      if (edge.edge_kind === 'DBT_DEPENDENCY') {
        transformationType = transformationTypes.DIRECT_COPY;
      } else if (edge.metadata) {
        const metadata = typeof edge.metadata === 'string' ? JSON.parse(edge.metadata) : edge.metadata;
        transformationType = metadata.transformation_type || transformationTypes.UNKNOWN;
      }
      
      const edgeStyle = getEdgeStyle(transformationType, isHighlighted);
      
      return {
        id: edgeId,
        source: edge.src_object_id || edge.source,
        target: edge.tgt_object_id || edge.target,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: edgeStyle,
        animated: edgeStyle.animated,
        label: edge.edge_kind || edge.edge_type || '',
        data: {
          transformationType,
          ...edge
        }
      };
    });

    return getLayoutedElements(nodes, edges);
  }, [data, level]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  const handleColumnSelect = useCallback((columnName, nodeId) => {
    selectColumn(nodeId, columnName);
    
    // Show column lineage panel
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setColumnLineagePanel({
        columnName,
        tableId: nodeId,
        tableName: node.data.object_name || node.data.label,
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      });
    }
    
    // TODO: Highlight lineage paths for this column
    // This would require API call to get column-level lineage
  }, [selectColumn, nodes]);
  
  const handleToggleExpand = useCallback((nodeId, expanded) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (expanded) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
      return newSet;
    });
  }, []);
  
  const handleCloseColumnPanel = useCallback(() => {
    setColumnLineagePanel(null);
    clearSelection();
  }, [clearSelection]);

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
        minZoom={0.1}
        maxZoom={2}
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'dbtModel': return '#10b981';
              case 'column': return '#3b82f6';
              default: '#6b7280';
            }
          }}
        />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
      
      {/* Enhanced Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded shadow-lg border text-xs">
        <div className="font-semibold mb-2">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-400 rounded"></div>
            <span>Table/View</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>dbt Model</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Column</span>
          </div>
        </div>
        
        <div className="mt-3 pt-2 border-t">
          <div className="font-medium mb-1">Transformations</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span>Direct Copy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500 border-dashed border-b-2 border-blue-500"></div>
              <span>Calculation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 bg-violet-500"></div>
              <span>Aggregation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500"></div>
              <span>Join</span>
            </div>
          </div>
        </div>
        
        {selectedColumn && (
          <div className="mt-2 pt-2 border-t text-blue-700">
            <div className="font-medium">Selected:</div>
            <div className="truncate">{selectedColumn.columnName}</div>
          </div>
        )}
      </div>
      
      {/* Column Lineage Panel */}
      {columnLineagePanel && (
        <ColumnLineagePanel
          {...columnLineagePanel}
          onClose={handleCloseColumnPanel}
        />
      )}
    </div>
  );
}
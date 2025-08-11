import React, { useCallback, useMemo } from 'react';
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

const nodeTypes = {
  table: ({ data }) => (
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-stone-400 min-w-[200px]">
      <div className="flex">
        <div className="ml-2">
          <div className="text-lg font-bold text-gray-900">{data.label}</div>
          <div className="text-gray-500 text-sm">
            {data.database && data.schema ? `${data.database}.${data.schema}` : 'N/A'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {data.node_type || 'TABLE'}
          </div>
          {data.columns && data.columns.length > 0 && (
            <div className="mt-2 text-xs">
              {data.columns.slice(0, 3).map((col, idx) => (
                <div key={idx} className="text-gray-600">
                  {typeof col === 'object' ? col.name : col}
                </div>
              ))}
              {data.columns.length > 3 && (
                <div className="text-gray-400">+{data.columns.length - 3} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ),
  
  column: ({ data }) => (
    <div className="px-3 py-1 shadow-sm rounded border bg-blue-50 border-blue-200 min-w-[150px]">
      <div className="text-sm font-medium text-blue-900">{data.label}</div>
      <div className="text-xs text-gray-500">{data.table}</div>
      {data.description && (
        <div className="text-xs text-gray-600 mt-1">{data.description}</div>
      )}
    </div>
  ),
  
  dbtModel: ({ data }) => (
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
  )
};

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { 
      width: node.measured?.width ?? 250, 
      height: node.measured?.height ?? 100 
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
          x: nodeWithPosition.x - (node.measured?.width ?? 250) / 2,
          y: nodeWithPosition.y - (node.measured?.height ?? 100) / 2,
        },
      };
    }),
    edges,
  };
};

export default function LineageGraph({ data, level = 'table', onNodeClick }) {
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
  }, [data, level]);

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
    <div style={{ width: '100%', height: '600px' }} className="border rounded bg-gray-50">
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
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded shadow-lg border text-xs">
        <div className="font-semibold mb-2">Legend</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-gray-400 rounded"></div>
          <span>Table/View</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>dbt Model</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Column</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-gray-600"></div>
          <span>Lineage</span>
        </div>
      </div>
    </div>
  );
}
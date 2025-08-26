import React, { useCallback, useMemo, useState, useEffect } from "react";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useQuery } from "@tanstack/react-query";

import LineageVisualizerTableNode from "./LineageVisualizerTableNode";
import LineageVisualizerColumnPanel from "./LineageVisualizerColumnPanel";

function LineageVisualizerCanvasInner({ tables, connections, project }) {
  const nodeTypes = useMemo(() => ({
    table: LineageVisualizerTableNode,
  }), []);

  const [selectedColumn, setSelectedColumn] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [highlightedColumns, setHighlightedColumns] = useState(new Set());
  const [highlightedTables, setHighlightedTables] = useState(new Set());
  const [lineageMode, setLineageMode] = useState('table');
  const [showLineagePanel, setShowLineagePanel] = useState(false);
  const [lineagePanelPosition, setLineagePanelPosition] = useState(undefined);
  const reactFlowInstance = useReactFlow();

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Fetch column lineage data when needed
  const { data: columnLineageData = [], isLoading: isColumnLineageLoading } = useQuery({
    queryKey: ['column-lineage', selectedColumn],
    queryFn: async () => {
      if (!selectedColumn) return [];
      const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${selectedColumn}&depth=2`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.edges || [];
    },
    enabled: !!selectedColumn
  });

  // Handle column selection and lineage highlighting
  const handleColumnSelect = useCallback(async (columnId, tableId, event) => {
    setSelectedColumn(columnId);
    setSelectedTable(tableId);
    setLineageMode('column');
    setShowLineagePanel(true);
    
    // Position panel at top-right of the node
    if (tableId) {
      const nodeElement = document.querySelector(`[data-id="${tableId}"]`);
      
      if (nodeElement) {
        const rect = nodeElement.getBoundingClientRect();
        setLineagePanelPosition({ 
          x: rect.right + 10,
          y: rect.top - 10
        });
      }
    }

    try {
      // Fetch lineage for the selected column
      const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${columnId}&depth=2`);
      if (response.ok) {
        const lineageData = await response.json();
        
        // Extract highlighted columns and tables from lineage
        const highlightedCols = new Set();
        const highlightedTabs = new Set();
        
        if (lineageData.edges) {
          lineageData.edges.forEach(edge => {
            highlightedCols.add(edge.src_object_id);
            highlightedCols.add(edge.tgt_object_id);
            
            // Find tables that contain these columns
            tables.forEach(table => {
              if (table.columns?.some(col => 
                col.id === edge.src_object_id || col.id === edge.tgt_object_id
              )) {
                highlightedTabs.add(table.id);
              }
            });
          });
        }
        
        highlightedCols.add(columnId);
        highlightedTabs.add(tableId);
        
        setHighlightedColumns(highlightedCols);
        setHighlightedTables(highlightedTabs);
      }
    } catch (error) {
      console.error('Failed to fetch column lineage:', error);
    }
  }, [tables, apiBase]);

  // Clear selection and highlighting
  const clearSelection = useCallback(() => {
    setSelectedColumn(null);
    setSelectedTable(null);
    setHighlightedColumns(new Set());
    setHighlightedTables(new Set());
    setLineageMode('table');
    setShowLineagePanel(false);
    setLineagePanelPosition(undefined);
  }, []);

  // Generate dynamic node positions with better spacing
  const generateNodePositions = useCallback((tables) => {
    const nodesWithoutPosition = tables.filter(table => !table.position);
    
    if (nodesWithoutPosition.length === 0) return tables;
    
    // Advanced grid layout with dynamic spacing
    const cols = Math.ceil(Math.sqrt(tables.length));
    const baseSpacing = { x: 400, y: 300 };
    const padding = { x: 100, y: 100 };
    
    return tables.map((table, index) => {
      if (table.position) return table;
      
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      // Add some randomness and spacing variation for organic feel
      const jitterX = (Math.random() - 0.5) * 50;
      const jitterY = (Math.random() - 0.5) * 50;
      
      return {
        ...table,
        position: {
          x: padding.x + col * baseSpacing.x + jitterX,
          y: padding.y + row * baseSpacing.y + jitterY
        }
      };
    });
  }, []);

  // Convert tables to React Flow nodes with enhanced data
  const initialNodes = useMemo(() => {
    const positionedTables = generateNodePositions(tables);
    
    return positionedTables.map((table) => {
      const isHighlighted = highlightedTables.has(table.id);
      const isSelected = selectedTable === table.id;
      
      return {
        id: table.id,
        type: 'table',
        position: table.position,
        data: { 
          table,
          isConnectable: true,
          selectedColumn,
          highlightedColumns,
          onColumnSelect: handleColumnSelect,
          isHighlighted,
          lineageLevel: isHighlighted ? (selectedTable === table.id ? null : 'connected') : null,
          onExpand: (tableId, expanded) => {
            console.log(`Table ${tableId} ${expanded ? 'expanded' : 'collapsed'}`);
          }
        },
        selected: isSelected,
        className: isHighlighted ? 'highlighted-node' : '',
      };
    });
  }, [tables, selectedColumn, highlightedColumns, highlightedTables, selectedTable, handleColumnSelect, generateNodePositions]);

  // Clean edge styling for better clarity
  const getEdgeStyle = useCallback((connection) => {
    const isHighlighted = highlightedTables.has(connection.sourceTableId) || 
                         highlightedTables.has(connection.targetTableId);
    
    if (lineageMode === 'column' && isHighlighted) {
      return {
        stroke: '#3b82f6',
        strokeWidth: 3,
        strokeDasharray: '0',
      };
    }
    
    // Simple, clean styling based on transformation type
    switch (connection.transformationType) {
      case 'join':
        return { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '0' }; // blue
      case 'aggregation':
        return { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5,5' }; // purple
      case 'filter':
        return { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '3,3' }; // amber
      case 'union':
        return { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '8,2' }; // red
      default:
        return { stroke: '#6b7280', strokeWidth: 2, strokeDasharray: '0' }; // gray
    }
  }, [lineageMode, highlightedTables]);

  // Convert connections to React Flow edges
  const initialEdges = useMemo(() => {
    return connections.map((connection) => {
      const edgeStyle = getEdgeStyle(connection);
      const isHighlighted = highlightedTables.has(connection.sourceTableId) || 
                           highlightedTables.has(connection.targetTableId);
      
      return {
        id: connection.id,
        source: connection.sourceTableId,
        target: connection.targetTableId,
        type: 'default',
        animated: isHighlighted && lineageMode === 'column',
        style: {
          ...edgeStyle,
          cursor: 'pointer'
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeStyle.stroke,
        },
        data: {
          transformationType: connection.transformationType,
          isHighlighted,
          connection
        },
        label: connection.transformationType,
        labelStyle: { 
          fontSize: 11, 
          fontWeight: 600,
          fill: edgeStyle.stroke,
          backgroundColor: 'white',
          padding: '4px 8px',
          borderRadius: '6px',
          border: `1px solid ${edgeStyle.stroke}`,
          cursor: 'pointer'
        },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 6,
        interactionWidth: 20
      };
    });
  }, [connections, getEdgeStyle, highlightedTables, lineageMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when dependencies change
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Update edges when dependencies change
  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle edge clicks to show relationship details
  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    console.log('Edge clicked:', edge);
    
    const connection = connections.find(conn => conn.id === edge.id);
    if (connection) {
      const highlightedTabs = new Set([connection.sourceTableId, connection.targetTableId]);
      setHighlightedTables(highlightedTabs);
      
      console.log(`Relationship: ${connection.transformationType} from ${connection.sourceTableId} to ${connection.targetTableId}`);
      
      const sourceNode = nodes.find(n => n.id === connection.sourceTableId);
      const targetNode = nodes.find(n => n.id === connection.targetTableId);
      
      if (sourceNode && targetNode && reactFlowInstance) {
        const centerX = (sourceNode.position.x + targetNode.position.x) / 2;
        const centerY = (sourceNode.position.y + targetNode.position.y) / 2;
        
        reactFlowInstance.setCenter(centerX, centerY, { zoom: 1.0 });
      }
    }
  }, [connections, nodes, reactFlowInstance]);

  // Focus on selected table/column
  const focusOnSelection = useCallback(() => {
    if (selectedTable && reactFlowInstance) {
      const node = nodes.find(n => n.id === selectedTable);
      if (node) {
        reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.2 });
      }
    }
  }, [selectedTable, reactFlowInstance, nodes]);

  return (
    <div className="w-full h-full relative" data-testid="lineage-canvas">
      {/* Clear Selection Button */}
      {(selectedColumn || selectedTable) && (
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={clearSelection}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow text-sm font-medium"
          >
            Clear Selection
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition={undefined}
        className="bg-slate-50"
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background 
          color="#e2e8f0" 
          gap={20} 
          size={1}
        />
        <Controls />
      </ReactFlow>
      
      {/* Column Lineage Panel */}
      {showLineagePanel && selectedColumn && (
        <LineageVisualizerColumnPanel
          columnId={selectedColumn}
          tableId={selectedTable}
          position={lineagePanelPosition}
          onClose={() => {
            setShowLineagePanel(false);
            setLineagePanelPosition(undefined);
          }}
        />
      )}

      {/* Enhanced Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-4 rounded-lg shadow-lg border text-sm max-w-xs">
        <div className="font-semibold mb-3 text-gray-800">Snowflake Data Lineage</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <span className="text-gray-700">Tables & Views</span>
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
            <div>❄️ Real Snowflake data integration</div>
          </div>
        </div>
        
        {project && (
          <div className="mt-3 pt-3 border-t text-xs text-gray-600">
            <div className="font-medium">{project.name}</div>
            <div>{project.description}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LineageVisualizerCanvas(props) {
  return (
    <ReactFlowProvider>
      <LineageVisualizerCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
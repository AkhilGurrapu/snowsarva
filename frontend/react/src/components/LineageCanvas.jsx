import React, { useCallback, useMemo, useState, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import EnhancedTableNode from "./EnhancedTableNode";
import { Button } from "./ui/button";
import { Target, GitBranch, Zap, RotateCcw, Info } from "lucide-react";

const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

// LineageCanvasProps type definition

function LineageCanvasInner({ tables, connections }) {
  const nodeTypes = useMemo(() => ({
    table: EnhancedTableNode,
  }), []);
  
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [highlightedColumns, setHighlightedColumns] = useState(new Set());
  const [highlightedTables, setHighlightedTables] = useState(new Set());
  const [lineageMode, setLineageMode] = useState('table');
  const [showLineagePanel, setShowLineagePanel] = useState(false);
  const [lineagePanelPosition, setLineagePanelPosition] = useState(undefined);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [autoLayout, setAutoLayout] = useState(true);
  const reactFlowInstance = useReactFlow();

  // Fetch column lineage data
  const { data: columnLineageData = [], isLoading: isColumnLineageLoading } = useQuery({
    queryKey: ['column-lineage'],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/lineage/column-level`);
      if (!response.ok) return [];
      return response.json();
    }
  });

  // Handle column selection and lineage triaging
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
      // Fetch upstream and downstream lineage for the selected column
      const [upstreamResponse, downstreamResponse] = await Promise.all([
        fetch(`${apiBase}/lineage/column-upstream/${columnId}`),
        fetch(`${apiBase}/lineage/column-downstream/${columnId}`)
      ]);
      
      const upstreamData = await upstreamResponse.json();
      const downstreamData = await downstreamResponse.json();
      const lineageData = [...upstreamData, ...downstreamData];
      
      // Extract highlighted columns and tables from lineage
      const highlightedCols = new Set();
      const highlightedTabs = new Set();
      
      lineageData.forEach(lineage => {
        highlightedCols.add(lineage.sourceColumnId);
        highlightedCols.add(lineage.targetColumnId);
      });
      
      highlightedCols.add(columnId);
      highlightedTabs.add(tableId);
      
      setHighlightedColumns(highlightedCols);
      setHighlightedTables(highlightedTabs);
      
    } catch (error) {
      console.error('Failed to fetch column lineage:', error);
    }
  }, []);

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
    
    const cols = Math.ceil(Math.sqrt(tables.length));
    const baseSpacing = { x: 400, y: 300 };
    const padding = { x: 100, y: 100 };
    
    return tables.map((table, index) => {
      if (table.position) return table;
      
      const row = Math.floor(index / cols);
      const col = index % cols;
      
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
        return { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '0' };
      case 'aggregation':
        return { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5,5' };
      case 'filter':
        return { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '3,3' };
      case 'union':
        return { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '8,2' };
      default:
        return { stroke: '#6b7280', strokeWidth: 2, strokeDasharray: '0' };
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

  // Handle node position updates
  const onNodeDragStop = useCallback(
    async (event, node) => {
      try {
        await fetch(`${apiBase}/tables/${node.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: node.position })
        });
      } catch (error) {
        console.error('Failed to update table position:', error);
      }
    },
    []
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
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
        <div 
          className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10"
          style={{
            left: lineagePanelPosition?.x || 0,
            top: lineagePanelPosition?.y || 0,
            minWidth: '300px'
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Column Lineage</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowLineagePanel(false);
                setLineagePanelPosition(undefined);
              }}
            >
              ×
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Column: {selectedColumn}
          </p>
          <p className="text-sm text-gray-600">
            Table: {selectedTable}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LineageCanvas(props) {
  return (
    <ReactFlowProvider>
      <LineageCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from './ui/button';
import { Database as DatabaseIcon, Maximize2, Minimize2 } from 'lucide-react';

// Simple table node component
const TableNode = ({ data }) => {
  const { table } = data;
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-4 min-w-[200px] shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <DatabaseIcon className="w-4 h-4 text-blue-600" />
        <span className="font-semibold text-sm">{table?.name || 'Unknown Table'}</span>
      </div>
      <div className="text-xs text-gray-600">
        {table?.database_name && table?.schema_name && (
          <div>{table.database_name}.{table.schema_name}</div>
        )}
      </div>
    </div>
  );
};

const nodeTypes = {
  table: TableNode
};

function LineageCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Load sample data
  const loadSampleLineage = async () => {
    setIsLoading(true);
    try {
      // Fetch databases first
      const response = await fetch(`${apiBase}/databases`);
      const databases = await response.json();
      
      // Create some sample nodes
      const sampleNodes = [
        {
          id: '1',
          type: 'table',
          position: { x: 100, y: 100 },
          data: {
            table: {
              id: 'DB1.SCHEMA1.TABLE1',
              name: 'CUSTOMERS',
              database_name: databases[0]?.name || 'SAMPLE_DB',
              schema_name: 'PUBLIC'
            }
          }
        },
        {
          id: '2',
          type: 'table',
          position: { x: 400, y: 100 },
          data: {
            table: {
              id: 'DB1.SCHEMA1.TABLE2',
              name: 'ORDERS',
              database_name: databases[0]?.name || 'SAMPLE_DB',
              schema_name: 'PUBLIC'
            }
          }
        },
        {
          id: '3',
          type: 'table',
          position: { x: 250, y: 300 },
          data: {
            table: {
              id: 'DB1.SCHEMA1.TABLE3',
              name: 'CUSTOMER_ORDERS',
              database_name: databases[0]?.name || 'SAMPLE_DB',
              schema_name: 'PUBLIC'
            }
          }
        }
      ];

      const sampleEdges = [
        {
          id: 'e1-3',
          source: '1',
          target: '3',
          type: 'smoothstep',
          animated: true
        },
        {
          id: 'e2-3',
          source: '2',
          target: '3',
          type: 'smoothstep',
          animated: true
        }
      ];

      setNodes(sampleNodes);
      setEdges(sampleEdges);
    } catch (error) {
      console.error('Error loading sample lineage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSampleLineage();
  }, []);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="w-full h-[600px] bg-gray-50 rounded-lg border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}

function LineageVisualizerSimple() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''} flex flex-col h-full`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <DatabaseIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold">Data Lineage Visualizer</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4">
        <ReactFlowProvider>
          <LineageCanvas />
        </ReactFlowProvider>
      </div>

      {/* Status Bar */}
      <div className="border-t p-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>Ready</span>
          <span>Tip: Click and drag to pan, scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}

export default LineageVisualizerSimple;

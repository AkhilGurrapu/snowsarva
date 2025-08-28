import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import EnhancedTableNode from './EnhancedTableNode'
import ColumnLineagePanel from './ColumnLineagePanel'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { 
  Database as DatabaseIcon, 
  Settings, 
  Maximize2, 
  Minimize2,
  Target,
  GitBranch,
  Zap,
  RotateCcw,
  Info,
  Eye,
  Map,
  TreePine,
  Filter,
  Search
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { getLayoutedElements, getEdgeStyle, transformationTypes } from '../utils/graph-utils'
import { useColumnSelection } from '../hooks/use-column-selection'

// Canvas Controls Component
function LineageCanvasControls({ 
  lineageMode, 
  setLineageMode, 
  showFileTree, 
  setShowFileTree, 
  showMiniMap, 
  setShowMiniMap,
  autoLayout,
  setAutoLayout,
  onResetView 
}) {
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
      <Card className="p-2">
        <div className="flex items-center space-x-2">
          <Button
            variant={lineageMode === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLineageMode('table')}
          >
            <DatabaseIcon className="w-4 h-4 mr-1" />
            Tables
          </Button>
          <Button
            variant={lineageMode === 'column' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLineageMode('column')}
          >
            <GitBranch className="w-4 h-4 mr-1" />
            Columns
          </Button>
        </div>
      </Card>
      
      <Card className="p-2">
        <div className="flex flex-col space-y-1">
          <Button
            variant={showFileTree ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFileTree(!showFileTree)}
          >
            <TreePine className="w-4 h-4 mr-1" />
            File Tree
          </Button>
          <Button
            variant={showMiniMap ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowMiniMap(!showMiniMap)}
          >
            <Map className="w-4 h-4 mr-1" />
            Mini Map
          </Button>
          <Button
            variant={autoLayout ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoLayout(!autoLayout)}
          >
            <Zap className="w-4 h-4 mr-1" />
            Auto Layout
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetView}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>
      </Card>
    </div>
  )
}

// File Tree Sidebar Component  
function FileTreeSidebar({ tables, onTableSelect, selectedTables }) {
  const [searchTerm, setSearchTerm] = useState('')
  
  const filteredTables = tables.filter(table =>
    table.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    table.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const groupedTables = filteredTables.reduce((acc, table) => {
    const key = `${table.database}.${table.schema}`
    if (!acc[key]) acc[key] = []
    acc[key].push(table)
    return acc
  }, {})

  return (
    <div className="absolute top-0 left-0 w-80 h-full bg-white border-r border-slate-200 z-20 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-2">Database Objects</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(groupedTables).map(([schemaKey, schemaTables]) => (
          <div key={schemaKey} className="mb-4">
            <div className="flex items-center text-sm font-medium text-slate-700 mb-2 px-2">
              <DatabaseIcon className="w-4 h-4 mr-2" />
              {schemaKey}
            </div>
            <div className="space-y-1 ml-6">
              {schemaTables.map((table, idx) => (
                <button
                  key={idx}
                  onClick={() => onTableSelect(table)}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                    selectedTables.has(table.fullName) ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{table.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {table.type}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mini Map Component
function LineageMiniMap({ nodeColor, showMiniMap }) {
  if (!showMiniMap) return null
  
  return (
    <div className="absolute bottom-4 right-4 bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
      <div className="w-32 h-24 bg-slate-50 rounded border relative">
        <div className="absolute inset-2 border border-blue-300 bg-blue-50 opacity-50"></div>
        <div className="absolute top-1 right-1 text-xs text-slate-500">Mini Map</div>
      </div>
    </div>
  )
}

// Main Lineage Canvas Component
function LineageCanvasInner({ tables, connections = [] }) {
  const reactFlowInstance = useReactFlow()
  const nodeTypes = useMemo(() => ({ table: EnhancedTableNode }), [])
  
  const {
    selectedColumn,
    highlightedPaths,
    selectColumn,
    clearSelection,
    highlightLineagePath,
    isColumnSelected,
    isPathHighlighted
  } = useColumnSelection()
  
  const [selectedTable, setSelectedTable] = useState(null)
  const [highlightedColumns, setHighlightedColumns] = useState(new Set())
  const [highlightedTables, setHighlightedTables] = useState(new Set())
  const [lineageMode, setLineageMode] = useState('table')
  const [showLineagePanel, setShowLineagePanel] = useState(false)
  const [lineagePanelData, setLineagePanelData] = useState(null)
  const [showFileTree, setShowFileTree] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [autoLayout, setAutoLayout] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [selectedTables, setSelectedTables] = useState(new Set())

  // Handle column selection
  const handleColumnSelect = useCallback((columnName, nodeId) => {
    selectColumn(nodeId, columnName)
    setSelectedTable(nodeId)
    
    // Show column lineage panel
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      setLineagePanelData({
        columnName,
        tableId: nodeId,
        tableName: node.data.object_name || node.data.label,
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      })
      setShowLineagePanel(true)
    }
  }, [selectColumn])
  
  const handleToggleExpand = useCallback((nodeId, expanded) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (expanded) {
        newSet.add(nodeId)
      } else {
        newSet.delete(nodeId)
      }
      return newSet
    })
  }, [])

  const handleTableSelect = useCallback((table) => {
    setSelectedTables(prev => {
      const newSet = new Set(prev)
      if (newSet.has(table.fullName)) {
        newSet.delete(table.fullName)
      } else {
        newSet.add(table.fullName)
      }
      return newSet
    })
  }, [])

  const handleResetView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2 })
    clearSelection()
    setShowLineagePanel(false)
  }, [reactFlowInstance, clearSelection])

  const handleCloseLineagePanel = useCallback(() => {
    setShowLineagePanel(false)
    setLineagePanelData(null)
    clearSelection()
  }, [clearSelection])

  // Transform data for React Flow
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (!tables || tables.length === 0) {
      return { nodes: [], edges: [] }
    }

    const nodes = tables.map(table => {
      const nodeId = table.object_id || `${table.database}.${table.schema}.${table.name}`
      const isExpanded = expandedNodes.has(nodeId)
      const isHighlighted = selectedColumn?.nodeId === nodeId

      return {
        id: nodeId,
        type: 'table',
        position: { x: 0, y: 0 },
        data: {
          ...table,
          isExpanded,
          isHighlighted,
          selectedColumn: selectedColumn?.columnName,
          highlightedColumns,
          onColumnSelect: handleColumnSelect,
          onToggleExpand: handleToggleExpand
        },
      }
    })

    const edges = connections.map(conn => {
      const edgeId = conn.edge_id || `${conn.source}-${conn.target}`
      const isHighlighted = isPathHighlighted(edgeId)
      
      const transformationType = conn.transformation_type || transformationTypes.UNKNOWN
      const edgeStyle = getEdgeStyle(transformationType, isHighlighted)
      
      return {
        id: edgeId,
        source: conn.src_object_id || conn.source,
        target: conn.tgt_object_id || conn.target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: edgeStyle,
        animated: edgeStyle.animated,
        label: conn.edge_kind || '',
        data: { transformationType, ...conn }
      }
    })

    if (autoLayout) {
      return getLayoutedElements(nodes, edges)
    }
    
    return { nodes, edges }
  }, [tables, connections, expandedNodes, selectedColumn, highlightedColumns, handleColumnSelect, handleToggleExpand, isPathHighlighted, autoLayout])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Update nodes when layoutNodes change
  useEffect(() => {
    setNodes(layoutNodes)
  }, [layoutNodes, setNodes])

  useEffect(() => {
    setEdges(layoutEdges)
  }, [layoutEdges, setEdges])

  return (
    <div className="w-full h-full relative bg-slate-50">
      {/* Canvas Controls */}
      <LineageCanvasControls
        lineageMode={lineageMode}
        setLineageMode={setLineageMode}
        showFileTree={showFileTree}
        setShowFileTree={setShowFileTree}
        showMiniMap={showMiniMap}
        setShowMiniMap={setShowMiniMap}
        autoLayout={autoLayout}
        setAutoLayout={setAutoLayout}
        onResetView={handleResetView}
      />

      {/* File Tree Sidebar */}
      {showFileTree && (
        <FileTreeSidebar
          tables={tables}
          onTableSelect={handleTableSelect}
          selectedTables={selectedTables}
        />
      )}

      {/* Main Canvas */}
      <div className={`w-full h-full ${showFileTree ? 'pl-80' : ''}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Background variant="dots" gap={12} size={1} />
          <Controls position="bottom-left" />
        </ReactFlow>
      </div>

      {/* Mini Map */}
      <LineageMiniMap 
        nodeColor={(node) => {
          switch (node.type) {
            case 'dbtModel': return '#10b981'
            case 'column': return '#3b82f6'
            default: return '#6b7280'
          }
        }}
        showMiniMap={showMiniMap}
      />

      {/* Enhanced Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-4 rounded-lg shadow-lg border text-sm max-w-xs">
        <h4 className="font-semibold mb-2 text-slate-900">Lineage Legend</h4>
        
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gradient-to-r from-white to-slate-50 border border-slate-200 rounded"></div>
            <span className="text-slate-700">Table/View</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gradient-to-r from-green-50 to-green-100 border border-green-300 rounded"></div>
            <span className="text-slate-700">dbt Model</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded"></div>
            <span className="text-slate-700">Column</span>
          </div>
        </div>
        
        <div className="border-t pt-2">
          <h5 className="font-medium mb-2 text-slate-800">Transformations</h5>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span className="text-xs text-slate-600">Direct Copy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500 border-dashed border-b-2 border-blue-500"></div>
              <span className="text-xs text-slate-600">Calculation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 bg-violet-500"></div>
              <span className="text-xs text-slate-600">Aggregation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500"></div>
              <span className="text-xs text-slate-600">Join</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-amber-500 border-dotted border-b-2 border-amber-500"></div>
              <span className="text-xs text-slate-600">Filter</span>
            </div>
          </div>
        </div>

        {selectedColumn && (
          <div className="mt-3 pt-2 border-t">
            <div className="text-blue-700 font-medium">Selected Column:</div>
            <div className="text-sm text-slate-600 truncate">{selectedColumn.columnName}</div>
          </div>
        )}
      </div>

      {/* Column Lineage Panel */}
      {showLineagePanel && lineagePanelData && (
        <ColumnLineagePanel
          {...lineagePanelData}
          onClose={handleCloseLineagePanel}
        />
      )}
    </div>
  )
}

// Main Data Lineage Dashboard Component
export default function DataLineage() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState('SNOWFLAKE')
  const [selectedSchema, setSelectedSchema] = useState('ACCOUNT_USAGE')
  const [tables, setTables] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const apiBase = '/api/snowpark'

  // Sample databases and schemas for the selectors
  const databases = [
    { id: 'SNOWFLAKE', name: 'SNOWFLAKE', type: 'System' },
    { id: 'SNOWSARVA', name: 'SNOWSARVA', type: 'User' },
    { id: 'INFORMATION_SCHEMA', name: 'INFORMATION_SCHEMA', type: 'System' }
  ]

  const schemas = [
    { id: 'ACCOUNT_USAGE', name: 'ACCOUNT_USAGE', databaseId: 'SNOWFLAKE' },
    { id: 'INFORMATION_SCHEMA', name: 'INFORMATION_SCHEMA', databaseId: 'SNOWFLAKE' },
    { id: 'PUBLIC', name: 'PUBLIC', databaseId: 'SNOWSARVA' }
  ]

  // Load lineage data
  useEffect(() => {
    loadLineageData()
  }, [selectedDatabase, selectedSchema])

  const loadLineageData = async () => {
    try {
      setLoading(true)
      
      // Try auto-discovery first
      const response = await fetch(`${apiBase}/lineage/auto-discover?limit=50&days=30`)
      if (response.ok) {
        const data = await response.json()
        
        if (data.nodes && data.nodes.length > 0) {
          // Transform to table format
          const tablesList = data.nodes
            .filter(node => node.object_type !== 'COLUMN')
            .map(node => ({
              id: node.object_id,
              name: node.object_name?.split('.').pop() || node.object_name,
              fullName: node.object_name,
              database: node.database_name,
              schema: node.schema_name,
              type: node.object_type || 'TABLE',
              ...node
            }))
          
          setTables(tablesList)
          setConnections(data.edges || [])
        } else {
          // Fallback to sample data for demo
          setSampleData()
        }
      } else {
        setSampleData()
      }
    } catch (error) {
      console.error('Failed to load lineage data:', error)
      setSampleData()
    } finally {
      setLoading(false)
    }
  }

  const setSampleData = () => {
    const sampleTables = [
      {
        id: 'customers_table',
        object_id: 'customers_table',
        name: 'customers',
        fullName: 'SAMPLE_DB.PUBLIC.CUSTOMERS',
        database: 'SAMPLE_DB',
        schema: 'PUBLIC',
        type: 'TABLE',
        object_name: 'customers',
        database_name: 'SAMPLE_DB',
        schema_name: 'PUBLIC',
        object_type: 'TABLE',
        metadata: JSON.stringify({
          row_count: 10000,
          description: 'Customer dimension table',
          tags: ['dimension', 'customer'],
          columns: [
            { name: 'customer_id', data_type: 'NUMBER', is_primary_key: true },
            { name: 'customer_name', data_type: 'VARCHAR' },
            { name: 'email', data_type: 'VARCHAR' },
            { name: 'phone', data_type: 'VARCHAR' },
            { name: 'address', data_type: 'VARCHAR' }
          ]
        })
      },
      {
        id: 'orders_table',
        object_id: 'orders_table',
        name: 'orders',
        fullName: 'SAMPLE_DB.PUBLIC.ORDERS',
        database: 'SAMPLE_DB',
        schema: 'PUBLIC',
        type: 'TABLE',
        object_name: 'orders',
        database_name: 'SAMPLE_DB',
        schema_name: 'PUBLIC',
        object_type: 'TABLE',
        metadata: JSON.stringify({
          row_count: 50000,
          description: 'Orders fact table',
          tags: ['fact', 'orders'],
          columns: [
            { name: 'order_id', data_type: 'NUMBER', is_primary_key: true },
            { name: 'customer_id', data_type: 'NUMBER' },
            { name: 'order_date', data_type: 'DATE' },
            { name: 'total_amount', data_type: 'DECIMAL' },
            { name: 'status', data_type: 'VARCHAR' }
          ]
        })
      },
      {
        id: 'customer_analytics',
        object_id: 'customer_analytics',
        name: 'customer_analytics',
        fullName: 'SAMPLE_DB.ANALYTICS.CUSTOMER_ANALYTICS',
        database: 'SAMPLE_DB',
        schema: 'ANALYTICS',
        type: 'VIEW',
        object_name: 'customer_analytics',
        database_name: 'SAMPLE_DB',
        schema_name: 'ANALYTICS',
        object_type: 'VIEW',
        metadata: JSON.stringify({
          description: 'Customer analytics view',
          tags: ['analytics', 'summary'],
          columns: [
            { name: 'customer_id', data_type: 'NUMBER' },
            { name: 'total_orders', data_type: 'NUMBER' },
            { name: 'total_spent', data_type: 'DECIMAL' },
            { name: 'avg_order_value', data_type: 'DECIMAL' },
            { name: 'last_order_date', data_type: 'DATE' }
          ]
        })
      }
    ]

    const sampleConnections = [
      {
        edge_id: 'customers_to_analytics',
        src_object_id: 'customers_table',
        tgt_object_id: 'customer_analytics',
        source: 'customers_table',
        target: 'customer_analytics',
        edge_kind: 'LINEAGE',
        transformation_type: 'join',
        metadata: JSON.stringify({ transformation_type: 'join' })
      },
      {
        edge_id: 'orders_to_analytics',
        src_object_id: 'orders_table',
        tgt_object_id: 'customer_analytics',
        source: 'orders_table',
        target: 'customer_analytics',
        edge_kind: 'LINEAGE',
        transformation_type: 'aggregation',
        metadata: JSON.stringify({ transformation_type: 'aggregation' })
      }
    ]

    setTables(sampleTables)
    setConnections(sampleConnections)
  }

  // Filter tables and schemas based on selection
  const filteredTables = tables.filter(table => {
    if (selectedDatabase && table.database !== selectedDatabase) return false
    if (selectedSchema && table.schema !== selectedSchema) return false
    return true
  })

  const availableSchemas = schemas.filter(schema => 
    !selectedDatabase || schema.databaseId === selectedDatabase
  )

  return (
    <ReactFlowProvider>
      <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'} bg-slate-50 flex flex-col`}>
        {/* Header with Database Selector - Exact same as LineageVisualizer */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <DatabaseIcon className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-slate-900">Data Lineage</h1>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex flex-col">
                <label className="text-xs text-slate-500 mb-1">Database</label>
                <Select 
                  value={selectedDatabase || ""} 
                  onValueChange={(value) => {
                    setSelectedDatabase(value === "all" ? null : value)
                    if (value !== selectedDatabase) {
                      setSelectedSchema(null)
                    }
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Databases" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Databases</SelectItem>
                    {databases.map((database) => (
                      <SelectItem key={database.id} value={database.id}>
                        {database.name} ({database.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-slate-500 mb-1">Schema</label>
                <Select 
                  value={selectedSchema || ""} 
                  onValueChange={(value) => {
                    setSelectedSchema(value === "all" ? null : value)
                  }}
                  disabled={!selectedDatabase}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Schemas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schemas</SelectItem>
                    {availableSchemas.map((schema) => (
                      <SelectItem key={schema.id} value={schema.id}>
                        {schema.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Snowflake Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Minimize
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 mr-2" />
                  Maximize
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Main Canvas Area - Exact same structure as LineageVisualizer */}
        <div className="flex-1 relative overflow-hidden">
          <LineageCanvasInner 
            tables={filteredTables}
            connections={connections}
          />
        </div>

        {/* Settings Modal Placeholder */}
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Snowflake Settings</h3>
              <p className="text-slate-600 mb-4">
                Snowflake connection settings and configuration options would go here.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setShowSettings(false)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  )
}
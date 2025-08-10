import React, { useState, useEffect } from 'react'

export default function DataLineage() {
  const [activeTab, setActiveTab] = useState('Visual')
  const [environment, setEnvironment] = useState('SNOWFLAKE')
  const [schema, setSchema] = useState('ACCOUNT_USAGE')
  const [searchTerm, setSearchTerm] = useState('')
  const [tables, setTables] = useState([])
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedObject, setSelectedObject] = useState('')
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchLineageData() {
      try {
        setLoading(true)
        setError(null)
        
        // Get data summary to understand what tables we have
        const summaryRes = await fetch(`${apiBase}/status/data-summary`)
        if (summaryRes.ok) {
          const summary = await summaryRes.json()
          console.log('Data summary:', summary)
        }
        
        // Try to get actual lineage data
        if (selectedObject) {
          const lineageRes = await fetch(`${apiBase}/lineage/object?name=${encodeURIComponent(selectedObject)}&depth=2`)
          if (lineageRes.ok) {
            const lineage = await lineageRes.json()
            setLineageData(lineage)
            
            // Convert lineage nodes to table format for display
            const tablesFromLineage = lineage.nodes?.map(node => ({
              name: node.OBJECT_NAME?.split('.').pop() || node.OBJECT_NAME,
              fullName: node.OBJECT_NAME,
              type: node.NODE_TYPE || 'TABLE',
              columns: [
                { name: node.COLUMN_NAME || 'ID', type: 'NUMBER', primary: true },
                { name: 'CREATED_AT', type: 'TIMESTAMP' },
                { name: 'UPDATED_AT', type: 'TIMESTAMP' }
              ]
            })) || []
            
            setTables(tablesFromLineage)
          }
        } else {
          // Auto-discover lineage from recent queries
          const autoRes = await fetch(`${apiBase}/lineage/auto-discover?limit=20&days=7`)
          if (autoRes.ok) {
            const autoData = await autoRes.json()
            setLineageData(autoData)
            
            // Convert auto-discovered data to tables
            const tablesFromAuto = autoData.nodes?.slice(0, 9).map(node => ({
              name: node.OBJECT_NAME?.split('.').pop() || node.OBJECT_NAME,
              fullName: node.OBJECT_NAME,
              type: node.NODE_TYPE || 'TABLE',
              columns: [
                { name: 'ID', type: 'NUMBER', primary: true },
                { name: 'NAME', type: 'TEXT' },
                { name: 'CREATED_AT', type: 'TIMESTAMP' }
              ]
            })) || []
            
            setTables(tablesFromAuto)
          } else {
            // Fallback: create tables based on known Snowflake system tables
            const systemTables = [
              {
                name: 'DATABASES',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.DATABASES',
                type: 'VIEW',
                columns: [
                  { name: 'DATABASE_ID', type: 'NUMBER', primary: true },
                  { name: 'DATABASE_NAME', type: 'TEXT' },
                  { name: 'DATABASE_OWNER', type: 'TEXT' },
                  { name: 'CREATED', type: 'TIMESTAMP' }
                ]
              },
              {
                name: 'SCHEMATA',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.SCHEMATA',
                type: 'VIEW',
                columns: [
                  { name: 'SCHEMA_ID', type: 'NUMBER', primary: true },
                  { name: 'SCHEMA_NAME', type: 'TEXT' },
                  { name: 'DATABASE_NAME', type: 'TEXT' },
                  { name: 'CREATED', type: 'TIMESTAMP' }
                ]
              },
              {
                name: 'TABLES',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.TABLES',
                type: 'VIEW',
                columns: [
                  { name: 'TABLE_ID', type: 'NUMBER', primary: true },
                  { name: 'TABLE_NAME', type: 'TEXT' },
                  { name: 'TABLE_SCHEMA', type: 'TEXT' },
                  { name: 'TABLE_TYPE', type: 'TEXT' }
                ]
              },
              {
                name: 'QUERY_HISTORY',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY',
                type: 'VIEW',
                columns: [
                  { name: 'QUERY_ID', type: 'TEXT', primary: true },
                  { name: 'QUERY_TEXT', type: 'TEXT' },
                  { name: 'USER_NAME', type: 'TEXT' },
                  { name: 'START_TIME', type: 'TIMESTAMP' }
                ]
              },
              {
                name: 'WAREHOUSE_METERING_HISTORY',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY',
                type: 'VIEW',
                columns: [
                  { name: 'WAREHOUSE_ID', type: 'NUMBER', primary: true },
                  { name: 'WAREHOUSE_NAME', type: 'TEXT' },
                  { name: 'CREDITS_USED', type: 'NUMBER' },
                  { name: 'START_TIME', type: 'TIMESTAMP' }
                ]
              },
              {
                name: 'ACCESS_HISTORY',
                fullName: 'SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY',
                type: 'VIEW',
                columns: [
                  { name: 'QUERY_ID', type: 'TEXT', primary: true },
                  { name: 'QUERY_START_TIME', type: 'TIMESTAMP' },
                  { name: 'USER_NAME', type: 'TEXT' },
                  { name: 'DIRECT_OBJECTS_ACCESSED', type: 'VARIANT' }
                ]
              }
            ]
            setTables(systemTables)
          }
        }
      } catch (e) {
        console.error('Lineage data fetch error:', e)
        setError(e.message)
        // Set default system tables on error
        setTables([
          {
            name: 'QUERY_HISTORY',
            fullName: 'SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY',
            type: 'VIEW',
            columns: [
              { name: 'QUERY_ID', type: 'TEXT', primary: true },
              { name: 'QUERY_TEXT', type: 'TEXT' },
              { name: 'USER_NAME', type: 'TEXT' },
              { name: 'START_TIME', type: 'TIMESTAMP' }
            ]
          }
        ])
      } finally {
        setLoading(false)
      }
    }
    
    fetchLineageData()
  }, [selectedObject, environment, schema])
  
  const filteredTables = tables.filter(table => 
    table.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const handleTableClick = (tableName) => {
    setSelectedObject(tableName)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Data Lineage Visualization</h2>
        
        {/* Tab navigation */}
        <div className="flex space-x-1 mb-4">
          {['Visual', 'dbt', 'SQL'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Environment and schema selectors */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="flex items-center space-x-2">
            <select 
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="SNOWFLAKE">SNOWFLAKE</option>
              <option value="SNOWSARVA">SNOWSARVA</option>
              <option value="INFORMATION_SCHEMA">INFORMATION_SCHEMA</option>
            </select>
            
            <select
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ACCOUNT_USAGE">ACCOUNT_USAGE</option>
              <option value="INFORMATION_SCHEMA">INFORMATION_SCHEMA</option>
              <option value="PUBLIC">PUBLIC</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              onClick={() => setSearchTerm('')}
              className="p-2 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <span>❌</span>
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="p-2 text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <span>🔄</span>
            </button>
          </div>
        </div>

        {/* Table visualization */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="text-gray-500">Loading lineage data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-red-700">
              <span>❌</span>
              <span>Error loading lineage: {error}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredTables.length === 0 ? (
              <div className="col-span-3 text-center py-8 text-gray-500">
                {searchTerm ? `No tables found matching "${searchTerm}"` : 'No tables available'}
              </div>
            ) : (
              filteredTables.map((table, index) => (
                <div 
                  key={index} 
                  className={`bg-gray-50 rounded-lg p-4 border cursor-pointer transition-colors ${
                    selectedObject === table.fullName 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleTableClick(table.fullName)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-gray-900">{table.name}</div>
                    <span className="text-xs px-2 py-1 bg-gray-200 rounded">{table.type}</span>
                  </div>
                  <div className="space-y-1">
                    {table.columns.slice(0, 4).map((column, colIndex) => (
                      <div key={colIndex} className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          {column.primary && <span className="text-blue-600">🔑</span>}
                          <span className="text-gray-700">{column.name}</span>
                        </div>
                        <span className="text-gray-500 text-xs">{column.type}</span>
                      </div>
                    ))}
                    {table.columns.length > 4 && (
                      <div className="text-xs text-gray-500 text-center mt-2">
                        +{table.columns.length - 4} more columns
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Lineage diagram */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Data Flow Visualization</h3>
          {lineageData.nodes?.length > 0 && (
            <div className="text-sm text-gray-500">
              {lineageData.nodes.length} objects, {lineageData.edges?.length || 0} relationships
            </div>
          )}
        </div>
        
        {lineageData.nodes?.length > 0 ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <strong>Connected Objects:</strong>
            </div>
            <div className="flex flex-wrap gap-2">
              {lineageData.nodes.map((node, index) => (
                <div key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  {node.OBJECT_NAME}
                </div>
              ))}
            </div>
            {lineageData.edges?.length > 0 && (
              <div>
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Dependencies:</strong>
                </div>
                <div className="space-y-1">
                  {lineageData.edges.slice(0, 5).map((edge, index) => (
                    <div key={index} className="text-sm text-gray-700">
                      {edge.SRC_OBJECT_NAME} → {edge.TGT_OBJECT_NAME}
                    </div>
                  ))}
                  {lineageData.edges.length > 5 && (
                    <div className="text-sm text-gray-500">
                      +{lineageData.edges.length - 5} more dependencies
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">🔗</div>
            <div className="text-gray-600 font-medium">No Lineage Data Available</div>
            <div className="text-gray-500 text-sm mt-2">
              {selectedObject ? 
                `No relationships found for ${selectedObject}. Try selecting a different table.` :
                'Select a table above to view its lineage relationships'
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
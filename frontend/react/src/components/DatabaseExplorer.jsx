import React, { useState, useEffect } from 'react'

export default function DatabaseExplorer() {
  const [searchTerm, setSearchTerm] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [accountInfo, setAccountInfo] = useState({ account: null, organization: null })
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchDatabaseData() {
      try {
        setLoading(true)
        setError(null)
        
        // First get enhanced metrics to get database info
        const metricsRes = await fetch(`${apiBase}/metrics/enhanced`)
        let databaseList = []
        
        if (metricsRes.ok) {
          const metrics = await metricsRes.json()
          
          // Try to get storage analysis for size information
          const storageRes = await fetch(`${apiBase}/finops/storage-analysis`)
          let storageData = {}
          if (storageRes.ok) {
            const storage = await storageRes.json()
            if (storage.database_storage) {
              storageData = storage.database_storage.reduce((acc, db) => {
                acc[db.DATABASE_NAME] = {
                  size: db.TOTAL_SIZE_BYTES || 0,
                  cost: db.ESTIMATED_COST || 0
                }
                return acc
              }, {})
            }
          }
          
          // Get account info from session - no fallback
          try {
            const sessionRes = await fetch(`${apiBase}/debug/session`)
            if (sessionRes.ok) {
              const session = await sessionRes.json()
              // Extract account from session data if available
              if (session.account || session.account_name) {
                setAccountInfo({ 
                  account: session.account || session.account_name || 'Unknown',
                  organization: session.organization || 'Unknown'
                })
              }
            }
          } catch (e) {
            // No fallback account info - leave as null
          }
          
          // Only use database list if we have real storage data
          if (storageData && Object.keys(storageData).length > 0) {
            databaseList = Object.keys(storageData).map(dbName => {
              const storage = storageData[dbName]
              return {
                name: dbName,
                businessOrg: accountInfo.organization || 'Unknown',
                account: accountInfo.account || 'Unknown',
                size: formatBytes(storage.size),
                monthlyCost: `$${storage.cost.toFixed(2)}`,
                rawSize: storage.size
              }
            })
          } else {
            // No real database data available
            databaseList = []
          }
        } else {
          // No enhanced metrics available - show empty state
          throw new Error('Unable to fetch database information')
        }
        
        setDatabases(databaseList)
      } catch (e) {
        console.error('Database explorer error:', e)
        setError(e.message)
        setDatabases([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchDatabaseData()
  }, [])
  
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 bytes'
    const k = 1024
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">My databases</h2>
        
        {/* Search bar */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400">🔍</span>
            </div>
            <input
              type="text"
              placeholder="Search databases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Database table */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Database</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Business org</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Account</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Size</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Monthly cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      <span className="text-gray-500">Loading databases...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                    Error: {error}
                  </td>
                </tr>
              ) : filteredDatabases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {searchTerm ? `No databases found matching "${searchTerm}"` : 'No database data available. Please ensure Snowflake connection is working.'}
                  </td>
                </tr>
              ) : (
                filteredDatabases.map((db, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                        {db.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{db.businessOrg || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{db.account || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{db.size}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{db.monthlyCost}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span>Rows per page:</span>
            <select 
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(parseInt(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="ml-4">
              {filteredDatabases.length > 0 ? 
                `1 - ${Math.min(rowsPerPage, filteredDatabases.length)} of ${filteredDatabases.length}` :
                '0 - 0 of 0'
              }
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 text-sm text-gray-400 cursor-not-allowed">Previous</button>
            <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded">1</span>
            <button className="px-3 py-1 text-sm text-gray-400 cursor-not-allowed">Next</button>
          </div>
        </div>
      </div>

      {/* Additional info card */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-start space-x-3">
          <div className="text-blue-600 mt-1">ℹ️</div>
          <div>
            <div className="font-medium text-blue-900">Database Explorer</div>
            <div className="text-blue-800 text-sm mt-1">
              Browse and manage your Snowflake databases. Click on a database name to explore its schemas and tables.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
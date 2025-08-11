import React, { useState, useEffect } from 'react'

export default function WarehouseManager() {
  const [warehouseData, setWarehouseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshTime, setRefreshTime] = useState(new Date())
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchWarehouseData() {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch warehouse analysis data
        const warehouseRes = await fetch(`${apiBase}/finops/warehouse-analysis?days=30`)
        if (warehouseRes.ok) {
          const warehouse = await warehouseRes.json()
          setWarehouseData(warehouse)
        } else {
          throw new Error(`Warehouse analysis failed: ${warehouseRes.status}`)
        }
      } catch (e) {
        console.error('Warehouse manager data fetch error:', e)
        setError(e.message)
        // No fallback data - show empty state
        setWarehouseData(null)
      } finally {
        setLoading(false)
      }
    }
    
    fetchWarehouseData()
  }, [refreshTime])

  const activeWarehouses = warehouseData?.active_warehouses || 0
  const totalCredits = warehouseData?.total_credits_used || 0
  const totalCost = warehouseData?.total_estimated_cost || 0
  const warehouses = warehouseData?.warehouse_summary || []

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Warehouse Manager</h2>
            <p className="text-gray-600">Monitor warehouse performance and costs across your Snowflake environment.</p>
          </div>
          <button 
            onClick={() => setRefreshTime(new Date())}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1 disabled:opacity-50"
          >
            <span>🔄</span>
            <span>{loading ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
        
        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-green-600 font-medium">Active Warehouses</div>
            <div className="text-2xl font-bold text-green-700">{activeWarehouses}</div>
            <div className="text-sm text-green-600">Currently configured</div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-blue-600 font-medium">Total Credit Usage</div>
            <div className="text-2xl font-bold text-blue-700">{totalCredits.toFixed(1)}</div>
            <div className="text-sm text-blue-600">Credits this month</div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-orange-600 font-medium">Estimated Cost</div>
            <div className="text-2xl font-bold text-orange-700">${totalCost.toFixed(0)}</div>
            <div className="text-sm text-orange-600">This month</div>
          </div>
        </div>

        {/* Warehouse details table */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Warehouse Details</h3>
            <p className="text-sm text-gray-500">Credit usage and costs by warehouse</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits Used</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estimated Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        <span className="text-gray-500">Loading warehouse data...</span>
                      </div>
                    </td>
                  </tr>
                ) : warehouses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No warehouse data available
                    </td>
                  </tr>
                ) : (
                  warehouses.map((warehouse, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
                          <span className="text-sm font-medium text-gray-900">{warehouse.WAREHOUSE_NAME}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {warehouse.CREDITS_USED?.toFixed(1) || '0.0'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${warehouse.EST_COST?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {warehouse.QUERY_COUNT || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button className="text-blue-600 hover:text-blue-900 text-sm font-medium mr-3">
                          Manage
                        </button>
                        <button className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-700">
            <span>❌</span>
            <span className="font-medium">Error loading warehouse data: {error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
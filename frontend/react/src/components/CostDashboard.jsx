import React, { useState, useEffect } from 'react'

export default function CostDashboard() {
  const [costData, setCostData] = useState(null)
  const [warehouseData, setWarehouseData] = useState(null)
  const [storageData, setStorageData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshTime, setRefreshTime] = useState(new Date())
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchCostData() {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch comprehensive analysis for cost data
        const comprehensiveRes = await fetch(`${apiBase}/finops/comprehensive-analysis?days=30&include_storage=true`)
        if (comprehensiveRes.ok) {
          const comprehensive = await comprehensiveRes.json()
          setCostData(comprehensive)
        }
        
        // Fetch warehouse analysis
        const warehouseRes = await fetch(`${apiBase}/finops/warehouse-analysis?days=30`)
        if (warehouseRes.ok) {
          const warehouse = await warehouseRes.json()
          setWarehouseData(warehouse)
        }
        
        // Fetch storage analysis
        const storageRes = await fetch(`${apiBase}/finops/storage-analysis`)
        if (storageRes.ok) {
          const storage = await storageRes.json()
          setStorageData(storage)
        }
        
        // If no data available, use fallbacks
        if (!comprehensiveRes.ok && !warehouseRes.ok && !storageRes.ok) {
          throw new Error('Unable to fetch cost data')
        }
        
      } catch (e) {
        console.error('Cost dashboard data fetch error:', e)
        setError(e.message)
        // No fallback data - show empty states
        setCostData(null)
        setWarehouseData(null)
      } finally {
        setLoading(false)
      }
    }
    
    fetchCostData()
  }, [refreshTime])

  // Calculate metrics from data (only if data exists)
  const monthlySpend = costData?.total_estimated_cost || warehouseData?.total_estimated_cost
  const creditsUsed = costData?.total_credits_used || warehouseData?.total_credits_used
  const costTrend = costData?.cost_trend_percent
  
  // Find top warehouse (only if we have real data)
  const warehouses = warehouseData?.warehouse_summary || []
  const topWarehouse = warehouses.length > 0 ? 
    warehouses.reduce((prev, current) => 
      (prev.EST_COST > current.EST_COST) ? prev : current
    ) : null
  
  const topWarehousePercent = monthlySpend && topWarehouse ? 
    Math.round((topWarehouse.EST_COST / monthlySpend) * 100) : null

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Cost Dashboard</h2>
            <p className="text-gray-600">Track and optimize your Snowflake spend across warehouses and queries.</p>
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
        
        {/* Cost metrics */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-green-600 font-medium">Monthly Spend</div>
            <div className="text-2xl font-bold text-green-700">
              {monthlySpend ? `$${monthlySpend.toFixed(0)}` : 'No data'}
            </div>
            <div className="text-sm text-gray-500">
              {costTrend ? 
                <span className={costTrend < 0 ? 'text-green-600' : 'text-red-600'}>
                  {costTrend < 0 ? '↓' : '↑'} {Math.abs(costTrend)}% from last month
                </span> : 
                'Trend data not available'
              }
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-blue-600 font-medium">Credits Used</div>
            <div className="text-2xl font-bold text-blue-700">
              {creditsUsed ? creditsUsed.toFixed(0) : 'No data'}
            </div>
            <div className="text-sm text-blue-600">This month</div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-orange-600 font-medium">Top Warehouse</div>
            <div className="text-2xl font-bold text-orange-700">
              {topWarehouse?.WAREHOUSE_NAME || 'No data'}
            </div>
            <div className="text-sm text-orange-600">
              {topWarehouse ? 
                `$${topWarehouse.EST_COST?.toFixed(0) || 0} (${topWarehousePercent || 0}% of spend)` :
                'Warehouse data not available'
              }
            </div>
          </div>
        </div>

        {/* Detailed breakdown */}
        <div className="grid grid-cols-2 gap-6">
          {/* Warehouse costs */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Warehouse Costs</h3>
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <span className="text-gray-500">Loading...</span>
                </div>
              ) : warehouses.length > 0 ? (
                warehouses.slice(0, 5).map((warehouse, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{warehouse.WAREHOUSE_NAME}</span>
                    <span className="text-sm font-medium text-gray-900">${warehouse.EST_COST?.toFixed(0) || 0}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No warehouse data available</div>
              )}
            </div>
          </div>

          {/* Storage costs */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Storage Costs</h3>
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <span className="text-gray-500">Loading...</span>
                </div>
              ) : storageData?.database_storage ? (
                storageData.database_storage.slice(0, 5).map((db, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{db.DATABASE_NAME}</span>
                    <span className="text-sm font-medium text-gray-900">${db.ESTIMATED_COST?.toFixed(0) || 0}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No storage data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Trends</h3>
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📈</div>
            <div>Cost trend visualization</div>
            <div className="text-sm mt-2">
              {costData ? 
                `${costData.total_credits_used?.toFixed(0) || 0} credits used over ${costData.days_analyzed || 30} days` :
                'Connect to view detailed cost trends'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Cost optimization suggestions */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Optimization Insights</h3>
        <div className="space-y-4">
          {topWarehouse && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-blue-600 mt-1">💰</div>
                <div>
                  <div className="font-medium text-blue-900">Auto-suspend Warehouses</div>
                  <div className="text-blue-800 text-sm mt-1">
                    {topWarehouse.WAREHOUSE_NAME} has high usage. Consider auto-suspend settings to optimize costs.
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {storageData?.total_size_bytes && storageData.total_size_bytes > 1000000000 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-green-600 mt-1">📦</div>
                <div>
                  <div className="font-medium text-green-900">Storage Optimization</div>
                  <div className="text-green-800 text-sm mt-1">
                    Storage usage detected. Consider data lifecycle policies for older data.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-700">
            <span>❌</span>
            <span className="font-medium">Error loading cost data: {error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
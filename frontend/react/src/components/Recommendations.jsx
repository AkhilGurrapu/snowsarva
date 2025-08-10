import React, { useState, useEffect } from 'react'

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState([])
  const [costData, setCostData] = useState(null)
  const [queryData, setQueryData] = useState(null)
  const [warehouseData, setWarehouseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshTime, setRefreshTime] = useState(new Date())
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchRecommendationData() {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch various data sources to generate intelligent recommendations
        const [warehouseRes, queryRes, storageRes, healthRes] = await Promise.all([
          fetch(`${apiBase}/finops/warehouse-analysis?days=30`),
          fetch(`${apiBase}/finops/query-analysis?days=7&limit=100`),
          fetch(`${apiBase}/finops/storage-analysis`),
          fetch(`${apiBase}/status/health`)
        ])
        
        let warehouseData = null
        let queryData = null
        let storageData = null
        let healthData = null
        
        if (warehouseRes.ok) {
          warehouseData = await warehouseRes.json()
          setWarehouseData(warehouseData)
        }
        
        if (queryRes.ok) {
          queryData = await queryRes.json()
          setQueryData(queryData)
        }
        
        if (storageRes.ok) {
          storageData = await storageRes.json()
        }
        
        if (healthRes.ok) {
          healthData = await healthRes.json()
        }
        
        // Generate intelligent recommendations based on data
        const generatedRecommendations = generateRecommendations(
          warehouseData,
          queryData,
          storageData,
          healthData
        )
        
        setRecommendations(generatedRecommendations)
        setCostData({ warehouse: warehouseData, storage: storageData })
        
      } catch (e) {
        console.error('Recommendations data fetch error:', e)
        setError(e.message)
        // No fallback recommendations - show empty state
        setRecommendations([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchRecommendationData()
  }, [refreshTime])

  const generateRecommendations = (warehouse, queries, storage, health) => {
    const recommendations = []
    
    // Cost optimization recommendations
    if (warehouse?.warehouse_summary) {
      const topWarehouse = warehouse.warehouse_summary.reduce((prev, current) => 
        (prev.EST_COST > current.EST_COST) ? prev : current
      )
      
      if (topWarehouse.EST_COST > 100) {
        recommendations.push({
          type: 'cost',
          priority: 'high',
          title: 'Cost Optimization',
          description: `${topWarehouse.WAREHOUSE_NAME} accounts for $${topWarehouse.EST_COST?.toFixed(0)} in costs. Consider auto-suspend settings during off-peak hours to reduce costs by ~30%.`,
          action: 'Apply Auto-Suspend',
          icon: '💡',
          color: 'green',
          data: { warehouse: topWarehouse.WAREHOUSE_NAME, savings: (topWarehouse.EST_COST * 0.3).toFixed(0) }
        })
      }
    }
    
    // Performance recommendations
    if (queries?.expensive_queries?.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Performance Enhancement',
        description: `${queries.expensive_queries.length} slow queries detected. Optimize query patterns and consider warehouse scaling for better performance.`,
        action: 'View Query Details',
        icon: '⚡',
        color: 'blue',
        data: { slowQueries: queries.expensive_queries.length }
      })
    }
    
    if (queries?.avg_execution_time_ms > 5000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Query Optimization',
        description: `Average query time is ${(queries.avg_execution_time_ms / 1000).toFixed(1)}s. Consider indexing strategies and query restructuring.`,
        action: 'Analyze Queries',
        icon: '🔍',
        color: 'blue',
        data: { avgTime: (queries.avg_execution_time_ms / 1000).toFixed(1) }
      })
    }
    
    // Data quality recommendations  
    if (!health?.account_usage_access) {
      recommendations.push({
        type: 'governance',
        priority: 'medium',
        title: 'Data Observability',
        description: 'Enable ACCOUNT_USAGE access for comprehensive data monitoring and quality checks.',
        action: 'Grant Privileges',
        icon: '🔍',
        color: 'orange',
        data: { privilege: 'ACCOUNT_USAGE' }
      })
    }
    
    // Storage optimization
    if (storage?.total_size_bytes > 1000000000) { // > 1GB
      recommendations.push({
        type: 'storage',
        priority: 'low',
        title: 'Storage Management',
        description: 'Consider implementing data lifecycle policies for older data to optimize storage costs.',
        action: 'Configure Lifecycle',
        icon: '📦',
        color: 'purple',
        data: { storageSize: formatBytes(storage.total_size_bytes) }
      })
    }
    
    // Security recommendations
    if (warehouse?.warehouse_summary?.length > 3) {
      recommendations.push({
        type: 'security',
        priority: 'low',
        title: 'Access Control',
        description: 'Review warehouse access patterns and implement role-based access controls for better security.',
        action: 'Review Access',
        icon: '🔐',
        color: 'red',
        data: { warehouseCount: warehouse.warehouse_summary.length }
      })
    }
    
    // If we have good performance, add positive reinforcement
    if (queries?.avg_execution_time_ms < 3000 && (!queries?.expensive_queries?.length || queries.expensive_queries.length === 0)) {
      recommendations.push({
        type: 'success',
        priority: 'info',
        title: 'Excellent Performance',
        description: 'Your Snowflake environment is performing optimally. Continue monitoring for any changes in usage patterns.',
        action: 'View Metrics',
        icon: '✅',
        color: 'green',
        data: { status: 'optimal' }
      })
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1, info: 0 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }



  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 bytes'
    const k = 1024
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getColorClasses = (color) => {
    const colorMap = {
      green: 'bg-green-50 border-green-200 text-green-600',
      blue: 'bg-blue-50 border-blue-200 text-blue-600',
      orange: 'bg-orange-50 border-orange-200 text-orange-600',
      red: 'bg-red-50 border-red-200 text-red-600',
      purple: 'bg-purple-50 border-purple-200 text-purple-600'
    }
    return colorMap[color] || colorMap.blue
  }

  const getTextColorClasses = (color) => {
    const colorMap = {
      green: 'text-green-900 text-green-800 text-green-600',
      blue: 'text-blue-900 text-blue-800 text-blue-600',
      orange: 'text-orange-900 text-orange-800 text-orange-600',
      red: 'text-red-900 text-red-800 text-red-600',
      purple: 'text-purple-900 text-purple-800 text-purple-600'
    }
    return colorMap[color]?.split(' ') || ['text-blue-900', 'text-blue-800', 'text-blue-600']
  }

  const getPriorityBadge = (priority) => {
    const badgeMap = {
      high: { color: 'bg-red-100 text-red-800', text: 'High Priority' },
      medium: { color: 'bg-yellow-100 text-yellow-800', text: 'Medium Priority' },
      low: { color: 'bg-gray-100 text-gray-800', text: 'Low Priority' },
      info: { color: 'bg-blue-100 text-blue-800', text: 'Info' }
    }
    return badgeMap[priority] || badgeMap.info
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">AI-Powered Recommendations</h2>
            <p className="text-gray-600">Intelligent optimization suggestions based on your Snowflake usage patterns.</p>
          </div>
          <button 
            onClick={() => setRefreshTime(new Date())}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1 disabled:opacity-50"
          >
            <span>🔄</span>
            <span>{loading ? 'Analyzing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Summary stats */}
        {(costData || queryData || warehouseData) && (
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-blue-600 font-medium">Total Recommendations</div>
              <div className="text-2xl font-bold text-blue-700">{recommendations.length}</div>
              <div className="text-sm text-blue-600">Generated from analysis</div>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-orange-600 font-medium">High Priority</div>
              <div className="text-2xl font-bold text-orange-700">
                {recommendations.filter(r => r.priority === 'high').length}
              </div>
              <div className="text-sm text-orange-600">Immediate attention</div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-green-600 font-medium">Potential Savings</div>
              <div className="text-2xl font-bold text-green-700">
                ${recommendations
                  .filter(r => r.data?.savings)
                  .reduce((sum, r) => sum + parseFloat(r.data.savings), 0)
                  .toFixed(0)
                }
              </div>
              <div className="text-sm text-green-600">Monthly estimate</div>
            </div>
          </div>
        )}
        
        {/* Recommendations list */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span className="text-gray-500">Analyzing your Snowflake environment...</span>
              </div>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🎉</div>
              <div className="text-lg font-medium text-gray-900">No recommendations at this time</div>
              <div className="text-gray-500">Your Snowflake environment appears to be well optimized!</div>
            </div>
          ) : (
            recommendations.map((rec, index) => {
              const colors = getColorClasses(rec.color)
              const textColors = getTextColorClasses(rec.color)
              const priorityBadge = getPriorityBadge(rec.priority)
              
              return (
                <div key={index} className={`border rounded-lg p-4 ${colors}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className={`mt-1 ${textColors[2]}`}>{rec.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <div className={`font-medium ${textColors[0]}`}>{rec.title}</div>
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${priorityBadge.color}`}>
                            {priorityBadge.text}
                          </span>
                        </div>
                        <div className={`text-sm mt-1 ${textColors[1]}`}>
                          {rec.description}
                        </div>
                        {rec.data && Object.keys(rec.data).length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">
                            {rec.data.savings && `Potential savings: $${rec.data.savings}/month`}
                            {rec.data.improvement && `Expected improvement: ${rec.data.improvement}%`}
                            {rec.data.slowQueries && `Slow queries: ${rec.data.slowQueries}`}
                            {rec.data.avgTime && `Avg query time: ${rec.data.avgTime}s`}
                            {rec.data.storageSize && `Storage size: ${rec.data.storageSize}`}
                            {rec.data.warehouseCount && `Warehouses: ${rec.data.warehouseCount}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <button className={`text-sm underline ${textColors[2]} hover:opacity-80`}>
                        {rec.action}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-700">
            <span>❌</span>
            <span className="font-medium">Error loading recommendations: {error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
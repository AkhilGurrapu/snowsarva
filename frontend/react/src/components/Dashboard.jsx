import React, { useState, useEffect } from 'react'

export default function Dashboard({ metrics, loading }) {
  const [healthData, setHealthData] = useState(null)
  const [queryStats, setQueryStats] = useState(null)
  const [warehouseStats, setWarehouseStats] = useState(null)
  const [dataQualityScore, setDataQualityScore] = useState(0)
  const [testResults, setTestResults] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState(null)

  const apiBase = '/api/snowpark'

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoadingData(true)
        setError(null)
        
        // Fetch health status
        const healthRes = await fetch(`${apiBase}/status/health`)
        if (healthRes.ok) {
          const health = await healthRes.json()
          setHealthData(health)
        }
        
        // Fetch warehouse analysis for last 7 days
        const warehouseRes = await fetch(`${apiBase}/finops/warehouse-analysis?days=7`)
        if (warehouseRes.ok) {
          const warehouse = await warehouseRes.json()
          setWarehouseStats(warehouse)
        }
        
        // Fetch query analysis for last 24 hours
        const queryRes = await fetch(`${apiBase}/finops/query-analysis?days=1&limit=100`)
        if (queryRes.ok) {
          const queries = await queryRes.json()
          setQueryStats(queries)
        }
        
        // Calculate data quality score from available metrics
        const qualityScore = calculateDataQualityScore(metrics, healthData)
        setDataQualityScore(qualityScore)
        
        // Generate test results based on real data
        const tests = generateTestResults(healthData, queryStats)
        setTestResults(tests)
        
      } catch (e) {
        console.error('Dashboard data fetch error:', e)
        setError(e.message)
      } finally {
        setLoadingData(false)
      }
    }
    
    fetchDashboardData()
    // Refresh every 5 minutes
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [metrics])
  
  const calculateDataQualityScore = (metrics, health) => {
    // Only calculate score if we have real data
    if (!metrics || !health || !health.account_usage_access) {
      return null // No score without real data
    }
    
    let score = 100
    
    // Reduce score based on real factors
    if (health.status !== 'healthy') score -= 20
    if (metrics.databases === 0) score -= 10
    
    return Math.max(0, Math.min(100, score))
  }
  
  const generateTestResults = (health, queryStats) => {
    // Only generate tests if we have real data
    if (!health || !queryStats) {
      return [] // No fake tests
    }
    
    const tests = []
    
    // Only add tests based on real data
    if (health.account_usage_access) {
      tests.push({
        name: 'account_usage_access',
        type: 'connection',
        status: 'Passed',
        time: new Date().toISOString().slice(0, 19).replace('T', ' '),
        column: null
      })
    }
    
    if (queryStats.total_queries_analyzed > 0) {
      tests.push({
        name: 'query_activity',
        type: 'automated',
        status: 'Passed',
        time: new Date().toISOString().slice(0, 19).replace('T', ' '),
        column: null
      })
    }
    
    return tests
  }

  const getTestIcon = (name, status) => {
    if (status === 'Failed') return '🔴'
    if (name.includes('freshness')) return '🟡'
    if (name.includes('volume')) return '📊'
    if (name.includes('dimension')) return '🟣'
    return '🔴'
  }

  const getStatusColor = (status) => {
    return status === 'Passed' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
  }

  return (
    <div className="space-y-6">
      {/* Top metrics cards */}
      <div className="grid grid-cols-4 gap-6">
        {/* Data Quality Score */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Data Quality Score</div>
            <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
              <span className="text-green-600">⚡</span>
            </div>
          </div>
          {dataQualityScore !== null ? (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-2">{dataQualityScore}%</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    dataQualityScore >= 90 ? 'bg-green-600' : 
                    dataQualityScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${dataQualityScore}%` }}
                ></div>
              </div>
            </>
          ) : loadingData ? (
            <div className="text-sm text-gray-500">Calculating...</div>
          ) : (
            <div className="text-sm text-gray-500">No data quality data available</div>
          )}
        </div>

        {/* Tests */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Tests</div>
            <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
              <span className="text-blue-600">📋</span>
            </div>
          </div>
          {loadingData ? (
            <div className="flex items-center space-x-4">
              <div className="animate-pulse">
                <div className="text-2xl font-bold text-gray-300">--</div>
                <div className="text-xs text-gray-400">Failed</div>
              </div>
              <div className="animate-pulse">
                <div className="text-2xl font-bold text-gray-300">--</div>
                <div className="text-xs text-gray-400">Passed</div>
              </div>
            </div>
          ) : testResults.length > 0 ? (
            <div className="flex items-center space-x-4">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {testResults.filter(t => t.status === 'Failed').length}
                </div>
                <div className="text-xs text-red-600">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {testResults.filter(t => t.status === 'Passed').length}
                </div>
                <div className="text-xs text-green-600">Passed</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No test data available</div>
          )}
        </div>

        {/* Queries */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Queries</div>
            <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center">
              <span className="text-purple-600">🔍</span>
            </div>
          </div>
          {loadingData ? (
            <>
              <div className="text-3xl font-bold text-gray-300 mb-1 animate-pulse">--</div>
              <div className="text-sm text-gray-400">Fetching query data...</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {queryStats?.total_queries_analyzed ?? (metrics?.query_metrics?.QUERIES_LAST_24H || 'No data')}
              </div>
              <div className="text-sm text-gray-500">
                {queryStats?.avg_execution_time_ms ? 
                  `${(queryStats.avg_execution_time_ms / 1000).toFixed(2)}s avg time` : 
                  metrics?.query_metrics?.AVG_QUERY_TIME_MS ? 
                  `${(metrics.query_metrics.AVG_QUERY_TIME_MS / 1000).toFixed(2)}s avg time` :
                  'No query data available'
                }
              </div>
            </>
          )}
        </div>

        {/* Tables */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Tables</div>
            <div className="w-6 h-6 bg-orange-100 rounded flex items-center justify-center">
              <span className="text-orange-600">📊</span>
            </div>
          </div>
          {loadingData ? (
            <>
              <div className="text-3xl font-bold text-gray-300 mb-1 animate-pulse">--</div>
              <div className="text-sm text-gray-400">Fetching table data...</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">{metrics?.tables ?? 'No data'}</div>
              <div className="text-sm text-gray-500">Total tables</div>
            </>
          )}
        </div>
      </div>

      {/* Main content sections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Test Results */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Test Results</h3>
            <p className="text-sm text-gray-500">Recent test results from your Snowflake environment</p>
          </div>
          <div className="p-0">
            {/* Table header */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-5 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div>Column name</div>
                <div>Test name</div>
                <div>Test type</div>
                <div>Last test run</div>
                <div>Last status</div>
              </div>
            </div>
            {/* Table rows */}
            <div className="divide-y divide-gray-200">
              {testResults.map((test, index) => (
                <div key={index} className="px-6 py-4">
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="text-sm text-gray-500">
                      {test.column || '-'}
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <span>{getTestIcon(test.name, test.status)}</span>
                      <span className="text-blue-600">{test.name}</span>
                    </div>
                    <div className="text-sm text-gray-900">{test.type}</div>
                    <div className="text-sm text-gray-500">{test.time}</div>
                    <div>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(test.status)}`}>
                        {test.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Updates */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Updates</h3>
            <p className="text-sm text-gray-500">Latest table updates</p>
          </div>
          <div className="p-6">
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">📝</div>
              <div className="text-gray-500">No recent updates</div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional metrics row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600 mb-2">Databases</div>
          {loadingData ? (
            <>
              <div className="text-2xl font-bold text-gray-300 animate-pulse">--</div>
              <div className="text-sm text-gray-400">Fetching...</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics?.databases ?? 'No data'}</div>
              <div className="text-sm text-green-600">↗ Active databases</div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600 mb-2">Schemas</div>
          {loadingData ? (
            <>
              <div className="text-2xl font-bold text-gray-300 animate-pulse">--</div>
              <div className="text-sm text-gray-400">Fetching...</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics?.schemas ?? 'No data'}</div>
              <div className="text-sm text-blue-600">→ Active schemas</div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-600 mb-2">Views</div>
          {loadingData ? (
            <>
              <div className="text-2xl font-bold text-gray-300 animate-pulse">--</div>
              <div className="text-sm text-gray-400">Fetching...</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics?.views ?? 'No data'}</div>
              <div className="text-sm text-purple-600">↑ Active views</div>
            </>
          )}
        </div>
      </div>


      
      {error && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>Error: {error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
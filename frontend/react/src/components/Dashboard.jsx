import React, { useState, useEffect } from 'react'
import LoadingSpinner, { MetricCardSkeleton, MetricValueLoader } from './LoadingSpinner'

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
      // Only fetch dashboard-specific data if we have main metrics
      if (!metrics) return
      
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
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
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
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
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
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Queries</div>
            <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center">
              <span className="text-purple-600">🔍</span>
            </div>
          </div>
          {!metrics || loading ? (
            <MetricValueLoader color="purple" />
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {queryStats?.total_queries_analyzed ?? metrics?.query_metrics?.QUERIES_LAST_24H ?? 'No data'}
              </div>
              <div className="text-sm text-gray-500">
                {queryStats?.avg_execution_time_ms ? 
                  `${(queryStats.avg_execution_time_ms / 1000).toFixed(2)}s avg time` : 
                  metrics?.query_metrics?.AVG_QUERY_TIME_MS ? 
                  `${(metrics.query_metrics.AVG_QUERY_TIME_MS / 1000).toFixed(2)}s avg time` :
                  'Last 24 hours'
                }
              </div>
            </>
          )}
        </div>

        {/* Tables */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Tables</div>
            <div className="w-6 h-6 bg-orange-100 rounded flex items-center justify-center">
              <span className="text-orange-600">📊</span>
            </div>
          </div>
          {!metrics || loading ? (
            <MetricValueLoader color="orange" />
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">{metrics.tables}</div>
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
                <div className="text-left">Column name</div>
                <div className="text-left">Test name</div>
                <div className="text-left">Test type</div>
                <div className="text-left">Last test run</div>
                <div className="text-center">Last status</div>
              </div>
            </div>
            {/* Table rows */}
            <div className="divide-y divide-gray-200">
              {testResults.length > 0 ? testResults.map((test, index) => (
                <div key={index} className="px-6 py-4">
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="text-sm text-gray-500 text-left">
                      {test.column || '-'}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-left">
                      <span>{getTestIcon(test.name, test.status)}</span>
                      <span className="text-blue-600 truncate">{test.name}</span>
                    </div>
                    <div className="text-sm text-gray-900 text-left capitalize">{test.type}</div>
                    <div className="text-sm text-gray-500 text-left">{test.time}</div>
                    <div className="text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(test.status)}`}>
                        {test.status}
                      </span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="px-6 py-8 text-center">
                  <div className="text-gray-400 text-lg mb-2">📋</div>
                  <div className="text-gray-500 text-sm">No test results available</div>
                  <div className="text-gray-400 text-xs mt-1">
                    Tests will appear here once data quality checks are configured
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Status & Updates */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">System Status</h3>
            <p className="text-sm text-gray-500">Connection and service health information</p>
          </div>
          <div className="p-6">
            {healthData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      healthData.session === 'connected' ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-900">Database Connection</span>
                  </div>
                  <span className={`text-sm font-medium capitalize ${
                    healthData.session === 'connected' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {healthData.session}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      healthData.account_usage_access ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-900">ACCOUNT_USAGE Access</span>
                  </div>
                  <span className={`text-sm font-medium ${
                    healthData.account_usage_access ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {healthData.account_usage_access ? 'Enabled' : 'Limited'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      healthData.status === 'healthy' ? 'bg-green-500' : 
                      healthData.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-900">Overall Status</span>
                  </div>
                  <span className={`text-sm font-medium capitalize ${
                    healthData.status === 'healthy' ? 'text-green-600' : 
                    healthData.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {healthData.status}
                  </span>
                </div>

                {healthData.timestamp && (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                      Last updated: {new Date(healthData.timestamp).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            ) : loadingData ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner text="Loading system status..." color="blue" />
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 text-lg mb-2">⚙️</div>
                <div className="text-gray-500 text-sm">System status unavailable</div>
                <div className="text-gray-400 text-xs mt-1">
                  Unable to retrieve system health information
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional metrics row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
          <div className="text-sm text-gray-600 mb-2">Databases</div>
          {!metrics || loading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 animate-spin text-green-500">
                <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="m12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"/>
                </svg>
              </div>
              <span className="text-2xl font-bold text-green-500">Loading...</span>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics.databases}</div>
              <div className="text-sm text-green-600">↗ Active databases</div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
          <div className="text-sm text-gray-600 mb-2">Schemas</div>
          {!metrics || loading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 animate-spin text-blue-500">
                <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="m12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"/>
                </svg>
              </div>
              <span className="text-2xl font-bold text-blue-500">Loading...</span>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics.schemas}</div>
              <div className="text-sm text-blue-600">→ Active schemas</div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card">
          <div className="text-sm text-gray-600 mb-2">Views</div>
          {!metrics || loading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 animate-spin text-purple-500">
                <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="m12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"/>
                </svg>
              </div>
              <span className="text-2xl font-bold text-purple-500">Loading...</span>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">{metrics.views}</div>
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
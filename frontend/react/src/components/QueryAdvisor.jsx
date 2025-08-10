import React, { useState, useEffect } from 'react'

export default function QueryAdvisor() {
  const [query, setQuery] = useState('SHOW WAREHOUSES like \'ADMIN_WH\'')
  const [costliestQueries, setCostliestQueries] = useState([])
  const [queryAnalysis, setQueryAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [error, setError] = useState(null)
  const [refreshTime, setRefreshTime] = useState(new Date())
  
  const apiBase = '/api/snowpark'
  
  useEffect(() => {
    async function fetchQueryData() {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch query analysis for expensive queries
        const queryRes = await fetch(`${apiBase}/finops/query-analysis?days=7&limit=50`)
        if (queryRes.ok) {
          const queryData = await queryRes.json()
          setQueryAnalysis(queryData)
          
          // Transform the expensive queries data
          if (queryData.expensive_queries && queryData.expensive_queries.length > 0) {
            const transformedQueries = queryData.expensive_queries.slice(0, 10).map(q => ({
              id: q.QUERY_ID?.substring(0, 20) + '...' || 'N/A',
              lastRun: q.START_TIME ? new Date(q.START_TIME).toLocaleDateString() : 'Unknown',
              account: q.WAREHOUSE_NAME || q.USER_NAME || 'Unknown',
              frequency: 1, // We don't have frequency data in current schema
              cost: q.EST_COST ? `$${q.EST_COST.toFixed(2)}` : '$0.00',
              executionTime: q.TOTAL_ELAPSED_TIME ? (q.TOTAL_ELAPSED_TIME / 1000).toFixed(2) : '0.00',
              lastBilled: q.START_TIME ? new Date(q.START_TIME).toLocaleDateString() : 'Unknown',
              queryType: q.QUERY_TYPE || 'UNKNOWN'
            }))
            setCostliestQueries(transformedQueries)
          } else {
            // Fallback: get data from top_clerks endpoint
            const clerksRes = await fetch(`${apiBase}/top_clerks?topn=10`)
            if (clerksRes.ok) {
              const clerksData = await clerksRes.json()
              const clerksQueries = clerksData.map((clerk, index) => ({
                id: `query-${index}-${Date.now()}`,
                lastRun: new Date().toLocaleDateString(),
                account: clerk.O_CLERK || 'Unknown',
                frequency: 1,
                cost: `$${((clerk.CLERK_TOTAL || 0) / 1000000).toFixed(2)}`,
                executionTime: ((clerk.CLERK_TOTAL || 0) / 1000000).toFixed(2),
                lastBilled: new Date().toLocaleDateString(),
                queryType: 'SELECT'
              }))
              setCostliestQueries(clerksQueries)
            }
          }
        } else {
          throw new Error(`Query analysis failed: ${queryRes.status}`)
        }
      } catch (e) {
        console.error('Query advisor data fetch error:', e)
        setError(e.message)
        // Set empty data on error
        setCostliestQueries([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchQueryData()
  }, [refreshTime])
  
  const analyzeQuery = async () => {
    if (!query.trim()) return
    
    try {
      setAnalyzing(true)
      setAnalysisResult(null)
      
      // Try to parse the SQL using the lineage parser
      const formData = new FormData()
      formData.append('sql', query)
      
      const response = await fetch(`${apiBase}/lineage/sql-parse`, {
        method: 'POST',
        body: formData
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.error) {
          setAnalysisResult({
            type: 'error',
            message: result.error,
            suggestion: 'Please check your SQL syntax and try again.'
          })
        } else {
          setAnalysisResult({
            type: 'success',
            message: 'Query parsed successfully',
            suggestion: `Found ${result.nodes?.length || 0} objects and ${result.edges?.length || 0} relationships`,
            details: result
          })
        }
      } else {
        throw new Error(`Analysis failed: ${response.status}`)
      }
    } catch (e) {
      setAnalysisResult({
        type: 'error',
        message: 'Error analyzing query',
        suggestion: 'An error occurred while analyzing the query. Please try again.'
      })
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-lg font-medium text-blue-900">Query Advisor</h2>
        <p className="text-blue-700 text-sm mt-1">
          This tool analyzes your organization's Snowflake queries and surfaces opportunities to clean up SQL keywords and operators, so the query can process more efficiently.
          Enter query text into the editor below to analyze it.
        </p>
      </div>

      {/* Costliest queries section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Costliest queries</h3>
            <p className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleString()}
              {queryAnalysis && ` • ${queryAnalysis.total_queries_analyzed || 0} queries analyzed`}
            </p>
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Execution time (sec)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last billed date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      <span className="text-gray-500">Loading query data...</span>
                    </div>
                  </td>
                </tr>
              ) : costliestQueries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No expensive queries found in the last 7 days
                  </td>
                </tr>
              ) : (
                costliestQueries.map((queryItem, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{queryItem.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.lastRun}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.account}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.frequency}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.cost}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.executionTime}s</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{queryItem.lastBilled}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        onClick={() => setQuery(`/* Query from ${queryItem.account} */\nSELECT * FROM INFORMATION_SCHEMA.TABLES LIMIT 10;`)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Query analysis section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Query analysis</h3>
          <p className="text-sm text-gray-500">Enter your query code below to analyze it for optimization opportunities</p>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-32 p-4 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your SQL query here..."
            />
          </div>
          
          <div className="flex justify-between">
            <button 
              onClick={analyzeQuery}
              disabled={analyzing || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {analyzing && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>}
              <span>{analyzing ? 'Analyzing...' : 'Analyze Query'}</span>
            </button>
          </div>
        </div>

        {/* Analysis results */}
        {analysisResult && (
          <div className="px-6 pb-6">
            <div className={`border rounded-lg p-4 ${
              analysisResult.type === 'error' 
                ? 'bg-orange-50 border-orange-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`mt-1 ${
                  analysisResult.type === 'error' ? 'text-orange-600' : 'text-green-600'
                }`}>
                  {analysisResult.type === 'error' ? '⚠️' : '✅'}
                </div>
                <div>
                  <div className={`font-medium ${
                    analysisResult.type === 'error' ? 'text-orange-900' : 'text-green-900'
                  }`}>
                    {analysisResult.type === 'error' ? 'Analysis Error' : 'Analysis Complete'}
                  </div>
                  <div className={`text-sm mt-1 ${
                    analysisResult.type === 'error' ? 'text-orange-800' : 'text-green-800'
                  }`}>
                    {analysisResult.message}
                  </div>
                  <div className={`text-sm mt-2 ${
                    analysisResult.type === 'error' ? 'text-orange-700' : 'text-green-700'
                  }`}>
                    {analysisResult.suggestion}
                  </div>
                  {analysisResult.details && analysisResult.details.nodes && (
                    <div className="mt-3 text-sm text-gray-600">
                      <strong>Objects found:</strong> {analysisResult.details.nodes.map(n => n.OBJECT_NAME).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="px-6 pb-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 text-red-700">
                <span>❌</span>
                <span className="font-medium">Error loading data: {error}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
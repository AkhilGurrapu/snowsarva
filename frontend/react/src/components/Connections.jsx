import React, { useState, useEffect } from 'react'

export default function Connections() {
  const [connectionInfo, setConnectionInfo] = useState(null)
  const [healthData, setHealthData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const apiBase = '/api/snowpark'

  useEffect(() => {
    async function fetchConnectionData() {
      try {
        setLoading(true)
        setError(null)

        // Fetch health status for connection info
        const healthRes = await fetch(`${apiBase}/status/health`)
        if (healthRes.ok) {
          const health = await healthRes.json()
          setHealthData(health)
        }

        // Fetch enhanced metrics for account details
        const metricsRes = await fetch(`${apiBase}/metrics/enhanced`)
        if (metricsRes.ok) {
          const metrics = await metricsRes.json()
          setConnectionInfo(metrics)
        }

      } catch (e) {
        console.error('Connection data fetch error:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchConnectionData()
  }, [])

  const getConnectionStatus = () => {
    if (!healthData) return { status: 'unknown', color: 'gray' }
    if (healthData.session === 'connected' && healthData.account_usage_access) {
      return { status: 'fully connected', color: 'green' }
    } else if (healthData.session === 'connected') {
      return { status: 'connected (limited)', color: 'yellow' }
    }
    return { status: 'disconnected', color: 'red' }
  }

  const connectionStatus = getConnectionStatus()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Connection Status</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full bg-${connectionStatus.color}-500`}></div>
            <span className={`text-sm font-medium text-${connectionStatus.color}-600 capitalize`}>
              {connectionStatus.status}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600 mb-1">Session Status</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              {healthData?.session || 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">ACCOUNT_USAGE Access</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              {healthData?.account_usage_access ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </div>

        {healthData?.timestamp && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Last checked: {new Date(healthData.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Account Information Card */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-600 mb-1">Account Region</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              Based on YECALEZ-TCB02565
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Authentication Method</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              Personal Access Token (PAT)
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">User Role</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              SNOWSARVA_ROLE
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Connected User</div>
            <div className="text-base font-medium text-gray-900 overflow-wrap">
              snowsarva_user
            </div>
          </div>
        </div>
      </div>

      {/* Data Source Information */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Data Source Details</h3>
        
        {connectionInfo ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Data Source</div>
              <div className="text-base font-medium text-gray-900 overflow-wrap">
                {connectionInfo.data_source || 'ACCOUNT_USAGE'}
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {connectionInfo.databases}
                </div>
                <div className="text-sm text-gray-600">Databases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {connectionInfo.schemas}
                </div>
                <div className="text-sm text-gray-600">Schemas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {connectionInfo.tables}
                </div>
                <div className="text-sm text-gray-600">Tables</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {connectionInfo.views}
                </div>
                <div className="text-sm text-gray-600">Views</div>
              </div>
            </div>

            {connectionInfo.timestamp && (
              <div className="pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500">
                  Data retrieved: {new Date(connectionInfo.timestamp).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">📊</div>
            <div className="text-gray-500">No connection data available</div>
          </div>
        )}
      </div>

      {/* Warehouse Information */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Warehouse Details</h3>
        
        {connectionInfo?.warehouse_metrics ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-600 mb-1">Active Warehouses</div>
              <div className="text-base font-medium text-gray-900 overflow-wrap">
                {connectionInfo.warehouse_metrics.ACTIVE_WAREHOUSES}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Estimated Cost (7d)</div>
              <div className="text-base font-medium text-gray-900 overflow-wrap">
                ${connectionInfo.warehouse_metrics.ESTIMATED_COST_USD}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Total Credits (7d)</div>
              <div className="text-base font-medium text-gray-900 overflow-wrap">
                {connectionInfo.warehouse_metrics.TOTAL_CREDITS_LAST_7D}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Avg Credits/Hour</div>
              <div className="text-base font-medium text-gray-900 overflow-wrap">
                {connectionInfo.warehouse_metrics.AVG_CREDITS_PER_HOUR}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">🏭</div>
            <div className="text-gray-500">No warehouse data available</div>
          </div>
        )}
      </div>

      {/* Service Status */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Service Status</h3>
        
        {healthData?.services ? (
          <div className="space-y-3">
            {Object.entries(healthData.services).map(([service, status]) => (
              <div key={service} className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900 capitalize">
                  {service.replace('_', ' ')}
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    status.includes('error') ? 'bg-red-500' : 'bg-green-500'
                  }`}></div>
                  <span className={`text-xs ${
                    status.includes('error') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {status.includes('error') ? 'Error (V1 Schema Missing)' : 'OK'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">⚙️</div>
            <div className="text-gray-500">No service status available</div>
          </div>
        )}
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm text-yellow-800">
            <strong>Note:</strong> V1 schema errors are expected in local development. 
            These features require deployment to Snowflake Native App environment.
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-red-600">⚠️</span>
            <span className="text-red-800">Connection Error: {error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
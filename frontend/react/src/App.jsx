import React, { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import DataObservability from './components/DataObservability'
import DataQualityMonitor from './components/DataQualityMonitor'
import QueryAdvisor from './components/QueryAdvisor'
import DatabaseExplorer from './components/DatabaseExplorer'
import WarehouseManager from './components/WarehouseManager'
import LineageVisualizerDashboard from './components/LineageVisualizerDashboard'
import Recommendations from './components/Recommendations'
import CostDashboard from './components/CostDashboard'
import Performance from './components/Performance'
import Connections from './components/Connections'

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [refreshTime, setRefreshTime] = useState(new Date())

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark'

  useEffect(() => {
    async function loadMetrics() {
      try {
        setLoading(true)
        console.log('Loading metrics from:', `${apiBase}/metrics/enhanced`)
        
        // Try enhanced metrics first, fallback to basic
        try {
          const mRes = await fetch(`${apiBase}/metrics/enhanced`)
          console.log('Enhanced metrics response status:', mRes.status)
          console.log('Enhanced metrics response headers:', Object.fromEntries(mRes.headers.entries()))
          
          if (mRes.ok) {
            const m = await mRes.json()
            console.log('Enhanced metrics loaded:', m)
            console.log('Setting metrics state with:', { databases: m.databases, schemas: m.schemas, tables: m.tables, views: m.views })
            setMetrics(m)
          } else {
            console.log('Enhanced metrics failed with status:', mRes.status)
            // Fallback to basic metrics
            const basicRes = await fetch(`${apiBase}/metrics`)
            if (basicRes.ok) {
              const basicMetrics = await basicRes.json()
              console.log('Basic metrics loaded:', basicMetrics)
              setMetrics(basicMetrics)
            } else {
              console.error('Both enhanced and basic metrics failed')
            }
          }
        } catch (e) {
          console.error('Metrics loading failed:', e)
        }
      } catch (e) {
        console.error('App initialization failed:', e)
      } finally {
        setLoading(false)
      }
    }
    loadMetrics()
  }, [refreshTime])

  const navigationItems = [
    {
      section: 'main',
      items: [
        { key: 'dashboard', icon: '🏠', label: 'Dashboard' },
        { key: 'data-observability', icon: '👁️', label: 'Data Observability' },
        { key: 'data-quality', icon: '🔬', label: 'Data Quality' },
        { key: 'query-advisor', icon: '🔍', label: 'Query Advisor' }
      ]
    },
    {
      section: 'RESOURCES',
      items: [
        { key: 'databases', icon: '🗄️', label: 'Databases' },
        { key: 'warehouses', icon: '🏭', label: 'Warehouses' },
        { key: 'data-lineage', icon: '🔗', label: 'Data Lineage' }
      ]
    },
    {
      section: 'INSIGHTS',
      items: [
        { key: 'recommendations', icon: '💡', label: 'Recommendations' },
        { key: 'cost-dashboard', icon: '💰', label: 'Cost Dashboard' },
        { key: 'performance', icon: '⚡', label: 'Performance' }
      ]
    },
    {
      section: 'SETTINGS',
      items: [
        { key: 'connections', icon: '🔌', label: 'Connections' }
      ]
    }
  ]

  const renderMainContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard metrics={metrics} loading={loading} />
      case 'data-observability':
        return <DataObservability />
      case 'data-quality':
        return <DataQualityMonitor />
      case 'query-advisor':
        return <QueryAdvisor />
      case 'databases':
        return <DatabaseExplorer />
      case 'warehouses':
        return <WarehouseManager />
      case 'data-lineage':
        return <LineageVisualizerDashboard />
      case 'recommendations':
        return <Recommendations />
      case 'cost-dashboard':
        return <CostDashboard />
      case 'performance':
        return <Performance />
      case 'connections':
        return <Connections />
      default:
        return <Dashboard metrics={metrics} loading={loading} />
    }
  }

  return (
    <div className="h-screen w-screen flex bg-gray-50">
      {/* Left sidebar - DataSarva style */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-bold">❄️</span>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">SnowSarva</div>
              <div className="text-sm text-gray-500">Powered by DataSarva</div>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navigationItems.map((group) => (
            <div key={group.section} className="mb-6">
              {group.section !== 'main' && (
                <div className="px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {group.section}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`
                      w-full text-left px-6 py-2 text-sm font-medium transition-colors duration-200 flex items-center space-x-3
                      ${
                        activeSection === item.key
                          ? 'text-blue-600 bg-blue-50 border-r-2 border-blue-600'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span className="sidebar-nav-text">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">Powered by DataSarva AI</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 capitalize">
                {activeSection.replace('-', ' ')}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {activeSection === 'dashboard' && 'Overview of your Snowflake data environment'}
                {activeSection === 'data-observability' && 'Monitor data quality, freshness and completeness'}
                {activeSection === 'data-quality' && 'Advanced data quality monitoring with anomaly detection and alerts'}
                {activeSection === 'query-advisor' && 'Analyze and optimize your Snowflake queries'}
                {activeSection === 'databases' && 'Explore and manage your databases'}
                {activeSection === 'warehouses' && 'Monitor warehouse performance and costs'}
                {activeSection === 'data-lineage' && 'Visualize data flow and dependencies'}
                {activeSection === 'recommendations' && 'AI-powered optimization suggestions'}
                {activeSection === 'cost-dashboard' && 'Track and optimize your Snowflake spend'}
                {activeSection === 'performance' && 'Query performance insights and monitoring'}
                {activeSection === 'connections' && 'Snowflake account and connection details'}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setRefreshTime(new Date())}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </header>
        
        {/* Main content area */}
        <div className="p-6">
          {renderMainContent()}
        </div>
      </main>
    </div>
  )
}
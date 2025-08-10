import React, { useEffect, useState } from 'react'
// Tailwind-first layout, retaining MUI basics for form and alerts
import { AppBar, Toolbar, Typography, Tabs, Tab, Box, Button, TextField, Paper, Container, Alert, Chip } from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'
import LineageGraph from './components/LineageGraph'
import LineageGraph3D from './components/LineageGraph3D'
import FinOps3D from './components/FinOps3D'

export default function App() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null) // non-blocking banner
  const [metricsError, setMetricsError] = useState(null)
  const [metrics, setMetrics] = useState({ databases: 0, schemas: 0 })
  const [grants, setGrants] = useState([])
  const [lineage, setLineage] = useState({ nodes: [], edges: [] })
  const [impact, setImpact] = useState({ nodes: [], edges: [] })
  const [access, setAccess] = useState({ grants: [], usage: [] })
  const [finops, setFinops] = useState([])
  const [grantsError, setGrantsError] = useState(null)

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark'

  useEffect(() => {
    async function load() {
      try {
        const gRes = await fetch(`${apiBase}/grants/status`)
        if (gRes.ok) {
          const g = await gRes.json()
          setGrants(g.required || [])
          setGrantsError(null)
        } else {
          setGrantsError(`Grants HTTP ${gRes.status}`)
        }
        // Enhanced metrics from ACCOUNT_USAGE - best-effort; don't block UI on failure
        try {
          const mRes = await fetch(`${apiBase}/metrics/enhanced`)
          if (mRes.ok) {
            const m = await mRes.json()
            setMetrics(m)
            setMetricsError(null)
          } else {
            // Fallback to basic metrics
            const basicRes = await fetch(`${apiBase}/metrics`)
            if (basicRes.ok) {
              const basicMetrics = await basicRes.json()
              setMetrics(basicMetrics)
              setMetricsError(`Enhanced metrics failed, using basic: ${mRes.status}`)
            } else {
              setMetricsError(`All metrics failed: ${mRes.status}`)
            }
          }
        } catch (e) {
          setMetricsError(String(e))
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function fetchLineage() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/lineage/object?name=${encodeURIComponent(lineageQuery || 'SNOWFLAKE.ACCOUNT_USAGE.DATABASES')}&depth=1`)
      if (!res.ok) throw new Error(`Lineage HTTP ${res.status}`)
      setLineage(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchImpact() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/lineage/impact?name=${encodeURIComponent(impactQuery || 'SNOWFLAKE.ACCOUNT_USAGE.DATABASES')}&depth=2`)
      if (!res.ok) throw new Error(`Impact HTTP ${res.status}`)
      setImpact(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchAccess() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/access/graph`)
      if (!res.ok) throw new Error(`Access HTTP ${res.status}`)
      setAccess(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchFinops() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/finops/summary?dim=warehouse`)
      if (!res.ok) throw new Error(`FinOps HTTP ${res.status}`)
      setFinops(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function parseSqlLineage() {
    if (!sqlText.trim()) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('sql', sqlText)
      const res = await fetch(`${apiBase}/lineage/sql-parse`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error(`SQL Parse HTTP ${res.status}`)
      setParsedLineage(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function autoDiscoverLineage() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/lineage/auto-discover?limit=50&days=7&store=true`)
      if (!res.ok) throw new Error(`Auto-discover HTTP ${res.status}`)
      setAutoLineage(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function uploadDbtManifest(file) {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('manifest', file)
      const res = await fetch(`${apiBase}/lineage/dbt-upload`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error(`dbt Upload HTTP ${res.status}`)
      const result = await res.json()
      // Set the lineage data from dbt upload
      if (result.lineage_extracted) {
        setParsedLineage(result.lineage_extracted)
        setLineageTab('dbt')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchWarehouseCosts() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/finops/warehouse-analysis?days=30`)
      if (!res.ok) throw new Error(`Warehouse costs HTTP ${res.status}`)
      setWarehouseCosts(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchQueryAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/finops/query-analysis?days=7&limit=1000`)
      if (!res.ok) throw new Error(`Query analysis HTTP ${res.status}`)
      setQueryAnalysis(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchStorageAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/finops/storage-analysis`)
      if (!res.ok) throw new Error(`Storage analysis HTTP ${res.status}`)
      setStorageAnalysis(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchAccessHistory() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/access/analyze-history?days=7&store=true`)
      if (!res.ok) throw new Error(`Access history HTTP ${res.status}`)
      setAccessAnalysis(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const [lineageQuery, setLineageQuery] = useState('')
  const [impactQuery, setImpactQuery] = useState('')
  const [sqlText, setSqlText] = useState('')
  const [parsedLineage, setParsedLineage] = useState({ nodes: [], edges: [] })
  const [autoLineage, setAutoLineage] = useState({ nodes: [], edges: [] })
  const [lineageTab, setLineageTab] = useState('manual') // manual, sql-parse, auto-discover, dbt
  const [warehouseCosts, setWarehouseCosts] = useState({})
  const [queryAnalysis, setQueryAnalysis] = useState({})
  const [storageAnalysis, setStorageAnalysis] = useState({})
  const [accessAnalysis, setAccessAnalysis] = useState({})
  const [finopsTab, setFinopsTab] = useState('warehouse') // warehouse, queries, storage, comprehensive
  const [accessTab, setAccessTab] = useState('grants') // grants, history, roles

  return (
    <div className="h-screen w-screen flex bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/3 right-1/3 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
        <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse animation-delay-2000"></div>
      </div>
      
      {/* Left sidebar with glassmorphism */}
      <motion.aside 
        className="w-80 backdrop-blur-xl bg-white/10 border-r border-white/20 flex flex-col shadow-2xl relative z-10"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <motion.div 
          className="px-6 py-6 border-b border-white/20"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="text-3xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
            snowsarva
          </div>
          <div className="text-sm text-white/70 mt-1">Snowflake Native Analytics Platform</div>
          <div className="mt-3 flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-300">Connected</span>
          </div>
        </motion.div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { key: 'metrics', icon: '📊', label: 'Metrics', desc: 'Database overview' },
            { key: 'grants', icon: '🔐', label: 'Grants', desc: 'Access permissions' },
            { key: 'lineage', icon: '🔗', label: 'Lineage', desc: '3D data flow' },
            { key: 'impact', icon: '💥', label: 'Impact', desc: 'Dependency analysis' },
            { key: 'access', icon: '👥', label: 'Access', desc: 'Role analytics' },
            { key: 'finops', icon: '💰', label: 'FinOps', desc: 'Cost optimization' }
          ].map((tab) => (
            <motion.button 
              key={tab.key} 
              onClick={() => setActiveTab(tab.key)} 
              className={`
                w-full text-left p-4 rounded-xl transition-all duration-300 group relative overflow-hidden
                ${
                  activeTab === tab.key 
                    ? 'bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg' 
                    : 'hover:bg-white/10 border border-transparent'
                }
              `}
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{tab.icon}</span>
                <div>
                  <div className={`font-semibold ${activeTab === tab.key ? 'text-white' : 'text-white/90'}`}>
                    {tab.label}
                  </div>
                  <div className="text-xs text-white/60">{tab.desc}</div>
                </div>
              </div>
              {activeTab === tab.key && (
                <motion.div 
                  className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-purple-400 rounded-r"
                  layoutId="activeTab"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          ))}
        </nav>
        
        <motion.div 
          className="p-4 border-t border-white/20"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <div className="text-xs text-white/60 mb-2">Environment</div>
          <div className="flex items-center space-x-2">
            <div className="px-2 py-1 bg-orange-500/20 rounded text-xs text-orange-300 border border-orange-500/30">
              Development
            </div>
          </div>
        </motion.div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative z-10">
        <div className="max-w-7xl mx-auto p-8 space-y-6">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div 
                className="p-4 bg-blue-500/20 text-blue-200 rounded-xl backdrop-blur-sm border border-blue-500/30"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center space-x-3">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-300 border-t-transparent rounded-full"></div>
                  <span>Loading data visualization...</span>
                </div>
              </motion.div>
            )}
            {error && (
              <motion.div 
                className="p-4 bg-red-500/20 text-red-200 rounded-xl backdrop-blur-sm border border-red-500/30"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">⚠️</span>
                  <span>{String(error)}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!loading && activeTab === 'metrics' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div 
                className="text-white/70 mb-6 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                📊 System Metrics
                <div className="text-sm text-white/50 mt-1">
                  Auto-falls back to SHOW if ACCOUNT_USAGE not granted
                </div>
              </motion.div>
              
              <div className="grid grid-cols-2 gap-6">
                <motion.div 
                  className="p-6 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/20"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                >
                  <div className="text-sm text-white/70 mb-2">Databases</div>
                  <div className="text-4xl font-bold text-white mb-2">{metrics.databases}</div>
                  <div className="text-xs text-blue-300">Active databases</div>
                </motion.div>
                
                <motion.div 
                  className="p-6 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 backdrop-blur-sm border border-white/20"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                >
                  <div className="text-sm text-white/70 mb-2">Schemas</div>
                  <div className="text-4xl font-bold text-white mb-2">{metrics.schemas}</div>
                  <div className="text-xs text-green-300">Active schemas</div>
                </motion.div>

                {metrics.tables && (
                  <motion.div 
                    className="p-6 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm border border-white/20"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                  >
                    <div className="text-sm text-white/70 mb-2">Tables</div>
                    <div className="text-4xl font-bold text-white mb-2">{metrics.tables}</div>
                    <div className="text-xs text-orange-300">Active tables</div>
                  </motion.div>
                )}

                {metrics.views && (
                  <motion.div 
                    className="p-6 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 backdrop-blur-sm border border-white/20"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                  >
                    <div className="text-sm text-white/70 mb-2">Views</div>
                    <div className="text-4xl font-bold text-white mb-2">{metrics.views}</div>
                    <div className="text-xs text-pink-300">Active views</div>
                  </motion.div>
                )}

                {metrics.warehouse_metrics && (
                  <motion.div 
                    className="p-6 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-sm border border-white/20"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, duration: 0.5 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                  >
                    <div className="text-sm text-white/70 mb-2">Credits (7d)</div>
                    <div className="text-4xl font-bold text-white mb-2">{metrics.warehouse_metrics.TOTAL_CREDITS_LAST_7D}</div>
                    <div className="text-xs text-cyan-300">${metrics.warehouse_metrics.ESTIMATED_COST_USD} USD</div>
                  </motion.div>
                )}

                {metrics.query_metrics && (
                  <motion.div 
                    className="p-6 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-sm border border-white/20"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                  >
                    <div className="text-sm text-white/70 mb-2">Queries (24h)</div>
                    <div className="text-4xl font-bold text-white mb-2">{metrics.query_metrics.QUERIES_LAST_24H}</div>
                    <div className="text-xs text-yellow-300">{metrics.query_metrics.ACTIVE_USERS} active users</div>
                  </motion.div>
                )}
              </div>
              
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {metrics.path && (
                  <div className="px-3 py-1 rounded-full bg-white/20 text-white/80 text-xs font-medium border border-white/30">
                    Source: {metrics.path}
                  </div>
                )}
                {metrics.error && (
                  <div className="p-3 bg-yellow-500/20 text-yellow-300 rounded-lg text-sm border border-yellow-500/30">
                    ⚠️ {String(metrics.error)}
                  </div>
                )}
                {metricsError && (
                  <div className="p-3 bg-red-500/20 text-red-300 rounded-lg text-sm border border-red-500/30">
                    ❌ {String(metricsError)}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {!loading && activeTab === 'grants' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-2xl font-bold text-white mb-6">🔐 Required Grants</div>
              {grantsError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-xs">{String(grantsError)}</div>}
              <div className="space-y-3">
                {grants.map((g, i) => (
                  <motion.div 
                    key={i} 
                    className="border border-white/20 rounded-xl p-4 bg-white/5 backdrop-blur-sm"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="text-sm text-white mb-2">
                      <b>{g.privilege}</b>
                      {g.granted === true ? ' ✅ (granted)' : g.granted === false ? ' ❌ (not granted)' : ''}
                    </div>
                    <pre className="bg-black/30 p-3 rounded-lg overflow-x-auto text-xs text-green-300 font-mono">
                      {g.grant_sql}
                    </pre>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {!loading && activeTab === 'lineage' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div 
                className="text-white mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-2xl font-bold mb-2">🔗 3D Data Lineage</div>
                <div className="text-white/70">Interactive column-level lineage visualization</div>
              </motion.div>
              
              {/* Enhanced Tab Navigation */}
              <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl">
                {[
                  { key: 'manual', label: 'Manual Query', icon: '🔍' },
                  { key: 'sql-parse', label: 'SQL Parser', icon: '⚡' },
                  { key: 'auto-discover', label: 'Auto-Discover', icon: '🤖' },
                  { key: 'dbt', label: 'dbt Artifacts', icon: '📦' }
                ].map(tab => (
                  <motion.button 
                    key={tab.key}
                    onClick={() => setLineageTab(tab.key)}
                    className={`
                      px-4 py-2 text-sm rounded-lg transition-all duration-300 flex items-center space-x-2
                      ${lineageTab === tab.key 
                        ? 'bg-white/20 text-white font-medium shadow-lg border border-white/30' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                      }
                    `}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Manual Query Tab */}
              {lineageTab === 'manual' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex gap-3">
                    <input 
                      className="bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-3 flex-1 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                      placeholder="DB.SCHEMA.OBJECT (e.g., SNOWFLAKE.ACCOUNT_USAGE.DATABASES)" 
                      value={lineageQuery} 
                      onChange={e => setLineageQuery(e.target.value)} 
                    />
                    <motion.button 
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                      onClick={fetchLineage}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      🔍 Load 3D Lineage
                    </motion.button>
                  </div>
                  <LineageGraph3D data={lineage} level="table" height={600} />
                </motion.div>
              )}

              {/* SQL Parser Tab */}
              {lineageTab === 'sql-parse' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div>
                    <textarea 
                      className="w-full bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-4 h-40 font-mono text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="Paste your SQL here (CREATE TABLE AS SELECT, INSERT, MERGE, etc.)

Example:
CREATE TABLE my_table AS
SELECT col1, col2 FROM source_table
WHERE condition = 'value'"
                      value={sqlText}
                      onChange={e => setSqlText(e.target.value)}
                    />
                    <motion.button 
                      className="mt-3 px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={parseSqlLineage}
                      disabled={!sqlText.trim()}
                      whileHover={{ scale: sqlText.trim() ? 1.05 : 1 }}
                      whileTap={{ scale: sqlText.trim() ? 0.95 : 1 }}
                    >
                      ⚡ Parse SQL for Column Lineage
                    </motion.button>
                  </div>
                  {parsedLineage.error ? (
                    <motion.div 
                      className="p-4 bg-red-500/20 text-red-300 rounded-xl border border-red-500/30"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      ❌ Error: {parsedLineage.error}
                    </motion.div>
                  ) : (
                    <LineageGraph3D data={parsedLineage} level="column" height={600} />
                  )}
                </motion.div>
              )}

              {/* Auto-Discover Tab */}
              {lineageTab === 'auto-discover' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/20">
                    <motion.button 
                      className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                      onClick={autoDiscoverLineage}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      🤖 Auto-Discover Lineage
                    </motion.button>
                    <div className="text-white/70">
                      <div className="font-medium">AI-Powered Discovery</div>
                      <div className="text-sm">Analyzes last 7 days of DDL/DML queries from ACCOUNT_USAGE</div>
                    </div>
                  </div>
                  
                  {autoLineage.queries_processed && (
                    <motion.div 
                      className="p-4 bg-blue-500/20 rounded-xl border border-blue-500/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="text-blue-200 font-medium mb-2">📊 Discovery Results</div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-blue-200">
                        <div>Queries Processed: <span className="font-bold">{autoLineage.queries_processed}</span></div>
                        <div>Lineage Found: <span className="font-bold">{autoLineage.queries_with_lineage}</span></div>
                      </div>
                    </motion.div>
                  )}
                  
                  <LineageGraph3D data={autoLineage} level="table" height={600} />
                </motion.div>
              )}

              {/* dbt Artifacts Tab */}
              {lineageTab === 'dbt' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="p-6 border-2 border-dashed border-white/30 rounded-xl bg-white/5 backdrop-blur-sm">
                    <input 
                      type="file" 
                      accept=".json"
                      onChange={e => e.target.files[0] && uploadDbtManifest(e.target.files[0])}
                      className="
                        block w-full text-sm text-white/70 
                        file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 
                        file:text-sm file:font-medium file:bg-green-500/20 file:text-green-300 
                        file:border file:border-green-500/30 
                        hover:file:bg-green-500/30 file:transition-all file:duration-300
                        file:shadow-lg hover:file:shadow-xl
                      "
                    />
                    <div className="mt-4 text-center">
                      <div className="text-white/70 font-medium">📦 dbt Artifacts Upload</div>
                      <div className="text-sm text-white/50 mt-1">
                        Upload your dbt manifest.json file to extract model dependencies and lineage
                      </div>
                      <div className="text-xs text-white/40 mt-2">
                        Supported: manifest.json, catalog.json, run_results.json
                      </div>
                    </div>
                  </div>
                  
                  <LineageGraph3D data={parsedLineage} level="table" height={600} />
                </motion.div>
              )}
            </motion.div>
          )}

          {!loading && activeTab === 'impact' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-2xl font-bold text-white mb-6">💥 Impact Analysis</div>
              <div className="flex gap-3 mb-6">
                <input 
                  className="bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-3 flex-1 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  placeholder="DB.SCHEMA.OBJECT" 
                  value={impactQuery} 
                  onChange={e => setImpactQuery(e.target.value)} 
                />
                <motion.button 
                  className="px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={fetchImpact}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  💥 Analyze Impact
                </motion.button>
              </div>
              <LineageGraph3D data={impact} level="table" height={600} />
            </motion.div>
          )}

          {!loading && activeTab === 'access' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-2xl font-bold text-white mb-6">👥 Access Lineage & Role Analysis</div>
              
              {/* Access Tab Navigation */}
              <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl">
                {[
                  { key: 'grants', label: 'Grants Analysis', icon: '🔐' },
                  { key: 'history', label: 'Access History', icon: '📊' },
                  { key: 'roles', label: 'Role Graph', icon: '🌐' }
                ].map(tab => (
                  <motion.button 
                    key={tab.key}
                    onClick={() => setAccessTab(tab.key)}
                    className={`
                      px-4 py-2 text-sm rounded-lg transition-all duration-300 flex items-center space-x-2
                      ${accessTab === tab.key 
                        ? 'bg-white/20 text-white font-medium shadow-lg border border-white/30' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                      }
                    `}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Access tabs content */}
              {accessTab === 'grants' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchAccess}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    🔐 Load Current Grants
                  </motion.button>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/20">
                      <div className="text-white/70 mb-3 font-medium">Role Grants</div>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {access.grants?.slice(0, 10).map((grant, i) => (
                          <div key={i} className="text-sm p-2 bg-white/5 rounded border border-white/10">
                            <strong className="text-white">{grant.ROLE_NAME}</strong>
                            <div className="text-white/60 text-xs">
                              {grant.PRIVILEGE} on {grant.OBJECT_NAME}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/20">
                      <div className="text-white/70 mb-3 font-medium">Usage Patterns</div>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {access.usage?.slice(0, 10).map((usage, i) => (
                          <div key={i} className="text-sm p-2 bg-white/5 rounded border border-white/10">
                            <strong className="text-white">{usage.ROLE_NAME}</strong>
                            <div className="text-white/60 text-xs">
                              Accessed {usage.OBJECT_ID} ({usage.ACCESS_COUNT} times)
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {accessTab === 'history' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchAccessHistory}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    📊 Analyze Access History (7 days)
                  </motion.button>
                  
                  {accessAnalysis.records_analyzed && (
                    <motion.div 
                      className="p-4 bg-blue-500/20 rounded-xl border border-blue-500/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="text-blue-200 font-medium">
                        📈 Analyzed {accessAnalysis.records_analyzed} access records
                      </div>
                    </motion.div>
                  )}
                  
                  <div className="text-center text-white/50 py-8">
                    Advanced access history visualization will be displayed here
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {!loading && activeTab === 'finops' && (
            <motion.div 
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div 
                className="text-white mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-2xl font-bold mb-2">💰 3D FinOps Analytics</div>
                <div className="text-white/70">Interactive cost optimization and performance analysis</div>
              </motion.div>
              
              {/* Enhanced FinOps Tab Navigation */}
              <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl">
                {[
                  { key: 'warehouse', label: 'Warehouse Costs', icon: '🏭', desc: '3D cost bars' },
                  { key: 'queries', label: 'Query Analysis', icon: '⚡', desc: 'Performance bubbles' },
                  { key: 'storage', label: 'Storage Costs', icon: '💾', desc: '3D pie charts' },
                  { key: 'comprehensive', label: 'Full Analysis', icon: '📊', desc: 'Combined view' }
                ].map(tab => (
                  <motion.button 
                    key={tab.key}
                    onClick={() => setFinopsTab(tab.key)}
                    className={`
                      px-4 py-3 text-sm rounded-lg transition-all duration-300 flex flex-col items-center space-y-1
                      ${finopsTab === tab.key 
                        ? 'bg-white/20 text-white font-medium shadow-lg border border-white/30' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                      }
                    `}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.label}</span>
                    <span className="text-xs opacity-60">{tab.desc}</span>
                  </motion.button>
                ))}
              </div>

              {/* Warehouse Costs Tab with 3D Visualization */}
              {finopsTab === 'warehouse' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchWarehouseCosts}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    🏭 Analyze Warehouse Costs (30 days)
                  </motion.button>
                  
                  {warehouseCosts.total_credits_used && (
                    <motion.div 
                      className="p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/30 backdrop-blur-sm"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <div className="text-3xl font-bold text-white">💳 {warehouseCosts.total_credits_used?.toFixed(2)}</div>
                          <div className="text-green-300">Total Credits Used</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold text-white">${(warehouseCosts.total_credits_used * 2).toFixed(2)}</div>
                          <div className="text-green-300">Estimated Cost</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  
                  <FinOps3D data={warehouseCosts} visualization="warehouses" height={500} />
                </motion.div>
              )}

              {/* Query Analysis Tab with 3D Bubbles */}
              {finopsTab === 'queries' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchQueryAnalysis}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    ⚡ Analyze Query Performance (7 days)
                  </motion.button>
                  
                  {queryAnalysis.total_queries_analyzed && (
                    <motion.div 
                      className="p-4 bg-purple-500/20 rounded-xl border border-purple-500/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="text-purple-200 font-medium mb-2">⚡ Query Analysis Results</div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-purple-200">
                        <div>Total Queries: <span className="font-bold">{queryAnalysis.total_queries_analyzed}</span></div>
                        <div>Expensive Queries: <span className="font-bold">{queryAnalysis.expensive_queries?.length}</span></div>
                      </div>
                    </motion.div>
                  )}
                  
                  <FinOps3D data={queryAnalysis} visualization="queries" height={500} />
                </motion.div>
              )}

              {/* Storage Analysis Tab with 3D Pie Chart */}
              {finopsTab === 'storage' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchStorageAnalysis}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    💾 Analyze Storage Costs
                  </motion.button>
                  
                  {storageAnalysis.total_storage && (
                    <motion.div 
                      className="grid grid-cols-4 gap-4 mb-6"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, staggerChildren: 0.1 }}
                    >
                      <motion.div className="p-4 bg-blue-500/20 rounded-xl text-center border border-blue-500/30" whileHover={{ scale: 1.05 }}>
                        <div className="text-sm text-blue-300 mb-1">Active Storage</div>
                        <div className="text-xl font-bold text-white">{(storageAnalysis.total_storage.active/(1024*1024*1024*1024)).toFixed(2)} TB</div>
                      </motion.div>
                      <motion.div className="p-4 bg-yellow-500/20 rounded-xl text-center border border-yellow-500/30" whileHover={{ scale: 1.05 }}>
                        <div className="text-sm text-yellow-300 mb-1">Time Travel</div>
                        <div className="text-xl font-bold text-white">{(storageAnalysis.total_storage.time_travel/(1024*1024*1024*1024)).toFixed(2)} TB</div>
                      </motion.div>
                      <motion.div className="p-4 bg-red-500/20 rounded-xl text-center border border-red-500/30" whileHover={{ scale: 1.05 }}>
                        <div className="text-sm text-red-300 mb-1">Failsafe</div>
                        <div className="text-xl font-bold text-white">{(storageAnalysis.total_storage.failsafe/(1024*1024*1024*1024)).toFixed(2)} TB</div>
                      </motion.div>
                      <motion.div className="p-4 bg-green-500/20 rounded-xl text-center border border-green-500/30" whileHover={{ scale: 1.05 }}>
                        <div className="text-sm text-green-300 mb-1">Clone Storage</div>
                        <div className="text-xl font-bold text-white">{(storageAnalysis.total_storage.clone/(1024*1024*1024*1024)).toFixed(2)} TB</div>
                      </motion.div>
                    </motion.div>
                  )}
                  
                  <FinOps3D data={storageAnalysis} visualization="storage" height={500} />
                </motion.div>
              )}

              {/* Comprehensive Analysis Tab */}
              {finopsTab === 'comprehensive' && (
                <motion.div 
                  className="space-y-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.button 
                    className="px-8 py-4 bg-gradient-to-r from-gray-700 to-black text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={fetchFinops}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    📊 Run Comprehensive 3D Analysis
                  </motion.button>
                  
                  <div className="grid grid-cols-3 gap-6 mb-6">
                    <motion.div 
                      className="p-6 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl border border-blue-500/30 text-center"
                      whileHover={{ scale: 1.05, rotateY: 10 }}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <div className="text-3xl mb-2">🏭</div>
                      <div className="text-white font-medium">Warehouse Costs</div>
                      <div className="text-white/70 text-sm">3D Bar Charts</div>
                    </motion.div>
                    
                    <motion.div 
                      className="p-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/30 text-center"
                      whileHover={{ scale: 1.05, rotateY: 10 }}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <div className="text-3xl mb-2">⚡</div>
                      <div className="text-white font-medium">Query Performance</div>
                      <div className="text-white/70 text-sm">Bubble Visualization</div>
                    </motion.div>
                    
                    <motion.div 
                      className="p-6 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/30 text-center"
                      whileHover={{ scale: 1.05, rotateY: 10 }}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <div className="text-3xl mb-2">💾</div>
                      <div className="text-white font-medium">Storage Analysis</div>
                      <div className="text-white/70 text-sm">3D Pie Charts</div>
                    </motion.div>
                  </div>
                  
                  {finops && finops.length > 0 && (
                    <motion.div 
                      className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <div className="text-white/70 font-medium mb-3">📈 Analysis Results</div>
                      <pre className="text-white/60 text-xs overflow-x-auto">
                        {JSON.stringify(finops, null, 2)}
                      </pre>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
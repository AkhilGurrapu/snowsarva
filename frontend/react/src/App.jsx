import React, { useEffect, useState } from 'react'
// Tailwind-first layout, retaining MUI basics for form and alerts
import { AppBar, Toolbar, Typography, Tabs, Tab, Box, Button, TextField, Paper, Container, Alert, Chip } from '@mui/material'

export default function App() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState({ databases: 0, schemas: 0 })
  const [grants, setGrants] = useState([])
  const [lineage, setLineage] = useState({ nodes: [], edges: [] })
  const [impact, setImpact] = useState({ nodes: [], edges: [] })
  const [access, setAccess] = useState({ grants: [], usage: [] })
  const [finops, setFinops] = useState([])

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark'

  useEffect(() => {
    async function load() {
      try {
        const [mRes, gRes] = await Promise.all([
          fetch(`${apiBase}/metrics`),
          fetch(`${apiBase}/grants/status`)
        ])
        if (!mRes.ok) throw new Error(`Metrics HTTP ${mRes.status}`)
        if (!gRes.ok) throw new Error(`Grants HTTP ${gRes.status}`)
        const m = await mRes.json()
        const g = await gRes.json()
        setMetrics(m)
        setGrants(g.required || [])
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

  const [lineageQuery, setLineageQuery] = useState('')
  const [impactQuery, setImpactQuery] = useState('')

  return (
    <div className="h-screen w-screen flex">
      {/* Left sidebar */}
      <aside className="w-64 border-r bg-white dark:bg-zinc-900 flex flex-col">
        <div className="px-4 py-3 border-b">
          <div className="text-xl font-semibold">snowsarva</div>
          <div className="text-xs text-zinc-500">Snowflake Native App</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {['metrics','grants','lineage','impact','access','finops'].map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} className={`w-full text-left px-3 py-2 rounded hover:bg-zinc-100 ${activeTab===t?'bg-zinc-100 font-medium':''}`}>{t.toUpperCase()}</button>
          ))}
        </nav>
        <div className="p-3 border-t text-xs text-zinc-500">Dev Mode</div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-zinc-50">
        <div className="max-w-6xl mx-auto p-6 space-y-4">
          {loading && <div className="p-3 bg-blue-50 text-blue-700 rounded">Loading...</div>}
          {error && <div className="p-3 bg-red-50 text-red-700 rounded">Error: {error}</div>}

          {!loading && !error && activeTab === 'metrics' && (
            <div className="bg-white rounded shadow p-4">
              <div className="text-sm text-zinc-500 mb-2">Metrics (auto-falls back to SHOW if ACCOUNT_USAGE not granted)</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded bg-zinc-50">
                  <div className="text-xs text-zinc-500">Databases</div>
                  <div className="text-2xl font-semibold">{metrics.databases}</div>
                </div>
                <div className="p-4 rounded bg-zinc-50">
                  <div className="text-xs text-zinc-500">Schemas</div>
                  <div className="text-2xl font-semibold">{metrics.schemas}</div>
                </div>
              </div>
              {metrics.path && <div className="mt-3 inline-block text-xs px-2 py-1 rounded bg-zinc-100">Source: {metrics.path}</div>}
            </div>
          )}

          {!loading && !error && activeTab === 'grants' && (
            <div className="bg-white rounded shadow p-4">
              <div className="text-sm font-medium mb-3">Required grants</div>
              <div className="space-y-3">
                {grants.map((g, i) => (
                  <div key={i} className="border rounded p-2">
                    <div className="text-sm"><b>{g.privilege}</b>{g.granted === true ? ' (granted)' : g.granted === false ? ' (not granted)' : ''}</div>
                    <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs">{g.grant_sql}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'lineage' && (
            <div className="bg-white rounded shadow p-4">
              <div className="text-sm font-medium mb-3">Object/column lineage</div>
              <div className="flex gap-2 mb-3">
                <input className="border rounded px-2 py-1 flex-1" placeholder="DB.SCHEMA.OBJECT" value={lineageQuery} onChange={e => setLineageQuery(e.target.value)} />
                <button className="px-3 py-1 bg-black text-white rounded" onClick={fetchLineage}>Load</button>
              </div>
              <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs">{JSON.stringify(lineage, null, 2)}</pre>
            </div>
          )}

          {!loading && !error && activeTab === 'impact' && (
            <div className="bg-white rounded shadow p-4">
              <div className="text-sm font-medium mb-3">Impact analysis</div>
              <div className="flex gap-2 mb-3">
                <input className="border rounded px-2 py-1 flex-1" placeholder="DB.SCHEMA.OBJECT" value={impactQuery} onChange={e => setImpactQuery(e.target.value)} />
                <button className="px-3 py-1 bg-black text-white rounded" onClick={fetchImpact}>Load</button>
              </div>
              <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs">{JSON.stringify(impact, null, 2)}</pre>
            </div>
          )}

          {!loading && !error && activeTab === 'access' && (
            <div className="bg-white rounded shadow p-4 space-y-3">
              <div className="text-sm font-medium">Access lineage</div>
              <button className="px-3 py-1 bg-black text-white rounded" onClick={fetchAccess}>Load</button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Grants</div>
                  <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs">{JSON.stringify(access.grants || [], null, 2)}</pre>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Usage</div>
                  <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs">{JSON.stringify(access.usage || [], null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'finops' && (
            <div className="bg-white rounded shadow p-4">
              <div className="text-sm font-medium mb-3">FinOps summary</div>
              <button className="px-3 py-1 bg-black text-white rounded" onClick={fetchFinops}>Load</button>
              <pre className="bg-zinc-50 p-2 rounded overflow-x-auto text-xs mt-3">{JSON.stringify(finops || [], null, 2)}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

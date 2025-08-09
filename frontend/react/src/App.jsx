import React, { useEffect, useState } from 'react'

export default function App() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState({ databases: 0, schemas: 0 })
  const [grants, setGrants] = useState([])

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

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>snowsarva</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setActiveTab('metrics')} disabled={activeTab==='metrics'}>Metrics</button>
        <button onClick={() => setActiveTab('grants')} disabled={activeTab==='grants'}>Grants</button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!loading && !error && activeTab === 'metrics' && (
        <div>
          <p>Metrics from SNOWFLAKE.ACCOUNT_USAGE</p>
          <div>Databases: <strong>{metrics.databases}</strong></div>
          <div>Schemas: <strong>{metrics.schemas}</strong></div>
        </div>
      )}

      {!loading && !error && activeTab === 'grants' && (
        <div>
          <p>Required grants for full functionality:</p>
          <ul>
            {grants.map((g, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <div><strong>{g.privilege}</strong>{g.granted === true ? ' (granted)' : g.granted === false ? ' (not granted)' : ''}</div>
                <code style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{g.grant_sql}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

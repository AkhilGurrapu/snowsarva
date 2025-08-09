import React, { useEffect, useState } from 'react'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState({ databases: 0, schemas: 0 })

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark'

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/metrics`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setMetrics(data)
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
      <p>Metrics from SNOWFLAKE.ACCOUNT_USAGE</p>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && (
        <div>
          <div>Databases: <strong>{metrics.databases}</strong></div>
          <div>Schemas: <strong>{metrics.schemas}</strong></div>
        </div>
      )}
    </div>
  )
}

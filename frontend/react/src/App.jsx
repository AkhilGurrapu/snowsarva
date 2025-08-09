import React, { useEffect, useState } from 'react'
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
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>snowsarva</Typography>
          <Chip label="Dev" color="default" size="small" />
        </Toolbar>
        <Tabs value={['metrics','grants','lineage','impact','access','finops'].indexOf(activeTab)} onChange={(_, v) => setActiveTab(['metrics','grants','lineage','impact','access','finops'][v])} centered>
          <Tab label="Metrics" />
          <Tab label="Grants" />
          <Tab label="Lineage" />
          <Tab label="Impact" />
          <Tab label="Access" />
          <Tab label="FinOps" />
        </Tabs>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {loading && <Alert severity="info">Loading...</Alert>}
        {error && <Alert severity="error">Error: {error}</Alert>}

        {!loading && !error && activeTab === 'metrics' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Metrics from SNOWFLAKE.ACCOUNT_USAGE (auto-falls back to SHOW)</Typography>
            <Typography>Databases: <b>{metrics.databases}</b></Typography>
            <Typography>Schemas: <b>{metrics.schemas}</b></Typography>
            {metrics.path && <Chip label={`Source: ${metrics.path}`} size="small" sx={{ mt: 1 }} />}
          </Paper>
        )}

        {!loading && !error && activeTab === 'grants' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Required grants for full functionality</Typography>
            {grants.map((g, i) => (
              <Box key={i} sx={{ mb: 2 }}>
                <Typography><b>{g.privilege}</b>{g.granted === true ? ' (granted)' : g.granted === false ? ' (not granted)' : ''}</Typography>
                <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50', overflowX: 'auto' }}>
                  <code>{g.grant_sql}</code>
                </Paper>
              </Box>
            ))}
          </Paper>
        )}

        {!loading && !error && activeTab === 'lineage' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Object/column lineage</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField fullWidth size="small" label="DB.SCHEMA.OBJECT" value={lineageQuery} onChange={e => setLineageQuery(e.target.value)} />
              <Button variant="contained" onClick={fetchLineage}>Load</Button>
            </Box>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(lineage, null, 2)}</pre>
            </Paper>
          </Paper>
        )}

        {!loading && !error && activeTab === 'impact' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Impact analysis</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField fullWidth size="small" label="DB.SCHEMA.OBJECT" value={impactQuery} onChange={e => setImpactQuery(e.target.value)} />
              <Button variant="contained" onClick={fetchImpact}>Load</Button>
            </Box>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(impact, null, 2)}</pre>
            </Paper>
          </Paper>
        )}

        {!loading && !error && activeTab === 'access' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Access lineage</Typography>
            <Button variant="contained" onClick={fetchAccess} sx={{ mb: 2 }}>Load</Button>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50', mb: 2 }}>
              <Typography variant="body2" gutterBottom>Grants</Typography>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(access.grants || [], null, 2)}</pre>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
              <Typography variant="body2" gutterBottom>Usage</Typography>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(access.usage || [], null, 2)}</pre>
            </Paper>
          </Paper>
        )}

        {!loading && !error && activeTab === 'finops' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>FinOps summary</Typography>
            <Button variant="contained" onClick={fetchFinops} sx={{ mb: 2 }}>Load</Button>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(finops || [], null, 2)}</pre>
            </Paper>
          </Paper>
        )}
      </Container>
    </Box>
  )
}

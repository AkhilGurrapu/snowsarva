import React from 'react';

function App() {
  return (
    <div className="App">
      <header style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f5f5f5' }}>
        <h1>Snowsarva - Data Observability Platform</h1>
        <p>Welcome to Snowsarva Data Observability and Cost Management Platform</p>
      </header>
      <main style={{ padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2>Dashboard</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
            <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
              <h3>Cost Management</h3>
              <p>Monitor and optimize your Snowflake costs</p>
              <div style={{ color: '#666' }}>Feature coming soon...</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
              <h3>Data Lineage</h3>
              <p>Track data dependencies and relationships</p>
              <div style={{ color: '#666' }}>Feature coming soon...</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
              <h3>Query Performance</h3>
              <p>Analyze and optimize query performance</p>
              <div style={{ color: '#666' }}>Feature coming soon...</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
              <h3>Governance</h3>
              <p>Access control and compliance monitoring</p>
              <div style={{ color: '#666' }}>Feature coming soon...</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
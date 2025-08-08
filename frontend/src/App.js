import React from 'react';

function App() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      color: 'white',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{
        fontSize: '4rem',
        fontWeight: 'bold',
        margin: '0 0 20px 0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
      }}>
        Hello World!
      </h1>
      <h2 style={{
        fontSize: '2rem',
        margin: '0 0 30px 0',
        opacity: 0.9
      }}>
        Welcome to Snowsarva
      </h2>
      <div style={{
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '20px',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.2)'
      }}>
        <p style={{
          fontSize: '1.2rem',
          margin: '0 0 15px 0'
        }}>
          🚀 Your Snowflake Native App is running successfully!
        </p>
        <p style={{
          fontSize: '1rem',
          margin: '0',
          opacity: 0.8
        }}>
          Built with React and deployed using Snowpark Container Services
        </p>
      </div>
      <div style={{
        marginTop: '40px',
        fontSize: '0.9rem',
        opacity: 0.7
      }}>
        <p>App Version: 1.0.0</p>
        <p>Environment: Snowflake Container Services</p>
      </div>
    </div>
  );
}

export default App;
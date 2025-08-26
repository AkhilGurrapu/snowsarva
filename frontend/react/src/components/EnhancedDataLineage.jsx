import React, { useState, useEffect } from 'react';
import EnhancedLineageGraph from './EnhancedLineageGraph';

export default function EnhancedDataLineage() {
  const [activeTab, setActiveTab] = useState('manual-query');
  const [lineageData, setLineageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [objectName, setObjectName] = useState('');

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Sample SQL queries for testing
  const sampleQueries = {
    'CREATE TABLE AS SELECT': `CREATE TABLE analytics.customer_summary AS
SELECT 
  customer_id,
  COUNT(*) as order_count,
  SUM(amount) as total_spent,
  AVG(amount) as avg_order_value
FROM raw.orders
GROUP BY customer_id`,
    
    'INSERT SELECT': `INSERT INTO staging.processed_orders (order_id, customer_name, total_amount)
SELECT 
  o.id,
  c.name,
  o.amount + COALESCE(o.tax, 0) as total
FROM raw.orders o
JOIN raw.customers c ON o.customer_id = c.id`,
    
    'Complex JOIN': `CREATE VIEW reports.customer_metrics AS
SELECT 
  c.id as customer_id,
  c.name,
  c.email,
  COUNT(o.id) as total_orders,
  SUM(o.amount) as lifetime_value,
  MAX(o.created_at) as last_order_date
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE c.status = 'active'
GROUP BY c.id, c.name, c.email`
  };

  const fetchObjectLineage = async (objectId, depth = 2) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${encodeURIComponent(objectId)}&depth=${depth}`);
      
      if (response.ok) {
        const data = await response.json();
        setLineageData(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch lineage data');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const parseSqlForLineage = async (sql) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${apiBase}/lineage/sql-parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setLineageData(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to parse SQL');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const autoDiscoverLineage = async (limit = 100, days = 7) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${apiBase}/lineage/auto-discover?limit=${limit}&days=${days}&store=true`);
      
      if (response.ok) {
        const data = await response.json();
        setLineageData(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to auto-discover lineage');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDbtUpload = async (file) => {
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('manifest', file);
      
      const response = await fetch(`${apiBase}/lineage/dbt-upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setLineageData(data.lineage_extracted || data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to process dbt artifacts');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'manual-query', label: 'Manual Query', icon: '🔍' },
    { key: 'sql-parser', label: 'SQL Parser', icon: '⚡' },
    { key: 'auto-discover', label: 'Auto-Discover', icon: '🤖' },
    { key: 'dbt-artifacts', label: 'dbt Artifacts', icon: '🔧' }
  ];

  return (
    <div className="space-y-6">
      {/* Enhanced Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-blue-600 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-6">
          {/* Manual Query Tab */}
          {activeTab === 'manual-query' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Object Lineage Query</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Enter a table, view, or column name to explore its lineage relationships
                </p>
              </div>
              
              <div className="flex space-x-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="e.g., DATABASE.SCHEMA.TABLE or COLUMN_NAME"
                    value={objectName}
                    onChange={(e) => setObjectName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => fetchObjectLineage(objectName)}
                  disabled={!objectName || loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Loading...' : 'Query Lineage'}
                </button>
              </div>
            </div>
          )}

          {/* SQL Parser Tab */}
          {activeTab === 'sql-parser' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">SQL Lineage Parser</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Parse SQL statements to extract column-level lineage relationships
                </p>
              </div>

              {/* Sample Query Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.keys(sampleQueries).map((queryType) => (
                  <button
                    key={queryType}
                    onClick={() => setSqlQuery(sampleQueries[queryType])}
                    className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    {queryType}
                  </button>
                ))}
              </div>
              
              <div>
                <textarea
                  placeholder="Enter SQL query (CREATE TABLE AS SELECT, INSERT, MERGE, etc.)"
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              
              <button
                onClick={() => parseSqlForLineage(sqlQuery)}
                disabled={!sqlQuery || loading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Parsing...' : 'Parse SQL'}
              </button>
            </div>
          )}

          {/* Auto-Discover Tab */}
          {activeTab === 'auto-discover' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Auto-Discover from Query History</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Automatically discover lineage from Snowflake QUERY_HISTORY (last 7 days)
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-blue-500">ℹ️</div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Auto-discovery analyzes:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>DDL operations (CREATE TABLE AS SELECT, CREATE VIEW)</li>
                      <li>DML operations (INSERT, UPDATE, MERGE)</li>
                      <li>Column-level transformations and mappings</li>
                      <li>dbt model dependencies</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => autoDiscoverLineage()}
                disabled={loading}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Discovering...' : 'Auto-Discover Lineage'}
              </button>
            </div>
          )}

          {/* dbt Artifacts Tab */}
          {activeTab === 'dbt-artifacts' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">dbt Artifacts Upload</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Upload dbt manifest.json to extract model dependencies and lineage
                </p>
              </div>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleDbtUpload(file);
                    }
                  }}
                  className="hidden"
                  id="dbt-upload"
                />
                <label
                  htmlFor="dbt-upload"
                  className="cursor-pointer flex flex-col items-center space-y-2"
                >
                  <div className="text-4xl">📁</div>
                  <div className="text-sm text-gray-600 text-center">
                    <span className="font-medium text-blue-600 hover:underline">
                      Click to upload
                    </span> or drag and drop
                  </div>
                  <div className="text-xs text-gray-500">
                    manifest.json files only
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="text-red-500">⚠️</div>
            <div className="text-sm text-red-800">
              <p className="font-medium">Error occurred:</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="animate-spin text-blue-500">🔄</div>
            <div className="text-sm text-blue-800">
              Processing lineage data from Snowflake...
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Lineage Graph */}
      {lineageData && !loading && (
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              Interactive Data Lineage
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {lineageData.nodes?.length || 0} objects, {lineageData.edges?.length || 0} relationships
              {lineageData.storage_result && (
                <span className="ml-2 text-green-600">• Stored in database</span>
              )}
            </p>
          </div>
          <div className="p-6">
            <EnhancedLineageGraph 
              data={lineageData} 
              level="table"
            />
          </div>
        </div>
      )}

      {/* Real-time Integration Info */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <div className="text-2xl">⚡</div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Real Snowflake Integration
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              This enhanced data lineage system connects directly to your Snowflake account using:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>ACCOUNT_USAGE views for metadata</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>ACCESS_HISTORY for column lineage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>SQL parsing with sqlglot</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>dbt artifacts processing</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>Interactive React Flow visualization</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-500">✓</span>
                  <span>Native App SPCS deployment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
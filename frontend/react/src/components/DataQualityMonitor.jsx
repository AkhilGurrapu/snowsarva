import React, { useState, useEffect } from 'react';

export default function DataQualityMonitor() {
  const [activeTab, setActiveTab] = useState('overview');
  const [alerts, setAlerts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [monitoringConfig, setMonitoringConfig] = useState({
    sensitivity: 3,
    training_period_days: 14,
    detection_period_days: 2,
    anomaly_direction: 'both'
  });
  const [testResults, setTestResults] = useState(null);
  const [notificationConfig, setNotificationConfig] = useState({
    slack_webhook: '',
    teams_webhook: '',
    webhook_url: ''
  });

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/snowpark/data-quality/alerts');
      const data = await response.json();
      if (data.alerts) {
        setAlerts(data.alerts);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await fetch('/api/snowpark/data-quality/monitor/suggestions');
      const data = await response.json();
      if (data.suggested_configurations) {
        setSuggestions(data.suggested_configurations);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchSuggestions();
  }, []);

  const runVolumeMonitoring = async (tableName, timestampColumn) => {
    setLoading(true);
    try {
      const response = await fetch('/api/snowpark/data-quality/monitor/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          timestamp_column: timestampColumn,
          config: monitoringConfig
        })
      });
      const result = await response.json();
      setTestResults(result);
      if (result.alert) {
        fetchAlerts(); // Refresh alerts
      }
    } catch (error) {
      console.error('Volume monitoring failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const runFreshnessMonitoring = async (tableName, timestampColumn) => {
    setLoading(true);
    try {
      const response = await fetch('/api/snowpark/data-quality/monitor/freshness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          timestamp_column: timestampColumn,
          config: monitoringConfig
        })
      });
      const result = await response.json();
      setTestResults(result);
      if (result.alert) {
        fetchAlerts(); // Refresh alerts
      }
    } catch (error) {
      console.error('Freshness monitoring failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const runComprehensiveMonitoring = async () => {
    setLoading(true);
    try {
      // Use top 5 suggestions for comprehensive monitoring
      const tablesConfig = suggestions.slice(0, 5).map(suggestion => ({
        table_name: suggestion.table_name,
        timestamp_column: suggestion.timestamp_column,
        monitor_types: suggestion.monitor_types,
        columns: suggestion.columns || []
      }));

      const response = await fetch('/api/snowpark/data-quality/monitor/comprehensive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables_config: tablesConfig,
          config: monitoringConfig
        })
      });
      const result = await response.json();
      setTestResults(result);
      fetchAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Comprehensive monitoring failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const testNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/snowpark/data-quality/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: notificationConfig
        })
      });
      const result = await response.json();
      setTestResults(result);
    } catch (error) {
      console.error('Notification test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAlertStatus = async (alertId, status) => {
    try {
      await fetch(`/api/snowpark/data-quality/alerts/${alertId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Failed to update alert status:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warning': return 'text-orange-600 bg-orange-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const OverviewTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-red-600 font-medium">Active Alerts</div>
          <div className="text-2xl font-bold text-red-700">{alerts.filter(a => a.STATUS === 'active').length}</div>
          <div className="text-sm text-red-600">Require attention</div>
        </div>
        
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-orange-600 font-medium">Error Alerts</div>
          <div className="text-2xl font-bold text-orange-700">{alerts.filter(a => a.SEVERITY === 'error').length}</div>
          <div className="text-sm text-orange-600">Critical issues</div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-yellow-600 font-medium">Warning Alerts</div>
          <div className="text-2xl font-bold text-yellow-700">{alerts.filter(a => a.SEVERITY === 'warning').length}</div>
          <div className="text-sm text-yellow-600">Monitor closely</div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-green-600 font-medium">Tables Monitored</div>
          <div className="text-2xl font-bold text-green-700">{suggestions.length}</div>
          <div className="text-sm text-green-600">Available for monitoring</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Alerts</h3>
        <div className="space-y-3">
          {alerts.slice(0, 5).map((alert, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(alert.SEVERITY)}`}>
                    {alert.SEVERITY}
                  </span>
                  <span className="font-medium">{alert.ALERT_TYPE}</span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {alert.TABLE_FULL_NAME} - {alert.DESCRIPTION}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(alert.DETECTED_AT).toLocaleString()}
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => updateAlertStatus(alert.ID, 'resolved')}
                  className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  Resolve
                </button>
                <button 
                  onClick={() => updateAlertStatus(alert.ID, 'suppressed')}
                  className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Suppress
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const MonitoringTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Monitoring Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sensitivity (Std Deviations)</label>
            <input 
              type="number" 
              value={monitoringConfig.sensitivity}
              onChange={(e) => setMonitoringConfig({...monitoringConfig, sensitivity: parseInt(e.target.value)})}
              className="w-full border rounded-md px-3 py-2"
              min="1" max="5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Training Period (Days)</label>
            <input 
              type="number" 
              value={monitoringConfig.training_period_days}
              onChange={(e) => setMonitoringConfig({...monitoringConfig, training_period_days: parseInt(e.target.value)})}
              className="w-full border rounded-md px-3 py-2"
              min="7" max="90"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Detection Period (Days)</label>
            <input 
              type="number" 
              value={monitoringConfig.detection_period_days}
              onChange={(e) => setMonitoringConfig({...monitoringConfig, detection_period_days: parseInt(e.target.value)})}
              className="w-full border rounded-md px-3 py-2"
              min="1" max="7"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Anomaly Direction</label>
            <select 
              value={monitoringConfig.anomaly_direction}
              onChange={(e) => setMonitoringConfig({...monitoringConfig, anomaly_direction: e.target.value})}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="both">Both (Spike & Drop)</option>
              <option value="spike">Spike Only</option>
              <option value="drop">Drop Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex space-x-4">
          <button 
            onClick={runComprehensiveMonitoring}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run Comprehensive Monitoring'}
          </button>
          <button 
            onClick={fetchSuggestions}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Refresh Suggestions
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Monitoring Suggestions</h3>
        <div className="space-y-3">
          {suggestions.slice(0, 10).map((suggestion, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{suggestion.table_name}</div>
                <div className="text-sm text-gray-600">{suggestion.rationale}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Monitors: {suggestion.monitor_types.join(', ')}
                  {suggestion.timestamp_column && ` | Timestamp: ${suggestion.timestamp_column}`}
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => runVolumeMonitoring(suggestion.table_name, suggestion.timestamp_column)}
                  disabled={loading}
                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                >
                  Volume Test
                </button>
                {suggestion.timestamp_column && (
                  <button 
                    onClick={() => runFreshnessMonitoring(suggestion.table_name, suggestion.timestamp_column)}
                    disabled={loading}
                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                  >
                    Freshness Test
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const NotificationsTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Slack Webhook URL</label>
            <input 
              type="url" 
              value={notificationConfig.slack_webhook}
              onChange={(e) => setNotificationConfig({...notificationConfig, slack_webhook: e.target.value})}
              className="w-full border rounded-md px-3 py-2"
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Teams Webhook URL</label>
            <input 
              type="url" 
              value={notificationConfig.teams_webhook}
              onChange={(e) => setNotificationConfig({...notificationConfig, teams_webhook: e.target.value})}
              className="w-full border rounded-md px-3 py-2"
              placeholder="https://outlook.office.com/webhook/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Custom Webhook URL</label>
            <input 
              type="url" 
              value={notificationConfig.webhook_url}
              onChange={(e) => setNotificationConfig({...notificationConfig, webhook_url: e.target.value})}
              className="w-full border rounded-md px-3 py-2"
              placeholder="https://your-webhook-endpoint.com/alerts"
            />
          </div>
          <button 
            onClick={testNotifications}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Notifications'}
          </button>
        </div>
      </div>

      {testResults && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Test Results</h3>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto">
            {JSON.stringify(testResults, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Overview' },
            { id: 'monitoring', name: 'Monitoring' },
            { id: 'notifications', name: 'Notifications' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'monitoring' && <MonitoringTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DollarSign, TrendingUp, TrendingDown, Zap, Database, Users, Clock } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, ArcElement);

interface CostMetrics {
  totalCost: number;
  dailyCost: number;
  monthlyCost: number;
  costTrend: number;
  budgetUtilization: number;
  activeWarehouses: number;
  totalQueries: number;
  avgQueryCost: number;
  storageGB: number;
  storageCost: number;
  computeCost: number;
  cloudServicesCost: number;
  costByWarehouse: Array<{ name: string; cost: number; utilization: number }>;
  costTrendData: Array<{ date: string; compute: number; storage: number; cloudServices: number }>;
  topCostQueries: Array<{ queryId: string; cost: number; warehouse: string; executionTime: number }>;
  costAnomalies: Array<{ type: string; severity: 'high' | 'medium' | 'low'; message: string; timestamp: string }>;
}

interface CostOverviewDashboardProps {
  refreshInterval?: number;
}

export const CostOverviewDashboard: React.FC<CostOverviewDashboardProps> = ({ refreshInterval = 300000 }) => {
  const [costMetrics, setCostMetrics] = useState<CostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('24h');

  useEffect(() => {
    const fetchCostMetrics = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/cost/overview?timeRange=${selectedTimeRange}`);
        if (!response.ok) throw new Error('Failed to fetch cost metrics');
        
        const data = await response.json();
        setCostMetrics(data);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCostMetrics();
    const interval = setInterval(fetchCostMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedTimeRange, refreshInterval]);

  if (loading && !costMetrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>Error loading cost metrics: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!costMetrics) return null;

  const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNumber = (num: number) => num.toLocaleString();

  // Chart configurations
  const costTrendChartData = {
    labels: costMetrics.costTrendData.map(d => new Date(d.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Compute',
        data: costMetrics.costTrendData.map(d => d.compute),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Storage',
        data: costMetrics.costTrendData.map(d => d.storage),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Cloud Services',
        data: costMetrics.costTrendData.map(d => d.cloudServices),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const costBreakdownData = {
    labels: ['Compute', 'Storage', 'Cloud Services'],
    datasets: [{
      data: [costMetrics.computeCost, costMetrics.storageCost, costMetrics.cloudServicesCost],
      backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  };

  const warehouseCostData = {
    labels: costMetrics.costByWarehouse.map(w => w.name),
    datasets: [{
      label: 'Cost ($)',
      data: costMetrics.costByWarehouse.map(w => w.cost),
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
    }],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cost Overview</h1>
          <p className="text-gray-600 mt-1">
            Real-time cost monitoring and analytics
            {lastUpdated && (
              <span className="ml-2 text-sm">
                • Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex space-x-2">
          {(['24h', '7d', '30d', '90d'] as const).map((range) => (
            <Button
              key={range}
              variant={selectedTimeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTimeRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Cost Anomalies Alert */}
      {costMetrics.costAnomalies.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-800">Cost Anomalies Detected</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {costMetrics.costAnomalies.slice(0, 3).map((anomaly, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-orange-700">{anomaly.message}</span>
                  <Badge variant={anomaly.severity === 'high' ? 'destructive' : anomaly.severity === 'medium' ? 'default' : 'secondary'}>
                    {anomaly.severity}
                  </Badge>
                </div>
              ))}
              {costMetrics.costAnomalies.length > 3 && (
                <Button variant="outline" size="sm" className="mt-2">
                  View All {costMetrics.costAnomalies.length} Anomalies
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cost ({selectedTimeRange})</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(costMetrics.totalCost)}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="flex items-center mt-4">
              {costMetrics.costTrend >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`ml-1 text-sm ${costMetrics.costTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(costMetrics.costTrend).toFixed(1)}% vs previous period
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Budget Utilization</p>
                <p className="text-2xl font-bold text-gray-900">{costMetrics.budgetUtilization.toFixed(1)}%</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div
                className={`h-2 rounded-full ${
                  costMetrics.budgetUtilization > 90 ? 'bg-red-600' :
                  costMetrics.budgetUtilization > 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(costMetrics.budgetUtilization, 100)}%` }}
              ></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Warehouses</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(costMetrics.activeWarehouses)}</p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Zap className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Avg cost: {formatCurrency(costMetrics.computeCost / costMetrics.activeWarehouses)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Query Cost</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(costMetrics.avgQueryCost)}</p>
              </div>
              <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {formatNumber(costMetrics.totalQueries)} total queries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Trend Chart */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Cost Trend Analysis</CardTitle>
            <CardDescription>Cost breakdown over time by service type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Line
                data={costTrendChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    tooltip: {
                      mode: 'index',
                      intersect: false,
                      callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => formatCurrency(Number(value)),
                      },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cost Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>Distribution by service type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Doughnut
                data={costBreakdownData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const label = context.label || '';
                          const value = formatCurrency(Number(context.raw));
                          const total = costMetrics.computeCost + costMetrics.storageCost + costMetrics.cloudServicesCost;
                          const percentage = ((Number(context.raw) / total) * 100).toFixed(1);
                          return `${label}: ${value} (${percentage}%)`;
                        },
                      },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Cost Warehouses */}
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Cost Analysis</CardTitle>
            <CardDescription>Cost and utilization by warehouse</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <Bar
                data={warehouseCostData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => `Cost: ${formatCurrency(context.parsed.y)}`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => formatCurrency(Number(value)),
                      },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Top Cost Queries */}
        <Card>
          <CardHeader>
            <CardTitle>Most Expensive Queries</CardTitle>
            <CardDescription>Highest cost queries in selected time range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {costMetrics.topCostQueries.slice(0, 5).map((query, index) => (
                <div key={query.queryId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">Query {query.queryId.slice(-8)}</p>
                      <p className="text-xs text-gray-600">
                        {query.warehouse} • {query.executionTime}s execution
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatCurrency(query.cost)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" size="sm">
              View All Queries
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CostOverviewDashboard;
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Zap, Clock, TrendingUp, TrendingDown, Settings, CheckCircle, XCircle, Activity } from 'lucide-react';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement);

interface WarehouseMetrics {
  id: string;
  name: string;
  size: string;
  status: 'running' | 'suspended' | 'starting' | 'suspending';
  creditsUsed: number;
  queriesExecuted: number;
  avgExecutionTime: number;
  queuedQueries: number;
  concurrentQueries: number;
  maxConcurrentQueries: number;
  utilization: number;
  efficiency: number;
  autoSuspend: number;
  autoResume: boolean;
  lastActivity: string;
  costPerHour: number;
  totalCost: number;
  idleTime: number;
  recommendations: WarehouseRecommendation[];
}

interface WarehouseRecommendation {
  id: string;
  type: 'resize' | 'auto_suspend' | 'schedule' | 'workload_split' | 'clustering';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    costSaving: number;
    performanceImprovement: number;
  };
  implementation: string;
  effort: 'low' | 'medium' | 'high';
}

interface OptimizationSummary {
  totalPotentialSavings: number;
  implementedOptimizations: number;
  pendingRecommendations: number;
  avgEfficiencyImprovement: number;
}

export const WarehouseOptimizer: React.FC = () => {
  const [warehouses, setWarehouses] = useState<WarehouseMetrics[]>([]);
  const [optimizationSummary, setOptimizationSummary] = useState<OptimizationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  useEffect(() => {
    fetchWarehouseData();
  }, [timeRange]);

  const fetchWarehouseData = async () => {
    try {
      setLoading(true);
      const [warehousesResponse, summaryResponse] = await Promise.all([
        fetch(`/api/cost/warehouse-metrics?timeRange=${timeRange}`),
        fetch(`/api/cost/optimization-summary`)
      ]);

      if (!warehousesResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch warehouse data');
      }

      const warehousesData = await warehousesResponse.json();
      const summaryData = await summaryResponse.json();

      setWarehouses(warehousesData);
      setOptimizationSummary(summaryData);
      if (warehousesData.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(warehousesData[0]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch warehouse data');
    } finally {
      setLoading(false);
    }
  };

  const implementRecommendation = async (warehouseId: string, recommendationId: string) => {
    try {
      const response = await fetch(`/api/cost/warehouses/${warehouseId}/recommendations/${recommendationId}/implement`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to implement recommendation');

      // Refresh data
      await fetchWarehouseData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to implement recommendation');
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNumber = (num: number) => num.toLocaleString();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'suspended':
        return 'bg-gray-400';
      case 'starting':
        return 'bg-blue-500';
      case 'suspending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  // Chart data
  const utilizationChartData = {
    labels: warehouses.map(w => w.name),
    datasets: [
      {
        label: 'Utilization %',
        data: warehouses.map(w => w.utilization),
        backgroundColor: warehouses.map(w => w.utilization > 80 ? 'rgba(239, 68, 68, 0.8)' : w.utilization > 50 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(34, 197, 94, 0.8)'),
        borderColor: warehouses.map(w => w.utilization > 80 ? 'rgb(239, 68, 68)' : w.utilization > 50 ? 'rgb(245, 158, 11)' : 'rgb(34, 197, 94)'),
        borderWidth: 1,
      }
    ],
  };

  const efficiencyScatterData = {
    datasets: [
      {
        label: 'Warehouses',
        data: warehouses.map(w => ({
          x: w.utilization,
          y: w.efficiency,
          warehouse: w.name,
          cost: w.totalCost,
        })),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
      }
    ],
  };

  const costTrendData = selectedWarehouse ? {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: 'Hourly Cost',
        data: Array.from({ length: 24 }, () => Math.random() * selectedWarehouse.costPerHour),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Target Cost',
        data: Array(24).fill(selectedWarehouse.costPerHour * 0.8),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
        backgroundColor: 'transparent',
      }
    ],
  } : null;

  if (loading) {
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
            <span>Error loading warehouse data: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Warehouse Optimizer</h1>
          <p className="text-gray-600 mt-1">Optimize warehouse performance and reduce costs with AI-powered recommendations</p>
        </div>
        <div className="flex space-x-2">
          {(['24h', '7d', '30d'] as const).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Optimization Summary */}
      {optimizationSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Potential Savings</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(optimizationSummary.totalPotentialSavings)}</p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Implemented</p>
                  <p className="text-2xl font-bold text-blue-600">{formatNumber(optimizationSummary.implementedOptimizations)}</p>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-orange-600">{formatNumber(optimizationSummary.pendingRecommendations)}</p>
                </div>
                <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Efficiency Gain</p>
                  <p className="text-2xl font-bold text-purple-600">{optimizationSummary.avgEfficiencyImprovement.toFixed(1)}%</p>
                </div>
                <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Warehouse Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {warehouses.map((warehouse) => (
              <Card key={warehouse.id} className={`cursor-pointer transition-shadow hover:shadow-md ${selectedWarehouse?.id === warehouse.id ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setSelectedWarehouse(warehouse)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{warehouse.name}</CardTitle>
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(warehouse.status)}`}></div>
                      <Badge variant="outline">{warehouse.size}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Credits Used:</span>
                        <p className="font-semibold">{warehouse.creditsUsed.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Cost:</span>
                        <p className="font-semibold">{formatCurrency(warehouse.totalCost)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Queries:</span>
                        <p className="font-semibold">{formatNumber(warehouse.queriesExecuted)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Time:</span>
                        <p className="font-semibold">{warehouse.avgExecutionTime.toFixed(2)}s</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Utilization</span>
                        <span className="font-medium">{warehouse.utilization.toFixed(1)}%</span>
                      </div>
                      <Progress value={warehouse.utilization} className="h-2" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Efficiency</span>
                        <span className="font-medium">{warehouse.efficiency.toFixed(1)}%</span>
                      </div>
                      <Progress value={warehouse.efficiency} className="h-2" />
                    </div>

                    {warehouse.recommendations.length > 0 && (
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-sm text-gray-600">Recommendations:</span>
                        <Badge variant={getSeverityColor(warehouse.recommendations[0].severity)}>
                          {warehouse.recommendations.length} pending
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Warehouse Utilization</CardTitle>
                <CardDescription>Resource utilization across all warehouses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Bar
                    data={utilizationChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          max: 100,
                          ticks: {
                            callback: (value) => `${value}%`,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Efficiency vs Utilization</CardTitle>
                <CardDescription>Performance correlation analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Scatter
                    data={efficiencyScatterData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          callbacks: {
                            label: (context: any) => {
                              const point = context.raw;
                              return `${point.warehouse}: ${point.x.toFixed(1)}% utilization, ${point.y.toFixed(1)}% efficiency, ${formatCurrency(point.cost)} cost`;
                            },
                          },
                        },
                      },
                      scales: {
                        x: {
                          title: {
                            display: true,
                            text: 'Utilization %',
                          },
                        },
                        y: {
                          title: {
                            display: true,
                            text: 'Efficiency %',
                          },
                        },
                      },
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {selectedWarehouse && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations for {selectedWarehouse.name}</CardTitle>
                <CardDescription>AI-powered optimization suggestions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedWarehouse.recommendations.map((recommendation) => (
                    <Card key={recommendation.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="font-semibold">{recommendation.title}</h4>
                              <Badge variant={getSeverityColor(recommendation.severity)}>
                                {recommendation.severity}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {recommendation.type}
                              </Badge>
                            </div>
                            <p className="text-gray-600 text-sm mb-3">{recommendation.description}</p>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Potential Cost Savings:</span>
                                <p className="font-semibold text-green-600">{formatCurrency(recommendation.impact.costSaving)}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Performance Improvement:</span>
                                <p className="font-semibold text-blue-600">{recommendation.impact.performanceImprovement.toFixed(1)}%</p>
                              </div>
                            </div>
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                              <strong>Implementation:</strong> {recommendation.implementation}
                            </div>
                          </div>
                          <div className="ml-4">
                            <Button
                              size="sm"
                              onClick={() => implementRecommendation(selectedWarehouse.id, recommendation.id)}
                              className="mb-2"
                            >
                              Implement
                            </Button>
                            <p className="text-xs text-gray-500 text-center">
                              {recommendation.effort} effort
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {selectedWarehouse.recommendations.length === 0 && (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">All optimized!</h3>
                      <p className="text-gray-600">This warehouse has no pending optimization recommendations.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {selectedWarehouse && costTrendData && (
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis: {selectedWarehouse.name}</CardTitle>
                <CardDescription>Detailed cost breakdown and trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 mb-6">
                  <Line
                    data={costTrendData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'top' as const,
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Auto-Suspend</p>
                    <p className="text-2xl font-bold">{selectedWarehouse.autoSuspend}min</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Idle Time</p>
                    <p className="text-2xl font-bold">{(selectedWarehouse.idleTime / 60).toFixed(1)}h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Queue Time</p>
                    <p className="text-2xl font-bold">{selectedWarehouse.queuedQueries}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Concurrency</p>
                    <p className="text-2xl font-bold">{selectedWarehouse.concurrentQueries}/{selectedWarehouse.maxConcurrentQueries}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Settings</CardTitle>
              <CardDescription>Configure automatic optimization parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-medium mb-4">Auto-Optimization</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Automatic Warehouse Resizing</p>
                        <p className="text-sm text-gray-600">Automatically resize warehouses based on workload patterns</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-Suspend Optimization</p>
                        <p className="text-sm text-gray-600">Optimize auto-suspend timing based on usage patterns</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Query Routing</p>
                        <p className="text-sm text-gray-600">Route queries to optimal warehouses automatically</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-medium mb-4">Alert Thresholds</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">High Utilization (%)</label>
                      <input type="number" defaultValue="80" className="w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Low Efficiency (%)</label>
                      <input type="number" defaultValue="50" className="w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">High Cost ($)</label>
                      <input type="number" defaultValue="1000" className="w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Queue Threshold</label>
                      <input type="number" defaultValue="10" className="w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>Save Settings</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WarehouseOptimizer;
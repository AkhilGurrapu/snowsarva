import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Edit, Trash2, TrendingUp, TrendingDown, Target, Calendar, DollarSign } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement);

interface Budget {
  id: string;
  name: string;
  amount: number;
  spent: number;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
  alertThresholds: number[];
  scope: {
    type: 'account' | 'warehouse' | 'database' | 'role' | 'user';
    values: string[];
  };
  status: 'active' | 'exceeded' | 'warning' | 'inactive';
  forecast: {
    projectedSpend: number;
    daysRemaining: number;
    burnRate: number;
  };
}

interface BudgetAlert {
  id: string;
  budgetId: string;
  budgetName: string;
  type: 'threshold' | 'exceeded' | 'forecast';
  severity: 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface BudgetFormData {
  name: string;
  amount: number;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
  alertThresholds: string;
  scopeType: 'account' | 'warehouse' | 'database' | 'role' | 'user';
  scopeValues: string;
}

export const BudgetManagementPanel: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  const [formData, setFormData] = useState<BudgetFormData>({
    name: '',
    amount: 0,
    period: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    alertThresholds: '75,90',
    scopeType: 'account',
    scopeValues: '',
  });

  useEffect(() => {
    fetchBudgets();
    fetchBudgetAlerts();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await fetch('/api/cost/budgets');
      if (!response.ok) throw new Error('Failed to fetch budgets');
      const data = await response.json();
      setBudgets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch budgets');
    } finally {
      setLoading(false);
    }
  };

  const fetchBudgetAlerts = async () => {
    try {
      const response = await fetch('/api/cost/budget-alerts');
      if (!response.ok) throw new Error('Failed to fetch budget alerts');
      const data = await response.json();
      setBudgetAlerts(data);
    } catch (err) {
      console.error('Failed to fetch budget alerts:', err);
    }
  };

  const handleCreateBudget = async () => {
    try {
      const budgetData = {
        ...formData,
        amount: Number(formData.amount),
        alertThresholds: formData.alertThresholds.split(',').map(t => Number(t.trim())),
        scopeValues: formData.scopeValues.split(',').map(v => v.trim()).filter(Boolean),
      };

      const response = await fetch('/api/cost/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(budgetData),
      });

      if (!response.ok) throw new Error('Failed to create budget');

      await fetchBudgets();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create budget');
    }
  };

  const handleUpdateBudget = async () => {
    if (!editingBudget) return;

    try {
      const budgetData = {
        ...formData,
        amount: Number(formData.amount),
        alertThresholds: formData.alertThresholds.split(',').map(t => Number(t.trim())),
        scopeValues: formData.scopeValues.split(',').map(v => v.trim()).filter(Boolean),
      };

      const response = await fetch(`/api/cost/budgets/${editingBudget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(budgetData),
      });

      if (!response.ok) throw new Error('Failed to update budget');

      await fetchBudgets();
      setIsDialogOpen(false);
      setEditingBudget(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update budget');
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
      const response = await fetch(`/api/cost/budgets/${budgetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete budget');

      await fetchBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete budget');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      amount: 0,
      period: 'monthly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      alertThresholds: '75,90',
      scopeType: 'account',
      scopeValues: '',
    });
  };

  const openEditDialog = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      amount: budget.amount,
      period: budget.period,
      startDate: budget.startDate,
      endDate: budget.endDate,
      alertThresholds: budget.alertThresholds.join(', '),
      scopeType: budget.scope.type,
      scopeValues: budget.scope.values.join(', '),
    });
    setIsDialogOpen(true);
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getBudgetStatusColor = (status: Budget['status']) => {
    switch (status) {
      case 'exceeded':
        return 'destructive';
      case 'warning':
        return 'default';
      case 'active':
        return 'secondary';
      case 'inactive':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getBudgetUtilization = (budget: Budget) => (budget.spent / budget.amount) * 100;

  // Chart data for selected budget
  const budgetTrendData = selectedBudget ? {
    labels: Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date.toLocaleDateString();
    }),
    datasets: [
      {
        label: 'Cumulative Spend',
        data: Array.from({ length: 30 }, (_, i) => (selectedBudget.spent / 30) * (i + 1)),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Budget Limit',
        data: Array(30).fill(selectedBudget.amount),
        borderColor: 'rgb(239, 68, 68)',
        borderDash: [5, 5],
        backgroundColor: 'transparent',
      },
      {
        label: 'Forecasted Spend',
        data: Array.from({ length: 30 }, (_, i) => (selectedBudget.forecast.projectedSpend / 30) * (i + 1)),
        borderColor: 'rgb(245, 158, 11)',
        borderDash: [10, 5],
        backgroundColor: 'transparent',
      },
    ],
  } : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Budget Management</h1>
          <p className="text-gray-600 mt-1">Monitor and manage cost budgets with forecasting and alerts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingBudget ? 'Edit Budget' : 'Create New Budget'}</DialogTitle>
              <DialogDescription>
                Set up budget limits and alerts for cost control and monitoring
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Budget Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Monthly Compute Budget"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="amount">Budget Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="period">Budget Period</Label>
                <Select value={formData.period} onValueChange={(value: BudgetFormData['period']) => setFormData({ ...formData, period: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="scopeType">Budget Scope</Label>
                <Select value={formData.scopeType} onValueChange={(value: BudgetFormData['scopeType']) => setFormData({ ...formData, scopeType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="account">Account-wide</SelectItem>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="alertThresholds">Alert Thresholds (%)</Label>
                <Input
                  id="alertThresholds"
                  placeholder="e.g., 75, 90"
                  value={formData.alertThresholds}
                  onChange={(e) => setFormData({ ...formData, alertThresholds: e.target.value })}
                />
                <p className="text-sm text-gray-500 mt-1">Comma-separated percentage values</p>
              </div>
              {formData.scopeType !== 'account' && (
                <div className="col-span-2">
                  <Label htmlFor="scopeValues">Scope Values</Label>
                  <Input
                    id="scopeValues"
                    placeholder={`Enter ${formData.scopeType} names (comma-separated)`}
                    value={formData.scopeValues}
                    onChange={(e) => setFormData({ ...formData, scopeValues: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); setEditingBudget(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={editingBudget ? handleUpdateBudget : handleCreateBudget}>
                {editingBudget ? 'Update Budget' : 'Create Budget'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Alerts */}
      {budgetAlerts.filter(alert => !alert.acknowledged).length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-orange-800">Budget Alerts</CardTitle>
              </div>
              <Badge variant="outline">{budgetAlerts.filter(alert => !alert.acknowledged).length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {budgetAlerts.filter(alert => !alert.acknowledged).slice(0, 3).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-white rounded border">
                  <div>
                    <p className="text-sm font-medium">{alert.budgetName}</p>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                    <p className="text-xs text-gray-500">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                  <Badge variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'default' : 'secondary'}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.map((budget) => {
          const utilization = getBudgetUtilization(budget);
          return (
            <Card key={budget.id} className={`cursor-pointer transition-shadow hover:shadow-md ${selectedBudget?.id === budget.id ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setSelectedBudget(budget)}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{budget.name}</CardTitle>
                  <Badge variant={getBudgetStatusColor(budget.status)}>
                    {budget.status}
                  </Badge>
                </div>
                <CardDescription className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>{budget.period} • {budget.scope.type}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Spent</span>
                      <span className="font-medium">{formatCurrency(budget.spent)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Budget</span>
                      <span>{formatCurrency(budget.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full ${
                          utilization > 100 ? 'bg-red-600' :
                          utilization > 90 ? 'bg-orange-600' :
                          utilization > 75 ? 'bg-yellow-600' : 'bg-green-600'
                        }`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                      <span>{utilization.toFixed(1)}% used</span>
                      <span>{budget.forecast.daysRemaining} days left</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-1">
                      {budget.forecast.projectedSpend > budget.amount ? (
                        <TrendingUp className="h-4 w-4 text-red-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-green-600" />
                      )}
                      <span className="text-gray-600">Forecast:</span>
                    </div>
                    <span className={`font-medium ${budget.forecast.projectedSpend > budget.amount ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(budget.forecast.projectedSpend)}
                    </span>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditDialog(budget); }}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteBudget(budget.id); }}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Budget Trend Chart */}
      {selectedBudget && budgetTrendData && (
        <Card>
          <CardHeader>
            <CardTitle>Budget Trend: {selectedBudget.name}</CardTitle>
            <CardDescription>Actual spend vs budget vs forecast over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Line
                data={budgetTrendData}
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
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(selectedBudget.spent)}</p>
                <p className="text-sm text-gray-600">Current Spend</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(selectedBudget.amount)}</p>
                <p className="text-sm text-gray-600">Budget Limit</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${selectedBudget.forecast.projectedSpend > selectedBudget.amount ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(selectedBudget.forecast.projectedSpend)}
                </p>
                <p className="text-sm text-gray-600">Forecasted Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {budgets.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No budgets configured</h3>
            <p className="text-gray-600 mb-4">Create your first budget to start monitoring and controlling costs</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Budget
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BudgetManagementPanel;
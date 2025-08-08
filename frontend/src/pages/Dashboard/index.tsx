import React from 'react';
import { 
  Box, 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  Paper,
  useTheme 
} from '@mui/material';
import { 
  TrendingUp as TrendingUpIcon,
  AccountTree as LineageIcon,
  MonetizationOn as CostIcon,
  Security as GovernanceIcon 
} from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';

import { MetricCard } from '../../components/MetricCard';
import { LineageOverview } from '../../components/dashboard/LineageOverview';
import { CostOverview } from '../../components/dashboard/CostOverview';
import { RecentActivity } from '../../components/dashboard/RecentActivity';
import { QuickActions } from '../../components/dashboard/QuickActions';
import { SystemHealth } from '../../components/dashboard/SystemHealth';
import { useDashboardData } from '../../hooks/useDashboardData';

export const Dashboard: React.FC = () => {
  const theme = useTheme();
  const { data, isLoading, error } = useDashboardData();

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">
          Failed to load dashboard data: {error.message}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - Snowsarva</title>
        <meta name="description" content="Snowsarva data observability and cost management dashboard" />
      </Helmet>
      
      <Box p={3}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
        
        <Typography variant="subtitle1" color="textSecondary" gutterBottom>
          Monitor your data ecosystem health, costs, and lineage
        </Typography>

        <Grid container spacing={3}>
          {/* Key Metrics Row */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Total Objects"
                  value={data?.totalObjects ?? 0}
                  change={data?.objectsChange ?? 0}
                  icon={<LineageIcon />}
                  color={theme.palette.primary.main}
                  isLoading={isLoading}
                />
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Monthly Spend"
                  value={data?.monthlySpend ?? 0}
                  format="currency"
                  change={data?.spendChange ?? 0}
                  icon={<CostIcon />}
                  color={theme.palette.warning.main}
                  isLoading={isLoading}
                />
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Active Users"
                  value={data?.activeUsers ?? 0}
                  change={data?.usersChange ?? 0}
                  icon={<GovernanceIcon />}
                  color={theme.palette.success.main}
                  isLoading={isLoading}
                />
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Query Performance"
                  value={data?.avgQueryTime ?? 0}
                  format="duration"
                  change={data?.performanceChange ?? 0}
                  icon={<TrendingUpIcon />}
                  color={theme.palette.info.main}
                  isLoading={isLoading}
                />
              </Grid>
            </Grid>
          </Grid>

          {/* System Health */}
          <Grid item xs={12}>
            <SystemHealth />
          </Grid>

          {/* Main Content Row */}
          <Grid item xs={12} lg={8}>
            <Grid container spacing={3}>
              {/* Cost Overview */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Cost Overview
                    </Typography>
                    <CostOverview />
                  </CardContent>
                </Card>
              </Grid>

              {/* Lineage Overview */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Lineage Overview
                    </Typography>
                    <LineageOverview />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} lg={4}>
            <Grid container spacing={3}>
              {/* Quick Actions */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Quick Actions
                    </Typography>
                    <QuickActions />
                  </CardContent>
                </Card>
              </Grid>

              {/* Recent Activity */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Recent Activity
                    </Typography>
                    <RecentActivity />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          {/* Alerts and Notifications */}
          {data?.alerts && data.alerts.length > 0 && (
            <Grid item xs={12}>
              <Paper 
                elevation={1} 
                sx={{ 
                  p: 2, 
                  bgcolor: theme.palette.warning.light,
                  color: theme.palette.warning.contrastText 
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Active Alerts ({data.alerts.length})
                </Typography>
                {data.alerts.slice(0, 3).map((alert, index) => (
                  <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                    • {alert.message}
                  </Typography>
                ))}
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>
    </>
  );
};
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/analytics?days=${period}&compare_days=${period}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  const getTrendIcon = (change) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  if (loading || !analytics) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="text-center text-gray-500">Loading analytics...</div>
        </CardContent>
      </Card>
    );
  }

  const currentMetrics = analytics.current_state.metrics;
  const currentPeriodCount = analytics.current_period.orders_created;
  const comparePeriodCount = analytics.compare_period.orders_created;
  const newOrdersChange = calculateChange(currentPeriodCount, comparePeriodCount);

  return (
    <div className="mb-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard Analytics</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total Orders Card */}
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold text-gray-900">{currentMetrics.total}</div>
              <div className="flex items-center gap-1 mt-1">
                {getTrendIcon(totalChange)}
                <span className={`text-sm font-medium ${
                  totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {totalChange > 0 ? '+' : ''}{totalChange}%
                </span>
                <span className="text-xs text-gray-500">vs previous period</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders by Stage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Orders by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['clay', 'paint', 'fulfilled', 'canceled'].map((stage) => {
              const currentCount = currentMetrics.by_stage[stage] || 0;
              const compareCount = compareMetrics.by_stage[stage] || 0;
              const change = calculateChange(currentCount, compareCount);
              
              return (
                <div key={stage} className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-600 capitalize mb-2">{stage}</div>
                  <div className="text-2xl font-bold text-gray-900">{currentCount}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {getTrendIcon(change)}
                    <span className={`text-xs font-medium ${
                      change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {change > 0 ? '+' : ''}{change}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Orders by Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Orders by Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(currentMetrics.by_status)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 6)
              .map(([status, currentCount]) => {
                const compareCount = compareMetrics.by_status[status] || 0;
                const change = calculateChange(currentCount, compareCount);
                
                return (
                  <div key={status} className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-xs font-medium text-gray-600 capitalize mb-2 truncate" title={status}>
                      {status.replace('_', ' ')}
                    </div>
                    <div className="text-xl font-bold text-gray-900">{currentCount}</div>
                    <div className="flex items-center gap-1 mt-1">
                      {getTrendIcon(change)}
                      <span className={`text-xs font-medium ${
                        change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {change > 0 ? '+' : ''}{change}%
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

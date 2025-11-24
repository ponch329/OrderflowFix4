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

      {/* Total Orders Card - Compact Single Line */}
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Total Orders:</span>
              <span className="text-2xl font-bold text-gray-900">{currentMetrics.total}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">{currentPeriodCount} new in last {period} days</span>
              {getTrendIcon(newOrdersChange)}
              <span className={`font-medium ${
                newOrdersChange > 0 ? 'text-green-600' : newOrdersChange < 0 ? 'text-red-600' : 'text-gray-500'
              }`}>
                {newOrdersChange > 0 ? '+' : ''}{newOrdersChange}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders by Stage - Compact Single Line */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">By Stage:</span>
            <div className="flex items-center gap-6">
              {['clay', 'paint', 'fulfilled', 'canceled'].map((stage) => {
                const currentCount = currentMetrics.by_stage[stage] || 0;
                const percentage = currentMetrics.total > 0 ? ((currentCount / currentMetrics.total) * 100).toFixed(0) : 0;
                
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 capitalize">{stage}:</span>
                    <span className="text-lg font-bold text-gray-900">{currentCount}</span>
                    <span className="text-xs text-gray-400">({percentage}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders by Status - Compact Single Line */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">By Status:</span>
            <div className="flex items-center gap-6 flex-wrap">
              {Object.entries(currentMetrics.by_status)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([status, currentCount]) => {
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 capitalize truncate" title={status}>
                        {status.replace('_', ' ')}:
                      </span>
                      <span className="text-lg font-bold text-gray-900">{currentCount}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

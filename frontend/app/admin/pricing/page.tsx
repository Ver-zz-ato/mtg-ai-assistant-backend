'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface PricingMetric {
  date: string;
  page_views: number;
  upgrade_clicks: number;
  conversion_rate: number;
  new_signups: number;
  pro_conversions: number;
}

interface UserStats {
  total_users: number;
  pro_users: number;
  free_users: number;
  conversion_rate: number;
  monthly_revenue: number;
}

export default function AdminPricingPage() {
  const [metrics, setMetrics] = useState<PricingMetric[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadPricingData();
  }, [timeRange]);

  async function loadPricingData() {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/admin/pricing?timeRange=${timeRange}`, { 
        cache: 'no-store' 
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Admin access required');
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load pricing data');
      }
      
      setMetrics(data.metrics || []);
      setUserStats(data.userStats || null);

    } catch (err: any) {
      setError(err.message || 'Failed to load pricing data');
      console.error('Error loading pricing data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading pricing analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  const totalPageViews = metrics.reduce((sum, m) => sum + m.page_views, 0);
  const totalUpgradeClicks = metrics.reduce((sum, m) => sum + m.upgrade_clicks, 0);
  const avgConversionRate = metrics.length > 0 
    ? metrics.reduce((sum, m) => sum + m.conversion_rate, 0) / metrics.length 
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Admin • Pricing Analytics
          </h1>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 space-y-2">
            <div className="font-semibold text-blue-900 dark:text-blue-200">📊 ELI5: What This Page Does</div>
            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <li>• <strong>Accurate:</strong> Total users, Pro users, conversion rate, monthly revenue — from Supabase Auth</li>
              <li>• <strong>Placeholder:</strong> Daily charts (page views, upgrade clicks) are simulated — wire up PostHog for real data</li>
              <li>• 💰 <strong>Monthly Revenue:</strong> Pro users × $1.99/month</li>
              <li>• ⏱️ <strong>When to use:</strong> Monthly business reviews, pricing strategy</li>
            </ul>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="mb-6">
          <div className="flex space-x-4">
            {['7d', '30d', '90d'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Last {range}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {userStats?.total_users || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Users</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-blue-600 mb-1">
              {userStats?.pro_users || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pro Users</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {((userStats?.conversion_rate || 0) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Conversion Rate</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              ${(userStats?.monthly_revenue || 0).toFixed(0)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Monthly Revenue</div>
          </div>
        </div>

        {/* Pricing Page Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Page Views
            </h3>
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {totalPageViews}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Last {timeRange}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Upgrade Clicks
            </h3>
            <div className="text-3xl font-bold text-green-600 mb-2">
              {totalUpgradeClicks}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Last {timeRange}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Avg Click Rate
            </h3>
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {(totalPageViews > 0 ? (totalUpgradeClicks / totalPageViews * 100) : 0).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Last {timeRange}
            </div>
          </div>
        </div>

        {/* Daily Metrics Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Daily Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Page Views
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Upgrade Clicks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Click Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    New Signups
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Pro Conversions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {metrics.slice(-14).map((metric, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(metric.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {metric.page_views}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {metric.upgrade_clicks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {((metric.upgrade_clicks / metric.page_views) * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {metric.new_signups}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {metric.pro_conversions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Items */}
        <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-4">
            📊 Next Steps
          </h3>
          <ul className="space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
            <li>• Implement actual analytics tracking (PostHog events integration)</li>
            <li>• Set up conversion funnel analysis</li>
            <li>• A/B test different pricing page variations</li>
            <li>• Monitor user feedback and pricing objections</li>
            <li>• Track feature usage among Pro vs Free users</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
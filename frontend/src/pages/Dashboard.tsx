import { useQuery } from '@tanstack/react-query'
import { getStatsSummary, getStatsActivity, type ActivityData } from '../api/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useTheme } from '../contexts/ThemeContext'

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: getStatsSummary,
  })

  const { data: activity } = useQuery({
    queryKey: ['stats', 'activity'],
    queryFn: () => getStatsActivity('30d'),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Reminders"
          value={summary?.total_reminders ?? 0}
          sub={`${summary?.pending_reminders ?? 0} pending`}
        />
        <StatCard
          label="Total Memories"
          value={summary?.total_memories ?? 0}
        />
        <StatCard
          label="Total Tasks"
          value={summary?.total_tasks ?? 0}
          sub={`${summary?.active_tasks ?? 0} active`}
        />
        <StatCard
          label="Pending"
          value={summary?.pending_reminders ?? 0}
        />
        <StatCard
          label="Active Tasks"
          value={summary?.active_tasks ?? 0}
        />
      </div>

      {/* Activity chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Activity (Last 30 Days)</h2>
        {activity?.data && activity.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activity.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }}
                tickFormatter={(value: string) => {
                  const d = new Date(value + 'T00:00:00')
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
              />
              <YAxis tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1f2937' : '#fff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.375rem',
                  color: isDark ? '#f9fafb' : '#111827',
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="reminders" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="memories" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="tasks" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-12">No activity data yet</p>
        )}
      </div>
    </div>
  )
}

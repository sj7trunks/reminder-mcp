import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAdminUsers, updateAdminUser, getCurrentUser, downloadBackup, restoreBackup, type AdminUser } from '../api/client'
import { format } from 'date-fns'

export default function Admin() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoreResult, setRestoreResult] = useState<Record<string, number> | null>(null)

  const { data: currentUser } = useQuery({
    queryKey: ['user'],
    queryFn: getCurrentUser,
  })

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: getAdminUsers,
  })

  const toggleAdmin = useMutation({
    mutationFn: ({ id, is_admin }: { id: string; is_admin: boolean }) =>
      updateAdminUser(id, { is_admin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const backup = useMutation({
    mutationFn: downloadBackup,
  })

  const restore = useMutation({
    mutationFn: restoreBackup,
    onSuccess: (data) => {
      setRestoreResult(data.stats)
      queryClient.invalidateQueries()
    },
  })

  const handleRestoreClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json.gz') && !file.name.endsWith('.gz')) {
      alert('Please select a .json.gz backup file')
      return
    }
    if (!confirm('This will replace ALL data in the database. Are you sure?')) {
      e.target.value = ''
      return
    }
    restore.mutate(file)
    e.target.value = ''
  }

  if (!currentUser?.is_admin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Admin access required</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin</h1>

      {/* Backup & Restore */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Backup & Restore
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Download a full database backup or restore from a previous backup file.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => backup.mutate()}
            disabled={backup.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {backup.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Backup
              </>
            )}
          </button>
          <button
            onClick={handleRestoreClick}
            disabled={restore.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {restore.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Restoring...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Restore from Backup
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gz,.json.gz"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {backup.isError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Backup failed: {(backup.error as Error).message}
          </p>
        )}
        {restore.isError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Restore failed: {(restore.error as Error).message}
          </p>
        )}
        {restoreResult && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
              Restore complete
            </p>
            <div className="text-xs text-green-700 dark:text-green-400 space-x-3">
              {Object.entries(restoreResult).map(([table, count]) => (
                <span key={table}>{table}: {count}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Users table */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Reminders
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Memories
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Tasks
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Admin
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users?.map((user: AdminUser) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</p>
                      {user.name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {user.reminder_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {user.memory_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {user.task_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAdmin.mutate({ id: user.id, is_admin: !user.is_admin })}
                      disabled={user.id === currentUser.id || toggleAdmin.isPending}
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium transition-colors ${
                        user.is_admin
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      } ${user.id === currentUser.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                    >
                      {user.is_admin ? 'Admin' : 'User'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

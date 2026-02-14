import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiKeys, createApiKey, deleteApiKey, type ApiKey } from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { format } from 'date-fns'

export default function Settings() {
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()

  const { data: keys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: getApiKeys,
  })

  const createMutation = useMutation({
    mutationFn: () => createApiKey(newKeyName || 'default'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      setCreatedKey(data.key || null)
      setNewKeyName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Theme settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Appearance</h2>
        <div className="flex items-center gap-2">
          {(['light', 'dark', 'system'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setTheme(opt)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                theme === opt
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">API Keys</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Use API keys to authenticate MCP clients (e.g., Poke). Keys are shown only once when created.
        </p>

        {/* Created key alert */}
        {createdKey && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-4 mb-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-2">
              API key created! Copy it now — it won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-green-100 dark:bg-green-900/50 px-3 py-1.5 rounded text-sm font-mono text-green-900 dark:text-green-300 break-all">
                {createdKey}
              </code>
              <button
                onClick={() => copyToClipboard(createdKey)}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Key name (optional)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Key'}
          </button>
        </div>

        {/* Key list */}
        {keys && keys.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {keys.map((key: ApiKey) => (
              <div key={key.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{key.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <code className="font-mono">{key.prefix}...</code>
                    {' '}&middot;{' '}
                    Created {format(new Date(key.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(key.id)}
                  disabled={deleteMutation.isPending}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No API keys yet</p>
        )}
      </div>
    </div>
  )
}

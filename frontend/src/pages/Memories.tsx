import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMemories,
  createMemory,
  deleteMemory,
  getMemoryScopes,
  type Memory,
  type MemoryScope,
  type MemoryScopeInfo,
} from '../api/client'
import { format } from 'date-fns'

const scopeColors: Record<string, string> = {
  personal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  team: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  application: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  global: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
        scopeColors[scope] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {scope}
    </span>
  )
}

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
  const status = memory.embedding_status ?? 'n/a'
  const scope = memory.scope ?? 'personal'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap flex-1">{memory.content}</p>
        <button
          onClick={() => onDelete(memory.id)}
          className="ml-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-sm flex-shrink-0"
        >
          Delete
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <ScopeBadge scope={scope} />
        {memory.classification && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {memory.classification}
          </span>
        )}
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            status === 'completed'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
              : status === 'failed'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                : status === 'pending'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          Embedding: {status}
        </span>
        {memory.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
          >
            {tag}
          </span>
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          Recalled {memory.recalled_count}x &middot; {format(new Date(memory.created_at), 'MMM d, yyyy')}
        </span>
      </div>
      {memory.embedding_status === 'failed' && memory.embedding_error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{memory.embedding_error}</p>
      )}
    </div>
  )
}

export default function Memories() {
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [embeddingStatusFilter, setEmbeddingStatusFilter] = useState<'pending' | 'completed' | 'failed' | ''>('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [scopeIdFilter, setScopeIdFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newScope, setNewScope] = useState<MemoryScope>('personal')
  const [newScopeId, setNewScopeId] = useState('')
  const [newClassification, setNewClassification] = useState('')
  const queryClient = useQueryClient()

  const { data: scopesData } = useQuery({
    queryKey: ['memoryScopes'],
    queryFn: getMemoryScopes,
  })

  const scopes = scopesData?.scopes ?? []
  // Scopes that have an ID (teams and applications)
  const namedScopes = scopes.filter((s) => s.id)

  const { data, isLoading } = useQuery({
    queryKey: ['memories', searchQuery, tagFilter, embeddingStatusFilter, scopeFilter, scopeIdFilter],
    queryFn: () => getMemories({
      query: searchQuery || undefined,
      tags: tagFilter || undefined,
      embedding_status: embeddingStatusFilter || undefined,
      scope: (scopeFilter as MemoryScope) || undefined,
      scope_id: scopeIdFilter || undefined,
    }),
  })

  const memories = data?.memories ?? []

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => createMemory({
      content: newContent,
      tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      scope: newScope,
      scope_id: newScopeId || undefined,
      classification: newClassification || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
      setShowCreate(false)
      setNewContent('')
      setNewTags('')
      setNewScope('personal')
      setNewScopeId('')
      setNewClassification('')
    },
  })

  // Collect all unique tags for filter suggestions
  const allTags = [...new Set(memories.flatMap((m) => m.tags))]

  // Build scope filter options from scopes data
  const handleScopeFilterChange = (value: string) => {
    if (value === '') {
      setScopeFilter('')
      setScopeIdFilter('')
    } else if (value.includes(':')) {
      const [type, id] = value.split(':')
      setScopeFilter(type)
      setScopeIdFilter(id)
    } else {
      setScopeFilter(value)
      setScopeIdFilter('')
    }
  }

  // Build create scope options
  const handleNewScopeChange = (value: string) => {
    if (value.includes(':')) {
      const [type, id] = value.split(':')
      setNewScope(type as MemoryScope)
      setNewScopeId(id)
    } else {
      setNewScope(value as MemoryScope)
      setNewScopeId('')
    }
  }

  const currentScopeValue = scopeIdFilter ? `${scopeFilter}:${scopeIdFilter}` : scopeFilter
  const currentNewScopeValue = newScopeId ? `${newScope}:${newScopeId}` : newScope

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Memories</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          New Memory
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          {createMutation.error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{createMutation.error.message}</p>
          )}
          <textarea
            placeholder="What do you want to remember?"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Tags (comma-separated, optional)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <select
              value={currentNewScopeValue}
              onChange={(e) => handleNewScopeChange(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="personal">Personal</option>
              {namedScopes.filter((s) => s.type === 'team').map((s) => (
                <option key={s.id} value={`team:${s.id}`}>Team: {s.name}</option>
              ))}
              {namedScopes.filter((s) => s.type === 'application').map((s) => (
                <option key={s.id} value={`application:${s.id}`}>App: {s.name}</option>
              ))}
              <option value="global">Global</option>
            </select>
            <select
              value={newClassification}
              onChange={(e) => setNewClassification(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">No classification</option>
              <option value="foundational">Foundational</option>
              <option value="tactical">Tactical</option>
              <option value="observational">Observational</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newContent || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search memories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
        />
        <select
          value={currentScopeValue}
          onChange={(e) => handleScopeFilterChange(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Scopes</option>
          <option value="personal">Personal</option>
          {namedScopes.filter((s) => s.type === 'team').map((s) => (
            <option key={s.id} value={`team:${s.id}`}>Team: {s.name}</option>
          ))}
          {namedScopes.filter((s) => s.type === 'application').map((s) => (
            <option key={s.id} value={`application:${s.id}`}>App: {s.name}</option>
          ))}
          <option value="global">Global</option>
        </select>
        <select
          value={embeddingStatusFilter}
          onChange={(e) => setEmbeddingStatusFilter(e.target.value as 'pending' | 'completed' | 'failed' | '')}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Embeddings</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        {allTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setTagFilter('')}
              className={`px-2 py-1 rounded text-xs font-medium ${
                !tagFilter
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? '' : tag)}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  tag === tagFilter
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : memories.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">No memories found</p>
      ) : (
        <div className="space-y-3">
          {memories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

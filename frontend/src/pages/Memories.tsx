import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMemories, createMemory, deleteMemory, type Memory } from '../api/client'
import { format } from 'date-fns'

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
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
    </div>
  )
}

export default function Memories() {
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['memories', searchQuery, tagFilter],
    queryFn: () => getMemories({
      query: searchQuery || undefined,
      tags: tagFilter || undefined,
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
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
      setShowCreate(false)
      setNewContent('')
      setNewTags('')
    },
  })

  // Collect all unique tags for filter suggestions
  const allTags = [...new Set(memories.flatMap((m) => m.tags))]

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
          <input
            type="text"
            placeholder="Tags (comma-separated, optional)"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
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

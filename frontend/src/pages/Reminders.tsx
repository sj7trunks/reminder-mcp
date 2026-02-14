import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getReminders, createReminder, updateReminder, type Reminder } from '../api/client'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns'

function ReminderItem({ reminder, onAction }: { reminder: Reminder; onAction: (id: string, action: 'complete' | 'cancel') => void }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    triggered: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{reminder.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {format(new Date(reminder.due_at), 'h:mm a')}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[reminder.status]}`}>
          {reminder.status}
        </span>
        {(reminder.status === 'pending' || reminder.status === 'triggered') && (
          <>
            <button
              onClick={() => onAction(reminder.id, 'complete')}
              className="text-green-600 hover:text-green-800 dark:text-green-400 text-xs"
            >
              Done
            </button>
            <button
              onClick={() => onAction(reminder.id, 'cancel')}
              className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Reminders() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDueAt, setNewDueAt] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const queryClient = useQueryClient()

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const { data } = useQuery({
    queryKey: ['reminders', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: () => getReminders({
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
    }),
  })

  const reminders = data?.reminders ?? []

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'complete' | 'cancel' }) =>
      updateReminder(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => createReminder({
      title: newTitle,
      description: newDescription || undefined,
      due_at: newDueAt,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      setShowCreate(false)
      setNewTitle('')
      setNewDueAt('')
      setNewDescription('')
    },
  })

  const remindersForDay = (day: Date) =>
    reminders.filter((r) => isSameDay(new Date(r.due_at), day))

  const selectedReminders = selectedDate
    ? remindersForDay(selectedDate)
    : []

  // Pad start of calendar to align to week
  const startDayOfWeek = monthStart.getDay()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reminders</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          New Reminder
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          {createMutation.error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{createMutation.error.message}</p>
          )}
          <input
            type="text"
            placeholder="Reminder title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <input
            type="text"
            placeholder='Due at (e.g. "tomorrow at 2pm", "2026-03-01T14:00:00")'
            value={newDueAt}
            onChange={(e) => setNewDueAt(e.target.value)}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newTitle || !newDueAt || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
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

      {/* Calendar grid */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            &larr;
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            &rarr;
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2 border-b border-gray-200 dark:border-gray-700">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7">
          {/* Empty cells for padding */}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`pad-${i}`} className="h-20 border-b border-r border-gray-100 dark:border-gray-700" />
          ))}

          {days.map((day) => {
            const dayReminders = remindersForDay(day)
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`h-20 border-b border-r border-gray-100 dark:border-gray-700 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className={`text-xs font-medium mb-0.5 ${
                  isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {format(day, 'd')}
                </div>
                {dayReminders.slice(0, 2).map((r) => (
                  <div
                    key={r.id}
                    className={`text-xs truncate px-1 rounded mb-0.5 ${
                      r.status === 'completed' ? 'text-green-600 dark:text-green-400 line-through' :
                      r.status === 'cancelled' ? 'text-gray-400 line-through' :
                      r.status === 'triggered' ? 'text-orange-600 dark:text-orange-400' :
                      'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {r.title}
                  </div>
                ))}
                {dayReminders.length > 2 && (
                  <div className="text-xs text-gray-400">+{dayReminders.length - 2} more</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </h3>
          {selectedReminders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No reminders for this day</p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {selectedReminders.map((r) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  onAction={(id, action) => actionMutation.mutate({ id, action })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

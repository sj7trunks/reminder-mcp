const API_BASE = '/api'

interface ApiError {
  error: string
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((data as ApiError).error || 'Request failed')
  }
  return response.json()
}

// Auth API
export interface User {
  id: string
  email: string
  name: string | null
  is_admin: boolean
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  return handleResponse(response)
}

export async function register(email: string, password: string, name?: string): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, name }),
  })
  return handleResponse(response)
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  const authentikLogoutUrl = (window as any).__AUTHENTIK_LOGOUT_URL__
  if (authentikLogoutUrl) {
    window.location.href = authentikLogoutUrl
  }
}

export async function getCurrentUser(): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

// API Keys
export interface ApiKey {
  id: string
  prefix: string
  name: string
  key?: string // only on creation
  created_at: string
}

export async function getApiKeys(): Promise<ApiKey[]> {
  const response = await fetch(`${API_BASE}/keys`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function createApiKey(name: string): Promise<ApiKey> {
  const response = await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  })
  return handleResponse(response)
}

export async function deleteApiKey(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/keys/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await handleResponse(response)
}

// Reminders
export interface Reminder {
  id: string
  title: string
  description: string | null
  due_at: string
  status: 'pending' | 'triggered' | 'completed' | 'cancelled'
  created_at: string
}

export async function getReminders(params?: {
  status?: string
  start?: string
  end?: string
  limit?: number
}): Promise<{ reminders: Reminder[] }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.start) searchParams.set('start', params.start)
  if (params?.end) searchParams.set('end', params.end)
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const response = await fetch(`${API_BASE}/reminders?${searchParams}`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function createReminder(data: {
  title: string
  description?: string
  due_at: string
  timezone?: string
}): Promise<{ success: boolean; reminder?: Reminder; error?: string }> {
  const response = await fetch(`${API_BASE}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(response)
}

export async function updateReminder(id: string, action: 'complete' | 'cancel'): Promise<void> {
  const response = await fetch(`${API_BASE}/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action }),
  })
  await handleResponse(response)
}

// Memories
export interface Memory {
  id: string
  content: string
  tags: string[]
  recalled_count: number
  embedding_status?: 'pending' | 'completed' | 'failed' | null
  embedding_model?: string | null
  embedding_error?: string | null
  created_at: string
}

export async function getMemories(params?: {
  query?: string
  tags?: string
  embedding_status?: 'pending' | 'completed' | 'failed'
  limit?: number
}): Promise<{ memories: Memory[] }> {
  const searchParams = new URLSearchParams()
  if (params?.query) searchParams.set('query', params.query)
  if (params?.tags) searchParams.set('tags', params.tags)
  if (params?.embedding_status) searchParams.set('embedding_status', params.embedding_status)
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const response = await fetch(`${API_BASE}/memories?${searchParams}`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function createMemory(data: {
  content: string
  tags?: string[]
}): Promise<{ success: boolean; memory?: Memory; error?: string }> {
  const response = await fetch(`${API_BASE}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(response)
}

export async function deleteMemory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/memories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await handleResponse(response)
}

// Tasks
export interface Task {
  id: string
  title: string
  command: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  check_interval_ms: number
  created_at: string
  completed_at: string | null
}

export async function getTasks(params?: {
  status?: string
  limit?: number
}): Promise<{ tasks: Task[] }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const response = await fetch(`${API_BASE}/tasks?${searchParams}`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function createTask(data: {
  title: string
  command?: string
}): Promise<{ success: boolean; task?: Task; error?: string }> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(response)
}

export async function updateTask(id: string, data: {
  action?: 'complete'
  status?: string
  notes?: string
}): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  await handleResponse(response)
}

// Stats
export interface StatsSummary {
  total_reminders: number
  total_memories: number
  total_tasks: number
  pending_reminders: number
  active_tasks: number
}

export interface ActivityData {
  date: string
  reminders: number
  memories: number
  tasks: number
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const response = await fetch(`${API_BASE}/stats/summary`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function getStatsActivity(range = '30d'): Promise<{ data: ActivityData[] }> {
  const response = await fetch(`${API_BASE}/stats/activity?range=${range}`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

// Admin
export interface AdminUser {
  id: string
  email: string
  name: string | null
  is_admin: boolean
  created_at: string
  reminder_count: number
  memory_count: number
  task_count: number
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await fetch(`${API_BASE}/admin/users`, {
    credentials: 'include',
  })
  return handleResponse(response)
}

export async function updateAdminUser(id: string, data: { is_admin: boolean }): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  await handleResponse(response)
}

// Backup & Restore
export async function downloadBackup(): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/backup`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Backup failed' }))
    throw new Error((data as ApiError).error || 'Backup failed')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="(.+)"/)
  const filename = match?.[1] || 'reminder-mcp-backup.json.gz'

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export interface RestoreStats {
  success: boolean
  stats: Record<string, number>
}

export async function restoreBackup(file: File): Promise<RestoreStats> {
  const response = await fetch(`${API_BASE}/admin/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/gzip' },
    credentials: 'include',
    body: file,
  })
  return handleResponse(response)
}

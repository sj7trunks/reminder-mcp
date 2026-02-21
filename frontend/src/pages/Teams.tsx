import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTeams,
  createTeam,
  getTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  type Team,
  type TeamDetail,
} from '../api/client'
import { format } from 'date-fns'

function TeamDetailView({
  teamId,
  onBack,
}: {
  teamId: string
  onBack: () => void
}) {
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'member' | 'admin'>('member')
  const queryClient = useQueryClient()

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId),
  })

  const addMemberMutation = useMutation({
    mutationFn: () => addTeamMember(teamId, addEmail, addRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] })
      setAddEmail('')
      setAddRole('member')
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateTeamMemberRole(teamId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      onBack()
    },
  })

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    )
  }

  if (!team) return null

  const isAdmin = team.my_role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Back
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{team.name}</h2>
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            {team.my_role}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              if (confirm('Delete this team? This cannot be undone.')) {
                deleteMutation.mutate()
              }
            }}
            className="px-3 py-1.5 text-red-600 hover:text-red-800 dark:text-red-400 text-sm"
          >
            Delete Team
          </button>
        )}
      </div>

      {/* Add member form (admin only) */}
      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Member</h3>
          {addMemberMutation.error && (
            <p className="text-red-600 dark:text-red-400 text-sm mb-2">
              {addMemberMutation.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Email address"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as 'member' | 'admin')}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => addMemberMutation.mutate()}
              disabled={!addEmail || addMemberMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Member list */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Members ({team.members?.length || 0})
          </h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {team.members?.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {member.name || member.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {member.email} &middot; Joined{' '}
                  {format(new Date(member.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        userId: member.id,
                        role: e.target.value,
                      })
                    }
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {member.role}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => removeMemberMutation.mutate(member.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Teams() {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
  })

  const createMutation = useMutation({
    mutationFn: () => createTeam(newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setShowCreate(false)
      setNewName('')
    },
  })

  if (selectedTeamId) {
    return (
      <TeamDetailView
        teamId={selectedTeamId}
        onBack={() => setSelectedTeamId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          New Team
        </button>
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          {createMutation.error && (
            <p className="text-red-600 dark:text-red-400 text-sm">
              {createMutation.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Team name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
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

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : !teams || teams.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">
          No teams yet. Create one to share memories across team members.
        </p>
      ) : (
        <div className="space-y-3">
          {teams.map((team: Team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className="w-full text-left bg-white dark:bg-gray-800 rounded-lg shadow p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {team.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created {format(new Date(team.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    team.my_role === 'admin'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {team.my_role}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

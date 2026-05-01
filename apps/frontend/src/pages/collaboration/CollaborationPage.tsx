import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import { usePermissions } from '@/hooks/usePermissions'
import type { ProjectMember, User } from '@/types'
import { Badge, Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

const ROLE_LABEL_KEYS: Record<string, string> = {
  owner: 'pages.collaboration.roles.owner',
  director: 'pages.collaboration.roles.director',
  writer: 'pages.collaboration.roles.writer',
  generator: 'pages.collaboration.roles.generator',
  viewer: 'pages.collaboration.roles.viewer',
}

function ManagementTab({
  members,
  users,
  canManageMembers,
  projectId,
}: {
  members: ProjectMember[]
  users: User[]
  canManageMembers: boolean
  projectId?: number
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedUser, setSelectedUser] = useState('')
  const [role, setRole] = useState('viewer')

  const addMember = useMutation({
    mutationFn: (m: { user_id: number; role: string }) =>
      api.post(`/projects/${projectId}/members`, m).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.delete(`/projects/${projectId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('pages.collaboration.teamMembers')}</h2>
      {canManageMembers && (
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">{t('pages.collaboration.selectUser')}</option>
            {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="director">{t('pages.collaboration.roles.director')}</option>
            <option value="writer">{t('pages.collaboration.roles.writer')}</option>
            <option value="generator">{t('pages.collaboration.roles.generator')}</option>
            <option value="viewer">{t('pages.collaboration.roles.viewer')}</option>
          </select>
          <Button
            onClick={() => {
              if (!selectedUser) return
              addMember.mutate({ user_id: Number(selectedUser), role })
              setSelectedUser('')
            }}
            className="gap-1"
          >
            <Plus size={14} /> {t('pages.collaboration.add')}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.ID} className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {m.user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.user?.username}</p>
            </div>
            <Badge className="bg-muted text-muted-foreground">
              {ROLE_LABEL_KEYS[m.role] ? t(ROLE_LABEL_KEYS[m.role]) : m.role}
            </Badge>
            {canManageMembers && m.role !== 'owner' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember.mutate(m.ID)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={t('pages.collaboration.remove')}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-muted-foreground">{t('pages.collaboration.noMembers')}</p>}
      </div>
    </div>
  )
}

export default function CollaborationPage() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data: projectDetail } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  })

  const members: ProjectMember[] = projectDetail?.members ?? []
  const { canManageMembers } = usePermissions(members)

  return (
    <div className="max-w-4xl">
      <ManagementTab
        members={members}
        users={users}
        canManageMembers={canManageMembers}
        projectId={projectId}
      />
    </div>
  )
}

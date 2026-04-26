import { useUserStore } from '@/store/userStore'
import { useProjectStore } from '@/store/projectStore'
import type { ProjectMember } from '@/types'

export function usePermissions(members?: ProjectMember[]) {
  const user = useUserStore((s) => s.currentUser)
  const project = useProjectStore((s) => s.current)

  const isSuperAdmin = user?.system_role === 'super_admin'

  const projectRole = members?.find((m) => m.user_id === user?.ID)?.role
    ?? (project?.owner_id === user?.ID ? 'owner' : undefined)

  const isProjectOwner = projectRole === 'owner'
  const isDirector = projectRole === 'director'
  const canManageMembers = isSuperAdmin || isProjectOwner

  return { isSuperAdmin, projectRole, isProjectOwner, isDirector, canManageMembers }
}

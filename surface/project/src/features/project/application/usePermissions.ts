import type { ProjectMember } from '@movscript/shared'
import { useSurfaceHostState } from './surfaceHostStateHooks'

export function usePermissions(members?: ProjectMember[]) {
  const user = useSurfaceHostState((state) => state.currentUser)
  const project = useSurfaceHostState((state) => state.currentProject)

  const isSuperAdmin = user?.system_role === 'super_admin'

  const projectRole = members?.find((m) => m.user_id === user?.ID)?.role
    ?? (project?.owner_id === user?.ID ? 'owner' : undefined)

  const isProjectOwner = projectRole === 'owner'
  const isDirector = projectRole === 'director'
  const canManageMembers = isSuperAdmin || isProjectOwner

  return { isSuperAdmin, projectRole, isProjectOwner, isDirector, canManageMembers }
}

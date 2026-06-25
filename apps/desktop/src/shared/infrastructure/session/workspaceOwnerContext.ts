import type { OrgMembership, User } from '@/types'
import type { ElectronMovScriptWorkspaceFileRepositoryContext } from '@/shared/infrastructure/workspaceDomainRepository'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'

export type WorkspaceOwnerContext = Pick<ElectronMovScriptWorkspaceFileRepositoryContext, 'userId' | 'orgId'>

export function workspaceOwnerContext(input: {
  currentUser?: User | null
  currentOrgID?: number | null
  orgMemberships?: OrgMembership[]
}): WorkspaceOwnerContext {
  const userId = input.currentUser?.ID
  if (userId === undefined) return {}
  const orgId = input.currentOrgID
  const currentMembership = input.orgMemberships?.find((membership) => membership.org_id === orgId)
  if (orgId !== undefined && orgId !== null && currentMembership?.is_personal === false) {
    return { orgId }
  }
  return { userId }
}

export function currentWorkspaceOwnerContext(): WorkspaceOwnerContext {
  const { currentUser, currentOrgID, orgMemberships } = useUserStore.getState()
  return workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
}

export function currentWorkspaceProjectDir(): string | undefined {
  const { current, workspaceRoot } = useProjectStore.getState()
  return workspaceRoot?.trim()
    || current?.workspace_path?.trim()
    || current?.project_path?.trim()
    || undefined
}

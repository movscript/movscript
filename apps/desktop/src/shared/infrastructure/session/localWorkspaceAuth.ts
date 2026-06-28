import { isLocalDataConnection } from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import {
  LOCAL_WORKSPACE_ORG,
  LOCAL_WORKSPACE_USER,
  type AuthSession,
  useUserStore,
} from './userStore'

let localWorkspaceAuthPromise: Promise<AuthSession> | null = null

export function ensureLocalWorkspaceAuthSession(options: {
  requireActiveLocalMode?: boolean
} = {}): Promise<AuthSession> {
  if (!localWorkspaceAuthPromise) {
    localWorkspaceAuthPromise = ensureLocalWorkspaceAuthSessionOnce(options).finally(() => {
      localWorkspaceAuthPromise = null
    })
  }
  return localWorkspaceAuthPromise
}

async function ensureLocalWorkspaceAuthSessionOnce(options: {
  requireActiveLocalMode?: boolean
}): Promise<AuthSession> {
  if (options.requireActiveLocalMode !== false) {
    const latestSettings = useAppSettingsStore.getState().settings
    if (!latestSettings.onboardingCompleted || !isLocalDataConnection(latestSettings)) {
      throw new Error('Local workspace mode is no longer active.')
    }
  }

  const userStore = useUserStore.getState()
  userStore.setLocalWorkspaceSession()
  return {
    user: LOCAL_WORKSPACE_USER,
    org_memberships: [LOCAL_WORKSPACE_ORG],
  }
}

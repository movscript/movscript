import { api } from '@/shared/infrastructure/api'
import {
  getLocalAPIBaseURL,
  getRuntimeConfigSnapshot,
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  type AppSettings,
} from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import {
  LOCAL_WORKSPACE_ORG,
  LOCAL_WORKSPACE_REALM_KEY,
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
  const userStore = useUserStore.getState()
  userStore.setActiveRealm(LOCAL_WORKSPACE_REALM_KEY)
  const settings = useAppSettingsStore.getState().settings

  const response = await api.post('/auth/local-session', {
    displayName: 'Local Workspace',
  }, {
    baseURL: `${localAuthAPIBaseURL(settings)}/api/v1`,
  }).catch((error) => {
    if (isNotFoundResponse(error)) {
      throw new Error('本地后端版本过旧，请重启本地后端后重试。')
    }
    throw error
  })
  const session = response.data as AuthSession

  if (options.requireActiveLocalMode !== false) {
    const latestSettings = useAppSettingsStore.getState().settings
    if (!latestSettings.onboardingCompleted || !isLocalLaunchMode(latestSettings)) {
      throw new Error('Local workspace mode is no longer active.')
    }
  }

  userStore.setSession(session)
  if (!session.org_memberships?.length) {
    useUserStore.getState().setOrgMemberships([LOCAL_WORKSPACE_ORG], LOCAL_WORKSPACE_ORG.org_id)
  }
  return session
}

function localAuthAPIBaseURL(settings: AppSettings): string {
  const runtimeConfig = getRuntimeConfigSnapshot()
  const configuredLocalURL = runtimeConfig?.localAPIBaseURL
    || settings.localAPIBaseURL
    || (isLocalLaunchMode(settings) ? settings.apiBaseURL : '')
    || getLocalAPIBaseURL()
  return normalizeAPIBaseURL(configuredLocalURL)
}

function isNotFoundResponse(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'response' in error
    && (error as { response?: { status?: number } }).response?.status === 404,
  )
}

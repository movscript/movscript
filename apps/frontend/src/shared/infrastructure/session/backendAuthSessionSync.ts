import { getAPIBaseURL } from '@/shared/infrastructure/config'

export interface BackendAuthSessionSyncInput {
  token?: string | null
  expires_at?: string | null
  user?: {
    id?: string | number
    ID?: string | number
    username?: string
    displayName?: string
    display_name?: string
    primaryEmail?: string
    primary_email?: string
    locale?: string
    systemRole?: string
    system_role?: string
  } | null
  git_credential?: {
    provider: 'gitea'
    username: string
    token?: string
    maskedToken?: string
    masked_token?: string
    status?: string
    lastError?: string
    last_error?: string
  } | null
}

export async function syncElectronBackendAuthSession(session: BackendAuthSessionSyncInput | null): Promise<void> {
  const setBackendAuthSession = globalThis.window?.api?.setBackendAuthSession
  if (!setBackendAuthSession) return
  if (!session?.token) {
    await setBackendAuthSession(null)
    return
  }
  await setBackendAuthSession({
    baseURL: getAPIBaseURL(),
    token: session.token,
    expiresAt: session.expires_at,
    user: session.user,
    gitCredential: session.git_credential,
  })
}

export async function handleElectronBackendAuthExpired(): Promise<void> {
  const handleBackendAuthExpired = globalThis.window?.api?.handleBackendAuthExpired
  if (!handleBackendAuthExpired) return
  await handleBackendAuthExpired()
}

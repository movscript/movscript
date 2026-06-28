import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { getAPIBaseURL, getSettingsDaemonGatewayBaseURL, isLocalDataConnection } from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { LOCAL_WORKSPACE_ORG, LOCAL_WORKSPACE_USER, useUserStore } from '@/shared/infrastructure/session/userStore'
import i18n from '@/i18n'
import type { ElectronAdminAuthSessionInput } from '@/shared/contracts/electronApi'

const MOVSCRIPT_THEME_STORAGE_KEY = 'movscript-theme'

export function adminConsoleURL(baseURL: string, path = ''): string {
  const normalizedBaseURL = normalizeAdminConsoleBaseURL(baseURL)
  const normalizedPath = normalizeAdminConsolePath(path)
  const url = new URL(`${normalizedBaseURL}/admin${normalizedPath}`)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Admin console URL must use http or https')
  }
  return url.toString()
}

export function canOpenAdminConsole(): boolean {
  return useUserStore.getState().currentUser?.system_role === 'super_admin'
}

export async function openAdminConsole(baseURL?: string, path = ''): Promise<void> {
  if (!canOpenAdminConsole()) return
  const electronApi = readElectronApi()
  const state = useUserStore.getState()
  const settings = useAppSettingsStore.getState().settings
  const localMode = isLocalDataConnection(settings)
  const adminBaseURL = baseURL ?? (localMode ? getSettingsDaemonGatewayBaseURL(settings) : getAPIBaseURL())
  const language = resolveAdminLanguage()
  const theme = resolveAdminTheme()
  const authSession = createAdminConsoleAuthSession({
    apiBaseURL: adminBaseURL,
    language,
    localMode,
    state,
    theme,
  })
  if (electronApi?.openAdminConsole) {
    await electronApi.openAdminConsole({
      baseURL: adminBaseURL,
      path,
      authSession,
    })
    return
  }
  window.open(adminConsoleURLWithAuth(adminBaseURL, path, authSession), '_blank', 'noopener,noreferrer')
}

function createAdminConsoleAuthSession(input: {
  apiBaseURL: string
  language: 'zh-CN' | 'en-US'
  localMode: boolean
  state: ReturnType<typeof useUserStore.getState>
  theme: 'light' | 'dark'
}): ElectronAdminAuthSessionInput | null {
  if (input.localMode) {
    return {
      user: LOCAL_WORKSPACE_USER,
      org_memberships: [LOCAL_WORKSPACE_ORG],
      current_org_id: LOCAL_WORKSPACE_ORG.org_id,
      api_base_url: input.apiBaseURL,
      theme: input.theme,
      language: input.language,
    }
  }
  if (!input.state.token || !input.state.currentUser) return null
  return {
    token: input.state.token,
    expires_at: input.state.tokenExpiresAt,
    user: input.state.currentUser,
    org_memberships: input.state.orgMemberships,
    current_org_id: input.state.currentOrgID,
    api_base_url: input.apiBaseURL,
    theme: input.theme,
    language: input.language,
  }
}

function adminConsoleURLWithAuth(baseURL: string, path: string, authSession: ElectronAdminAuthSessionInput | null): string {
  const url = new URL(adminConsoleURL(baseURL, path))
  if (authSession?.user) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    hash.set('authSession', encodeAdminAuthSession(authSession))
    url.hash = hash.toString()
  }
  return url.toString()
}

function encodeAdminAuthSession(session: ElectronAdminAuthSessionInput): string {
  const json = JSON.stringify(session)
  const binary = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function resolveAdminLanguage(): 'zh-CN' | 'en-US' {
  const language = i18n.resolvedLanguage || i18n.language
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function resolveAdminTheme(): 'light' | 'dark' {
  return readBrowserStorageItem('local', MOVSCRIPT_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

function normalizeAdminConsolePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed === 'admin') return ''
  const withoutAdminPrefix = trimmed.startsWith('admin/') ? trimmed.slice('admin/'.length) : trimmed
  return `/${withoutAdminPrefix}`
}

function normalizeAdminConsoleBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}

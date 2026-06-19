import { resolveAdminConsoleURL } from '@movscript/core/backend'
import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import i18n from '@/i18n'

const MOVSCRIPT_THEME_STORAGE_KEY = 'movscript-theme'

export function adminConsoleURL(baseURL: string, path = ''): string {
  return resolveAdminConsoleURL({ baseURL, path })
}

export function canOpenAdminConsole(): boolean {
  return useUserStore.getState().currentUser?.system_role === 'super_admin'
}

export async function openAdminConsole(baseURL = getAPIBaseURL(), path = ''): Promise<void> {
  if (!canOpenAdminConsole()) return
  const electronApi = readElectronApi()
  const state = useUserStore.getState()
  const language = resolveAdminLanguage()
  const theme = resolveAdminTheme()
  if (electronApi?.openAdminConsole) {
    await electronApi.openAdminConsole({
      baseURL,
      path,
      authSession: state.token && state.currentUser
        ? {
            token: state.token,
            expires_at: state.tokenExpiresAt,
            user: state.currentUser,
            org_memberships: state.orgMemberships,
            current_org_id: state.currentOrgID,
            api_base_url: baseURL,
            theme,
            language,
          }
        : null,
    })
    return
  }
  window.open(adminConsoleURL(baseURL, path), '_blank', 'noopener,noreferrer')
}

function resolveAdminLanguage(): 'zh-CN' | 'en-US' {
  const language = i18n.resolvedLanguage || i18n.language
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function resolveAdminTheme(): 'light' | 'dark' {
  return readBrowserStorageItem('local', MOVSCRIPT_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

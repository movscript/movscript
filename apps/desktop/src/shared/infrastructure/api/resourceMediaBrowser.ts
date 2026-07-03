import { resourceAuthCacheScopeKey } from '@movscript/core/resources'
import { configureResourceMediaBrowser } from '@movscript/resource-surface/resource-media'
import { getDaemonGatewayBaseURL } from '@/shared/infrastructure/config'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

configureResourceMediaBrowser({
  gatewayBaseURL: getDaemonGatewayBaseURL,
  authCacheScope: () => {
    const { currentUser, currentOrgID, token } = useUserStore.getState()
    return resourceAuthCacheScopeKey({
      userId: currentUser?.ID,
      orgId: currentOrgID,
      token,
    })
  },
  mediaAuthHeaders: () => {
    const { currentOrgID, token } = useUserStore.getState()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (currentOrgID) headers['X-Org-ID'] = String(currentOrgID)
    return Object.keys(headers).length ? headers : undefined
  },
})

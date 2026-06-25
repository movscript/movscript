import axios from 'axios'
import { configureSurfaceHttpClients } from '@movscript/shared/surface-http'
import '../application/appEvents'
import './api/generationJobs'
import './api/hostState'
import './api/routes'
import './api/semanticEntities'
import './api/workspaceArtifacts'
import './api/workspaceCandidates'
import './api/workspaceDomain'
import './api/resourceMediaBrowser'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { toast } from '@movscript/ui/toast'
import {
  getAPIV1BaseURL,
  getCanvasServiceV1BaseURL,
  getRuntimeConfigSnapshot,
  refreshRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'
import { translateApiError, type APIErrorBody } from '@/shared/infrastructure/apiError'
import { isBackendBootError, waitForLocalBackendReady } from '@/shared/infrastructure/backendBoot'
import { publishApiRedirect } from '@/shared/application/navigationEvents'
import { handleElectronBackendAuthExpired } from '@/shared/infrastructure/session/backendAuthSessionSync'

export const api = axios.create({
  baseURL: getAPIV1BaseURL()
})

export const canvasApi = axios.create({
  baseURL: getCanvasServiceV1BaseURL()
})

let agentBrowserAPIV1BaseURL: string | null = null
let runtimeConfigRefreshPromise: Promise<unknown> | null = null
let runtimeConfigRefreshedAt = 0
const RUNTIME_CONFIG_REFRESH_TTL_MS = 1_000

export function setAgentBrowserAPIV1BaseURL(baseURL: string | null | undefined): void {
  agentBrowserAPIV1BaseURL = baseURL?.trim() || null
}

async function applyAuthenticatedRequestConfig(config: any) {
  await refreshRuntimeConfigSnapshotIfStale()
  await waitForLocalBackendReady()
  const { token, currentOrgID } = useUserStore.getState()
  if (agentBrowserAPIV1BaseURL) {
    config.baseURL = agentBrowserAPIV1BaseURL
  }
  if (config.baseURL === undefined || config.baseURL === api.defaults.baseURL) {
    config.baseURL = getAPIV1BaseURL()
  }
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (currentOrgID) {
    config.headers['X-Org-ID'] = String(currentOrgID)
  }
  return config
}

async function applyCanvasAuthenticatedRequestConfig(config: any) {
  await refreshRuntimeConfigSnapshotIfStale()
  await waitForLocalBackendReady()
  const { token, currentOrgID } = useUserStore.getState()
  if (config.baseURL === undefined || config.baseURL === canvasApi.defaults.baseURL) {
    config.baseURL = getCanvasServiceV1BaseURL()
  }
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (currentOrgID) {
    config.headers['X-Org-ID'] = String(currentOrgID)
  }
  return config
}

async function refreshRuntimeConfigSnapshotIfStale() {
  if (agentBrowserAPIV1BaseURL) return
  const now = Date.now()
  if (getRuntimeConfigSnapshot() && now - runtimeConfigRefreshedAt < RUNTIME_CONFIG_REFRESH_TTL_MS) return
  if (!runtimeConfigRefreshPromise) {
    runtimeConfigRefreshPromise = refreshRuntimeConfigSnapshot()
      .then((snapshot) => {
        if (snapshot) runtimeConfigRefreshedAt = Date.now()
        return snapshot
      })
      .finally(() => {
        runtimeConfigRefreshPromise = null
      })
  }
  await runtimeConfigRefreshPromise
}

function handleAPIResponseError(err: any) {
    if (isBackendBootError(err)) {
      if (toast.isDebug()) {
        toast.error(err.message)
      }
      return Promise.reject(err)
    }

    // Blob requests (resource thumbnails etc.) don't show user-facing toasts.
    // In debug mode, log the error to console so it's visible in devtools.
    if (err.config?.responseType === 'blob') {
      if (toast.isDebug()) {
        console.error('[blob fetch]', err.config?.url, err.response?.status ?? 'network error', err.message)
      }
      return Promise.reject(err)
    }

    const body: APIErrorBody = err.response?.data ?? {}
    const message = translateApiError(body)
    const action  = body.action ?? ''

    // Build debug detail when debug mode is on
    let detail: string | undefined
    if (toast.isDebug()) {
      const status = err.response?.status ?? 'network error'
      const url = err.config?.url ?? ''
      const method = (err.config?.method ?? 'GET').toUpperCase()
      const rawBody = typeof err.response?.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response?.data ?? {}, null, 2)
      detail = `${method} ${url}\nHTTP ${status}\n\n${rawBody}`
    }

    if (err.response?.status !== 401 || action !== 'logout') {
      toast.error(message, detail)
    }

    if (action === 'logout') {
      useUserStore.getState().setCurrentUser(null)
      void handleElectronBackendAuthExpired()
    } else if (action === 'redirect_projects') {
      publishApiRedirect('/projects')
    }

    return Promise.reject(err)
}

api.interceptors.request.use(applyAuthenticatedRequestConfig)
canvasApi.interceptors.request.use(applyCanvasAuthenticatedRequestConfig)

api.interceptors.response.use((res) => res, handleAPIResponseError)
canvasApi.interceptors.response.use((res) => res, handleAPIResponseError)

configureSurfaceHttpClients({
  data: api,
  canvas: canvasApi,
})

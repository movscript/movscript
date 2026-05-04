import axios from 'axios'
import { useUserStore } from '@/store/userStore'
import { toast } from '@/store/toastStore'
import { getAPIV1BaseURL } from '@/lib/config'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'

export const api = axios.create({
  baseURL: getAPIV1BaseURL()
})

api.interceptors.request.use((config) => {
  const { token, currentOrgID } = useUserStore.getState()
  config.baseURL = getAPIV1BaseURL()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
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
    } else if (action === 'redirect_projects') {
      window.dispatchEvent(new CustomEvent('api:redirect', { detail: '/projects' }))
    }

    return Promise.reject(err)
  }
)

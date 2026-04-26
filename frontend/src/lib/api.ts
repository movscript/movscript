import axios from 'axios'
import { useUserStore } from '@/store/userStore'
import { toast } from '@/store/toastStore'

export const api = axios.create({
  baseURL: 'http://localhost:8765/api/v1'
})

api.interceptors.request.use((config) => {
  const user = useUserStore.getState().currentUser
  if (user) {
    config.headers['X-User-ID'] = String(user.ID)
  }
  return config
})

// Structured error body from the backend (new apierr format).
interface APIErrorBody {
  code?: string
  message?: string
  error?: string   // legacy format: {"error": "..."}
  action?: string  // "logout" | "redirect_projects" | "retry" | ""
}

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
    const message = body.message ?? body.error ?? '请求失败，请稍后重试'
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

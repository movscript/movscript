import axios from 'axios'
import { useUserStore } from '@/store/userStore'
import { toast } from '@/store/toastStore'
import { getAPIV1BaseURL } from '@/lib/config'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'

export const api = axios.create({
  baseURL: getAPIV1BaseURL(),
})

api.interceptors.request.use((config) => {
  const { token, currentOrgID } = useUserStore.getState()
  config.baseURL = getAPIV1BaseURL()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (currentOrgID) {
    config.headers['X-Org-ID'] = String(currentOrgID)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const body: APIErrorBody = error.response?.data ?? {}
    const message = translateApiError(body)
    const action = body.action ?? ''

    let detail: string | undefined
    if (toast.isDebug()) {
      const status = error.response?.status ?? 'network error'
      const url = error.config?.url ?? ''
      const method = (error.config?.method ?? 'GET').toUpperCase()
      const rawBody = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {}, null, 2)
      detail = `${method} ${url}\nHTTP ${status}\n\n${rawBody}`
    }

    if (error.response?.status !== 401 || action !== 'logout') {
      toast.error(message, detail)
    }

    if (action === 'logout') {
      useUserStore.getState().setCurrentUser(null)
    }

    return Promise.reject(error)
  },
)

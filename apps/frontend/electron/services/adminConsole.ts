import { LOCAL_BACKEND_URL } from './backend/constants'
import {
  normalizeAdminConsolePath,
  resolveAdminConsoleURL as resolveCoreAdminConsoleURL,
} from '@movscript/core/backend'

export { normalizeAdminConsolePath }

export function resolveAdminConsoleURL(input?: { baseURL?: string; path?: string }): string {
  return resolveCoreAdminConsoleURL({
    baseURL: input?.baseURL?.trim() || LOCAL_BACKEND_URL,
    path: input?.path,
  })
}

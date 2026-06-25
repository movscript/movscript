import { LOCAL_BACKEND_URL } from './backend/constants'
import type { ElectronAdminAuthSessionInput } from '../../src/shared/contracts/electronApi'

export const ELECTRON_ADMIN_ORIGIN = 'movscript-admin://app'
export const DEFAULT_ADMIN_DEV_RENDERER_URL = 'http://127.0.0.1:5174'

export function readAdminRendererURLFromEnv(): string {
  return process.env.ELECTRON_ADMIN_URL?.trim()
    || process.env.MOVSCRIPT_ADMIN_RENDERER_URL?.trim()
    || ''
}

export function resolveAdminConsoleURL(
  input?: { baseURL?: string; path?: string; authSession?: ElectronAdminAuthSessionInput | null },
  options?: { rendererURL?: string },
): string {
  const apiBaseURL = resolveAdminAPIBaseURL(input?.baseURL)
  const normalizedPath = normalizeAdminConsolePath(input?.path ?? '') || '/'
  const baseURL = options?.rendererURL?.trim() || ELECTRON_ADMIN_ORIGIN
  const url = new URL(normalizedPath, baseURL.endsWith('/') ? baseURL : `${baseURL}/`)
  url.searchParams.set('apiBaseURL', apiBaseURL)
  if (input?.authSession?.user) {
    const hash = new URLSearchParams()
    hash.set('authSession', encodeAdminAuthSession(input.authSession))
    url.hash = hash.toString()
  }
  return url.toString()
}

export function resolveAdminAPIBaseURL(baseURL?: string): string {
  const normalized = normalizeAdminConsoleBaseURL(baseURL?.trim() || LOCAL_BACKEND_URL)
  const url = new URL(normalized)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Admin API base URL must use http or https')
  }
  return url.toString().replace(/\/$/, '')
}

function encodeAdminAuthSession(session: ElectronAdminAuthSessionInput): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
}

export function normalizeAdminConsolePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed === 'admin') return ''
  const withoutAdminPrefix = trimmed.startsWith('admin/') ? trimmed.slice('admin/'.length) : trimmed
  return `/${withoutAdminPrefix}`
}

function normalizeAdminConsoleBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}

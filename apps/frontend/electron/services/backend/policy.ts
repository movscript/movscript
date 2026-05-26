import type { BackendLaunchPolicy } from './types'

export function getBackendLaunchPolicy(): BackendLaunchPolicy {
  const raw = process.env.MOVSCRIPT_BACKEND_POLICY?.trim()
  if (raw === 'external' || raw === 'spawn' || raw === 'cloud') return raw
  return process.env.NODE_ENV === 'development' ? 'external' : 'cloud'
}

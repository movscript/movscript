import type { BackendLaunchPolicy } from './types'

export function getBackendLaunchPolicy(env: NodeJS.ProcessEnv = process.env): BackendLaunchPolicy {
  const value = env.MOVSCRIPT_BACKEND_LAUNCH_POLICY?.trim().toLowerCase()
    ?? env.MOVSCRIPT_LOCAL_BACKEND_POLICY?.trim().toLowerCase()
  if (value === 'external' || value === 'disabled' || value === 'spawn') return value
  if (env.MOVSCRIPT_DISABLE_LOCAL_BACKEND === '1') return 'disabled'
  return 'spawn'
}

import type { BackendLaunchPolicy } from './types'
import {
  readMovScriptHomeConfig,
  resolveMovScriptHomeConfigPaths,
} from '@movscript/core/workspace/node'

export function getBackendLaunchPolicy(input: {
  workspaceDir?: string
} = {}): BackendLaunchPolicy {
  const raw = process.env.MOVSCRIPT_BACKEND_POLICY?.trim()
  if (raw === 'external' || raw === 'spawn' || raw === 'cloud') return raw
  const configured = readMovScriptHomeConfig(resolveMovScriptHomeConfigPaths(input.workspaceDir).configPath).startup.backendPolicy
  if (configured === 'external' || configured === 'spawn' || configured === 'cloud') return configured
  return process.env.NODE_ENV === 'development' ? 'external' : 'spawn'
}

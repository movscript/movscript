import { readMovScriptHomeConfig, resolveMovScriptHomeConfigPaths } from '@movscript/workspace/home'
import type { BackendLaunchPolicy } from './types'

export interface BackendLaunchPolicyOptions {
  env?: NodeJS.ProcessEnv
  workspaceDir?: string
}

export function getBackendLaunchPolicy(input: NodeJS.ProcessEnv | BackendLaunchPolicyOptions = process.env): BackendLaunchPolicy {
  const options = isBackendLaunchPolicyOptions(input) ? input : { env: input }
  const env = options.env ?? process.env
  const value = normalizeBackendLaunchPolicy(
    env.MOVSCRIPT_BACKEND_LAUNCH_POLICY
      ?? env.MOVSCRIPT_BACKEND_POLICY
      ?? env.MOVSCRIPT_LOCAL_BACKEND_POLICY,
  )
  if (value) return value
  if (env.MOVSCRIPT_DISABLE_LOCAL_BACKEND === '1') return 'disabled'

  const configPolicy = readConfiguredBackendLaunchPolicy(
    options.workspaceDir ?? env.MOVSCRIPT_HOME?.trim() ?? env.MOVSCRIPT_WORKSPACE_DIR?.trim(),
  )
  if (configPolicy) return configPolicy

  return 'spawn'
}

function readConfiguredBackendLaunchPolicy(homeDir?: string): BackendLaunchPolicy | undefined {
  try {
    const { configPath } = resolveMovScriptHomeConfigPaths(homeDir)
    return normalizeBackendLaunchPolicy(readMovScriptHomeConfig(configPath).startup.backendPolicy)
  } catch {
    return undefined
  }
}

function normalizeBackendLaunchPolicy(value: unknown): BackendLaunchPolicy | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : undefined
  if (normalized === 'spawn' || normalized === 'external' || normalized === 'cloud' || normalized === 'disabled') {
    return normalized
  }
  return undefined
}

function isBackendLaunchPolicyOptions(input: NodeJS.ProcessEnv | BackendLaunchPolicyOptions): input is BackendLaunchPolicyOptions {
  return Object.prototype.hasOwnProperty.call(input, 'env') || Object.prototype.hasOwnProperty.call(input, 'workspaceDir')
}

import {
  MOVSCRIPT_DEFAULT_BACKEND_BASE_URL,
  normalizeBackendAPIBaseURL,
} from './config.js'

interface MovScriptBackendRuntimeState {
  backendAPIBaseURL: string
  backendRuntimeAuthToken: string
  configuredBackendDefaultWorkspaceDir?: string
}

type MovScriptBackendRuntimeGlobal = typeof globalThis & {
  __movscriptBackendRuntimeState?: MovScriptBackendRuntimeState
}

function backendRuntimeState(): MovScriptBackendRuntimeState {
  const globalRuntime = globalThis as MovScriptBackendRuntimeGlobal
  globalRuntime.__movscriptBackendRuntimeState ??= {
    backendAPIBaseURL: normalizeBackendAPIBaseURL(defaultMovScriptBackendBaseURL()),
    backendRuntimeAuthToken: '',
  }
  return globalRuntime.__movscriptBackendRuntimeState
}

export function setMovScriptBackendAPIBaseURL(next: string): void {
  backendRuntimeState().backendAPIBaseURL = normalizeBackendAPIBaseURL(next)
}

export function getMovScriptBackendAPIBaseURL(): string {
  return backendRuntimeState().backendAPIBaseURL
}

export function setMovScriptBackendRuntimeAuthToken(token: string | undefined): void {
  backendRuntimeState().backendRuntimeAuthToken = token?.trim() ?? ''
}

export function getMovScriptBackendRuntimeAuthToken(): string {
  return backendRuntimeState().backendRuntimeAuthToken
}

export function setMovScriptBackendDefaultWorkspaceDir(workspaceDir: string | undefined): void {
  backendRuntimeState().configuredBackendDefaultWorkspaceDir = workspaceDir?.trim() || undefined
}

export function resolveMovScriptBackendDefaultWorkspaceDir(): string {
  return backendRuntimeState().configuredBackendDefaultWorkspaceDir || process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd()
}

function defaultMovScriptBackendBaseURL(): string {
  return typeof process !== 'undefined'
    ? process.env.MOVSCRIPT_API_BASE_URL || MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
    : MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
}

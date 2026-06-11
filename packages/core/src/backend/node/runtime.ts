import {
  MOVSCRIPT_DEFAULT_BACKEND_BASE_URL,
  normalizeBackendAPIBaseURL,
} from './config.js'

let backendAPIBaseURL = normalizeBackendAPIBaseURL(defaultMovScriptBackendBaseURL())
let backendRuntimeAuthToken = ''
let configuredBackendDefaultWorkspaceDir: string | undefined

export function setMovScriptBackendAPIBaseURL(next: string): void {
  backendAPIBaseURL = normalizeBackendAPIBaseURL(next)
}

export function getMovScriptBackendAPIBaseURL(): string {
  return backendAPIBaseURL
}

export function setMovScriptBackendRuntimeAuthToken(token: string | undefined): void {
  backendRuntimeAuthToken = token?.trim() ?? ''
}

export function getMovScriptBackendRuntimeAuthToken(): string {
  return backendRuntimeAuthToken
}

export function setMovScriptBackendDefaultWorkspaceDir(workspaceDir: string | undefined): void {
  configuredBackendDefaultWorkspaceDir = workspaceDir?.trim() || undefined
}

export function resolveMovScriptBackendDefaultWorkspaceDir(): string {
  return configuredBackendDefaultWorkspaceDir || process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd()
}

function defaultMovScriptBackendBaseURL(): string {
  return typeof process !== 'undefined'
    ? process.env.MOVSCRIPT_API_BASE_URL || MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
    : MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
}

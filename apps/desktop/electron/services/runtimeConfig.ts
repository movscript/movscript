import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'
import {
  normalizeDataServiceAPIBaseURL,
  normalizeDataServiceRootBaseURL,
  resolveMovScriptDataServiceSession,
} from '@movscript/data-client'
import type { ElectronRuntimeConfig } from '../../src/shared/contracts/electronApi'
import { readDesktopAppSettings } from './appSettings'
import { getBackendStatus, LOCAL_BACKEND_URL } from './backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { providerRuntimeEnvSnapshot } from './providerRuntimeEnv'

const CANVAS_SERVICE_NAME = 'movscript.canvas.service'
const PROJECT_SERVICE_NAME = 'movscript.project.service'
const DATA_SERVICE_NAME = 'movscript.data.service'
const LOCAL_NODE_GATEWAY_SERVICE = 'movscript.local-node.gateway'

export function getElectronRuntimeConfig(): ElectronRuntimeConfig {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const backendStatus = getBackendStatus()
  const appSettings = readDesktopAppSettings(movScriptHomeDir)
  const session = resolveMovScriptDataServiceSession({ workspaceDir: movScriptHomeDir })
  const gatewayBaseURL = resolveGatewayBaseURL(movScriptHomeDir)
  const dataServiceBaseURL = resolveDataServiceBaseURL(movScriptHomeDir)
  const apiBaseURL = resolveEffectiveAPIBaseURL({
    configuredBaseURL: appSettings?.apiBaseURL ?? session.baseURL,
    backendStatus,
    gatewayBaseURL,
    dataServiceBaseURL,
    shouldPreferLocalBackend: appSettings?.onboardingCompleted === true && appSettings.launchMode === 'local',
  })
  const canvasServiceBaseURL = resolveCanvasServiceBaseURL(movScriptHomeDir)
  const canvasServiceV1BaseURL = gatewayBaseURL
    ? `${gatewayBaseURL}/local-api`
    : canvasServiceBaseURL
      ? `${canvasServiceBaseURL}/v1`
      : undefined
  const projectServiceBaseURL = resolveProjectServiceBaseURL(movScriptHomeDir)
  return {
    movScriptHomeDir,
    workspaceDir: movScriptHomeDir,
    ...(gatewayBaseURL ? { gatewayBaseURL } : {}),
    ...(dataServiceBaseURL ? { dataServiceBaseURL } : {}),
    apiBaseURL,
    apiV1BaseURL: normalizeDataServiceAPIBaseURL(apiBaseURL),
    ...(projectServiceBaseURL ? {
      projectServiceBaseURL,
    } : {}),
    ...(canvasServiceBaseURL ? {
      canvasServiceBaseURL,
    } : {}),
    ...(canvasServiceV1BaseURL ? { canvasServiceV1BaseURL } : {}),
    localAPIBaseURL: normalizeDataServiceRootBaseURL(gatewayBaseURL ?? LOCAL_BACKEND_URL),
    providerRuntimeEnv: providerRuntimeEnvSnapshot(process.env),
    backendStatus: {
      ...backendStatus,
      baseURL: normalizeDataServiceRootBaseURL(backendStatus.baseURL),
    },
  }
}

function resolveEffectiveAPIBaseURL(input: {
  configuredBaseURL: string
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
  dataServiceBaseURL?: string
  shouldPreferLocalBackend: boolean
}): string {
  if (input.shouldPreferLocalBackend && input.gatewayBaseURL) {
    return normalizeDataServiceRootBaseURL(input.gatewayBaseURL)
  }
  if (input.shouldPreferLocalBackend && input.dataServiceBaseURL) {
    return normalizeDataServiceRootBaseURL(input.dataServiceBaseURL)
  }
  if (
    input.shouldPreferLocalBackend
    &&
    input.backendStatus.state === 'ready'
    && normalizeDataServiceRootBaseURL(input.backendStatus.baseURL) === normalizeDataServiceRootBaseURL(LOCAL_BACKEND_URL)
  ) {
    return normalizeDataServiceRootBaseURL(input.backendStatus.baseURL)
  }
  return normalizeDataServiceRootBaseURL(input.configuredBaseURL)
}

function resolveGatewayBaseURL(movScriptHomeDir: string): string | undefined {
  const explicit = normalizeHTTPBaseURL(
    process.env.MOVSCRIPT_LOCAL_GATEWAY_URL
      || process.env.MOVSCRIPT_LOCAL_GATEWAY_BASE_URL,
  )
  if (explicit) return explicit
  const snapshot = readRuntimeHomeSnapshot(movScriptHomeDir)
  const endpoint = findRuntimeEndpoint(snapshot, LOCAL_NODE_GATEWAY_SERVICE)
    ?? findRuntimeService(snapshot, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint
  return normalizeHTTPBaseURL(endpointURL(endpoint))
}

function resolveDataServiceBaseURL(movScriptHomeDir: string): string | undefined {
  const explicit = normalizeHTTPBaseURL(process.env.MOVSCRIPT_DATA_SERVICE_URL)
  if (explicit) return explicit
  const snapshot = readRuntimeHomeSnapshot(movScriptHomeDir)
  const endpoint = findRuntimeEndpoint(snapshot, DATA_SERVICE_NAME)
    ?? findRuntimeService(snapshot, DATA_SERVICE_NAME)?.endpoint
  return normalizeHTTPBaseURL(endpointURL(endpoint))
}

function resolveProjectServiceBaseURL(movScriptHomeDir: string): string | undefined {
  const explicit = normalizeHTTPBaseURL(
    process.env.MOVSCRIPT_PROJECT_SERVICE_URL
      || process.env.MOVSCRIPT_PROJECT_SERVICE_BASE_URL,
  )
  if (explicit) return explicit
  const snapshot = readRuntimeHomeSnapshot(movScriptHomeDir)
  const endpoint = findRuntimeEndpoint(snapshot, PROJECT_SERVICE_NAME)
    ?? findRuntimeService(snapshot, PROJECT_SERVICE_NAME)?.endpoint
  return normalizeHTTPBaseURL(endpointURL(endpoint))
}

function resolveCanvasServiceBaseURL(movScriptHomeDir: string): string | undefined {
  const explicit = normalizeHTTPBaseURL(
    process.env.MOVSCRIPT_CANVAS_SERVICE_URL
      || process.env.MOVSCRIPT_CANVAS_SERVICE_BASE_URL,
  )
  if (explicit) return explicit
  const snapshot = readRuntimeHomeSnapshot(movScriptHomeDir)
  const endpoint = findRuntimeEndpoint(snapshot, CANVAS_SERVICE_NAME)
    ?? findRuntimeService(snapshot, CANVAS_SERVICE_NAME)?.endpoint
  return normalizeHTTPBaseURL(endpointURL(endpoint))
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function normalizeHTTPBaseURL(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  return url.toString().replace(/\/+$/, '')
}

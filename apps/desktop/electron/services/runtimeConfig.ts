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
import type {
  MovScriptDataConnectionContext,
  MovScriptRuntimeDescriptor,
} from '@movscript/shared'
import type { ElectronRuntimeConfig } from '../../src/shared/contracts/electronApi'
import { readDesktopAppSettings } from './appSettings'
import { getBackendStatus, LOCAL_BACKEND_URL } from './backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { providerRuntimeEnvSnapshot } from './providerRuntimeEnv'

const DATA_SERVICE_NAME = 'movscript.data.service'
const LOCAL_NODE_GATEWAY_SERVICE = 'movscript.local-node.gateway'
const LOCAL_NODE_RUNTIME_OWNER = 'movscript.local-node'

export function getElectronRuntimeConfig(): ElectronRuntimeConfig {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const backendStatus = getBackendStatus()
  const appSettings = readDesktopAppSettings(movScriptHomeDir)
  const session = resolveMovScriptDataServiceSession({ workspaceDir: movScriptHomeDir })
  const gatewayBaseURL = resolveGatewayBaseURL(movScriptHomeDir)
  const dataServiceBaseURL = resolveDataServiceBaseURL(movScriptHomeDir)
  const shouldPreferLocalBackend = appSettings?.onboardingCompleted === true && appSettings.launchMode === 'local'
  const apiBaseURL = resolveRendererAPIGatewayBaseURL({
    configuredBaseURL: appSettings?.apiBaseURL ?? session.baseURL,
    backendStatus,
    gatewayBaseURL,
    dataServiceBaseURL,
    shouldPreferLocalBackend,
  })
  const dataConnection = resolveRuntimeDataConnection({
    configuredKind: appSettings?.launchMode === 'local' ? 'local' : 'cloud',
    backendStatus,
    gatewayBaseURL,
    dataServiceBaseURL,
    shouldPreferLocalBackend,
  })
  const runtime = createRuntimeDescriptor({
    gatewayBaseURL: gatewayBaseURL ?? apiBaseURL,
    dataConnection,
  })
  return {
    movScriptHomeDir,
    workspaceDir: movScriptHomeDir,
    runtime,
    dataConnection,
    ...(gatewayBaseURL ? { gatewayBaseURL } : {}),
    apiBaseURL,
    apiV1BaseURL: normalizeDataServiceAPIBaseURL(apiBaseURL),
    providerRuntimeEnv: providerRuntimeEnvSnapshot(process.env),
    backendStatus: {
      ...backendStatus,
      baseURL: normalizeDataServiceRootBaseURL(backendStatus.baseURL),
    },
  }
}

function createRuntimeDescriptor(input: {
  gatewayBaseURL: string
  dataConnection: MovScriptDataConnectionContext
}): MovScriptRuntimeDescriptor {
  return {
    schema: 'movscript.runtime-descriptor.v1',
    runtime: {
      owner: LOCAL_NODE_RUNTIME_OWNER,
      appId: LOCAL_NODE_RUNTIME_OWNER,
      name: 'MovScript Local Node Daemon',
    },
    gateway: {
      baseURL: normalizeDataServiceRootBaseURL(input.gatewayBaseURL),
      canonicalPrefix: '/v1',
    },
    dataConnection: input.dataConnection,
    capabilities: {
      project: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
  }
}

function resolveRuntimeDataConnection(input: {
  configuredKind: MovScriptDataConnectionContext['kind']
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
  dataServiceBaseURL?: string
  shouldPreferLocalBackend: boolean
}): MovScriptDataConnectionContext {
  const kind = input.shouldPreferLocalBackend ? 'local' : input.configuredKind
  return {
    kind,
    authMode: kind === 'local' ? 'local-owner' : 'session',
    status: runtimeDataConnectionStatus(input),
    displayName: kind === 'local' ? 'Local daemon data' : 'Cloud data connection',
  }
}

function runtimeDataConnectionStatus(input: {
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
  dataServiceBaseURL?: string
}): NonNullable<MovScriptDataConnectionContext['status']> {
  if (input.gatewayBaseURL || input.dataServiceBaseURL || input.backendStatus.state === 'ready') return 'connected'
  if (input.backendStatus.state === 'error' || input.backendStatus.state === 'stopped') return 'unavailable'
  return 'degraded'
}

function resolveRendererAPIGatewayBaseURL(input: {
  configuredBaseURL: string
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
  dataServiceBaseURL?: string
  shouldPreferLocalBackend: boolean
}): string {
  if (input.gatewayBaseURL) {
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

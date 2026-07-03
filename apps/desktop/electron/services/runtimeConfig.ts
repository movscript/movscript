import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  findRuntimeApp,
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  runtimeBundleCompatibility,
  runtimeBundleIdentityFromManifest,
  validateRuntimeBundleManifest,
  type RuntimeEndpointRecord,
  type RuntimeBundleCompatibility,
  type RuntimeBundleIdentity,
  type RuntimeBundleManifest,
} from '@movscript/runtime-contracts'
import {
  readMovScriptHomePluginBundleIdentity,
  resolveMovScriptHomeCurrentPluginRoot,
  resolveMovScriptHomePreviousPluginRoot,
} from '@movscript/plugins/node'
import {
  normalizeDataServiceAPIBaseURL,
  normalizeDataServiceRootBaseURL,
  resolveMovScriptDataServiceSession,
} from '@movscript/data-client'
import type {
  MovScriptDataConnectionContext,
  MovScriptRuntimeIdentity,
  MovScriptRuntimeConnectionDescriptor,
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
  const runtimeIdentity = resolveRuntimeIdentity(movScriptHomeDir)
  const mode = appSettings?.launchMode === 'local' ? 'local' : 'cloud'
  const runtimeConnection = resolveRuntimeConnection({
    mode,
    configuredCloudBaseURL: appSettings?.cloudAPIBaseURL ?? appSettings?.apiBaseURL ?? session.baseURL,
    backendStatus,
    gatewayBaseURL,
  })
  const dataConnection = resolveRuntimeDataConnection({
    mode: runtimeConnection.mode,
    backendStatus,
    gatewayBaseURL,
    dataServiceBaseURL,
    runtimeConnection,
  })
  const runtime = createRuntimeDescriptor({
    gatewayBaseURL: runtimeConnection.gatewayBaseURL,
    dataConnection,
    identity: runtimeIdentity,
  })
  const runtimeBundleStatus = resolveRuntimeBundleStatus(movScriptHomeDir)
  return {
    movScriptHomeDir,
    workspaceDir: movScriptHomeDir,
    runtimeConnection,
    runtime,
    dataConnection,
    runtimeBundleStatus,
    ...(gatewayBaseURL ? { gatewayBaseURL } : {}),
    apiBaseURL: runtimeConnection.gatewayBaseURL,
    apiV1BaseURL: runtimeConnection.apiV1BaseURL,
    providerRuntimeEnv: providerRuntimeEnvSnapshot(process.env),
    backendStatus: {
      ...backendStatus,
      baseURL: normalizeDataServiceRootBaseURL(backendStatus.baseURL),
    },
  }
}

function resolveRuntimeConnection(input: {
  mode: MovScriptRuntimeConnectionDescriptor['mode']
  configuredCloudBaseURL: string
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
}): MovScriptRuntimeConnectionDescriptor {
  const gatewayBaseURL = resolveRendererAPIGatewayBaseURL(input)
  if (input.mode === 'local') {
    return {
      schema: 'movscript.runtime-connection.v1',
      mode: 'local',
      gatewayBaseURL,
      apiV1BaseURL: normalizeDataServiceAPIBaseURL(gatewayBaseURL),
      authMode: 'local-owner',
      displayName: 'Local daemon gateway',
      status: runtimeConnectionStatus(input.backendStatus, gatewayBaseURL),
      source: 'daemon',
    }
  }

  return {
    schema: 'movscript.runtime-connection.v1',
    mode: 'cloud',
    gatewayBaseURL,
    apiV1BaseURL: normalizeDataServiceAPIBaseURL(gatewayBaseURL),
    authMode: 'session',
    displayName: 'Cloud data connection',
    status: gatewayBaseURL ? 'connected' : 'degraded',
    source: 'cloud',
  }
}

function resolveRendererAPIGatewayBaseURL(input: {
  mode: MovScriptRuntimeConnectionDescriptor['mode']
  configuredCloudBaseURL: string
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
}): string {
  if (input.gatewayBaseURL) {
    return normalizeDataServiceRootBaseURL(input.gatewayBaseURL)
  }
  if (input.mode === 'local') {
    return normalizeDataServiceRootBaseURL(
      localBackendStatusBaseURL(input.backendStatus)
        ?? LOCAL_BACKEND_URL,
    )
  }
  return normalizeDataServiceRootBaseURL(input.configuredCloudBaseURL)
}

function createRuntimeDescriptor(input: {
  gatewayBaseURL: string
  dataConnection: MovScriptDataConnectionContext
  identity?: MovScriptRuntimeIdentity
}): MovScriptRuntimeDescriptor {
  return {
    schema: 'movscript.runtime-descriptor.v1',
    apiVersion: input.identity?.apiVersion ?? '1.0',
    ...(input.identity?.bundleHash ? { bundleHash: input.identity.bundleHash } : {}),
    compatibility: {
      kind: 'unknown',
      compatible: true,
      reason: 'Electron fallback descriptor has not compared the running daemon bundle with Home current.',
      ...(input.identity ? {
        actual: {
          ...(input.identity.pluginVersion ? { version: input.identity.pluginVersion } : {}),
          ...(input.identity.apiVersion ? { apiVersion: input.identity.apiVersion } : {}),
          ...(input.identity.minDaemonApiVersion ? { minDaemonApiVersion: input.identity.minDaemonApiVersion } : {}),
          ...(input.identity.bundleHash ? { bundleHash: input.identity.bundleHash } : {}),
          ...(input.identity.pluginRoot ? { pluginRoot: input.identity.pluginRoot } : {}),
        },
      } : {}),
    },
    runtime: {
      owner: LOCAL_NODE_RUNTIME_OWNER,
      appId: LOCAL_NODE_RUNTIME_OWNER,
      name: 'MovScript Local Node Daemon',
      ...(input.identity ? { identity: input.identity } : {}),
    },
    gateway: {
      baseURL: normalizeDataServiceRootBaseURL(input.gatewayBaseURL),
      canonicalPrefix: '/v1',
    },
    dataConnection: input.dataConnection,
    capabilities: {
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
  }
}

function resolveRuntimeIdentity(movScriptHomeDir: string): MovScriptRuntimeIdentity | undefined {
  const app = findRuntimeApp(readRuntimeHomeSnapshot(movScriptHomeDir), LOCAL_NODE_RUNTIME_OWNER)
  const metadata = app?.raw.metadata
  if (!metadata || typeof metadata !== 'object') return undefined
  const record = metadata as Record<string, unknown>
  const identity: MovScriptRuntimeIdentity = {
    ...(stringValue(record.pluginVersion) ? { pluginVersion: stringValue(record.pluginVersion) } : {}),
    ...(stringValue(record.pluginRoot) ? { pluginRoot: stringValue(record.pluginRoot) } : {}),
    ...(stringValue(record.apiVersion) ? { apiVersion: stringValue(record.apiVersion) } : {}),
    ...(stringValue(record.minDaemonApiVersion) ? { minDaemonApiVersion: stringValue(record.minDaemonApiVersion) } : {}),
    ...(stringValue(record.bundleHash) ? { bundleHash: stringValue(record.bundleHash) } : {}),
    ...(stringValue(record.runtimeVersion) ? { runtimeVersion: stringValue(record.runtimeVersion) } : {}),
    ...(stringValue(record.runtimeRoot) ? { runtimeRoot: stringValue(record.runtimeRoot) } : {}),
  }
  return Object.keys(identity).length > 0 ? identity : undefined
}

function resolveRuntimeBundleStatus(movScriptHomeDir: string): NonNullable<ElectronRuntimeConfig['runtimeBundleStatus']> {
  const homeIdentity = readMovScriptHomePluginBundleIdentity(movScriptHomeDir)
  const homeCurrentRoot = resolveMovScriptHomeCurrentPluginRoot(movScriptHomeDir)
  const previousRoot = resolveMovScriptHomePreviousPluginRoot(movScriptHomeDir)
  const homeCurrent = runtimeBundleIdentityForPluginRoot(homeCurrentRoot)
    ?? runtimeBundleIdentityFromHomeIdentity(homeIdentity)
  const desktopBundled = runtimeBundleIdentityForPluginRoot(resolveDesktopBundledPluginRoot())
  const comparison = runtimeBundleCompatibility({
    actual: desktopBundled,
    expected: homeCurrent,
  })
  const action = runtimeBundleUpdateAction({
    homeCurrentRoot,
    homeCurrent,
    desktopBundled,
    comparison,
    previousRoot,
  })
  return {
    action,
    reason: runtimeBundleStatusReason(action, comparison),
    ...(homeCurrent ? { homeCurrent } : {}),
    ...(desktopBundled ? { desktopBundled } : {}),
    ...(previousRoot ? { previousRoot } : {}),
    comparison,
  }
}

function runtimeBundleUpdateAction(input: {
  homeCurrentRoot: string | undefined
  homeCurrent: RuntimeBundleIdentity | undefined
  desktopBundled: RuntimeBundleIdentity | undefined
  comparison: RuntimeBundleCompatibility
  previousRoot?: string
}): NonNullable<ElectronRuntimeConfig['runtimeBundleStatus']>['action'] {
  if (!input.desktopBundled) return 'unknown'
  if (!input.homeCurrentRoot || !input.homeCurrent) return input.previousRoot ? 'rollback' : 'repair'
  if (input.comparison.kind === 'newer') return 'upgrade'
  if (input.comparison.kind === 'same' || input.comparison.kind === 'older') return 'keep'
  if (input.comparison.kind === 'incompatible' || input.comparison.kind === 'repair-only') return 'repair'
  return 'unknown'
}

function runtimeBundleStatusReason(
  action: NonNullable<ElectronRuntimeConfig['runtimeBundleStatus']>['action'],
  comparison: RuntimeBundleCompatibility,
): string {
  if (action === 'upgrade') return 'Desktop bundled runtime is newer than Home current.'
  if (action === 'keep' && comparison.kind === 'older') return 'Home current is newer than the Desktop bundled runtime; Desktop will not downgrade it.'
  if (action === 'keep') return 'Home current already matches the Desktop bundled runtime.'
  if (action === 'repair') return 'Home current should be repaired from the Desktop bundled runtime before daemon reuse.'
  if (action === 'rollback') return 'Home current is missing or unreadable; previous bundle is available for rollback.'
  return comparison.reason
}

function runtimeBundleIdentityForPluginRoot(pluginRoot: string | undefined): RuntimeBundleIdentity | undefined {
  if (!pluginRoot) return undefined
  const manifest = readRuntimeBundleManifest(pluginRoot)
  const canonicalPluginRoot = canonicalRuntimePath(pluginRoot)
  if (manifest) return runtimeBundleIdentityFromManifest(manifest, { pluginRoot: canonicalPluginRoot })
  return { pluginRoot: canonicalPluginRoot }
}

function runtimeBundleIdentityFromHomeIdentity(
  identity: ReturnType<typeof readMovScriptHomePluginBundleIdentity>,
): RuntimeBundleIdentity | undefined {
  if (!identity) return undefined
  return compactRuntimeBundleIdentity({
    version: identity.version,
    apiVersion: identity.apiVersion,
    minDaemonApiVersion: identity.minDaemonApiVersion,
    bundleHash: identity.bundleHash,
    pluginRoot: identity.pluginRoot,
  })
}

function readRuntimeBundleManifest(pluginRoot: string): RuntimeBundleManifest | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resolve(pluginRoot, 'manifest.runtime.json'), 'utf8')) as unknown
    const result = validateRuntimeBundleManifest(parsed)
    return result.ok ? result.manifest : undefined
  } catch {
    return undefined
  }
}

function compactRuntimeBundleIdentity(identity: RuntimeBundleIdentity): RuntimeBundleIdentity | undefined {
  const compacted: RuntimeBundleIdentity = {
    ...(identity.version ? { version: identity.version } : {}),
    ...(identity.apiVersion ? { apiVersion: identity.apiVersion } : {}),
    ...(identity.minDaemonApiVersion ? { minDaemonApiVersion: identity.minDaemonApiVersion } : {}),
    ...(identity.bundleHash ? { bundleHash: identity.bundleHash } : {}),
    ...(identity.pluginRoot ? { pluginRoot: identity.pluginRoot } : {}),
  }
  return Object.keys(compacted).length > 0 ? compacted : undefined
}

function resolveRuntimeDataConnection(input: {
  mode: MovScriptRuntimeConnectionDescriptor['mode']
  backendStatus: ReturnType<typeof getBackendStatus>
  gatewayBaseURL?: string
  dataServiceBaseURL?: string
  runtimeConnection: MovScriptRuntimeConnectionDescriptor
}): MovScriptDataConnectionContext {
  const kind = input.mode
  return {
    kind,
    authMode: kind === 'local' ? 'local-owner' : 'session',
    status: runtimeDataConnectionStatus(input),
    displayName: input.runtimeConnection.displayName,
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

function runtimeConnectionStatus(
  backendStatus: ReturnType<typeof getBackendStatus>,
  gatewayBaseURL: string,
): MovScriptRuntimeConnectionDescriptor['status'] {
  if (backendStatus.state === 'ready' && sameBaseURL(backendStatus.baseURL, gatewayBaseURL)) return 'connected'
  if (backendStatus.state === 'starting' || backendStatus.state === 'idle') return 'starting'
  if (backendStatus.state === 'error' || backendStatus.state === 'stopped') return 'unavailable'
  return 'degraded'
}

function localBackendStatusBaseURL(backendStatus: ReturnType<typeof getBackendStatus>): string | undefined {
  if (!backendStatus.baseURL || !isLocalGatewayBaseURL(backendStatus.baseURL)) return undefined
  return backendStatus.baseURL
}

function sameBaseURL(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false
  return normalizeDataServiceRootBaseURL(left) === normalizeDataServiceRootBaseURL(right)
}

function isLocalGatewayBaseURL(value: string): boolean {
  try {
    const url = new URL(normalizeDataServiceRootBaseURL(value))
    const hostname = url.hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
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

function resolveDesktopBundledPluginRoot(): string | undefined {
  const repoRoot = resolveDesktopRuntimeRepoRoot()
  const resourcesPath = defaultElectronResourcesPath()
  const candidates = [
    resourcesPath ? resolve(resourcesPath, 'provider-plugins/movscript') : undefined,
    resolve(repoRoot, 'plugins/movscript'),
    resolve(repoRoot, 'apps/plugin'),
  ]
  return candidates.find((candidate): candidate is string => Boolean(candidate && isMovScriptPluginBundleRoot(candidate)))
}

function resolveDesktopRuntimeRepoRoot(input: {
  dirname?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
} = {}): string {
  const currentDir = input.dirname ?? import.meta.dirname
  const cwd = input.cwd ?? process.cwd()
  const env = input.env ?? process.env
  const explicitRoot = env.MOVSCRIPT_REPO_ROOT?.trim()
  const candidates = [
    explicitRoot,
    resolve(currentDir, '../../..'),
    resolve(currentDir, '../../../..'),
    resolve(cwd),
    resolve(cwd, '..'),
    resolve(cwd, '../..'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find(isMovScriptRepoRoot) ?? resolve(currentDir, '../../..')
}

function isMovScriptRepoRoot(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, 'pnpm-workspace.yaml')) &&
    existsSync(resolve(candidate, 'apps/desktop/package.json')) &&
    existsSync(resolve(candidate, 'services/project-service/bin/movscript-project-service.mjs'))
  )
}

function isMovScriptPluginBundleRoot(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, '.codex-plugin/plugin.json')) &&
    existsSync(resolve(candidate, '.mcp.json'))
  )
}

function defaultElectronResourcesPath(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return typeof resourcesPath === 'string' && resourcesPath.trim() ? resourcesPath : undefined
}

function canonicalRuntimePath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

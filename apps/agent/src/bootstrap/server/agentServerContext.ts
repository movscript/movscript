import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  createAgentSessionLockFile,
  ensureAgentSessionRuntime,
  readAgentWorkspaceConfig,
  releaseAgentSessionLockFile,
  resolveAgentSessionRuntimePaths,
  resolveDefaultAgentWorkspaceDir,
  type AgentWorkspaceConfig,
  type AgentSessionRuntimePaths,
} from '@movscript/agent-runtime'
import { MCPToolProviderRegistry, type MCPToolProviderView } from '../../adapters/mcp/providers/mcpToolProviderRegistry.js'
import { AgentRuntimeRouter, loadAgentPluginCatalog } from '../../application/router/runtimeRouter.js'
import { FileAgentStore, resolveAgentMemoryPath, resolveAgentRuntimeDataDir, resolveAgentRuntimeLogPath, resolveAgentTracePath } from '../../state/store/file/fileStore.js'
import { FileAgentToolResultStore, resolveAgentToolResultPath } from '../../state/store/tool-results/toolResultStore.js'
import { BackendResourceFileDownloader } from '../../adapters/backend/backendResourceFileDownloader.js'
import type { ResourceFileDownloadPort } from '../../ports/files/resourceDownloadPort.js'
import { FileAgentMemoryStore } from '../../memory/store/file/fileMemoryStore.js'
import { FileAgentCatalogStateStore, resolveAgentCatalogStatePath } from '../../catalog/registry/state/catalogState.js'
import { RuntimeModelConfigStore, resolveRuntimeChatModelConfig, resolveRuntimeModelConfigPath, type RuntimeModelConfigInput } from '../../model/config/modelConfig.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
} from '../../contracts/runtime/runtimeContract.js'
import { buildAgentUpdateState } from '../../updates/policy/updatePolicy.js'
import { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'
import { createRuntimeOtlpExporterFromEnv } from '../../telemetry/exporters/otlp/runtimeOtlpExporter.js'
import type { AgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import type { CatalogIssue } from '../../catalog/registry/shared/types.js'
import type { AgentRuntimeServerEndpoint } from '../../server/transports/runtimeServerTransport.js'

const DEFAULT_AGENT_PORT = 28765
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const RUNTIME_API_VERSION = 1

export interface AgentServerContext {
  port: number
  mcpEndpoint: string
  paths: {
    runtimeDataDir: string
    memoryPath: string
    runtimeLogPath: string
    workspacePath: string
    toolResultPath: string
    catalogStatePath: string
    modelConfigPath: string
  }
  sessionRuntime?: {
    sessionId: string
    workspaceDir: string
    paths: AgentSessionRuntimePaths
    workspaceConfig: AgentWorkspaceConfig
  }
  updates: ReturnType<typeof buildAgentUpdateState>
  client: MCPToolProviderRegistry
  toolProviderRegistry: MCPToolProviderRegistry
  runtimeRouter: AgentRuntimeRouter
  resourceFileDownloader: ResourceFileDownloadPort & { isEnabled?: () => boolean }
  modelConfigStore: RuntimeModelConfigStore
  pluginCatalog: ReturnType<typeof loadAgentPluginCatalog>
  telemetry: RuntimeTelemetryRegistry
}

export interface AgentServerCapabilities {
  service: 'movscript-agent'
  mode: 'server'
  runtime: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  mcpEndpoint: string
  pluginCatalog: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir: string
    builtinToolsDir: string
    skillCount: number
    toolCount: number
    warnings: string[]
  }
  paths: AgentServerContext['paths']
  modelConfig: {
    supported: true
    provider: 'backend-model-config'
    path: string
  }
  updates: ReturnType<typeof buildAgentUpdateState>
  resourceFileDownloadEnabled: boolean
  toolProviders: MCPToolProviderView[]
  sessionRuntime?: {
    sessionId: string
    workspaceDir: string
    sessionDir: string
    runtimeLogPath: string
    runtimePath: string
    lockPath: string
  }
}

export interface AgentRuntimeCompatibility {
  ok: true
  service: 'movscript-agent'
  mode: 'server'
  runtime: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
}

export interface AgentCatalogStartupReport {
  packCount: number
  configFileCount: number
  skillCount: number
  toolCount: number
  toolGrantCount: number
  enabledPackCount: number
  enabledSkillCount: number
  enabledToolCount: number
  issueCount: number
  errorCount: number
  warningCount: number
  enabledPackIds: string[]
  configFiles: Array<{
    id: string
    enabledPackIds: string[]
    configSkills: number
    toolGrants: number
  }>
  packs: Array<{
    id: string
    source: string
    filePath?: string
    schemas: number
    skills: number
    tools: number
    skillRoots: string[]
    toolRoots: string[]
    missingSkills: string[]
    missingTools: string[]
    status: 'enabled' | 'loaded'
  }>
  issues: CatalogIssue[]
}

export function createAgentServerContext(): AgentServerContext {
  const startupStartedAt = Date.now()
  let lastPhaseAt = startupStartedAt
  const logPhase = (phase: string) => {
    const now = Date.now()
    console.info(`[agent] startup phase ${phase} +${now - lastPhaseAt}ms total=${now - startupStartedAt}ms`)
    lastPhaseAt = now
  }
  const port = Number(process.env.MOVSCRIPT_AGENT_PORT || DEFAULT_AGENT_PORT)
  const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
  const sessionRuntime = resolveSessionRuntimeContext()
  const runtimeDataDir = sessionRuntime?.paths.sessionDir ?? resolveAgentRuntimeDataDir()
  const memoryPath = sessionRuntime?.paths.memoryPath ?? resolveAgentMemoryPath(runtimeDataDir)
  const runtimeLogPath = sessionRuntime?.paths.runtimeLogPath ?? resolveAgentRuntimeLogPath(runtimeDataDir)
  const tracePath = sessionRuntime?.paths.traceDir ?? resolveAgentTracePath(runtimeDataDir)
  const workspacePath = sessionRuntime?.paths.workspacePath ?? join(runtimeDataDir, 'workspaces.deprecated.json')
  const toolResultPath = sessionRuntime?.paths.toolResultPath ?? resolveAgentToolResultPath(runtimeDataDir)
  const catalogStatePath = sessionRuntime?.paths.catalogStatePath ?? resolveAgentCatalogStatePath(runtimeDataDir)
  const modelConfigPath = sessionRuntime?.paths.modelConfigPath ?? resolveRuntimeModelConfigPath(runtimeDataDir)
  logPhase(`paths-resolved runtimeDataDir=${pathDiagnostic(runtimeDataDir)} runtimeLog=${pathDiagnostic(runtimeLogPath)} trace=${pathDiagnostic(tracePath)} memory=${pathDiagnostic(memoryPath)} workspaceDeprecated=${pathDiagnostic(workspacePath)} toolResults=${pathDiagnostic(toolResultPath)} catalogState=${pathDiagnostic(catalogStatePath)} modelConfig=${pathDiagnostic(modelConfigPath)}`)
  const modelConfigStore = timeStartupStep('model-config-store', () => new RuntimeModelConfigStore(modelConfigPath, {
    ...(sessionRuntime?.workspaceConfig.modelConfig ? { fallbackConfig: sessionRuntime.workspaceConfig.modelConfig as RuntimeModelConfigInput } : {}),
  }), () => pathDiagnostic(modelConfigPath))
  const catalogLoadOptions = buildWorkspaceCatalogLoadOptions(sessionRuntime)
  const loadPluginCatalog = (options: Parameters<typeof loadAgentPluginCatalog>[0] = {}) => loadAgentPluginCatalog({
    ...catalogLoadOptions,
    ...options,
  })
  const pluginCatalog = timeStartupStep('plugin-catalog-load', () => loadPluginCatalog(), (catalog) => [
    `packs=${catalog.packs.length}`,
    `skills=${catalog.layeredSkills.length}`,
    `tools=${catalog.layeredTools.length}`,
    `warnings=${catalog.warnings.length}`,
    `skillsDir=${relative(process.cwd(), catalog.skillsDir) || '.'}`,
    `toolsDir=${relative(process.cwd(), catalog.toolsDir) || '.'}`,
  ].join(' '))
  const catalogStateStore = timeStartupStep('catalog-data-store', () => new FileAgentCatalogStateStore(catalogStatePath), () => pathDiagnostic(catalogStatePath))
  const updateState = buildAgentUpdateState({
    runtimeVersion: '0.1.0',
    manifestVersion: pluginCatalog.manifest.version,
    applied: [
      {
        id: pluginCatalog.manifest.id,
        version: pluginCatalog.manifest.version,
        kind: 'policy',
        severity: 'normal',
        source: 'builtin',
        metadata: {
          skills: pluginCatalog.layeredSkills.length,
          tools: pluginCatalog.layeredTools.length,
        },
      },
    ],
    warnings: [
      'Remote update source is not configured; dynamic updates are limited to builtin and local catalog files.',
    ],
  })
  logPhase('update-state-built')
  const toolProviderRegistry = new MCPToolProviderRegistry(mcpEndpoint)
  applyWorkspaceToolProviders(toolProviderRegistry, sessionRuntime?.workspaceConfig)
  const client = toolProviderRegistry
  const resourceFileDownloader = new BackendResourceFileDownloader()
  const runtimeContractResolver = EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
  const telemetry = new RuntimeTelemetryRegistry({
    externalExporter: createRuntimeOtlpExporterFromEnv(),
  })
  const store = timeStartupStep('runtime-store', () => new FileAgentStore(runtimeDataDir, telemetry, {
    runtimeLogPath,
    ...(sessionRuntime ? { sessionRuntimePaths: sessionRuntime.paths } : {}),
  }), (stateStore) => [
    pathDiagnostic(runtimeDataDir),
    `runtimeLog=${pathDiagnostic(stateStore.runtimeLogPath)}`,
    `trace=${traceIndexDiagnostic(stateStore.tracePath)}`,
    `threads=${stateStore.listThreads().length}`,
    `runs=${stateStore.listRuns().length}`,
    `plans=${stateStore.listTaskGraphs().length}`,
    `tasks=${stateStore.listTasks().length}`,
    `operations=${stateStore.listRuntimeWorks().length}`,
    `interactions=${stateStore.listRuntimeInteractions().length}`,
    `continuations=${stateStore.listRuntimeContinuations().length}`,
  ].join(' '))
  const memoryStore = timeStartupStep('memory-store', () => new FileAgentMemoryStore(memoryPath, telemetry), () => [
    pathDiagnostic(memoryPath),
    'load=lazy',
  ].join(' '))
  const toolResultStore = timeStartupStep('tool-result-store', () => new FileAgentToolResultStore(toolResultPath, telemetry), (store) => [
    pathDiagnostic(toolResultPath),
    `records=${store.listToolResults().length}`,
  ].join(' '))

  const runtimeRouter = timeStartupStep('runtime-router', () => new AgentRuntimeRouter({
    mcpClient: client,
    store,
    toolResultStore,
    resourceFileDownloadPort: resourceFileDownloader,
    memoryStore,
    activeAgentManifest: pluginCatalog.manifest,
    toolRegistry: pluginCatalog.registry,
    pluginCatalog,
    catalogStateStore,
    pluginCatalogLoader: (options) => loadPluginCatalog(options),
    contractResolver: runtimeContractResolver,
    pluginCatalogInfo: {
      skillsDir: pluginCatalog.skillsDir,
      toolsDir: pluginCatalog.toolsDir,
      builtinSkillsDir: pluginCatalog.builtinSkillsDir,
      builtinToolsDir: pluginCatalog.builtinToolsDir,
      skillCount: pluginCatalog.layeredSkills.length,
      toolCount: pluginCatalog.layeredTools.length,
    },
    pluginWarnings: pluginCatalog.warnings,
    updateState,
    resolveModelConfig: () => resolveRuntimeChatModelConfig(modelConfigStore),
    telemetry,
  }), () => [
    `registeredTools=${runtimeRouterToolCountSafe(pluginCatalog)}`,
    `catalogState=${pathDiagnostic(catalogStatePath)}`,
  ].join(' '))
  const recoveryReport = timeStartupStep('runtime-recovery', () => runtimeRouter.reconcileRuntimeThreads(), (report) => [
    `checked=${report.checkedRunCount}`,
    `rescheduled=${report.rescheduledRunIds.length}`,
    `interrupted=${report.interruptedRunIds.length}`,
    `waiting=${report.waitingRunIds.length}`,
  ].join(' '))
  console.info(`[agent] runtime recovery checked=${recoveryReport.checkedRunCount} rescheduled=${recoveryReport.rescheduledRunIds.length} interrupted=${recoveryReport.interruptedRunIds.length} waiting=${recoveryReport.waitingRunIds.length}`)
  logPhase('runtime-recovery-reconciled')
  console.info(`[agent] startup complete total=${Date.now() - startupStartedAt}ms`)

  return {
    port,
    mcpEndpoint,
    paths: {
      runtimeDataDir,
      memoryPath,
      runtimeLogPath,
      workspacePath,
      toolResultPath,
      catalogStatePath,
      modelConfigPath,
    },
    ...(sessionRuntime ? { sessionRuntime } : {}),
    updates: updateState,
    client,
    toolProviderRegistry,
    runtimeRouter,
    resourceFileDownloader,
    modelConfigStore,
    pluginCatalog,
    telemetry,
  }
}

function timeStartupStep<T>(label: string, run: () => T, detail?: (result: T) => string): T {
  const startedAt = Date.now()
  console.info(`[agent] startup begin ${label}`)
  const result = run()
  const elapsedMs = Date.now() - startedAt
  const detailText = detail?.(result)
  console.info(`[agent] startup end ${label} elapsed=${elapsedMs}ms${detailText ? ` ${detailText}` : ''}`)
  return result
}

function pathDiagnostic(filePath: string): string {
  try {
    if (!existsSync(filePath)) return `${relative(process.cwd(), filePath) || filePath}:missing`
    const stat = statSync(filePath)
    return `${relative(process.cwd(), filePath) || filePath}:${stat.isDirectory() ? 'dir' : 'file'}:${stat.size}b`
  } catch (error) {
    return `${relative(process.cwd(), filePath) || filePath}:stat_error=${formatStartupError(error)}`
  }
}

function traceIndexDiagnostic(tracePath: string): string {
  const indexPath = join(tracePath, 'index.json')
  try {
    if (!existsSync(indexPath)) return `${relative(process.cwd(), indexPath) || indexPath}:missing`
    const stat = statSync(indexPath)
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as unknown
    if (!isStartupRecord(parsed)) return `${relative(process.cwd(), indexPath) || indexPath}:${stat.size}b invalid`
    const threads = isStartupRecord(parsed.threads) ? Object.keys(parsed.threads).length : 0
    const runs = isStartupRecord(parsed.runs) ? Object.values(parsed.runs).filter(isStartupRecord) : []
    const events = runs.reduce((sum, run) => sum + numberField(run.eventCount), 0)
    const chunks = runs.reduce((sum, run) => sum + (Array.isArray(run.chunks) ? run.chunks.length : 0), 0)
    const blobBytes = runs.reduce((sum, run) => sum + numberField(run.blobBytes), 0)
    return `${relative(process.cwd(), indexPath) || indexPath}:${stat.size}b threads=${threads} runs=${runs.length} events=${events} chunks=${chunks} blobBytes=${blobBytes}`
  } catch (error) {
    return `${relative(process.cwd(), indexPath) || indexPath}:read_error=${formatStartupError(error)}`
  }
}

function runtimeRouterToolCountSafe(pluginCatalog: ReturnType<typeof loadAgentPluginCatalog>): number {
  return pluginCatalog.layeredTools.length
}

function isStartupRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatStartupError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, '_') : String(error).replace(/\s+/g, '_')
}

function resolveSessionRuntimeContext(): AgentServerContext['sessionRuntime'] | undefined {
  const sessionId = process.env.MOVSCRIPT_AGENT_SESSION_ID?.trim()
  if (!sessionId) return undefined
  const workspaceDir = process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR || resolveDefaultAgentWorkspaceDir()
  const paths = resolveAgentSessionRuntimePaths({ workspaceDir, sessionId, runtimeDirName: process.env.MOVSCRIPT_AGENT_RUNTIME_DIR_NAME })
  ensureAgentSessionRuntime(paths, {
    title: process.env.MOVSCRIPT_AGENT_SESSION_TITLE,
    projectId: parseOptionalInteger(process.env.MOVSCRIPT_AGENT_PROJECT_ID),
  })
  const workspaceConfig = applySessionWorkspaceConfigDefaults(paths)
  applySessionWorkspaceEnvironmentDefaults(workspaceConfig)
  createAgentSessionLockFile(paths)
  const releaseLock = () => releaseAgentSessionLockFile(paths)
  process.once('beforeExit', releaseLock)
  process.once('exit', releaseLock)
  return {
    sessionId: paths.sessionId,
    workspaceDir: paths.workspaceDir,
    paths,
    workspaceConfig,
  }
}

function applySessionWorkspaceConfigDefaults(paths: AgentSessionRuntimePaths): AgentWorkspaceConfig {
  const workspaceConfig = readAgentWorkspaceConfig(paths.configPath)
  if (!new RuntimeModelConfigStore(paths.modelConfigPath).getEffectiveConfig() && workspaceConfig.modelConfig) {
    try {
      new RuntimeModelConfigStore(paths.modelConfigPath).save(workspaceConfig.modelConfig)
    } catch (error) {
      console.warn(`[agent] workspace modelConfig was not applied to session runtime: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return workspaceConfig
}

function applySessionWorkspaceEnvironmentDefaults(workspaceConfig: AgentWorkspaceConfig): void {
  for (const [key, value] of Object.entries(workspaceConfig.environment ?? {})) {
    if (!key.trim()) continue
    if (process.env[key] !== undefined) continue
    process.env[key] = value
  }
}

function buildWorkspaceCatalogLoadOptions(sessionRuntime: AgentServerContext['sessionRuntime'] | undefined): Parameters<typeof loadAgentPluginCatalog>[0] {
  if (!sessionRuntime?.workspaceConfig.catalog) return {}
  const catalog = sessionRuntime.workspaceConfig.catalog
  return {
    ...(catalog.skillsDir ? { skillsDir: resolveWorkspaceConfigPath(sessionRuntime.workspaceDir, catalog.skillsDir) } : {}),
    ...(catalog.toolsDir ? { toolsDir: resolveWorkspaceConfigPath(sessionRuntime.workspaceDir, catalog.toolsDir) } : {}),
    ...(catalog.packsDir ? { packsDir: resolveWorkspaceConfigPath(sessionRuntime.workspaceDir, catalog.packsDir) } : {}),
    ...(catalog.configFilesDir ? { configFilesDir: resolveWorkspaceConfigPath(sessionRuntime.workspaceDir, catalog.configFilesDir) } : {}),
  }
}

function resolveWorkspaceConfigPath(workspaceDir: string, configuredPath: string): string {
  return isAbsolute(configuredPath) ? configuredPath : resolve(workspaceDir, configuredPath)
}

function applyWorkspaceToolProviders(registry: MCPToolProviderRegistry, workspaceConfig: AgentWorkspaceConfig | undefined): void {
  for (const provider of workspaceConfig?.toolProviders ?? []) {
    const providerId = stringField(provider.providerId)
    const endpoint = stringField(provider.endpoint)
    if (!providerId || !endpoint) {
      console.warn('[agent] workspace tool provider was skipped because providerId or endpoint is missing')
      continue
    }
    const label = stringField(provider.label)
    try {
      registry.register({
        providerId,
        endpoint,
        ...(label ? { label } : {}),
      })
    } catch (error) {
      console.warn(`[agent] workspace tool provider ${providerId} was not registered: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

export function getAgentServerCapabilities(context: AgentServerContext): AgentServerCapabilities {
  const { pluginCatalog, paths, mcpEndpoint, resourceFileDownloader } = context
  const resourceFileDownloadEnabled = resourceFileDownloader.isEnabled?.() ?? true
  return {
    service: 'movscript-agent',
    mode: 'server',
    runtime: runtimeCompatibilityContract().runtime,
    mcpEndpoint,
    pluginCatalog: {
      skillsDir: pluginCatalog.skillsDir,
      toolsDir: pluginCatalog.toolsDir,
      builtinSkillsDir: pluginCatalog.builtinSkillsDir,
      builtinToolsDir: pluginCatalog.builtinToolsDir,
      skillCount: pluginCatalog.layeredSkills.length,
      toolCount: pluginCatalog.layeredTools.length,
      warnings: pluginCatalog.warnings,
    },
    paths,
    modelConfig: {
      supported: true,
      provider: 'backend-model-config',
      path: paths.modelConfigPath,
    },
    updates: context.updates,
    resourceFileDownloadEnabled,
    toolProviders: context.toolProviderRegistry?.listProviders?.() ?? [],
    ...(context.sessionRuntime ? {
      sessionRuntime: {
        sessionId: context.sessionRuntime.sessionId,
        workspaceDir: context.sessionRuntime.workspaceDir,
        sessionDir: context.sessionRuntime.paths.sessionDir,
        runtimeLogPath: context.sessionRuntime.paths.runtimeLogPath,
        runtimePath: context.sessionRuntime.paths.runtimePath,
        lockPath: context.sessionRuntime.paths.lockPath,
      },
    } : {}),
  }
}

export function getAgentRuntimeCompatibility(context: AgentServerContext): AgentRuntimeCompatibility {
  const contract = runtimeCompatibilityContract()
  return {
    ok: true,
    service: contract.service,
    mode: contract.mode,
    runtime: contract.runtime,
  }
}

function runtimeCompatibilityContract(): Omit<AgentRuntimeCompatibility, 'ok'> {
  return {
    service: 'movscript-agent',
    mode: 'server',
    runtime: {
      apiVersion: RUNTIME_API_VERSION,
      features: [
        'model-config',
        'runtime-capabilities',
        'backend-api-base-url-header',
        'dynamic-update-policy',
        'frontend-workspace-mcp',
        'memories',
        'agent-catalog-runtime-tools',
        'run-cancel',
        'runtime-thread-recovery',
        'runtime-livez',
        'runtime-compat',
        'dynamic-tool-providers',
        'workspace-session-runtime',
      ],
      endpoints: [
        '/livez',
        '/runtime/compat',
        '/health',
        '/runtime/capabilities',
        '/runtime/tool-providers',
        '/model-config',
        '/runs',
        '/runs/{id}/cancel',
        '/runs/{id}/resume',
        '/memories',
      ],
    },
  }
}

export function logAgentServerStartup(context: AgentServerContext, endpoint?: AgentRuntimeServerEndpoint): void {
  const { port, mcpEndpoint, paths, resourceFileDownloader, pluginCatalog, updates } = context
  const resourceFileDownloadEnabled = resourceFileDownloader.isEnabled?.() ?? true
  const catalogReport = buildAgentCatalogStartupReport(pluginCatalog)
  console.info(`[agent] movscript-agent listening on ${endpoint?.label ?? `http://127.0.0.1:${port}`}`)
  console.info(`[agent] using MovScript MCP endpoint ${mcpEndpoint}`)
  if (context.sessionRuntime) {
    console.info(`[agent] session runtime workspace ${context.sessionRuntime.workspaceDir}`)
    console.info(`[agent] session runtime id ${context.sessionRuntime.sessionId}`)
    console.info(`[agent] session runtime dir ${context.sessionRuntime.paths.sessionDir}`)
  }
  console.info(`[agent] runtime data dir ${paths.runtimeDataDir}`)
  console.info(`[agent] runtime log path ${paths.runtimeLogPath}`)
  console.info(`[agent] memory path ${paths.memoryPath}`)
  console.info(`[agent] workspace path ${paths.workspacePath} (deprecated; workspace files are managed by frontend MCP)`)
  console.info(`[agent] catalog data path ${paths.catalogStatePath}`)
  console.info(`[agent] model config path ${paths.modelConfigPath}`)
  console.info(`[agent] resource file download ${resourceFileDownloadEnabled ? 'enabled' : 'disabled'}`)
  console.info(`[agent] update policy ${updates.policy.channel} (${updates.current.policyVersion})`)
  console.info(`[agent] skills dir ${pluginCatalog.skillsDir} (${pluginCatalog.layeredSkills.length})`)
  console.info(`[agent] tools dir ${pluginCatalog.toolsDir} (${pluginCatalog.layeredTools.length})`)
  console.info(
    `[agent] catalog check packs=${catalogReport.packCount} configFiles=${catalogReport.configFileCount} `
    + `skills=${catalogReport.skillCount} tools=${catalogReport.toolCount} grants=${catalogReport.toolGrantCount} `
    + `enabledPackIds=${catalogReport.enabledPackCount} enabledSkills=${catalogReport.enabledSkillCount} `
    + `enabledTools=${catalogReport.enabledToolCount} issues=${catalogReport.issueCount} `
    + `(errors=${catalogReport.errorCount}, warnings=${catalogReport.warningCount})`,
  )
  for (const configFile of catalogReport.configFiles) {
    console.info(
      `[agent] catalog config file ${configFile.id} packs=${configFile.enabledPackIds.join(',') || '-'} `
      + `configSkills=${configFile.configSkills} toolGrants=${configFile.toolGrants}`,
    )
  }
  for (const pack of catalogReport.packs) {
    console.info(
      `[agent] catalog pack ${pack.id} source=${pack.source} status=${pack.status} `
      + `schemas=${pack.schemas} skills=${pack.skills} tools=${pack.tools} file=${pack.filePath ?? '-'}`,
    )
    console.info(
      `[agent] catalog pack ${pack.id} skillRoots=${pack.skillRoots.join(',') || '-'} `
      + `toolRoots=${pack.toolRoots.join(',') || '-'}`,
    )
    if (pack.missingSkills.length > 0) console.warn(`[agent] catalog pack ${pack.id} missingSkills=${pack.missingSkills.join(',')}`)
    if (pack.missingTools.length > 0) console.warn(`[agent] catalog pack ${pack.id} missingTools=${pack.missingTools.join(',')}`)
  }
  for (const issue of catalogReport.issues) logCatalogIssue(issue)
  for (const warning of pluginCatalog.warnings) console.warn(`[agent] plugin warning: ${warning}`)
}

export function buildAgentCatalogStartupReport(pluginCatalog: AgentPluginCatalog): AgentCatalogStartupReport {
  const enabledPackIds = new Set(pluginCatalog.configFiles.flatMap((configFile) => configFile.enabledPackIds))
  const enabledSkillIds = new Set<string>()
  const enabledToolNames = new Set<string>()
  for (const packId of enabledPackIds) {
    collectPackClosure(packId, pluginCatalog, enabledPackIds)
  }
  for (const packId of enabledPackIds) {
    const pack = pluginCatalog.layeredRegistry.packs.get(packId)
    if (!pack) continue
    for (const skillId of pack.skills) enabledSkillIds.add(skillId)
    for (const toolName of pack.tools) enabledToolNames.add(toolName)
  }
  const issues = pluginCatalog.catalogIssues ?? []
  return {
    packCount: pluginCatalog.packs.length,
    configFileCount: pluginCatalog.configFiles.length,
    skillCount: pluginCatalog.layeredSkills.length,
    toolCount: pluginCatalog.layeredTools.length,
    toolGrantCount: pluginCatalog.manifest.tools.length,
    enabledPackCount: enabledPackIds.size,
    enabledSkillCount: enabledSkillIds.size,
    enabledToolCount: enabledToolNames.size,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
    warningCount: issues.filter((issue) => issue.level === 'warning').length,
    enabledPackIds: Array.from(enabledPackIds).sort(),
    configFiles: pluginCatalog.configFiles.map((configFile) => ({
      id: configFile.id,
      enabledPackIds: [...configFile.enabledPackIds],
      configSkills: configFile.skillIds.length,
      toolGrants: configFile.toolGrants.length,
    })),
    packs: pluginCatalog.packs.map((pack) => ({
      id: pack.id,
      source: pack.source,
      ...(pluginCatalog.resourcePaths.packs[pack.id] ? { filePath: displayPath(pluginCatalog.resourcePaths.packs[pack.id]) } : {}),
      schemas: pack.schemas.length,
      skills: pack.skills.length,
      tools: pack.tools.length,
      skillRoots: summarizeResourceRoots(pack.skills, pluginCatalog.resourcePaths.skills, pluginCatalog.builtinSkillsDir, pluginCatalog.skillsDir),
      toolRoots: summarizeResourceRoots(pack.tools, pluginCatalog.resourcePaths.tools, pluginCatalog.builtinToolsDir, pluginCatalog.toolsDir),
      missingSkills: pack.skills.filter((skillId) => !pluginCatalog.resourcePaths.skills[skillId]),
      missingTools: pack.tools.filter((toolName) => !pluginCatalog.resourcePaths.tools[toolName]),
      status: enabledPackIds.has(pack.id) ? 'enabled' : 'loaded',
    })),
    issues,
  }
}

function collectPackClosure(packId: string, pluginCatalog: AgentPluginCatalog, visited: Set<string>): void {
  const pack = pluginCatalog.layeredRegistry.packs.get(packId)
  if (!pack) return
  for (const requiredPackId of Object.keys(pack.requires?.packs ?? {})) {
    if (visited.has(requiredPackId)) continue
    visited.add(requiredPackId)
    collectPackClosure(requiredPackId, pluginCatalog, visited)
  }
}

function logCatalogIssue(issue: CatalogIssue): void {
  const suffix = issue.resourceId ? ` resource=${issue.resourceId}` : ''
  const line = `[agent] catalog ${issue.level}: ${issue.code}${suffix} - ${issue.message}`
  if (issue.level === 'error') console.error(line)
  else console.warn(line)
}

function summarizeResourceRoots(ids: string[], pathsById: Record<string, string>, builtinRoot: string, localRoot: string): string[] {
  const roots = ids.flatMap((id) => {
    const filePath = pathsById[id]
    if (!filePath) return []
    return [resourceRoot(filePath, builtinRoot) ?? resourceRoot(filePath, localRoot) ?? displayPath(dirname(filePath))]
  })
  return Array.from(new Set(roots)).sort()
}

function resourceRoot(filePath: string, rootDir: string): string | undefined {
  const rel = relative(rootDir, dirname(filePath))
  if (!rel || rel.startsWith('..')) return undefined
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  return parts.slice(0, 2).join('/') || '.'
}

function displayPath(filePath: string): string {
  const rel = relative(process.cwd(), filePath)
  return rel && !rel.startsWith('..') ? rel : filePath
}

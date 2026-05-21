import { dirname, relative } from 'node:path'
import { MCPClient } from '../mcpClient.js'
import { AgentRuntimeRouter, loadAgentPluginCatalog } from '../application/runtimeRouter.js'
import { FileAgentStore, resolveAgentMemoryPath, resolveAgentStatePath } from '../state/fileStore.js'
import { FileAgentDraftStore, resolveAgentDraftPath } from '../drafts/draftStore.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { MCPBackendApplyClient } from '../drafts/mcpBackendApplyClient.js'
import { FileAgentMemoryStore } from '../memory/fileMemoryStore.js'
import { FileAgentCatalogStateStore, resolveAgentCatalogStatePath } from '../catalog/state.js'
import { RuntimeModelConfigStore, resolveRuntimeModelConfigPath } from '../model/modelConfig.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
} from '../contracts/runtimeContract.js'
import { buildAgentUpdateState } from '../updates/updatePolicy.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { CatalogIssue } from '../catalog/types.js'

const DEFAULT_AGENT_PORT = 28765
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const RUNTIME_API_VERSION = 1

export interface AgentServerContext {
  port: number
  mcpEndpoint: string
  paths: {
    statePath: string
    memoryPath: string
    draftPath: string
    catalogStatePath: string
    modelConfigPath: string
  }
  updates: ReturnType<typeof buildAgentUpdateState>
  client: MCPClient
  runtimeRouter: AgentRuntimeRouter
  backendApplyClient: BackendApplyClient
  modelConfigStore: RuntimeModelConfigStore
  pluginCatalog: ReturnType<typeof loadAgentPluginCatalog>
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
  backendApplyEnabled: boolean
}

export interface AgentCatalogStartupReport {
  packCount: number
  profileCount: number
  skillCount: number
  toolCount: number
  toolGrantCount: number
  enabledPackCount: number
  enabledSkillCount: number
  enabledToolCount: number
  issueCount: number
  errorCount: number
  warningCount: number
  enabledPacks: string[]
  profiles: Array<{
    id: string
    enabledPacks: string[]
    workflows: number
    policies: number
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
  const statePath = resolveAgentStatePath()
  const memoryPath = resolveAgentMemoryPath(statePath)
  const draftPath = resolveAgentDraftPath(statePath)
  const catalogStatePath = resolveAgentCatalogStatePath(statePath)
  const modelConfigPath = resolveRuntimeModelConfigPath(statePath)
  logPhase('paths-resolved')
  const modelConfigStore = new RuntimeModelConfigStore(modelConfigPath)
  logPhase('model-config-store-created')
  const pluginCatalog = loadAgentPluginCatalog()
  logPhase(`plugin-catalog-loaded packs=${pluginCatalog.packs.length} skills=${pluginCatalog.layeredSkills.length} tools=${pluginCatalog.layeredTools.length}`)
  const catalogStateStore = new FileAgentCatalogStateStore(catalogStatePath)
  logPhase('catalog-state-store-loaded')
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
  const client = new MCPClient({ endpoint: mcpEndpoint })
  const backendApplyClient = new MCPBackendApplyClient(client)
  const runtimeContractResolver = EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER

  const runtimeRouter = new AgentRuntimeRouter({
    mcpClient: client,
    store: new FileAgentStore(statePath),
    draftStore: new FileAgentDraftStore(draftPath),
    backendApplyClient,
    memoryStore: new FileAgentMemoryStore(memoryPath),
    defaultAgentManifest: pluginCatalog.manifest,
    toolRegistry: pluginCatalog.registry,
    pluginCatalog,
    catalogStateStore,
    pluginCatalogLoader: (options) => loadAgentPluginCatalog(options),
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
  })
  logPhase('runtime-router-created')
  const recoveryReport = runtimeRouter.reconcileRuntimeThreads()
  console.info(`[agent] runtime recovery checked=${recoveryReport.checkedRunCount} rescheduled=${recoveryReport.rescheduledRunIds.length} interrupted=${recoveryReport.interruptedRunIds.length} waiting=${recoveryReport.waitingRunIds.length}`)
  logPhase('runtime-recovery-reconciled')

  return {
    port,
    mcpEndpoint,
    paths: {
      statePath,
      memoryPath,
      draftPath,
      catalogStatePath,
      modelConfigPath,
    },
    updates: updateState,
    client,
    runtimeRouter,
    backendApplyClient,
    modelConfigStore,
    pluginCatalog,
  }
}

export function getAgentServerCapabilities(context: AgentServerContext): AgentServerCapabilities {
  const { pluginCatalog, paths, mcpEndpoint, backendApplyClient } = context
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
        'drafts',
        'memories',
        'agent-catalog-runtime-tools',
        'run-cancel',
        'runtime-thread-recovery',
      ],
      endpoints: [
        '/health',
        '/runtime/capabilities',
        '/model-config',
        '/runs',
        '/runs/{id}/cancel',
        '/runs/{id}/resume',
        '/drafts',
        '/memories',
      ],
    },
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
    backendApplyEnabled: backendApplyClient.isEnabled(),
  }
}

export function logAgentServerStartup(context: AgentServerContext): void {
  const { port, mcpEndpoint, paths, backendApplyClient, pluginCatalog, updates } = context
  const catalogReport = buildAgentCatalogStartupReport(pluginCatalog)
  console.info(`[agent] movscript-agent listening on http://127.0.0.1:${port}`)
  console.info(`[agent] using MovScript MCP endpoint ${mcpEndpoint}`)
  console.info(`[agent] state path ${paths.statePath}`)
  console.info(`[agent] memory path ${paths.memoryPath}`)
  console.info(`[agent] draft path ${paths.draftPath}`)
  console.info(`[agent] catalog state path ${paths.catalogStatePath}`)
  console.info(`[agent] model config path ${paths.modelConfigPath}`)
  console.info(`[agent] backend apply ${backendApplyClient.isEnabled() ? 'enabled' : 'disabled'}`)
  console.info(`[agent] update policy ${updates.policy.channel} (${updates.current.policyVersion})`)
  console.info(`[agent] skills dir ${pluginCatalog.skillsDir} (${pluginCatalog.layeredSkills.length})`)
  console.info(`[agent] tools dir ${pluginCatalog.toolsDir} (${pluginCatalog.layeredTools.length})`)
  console.info(
    `[agent] catalog check packs=${catalogReport.packCount} profiles=${catalogReport.profileCount} `
    + `skills=${catalogReport.skillCount} tools=${catalogReport.toolCount} grants=${catalogReport.toolGrantCount} `
    + `enabledPacks=${catalogReport.enabledPackCount} enabledSkills=${catalogReport.enabledSkillCount} `
    + `enabledTools=${catalogReport.enabledToolCount} issues=${catalogReport.issueCount} `
    + `(errors=${catalogReport.errorCount}, warnings=${catalogReport.warningCount})`,
  )
  for (const profile of catalogReport.profiles) {
    console.info(
      `[agent] catalog profile ${profile.id} packs=${profile.enabledPacks.join(',') || '-'} `
      + `workflows=${profile.workflows} policies=${profile.policies} toolGrants=${profile.toolGrants}`,
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
  const enabledPackIds = new Set(pluginCatalog.profiles.flatMap((profile) => profile.enabledPacks))
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
    profileCount: pluginCatalog.profiles.length,
    skillCount: pluginCatalog.layeredSkills.length,
    toolCount: pluginCatalog.layeredTools.length,
    toolGrantCount: pluginCatalog.manifest.tools.length,
    enabledPackCount: enabledPackIds.size,
    enabledSkillCount: enabledSkillIds.size,
    enabledToolCount: enabledToolNames.size,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
    warningCount: issues.filter((issue) => issue.level === 'warning').length,
    enabledPacks: Array.from(enabledPackIds).sort(),
    profiles: pluginCatalog.profiles.map((profile) => ({
      id: profile.id,
      enabledPacks: [...profile.enabledPacks],
      workflows: profile.enabledWorkflows.length,
      policies: profile.enabledPolicies.length,
      toolGrants: profile.toolGrants.length,
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

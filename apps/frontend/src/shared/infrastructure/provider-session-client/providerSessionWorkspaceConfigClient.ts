import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { providerSessionWorkspaceScope, type ProviderSessionWorkspaceScopeInput } from '@/shared/infrastructure/provider-session-client/providerSessionHttpRoutes'
import type {
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
  ProviderCatalogConfigFile,
  ProviderCatalogInspectResponse,
  ProviderManifest,
  ProviderSessionSummary,
} from '@/shared/infrastructure/provider-session-client/types'

export interface ProviderSessionWorkspaceScopeContext extends ProviderSessionWorkspaceScopeInput {}

export interface ProviderSessionWorkspaceConfigContext extends ProviderSessionWorkspaceScopeContext {
  getWorkspaceConfig(input?: ProviderSessionWorkspaceScopeInput): Promise<MovScriptWorkspaceConfig>
  saveWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig>
}

type RuntimeConfigFileSaveResult = {
  configFile: ProviderCatalogConfigFile
  configFiles: ProviderCatalogConfigFile[]
  activeProviderManifest: ProviderManifest
  activeAgentManifest?: ProviderManifest
}

type RuntimeConfigFileDeleteResult = {
  configFiles: ProviderCatalogConfigFile[]
  activeProviderManifest: ProviderManifest
  activeAgentManifest?: ProviderManifest
}

export async function listProviderSessionsFromElectronWorkspace(
  input: ProviderSessionWorkspaceScopeInput = {},
  context: ProviderSessionWorkspaceScopeContext,
): Promise<{ sessions: ProviderSessionSummary[] }> {
  const electronApi = readElectronApi()
  if (typeof electronApi?.listProviderSessions !== 'function') {
    return { sessions: [] }
  }
  return electronApi.listProviderSessions(providerSessionWorkspaceScope(input, context))
}

export async function getProviderSessionWorkspaceConfig(
  input: ProviderSessionWorkspaceScopeInput = {},
  context: ProviderSessionWorkspaceScopeContext,
): Promise<MovScriptWorkspaceConfig> {
  const electronApi = readElectronApi()
  if (typeof electronApi?.getMovScriptWorkspaceConfig === 'function') {
    return electronApi.getMovScriptWorkspaceConfig(providerSessionWorkspaceScope(input, context))
  }
  return {
    schema: 'movscript.workspace-config.v2',
    updatedAt: new Date().toISOString(),
  }
}

export async function saveProviderSessionWorkspaceConfig(
  input: MovScriptWorkspaceConfigSaveInput,
  context: ProviderSessionWorkspaceConfigContext,
): Promise<MovScriptWorkspaceConfig> {
  const electronApi = readElectronApi()
  if (typeof electronApi?.saveMovScriptWorkspaceConfig === 'function') {
    return electronApi.saveMovScriptWorkspaceConfig({
      ...providerSessionWorkspaceScope({}, context),
      ...input,
    })
  }
  return context.getWorkspaceConfig()
}

export async function inspectProviderSessionCatalogFromWorkspace(
  context: ProviderSessionWorkspaceConfigContext,
  runtimeInspect: () => Promise<ProviderCatalogInspectResponse>,
): Promise<ProviderCatalogInspectResponse> {
  const runtimeCatalog = await runtimeInspect()
  if (typeof readElectronApi()?.getMovScriptWorkspaceConfig !== 'function') return runtimeCatalog
  const config = await context.getWorkspaceConfig()
  return mergeProviderCatalogInspectWithWorkspaceConfig(runtimeCatalog, config)
}

export async function saveProviderSessionConfigFile(
  input: { configFile: ProviderCatalogConfigFile; activate?: boolean },
  context: ProviderSessionWorkspaceConfigContext,
  runtimeSave: () => Promise<RuntimeConfigFileSaveResult>,
): Promise<RuntimeConfigFileSaveResult> {
  if (typeof readElectronApi()?.saveMovScriptWorkspaceConfig !== 'function') return runtimeSave()
  const config = await context.getWorkspaceConfig()
  const agentCatalog = nextAgentCatalogConfig(config, {
    configFiles: upsertConfigFile(config.agentCatalog?.configFiles, input.configFile),
    activeConfigFileId: input.activate ? input.configFile.id : config.agentCatalog?.activeConfigFileId,
  })
  const savedConfig = await context.saveWorkspaceConfig({ agentCatalog })
  const runtimeResult = await bestEffortRuntimeSync(runtimeSave)
  return runtimeResult ?? runtimeConfigFileSaveResult(input.configFile, savedConfig.agentCatalog?.configFiles ?? agentCatalog.configFiles ?? [], savedConfig.agentCatalog?.activeConfigFileId)
}

export async function deleteProviderSessionConfigFile(
  input: { configFileId: string },
  context: ProviderSessionWorkspaceConfigContext,
  runtimeDelete: () => Promise<RuntimeConfigFileDeleteResult>,
): Promise<RuntimeConfigFileDeleteResult> {
  if (typeof readElectronApi()?.saveMovScriptWorkspaceConfig !== 'function') return runtimeDelete()
  const config = await context.getWorkspaceConfig()
  const configFiles = (config.agentCatalog?.configFiles ?? []).filter((configFile) => configFile.id !== input.configFileId)
  const activeConfigFileId = config.agentCatalog?.activeConfigFileId === input.configFileId
    ? configFiles[0]?.id
    : config.agentCatalog?.activeConfigFileId
  const agentCatalog = nextAgentCatalogConfig(config, { configFiles, activeConfigFileId })
  const savedConfig = await context.saveWorkspaceConfig({ agentCatalog })
  const runtimeResult = await bestEffortRuntimeSync(runtimeDelete)
  return runtimeResult ?? runtimeConfigFileDeleteResult(savedConfig.agentCatalog?.configFiles ?? agentCatalog.configFiles ?? [], savedConfig.agentCatalog?.activeConfigFileId)
}

export async function saveActiveProviderSessionConfigFile(
  input: { configFileId: string },
  context: ProviderSessionWorkspaceConfigContext,
  runtimeSaveActive: () => Promise<ProviderManifest>,
): Promise<ProviderManifest> {
  if (typeof readElectronApi()?.saveMovScriptWorkspaceConfig !== 'function') return runtimeSaveActive()
  const config = await context.getWorkspaceConfig()
  await context.saveWorkspaceConfig({
    agentCatalog: nextAgentCatalogConfig(config, { activeConfigFileId: input.configFileId }),
  })
  return await bestEffortRuntimeSync(runtimeSaveActive) ?? emptyProviderManifest(input.configFileId)
}

function mergeProviderCatalogInspectWithWorkspaceConfig(
  catalog: ProviderCatalogInspectResponse,
  config: MovScriptWorkspaceConfig,
): ProviderCatalogInspectResponse {
  const agentCatalog = config.agentCatalog
  if (!agentCatalog?.activeConfigFileId && !agentCatalog?.configFiles?.length) return catalog
  const configFilesById = new Map<string, ProviderCatalogConfigFile>()
  for (const configFile of catalog.configFiles ?? []) configFilesById.set(configFile.id, configFile)
  for (const configFile of agentCatalog.configFiles ?? []) configFilesById.set(configFile.id, configFile)
  const configFiles = Array.from(configFilesById.values())
  const activeConfigFileId = agentCatalog.activeConfigFileId
    && configFiles.some((configFile) => configFile.id === agentCatalog.activeConfigFileId)
    ? agentCatalog.activeConfigFileId
    : catalog.activeConfigFileId
  return {
    ...catalog,
    configFiles,
    activeConfigFileId,
  }
}

function nextAgentCatalogConfig(
  config: MovScriptWorkspaceConfig,
  patch: NonNullable<MovScriptWorkspaceConfig['agentCatalog']>,
): NonNullable<MovScriptWorkspaceConfig['agentCatalog']> {
  return {
    ...(config.agentCatalog ?? {}),
    ...patch,
  }
}

function upsertConfigFile(
  configFiles: ProviderCatalogConfigFile[] | undefined,
  configFile: ProviderCatalogConfigFile,
): ProviderCatalogConfigFile[] {
  const byId = new Map<string, ProviderCatalogConfigFile>()
  for (const item of configFiles ?? []) byId.set(item.id, item)
  byId.set(configFile.id, configFile)
  return Array.from(byId.values())
}

async function bestEffortRuntimeSync<T>(sync: () => Promise<T>): Promise<T | null> {
  try {
    return await sync()
  } catch {
    return null
  }
}

function runtimeConfigFileSaveResult(
  configFile: ProviderCatalogConfigFile,
  configFiles: ProviderCatalogConfigFile[],
  activeConfigFileId: string | undefined,
): RuntimeConfigFileSaveResult {
  return {
    configFile,
    configFiles,
    activeProviderManifest: emptyProviderManifest(activeConfigFileId ?? configFile.id),
  }
}

function runtimeConfigFileDeleteResult(
  configFiles: ProviderCatalogConfigFile[],
  activeConfigFileId: string | undefined,
): RuntimeConfigFileDeleteResult {
  return {
    configFiles,
    activeProviderManifest: emptyProviderManifest(activeConfigFileId),
  }
}

function emptyProviderManifest(configFileId: string | undefined): ProviderManifest {
  return {
    schema: 'movscript.agent.current',
    id: configFileId ?? 'electron-workspace',
    version: '0.0.0',
    name: 'Electron workspace agent settings',
    tools: [],
    skills: [],
  } as ProviderManifest
}

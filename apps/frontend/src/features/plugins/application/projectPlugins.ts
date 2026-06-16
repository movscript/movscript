import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import type {
  ElectronProjectLocalSkill,
  ElectronProjectPluginSnapshot,
} from '@/shared/contracts/electronApi'
import {
  installProviderMarketplacePlugin,
  type ProviderPluginMarketplaceItem,
} from '@/features/plugins/application/providerPluginMarketplace'

export type ProjectPluginSnapshot = ElectronProjectPluginSnapshot
export type ProjectLocalSkill = ElectronProjectLocalSkill
export const PROJECT_PLUGIN_MARKETPLACE_NAME = 'movscript-project'

export type ProjectPluginContext = {
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir?: string
  projectId?: string | number
  userId?: string | number
  orgId?: string | number
}

export type ProjectSkillObservation = {
  ok: boolean
  providerLabel?: string
  cwd?: string
  skillCount: number
  errorCount: number
  skillNames: string[]
  errors: Array<{ path?: string; message: string }>
  unavailableReason?: string
}

export async function loadProjectPluginSnapshot(context: ProjectPluginContext | string = {}): Promise<ProjectPluginSnapshot> {
  const api = readElectronApi()
  if (!api?.getProjectPluginSnapshot) throw new Error('当前窗口没有项目插件管理能力')
  return api.getProjectPluginSnapshot(normalizeProjectPluginContext(context))
}

export async function installProviderMarketplacePluginToProject(
  item: ProviderPluginMarketplaceItem,
  context: ProjectPluginContext | string = {},
): Promise<ProjectPluginSnapshot> {
  const api = readElectronApi()
  if (!api?.installProjectPlugin) throw new Error('当前窗口没有项目插件安装能力')
  const providerInstallResult = item.sourceType === 'local'
    ? undefined
    : await installProviderMarketplacePlugin(item)
  const installedSourcePath = sourcePathFromProviderInstallResult(providerInstallResult)
  return api.installProjectPlugin({
    ...normalizeProjectPluginContext(context),
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    version: item.version,
    description: item.description,
    marketplaceName: PROJECT_PLUGIN_MARKETPLACE_NAME,
    sourceMarketplaceName: item.marketplaceName,
    sourceMarketplacePath: item.marketplacePath,
    pluginKey: `${item.name}@${PROJECT_PLUGIN_MARKETPLACE_NAME}`,
    sourceType: item.sourceType,
    sourcePath: installedSourcePath ?? item.sourcePath,
    enabled: true,
  })
}

export async function setProjectSkillEnabled(
  context: ProjectPluginContext | string,
  skillId: string,
  enabled: boolean,
): Promise<ProjectPluginSnapshot> {
  const api = readElectronApi()
  if (!api?.setProjectSkillEnabled) throw new Error('当前窗口没有项目 skill 启停能力')
  return api.setProjectSkillEnabled({ ...normalizeProjectPluginContext(context), skillId, enabled })
}

function normalizeProjectPluginContext(context: ProjectPluginContext | string): ProjectPluginContext {
  if (typeof context === 'string') return { movScriptHomeDir: context, workspaceDir: context }
  const movScriptHomeDir = context.movScriptHomeDir ?? context.workspaceDir
  return {
    ...context,
    ...(movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}),
  }
}

function sourcePathFromProviderInstallResult(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return stringField(value.installedPath)
    ?? stringField(value.installed_path)
    ?? stringField(value.path)
    ?? (isRecord(value.plugin) ? stringField(value.plugin.installedPath) ?? stringField(value.plugin.installed_path) : undefined)
}

export async function observeProjectSkills(workspaceDir: string): Promise<ProjectSkillObservation> {
  const providers = enabledProviders(normalizeProviderSettings(useProviderConfigStore.getState().settings))
  const provider = providers.find(usesAppServerProtocol)
  if (!provider) return unavailableProjectSkillObservation('没有可用的 app-server provider')
  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider, { appServerPolicy: 'status-only' })
    const response = await dataSource.capabilities?.skills?.list({ cwds: [workspaceDir], forceReload: true })
    return normalizeProjectSkillObservation(response, workspaceDir, provider.label)
  } catch (error) {
    return unavailableProjectSkillObservation(error instanceof Error ? error.message : String(error), provider.label)
  }
}

function normalizeProjectSkillObservation(response: unknown, workspaceDir: string, providerLabel: string): ProjectSkillObservation {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return unavailableProjectSkillObservation('app-server skills/list 返回格式不可识别', providerLabel)
  }
  const entry = response.data.find((item) => isRecord(item) && item.cwd === workspaceDir) ?? response.data.find(isRecord)
  if (!isRecord(entry)) {
    return {
      ok: true,
      providerLabel,
      cwd: workspaceDir,
      skillCount: 0,
      errorCount: 0,
      skillNames: [],
      errors: [],
    }
  }
  const skills = Array.isArray(entry.skills) ? entry.skills.filter(isRecord) : []
  const errors = Array.isArray(entry.errors) ? entry.errors.filter(isRecord) : []
  return {
    ok: true,
    providerLabel,
    cwd: typeof entry.cwd === 'string' ? entry.cwd : workspaceDir,
    skillCount: skills.length,
    errorCount: errors.length,
    skillNames: skills
      .map((skill) => typeof skill.name === 'string' ? skill.name : undefined)
      .filter((name): name is string => Boolean(name)),
    errors: errors.map((error) => ({
      ...(typeof error.path === 'string' ? { path: error.path } : {}),
      message: typeof error.message === 'string' ? error.message : '未知 skill 加载错误',
    })),
  }
}

function unavailableProjectSkillObservation(reason: string, providerLabel?: string): ProjectSkillObservation {
  return {
    ok: false,
    ...(providerLabel ? { providerLabel } : {}),
    skillCount: 0,
    errorCount: 0,
    skillNames: [],
    errors: [],
    unavailableReason: reason,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

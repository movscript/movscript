import {
  redactAgentTraceDebugText,
  type ProviderModelAPIKind,
} from '@movscript/core/agent'
import type {
  ProviderCatalogConfigFile,
  ProviderModelConfigPublic,
} from '@/shared/infrastructure/providerSessionClient'
import {
  buildSettingsActionItemsFromInput,
  type BuildSettingsActionItemsInput,
} from '@/features/agent/application/agentSettingsActionItems'

export type SkillConfigIssue = { type: 'dependency' | 'conflict'; skillId: string; relatedSkillId: string }

export type SettingsReadinessItem = {
  id: string
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}

export type SettingsActionItem = {
  id: string
  status: 'warning' | 'action'
  targetSection:
    | 'agent-settings-config-files'
    | 'agent-settings-installed-capabilities'
    | 'agent-settings-skills'
    | 'agent-settings-tools'
    | 'agent-settings-model'
    | 'agent-settings-snapshot'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
  reasons?: SettingsActionReason[]
  quickFix?: SettingsActionQuickFix
  quickFixLabelKey?: string
  persistHintKey?: string
}

export type SettingsActionReason = {
  labelKey: string
  values?: Record<string, string | number>
}

export type ToolPermissionsWorkspaceIssue = {
  toolName: string
  reasonKey: string
  values?: Record<string, string | number>
}

export type ModelCompatibilityProbe = {
  id: 'api-mode' | 'model-id' | 'credentials' | 'base-url' | 'routes'
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}

export type ApiModeSwitchPlanItem = {
  id: 'target-mode' | 'model-id' | 'credentials' | 'base-url' | 'routes' | 'save-test'
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}

export type SettingsActionQuickFix =
  | 'reset-model-workspace'
  | 'confirm-clear-model-config'
  | 'enable-chat-route'
  | 'switch-openai-responses'
  | 'strip-sensitive-base-url-query'
  | 'reset-config-file-workspace'
  | 'reset-skill-config-workspace'
  | 'fix-tool-permissions-workspace-issues'
  | 'reset-tool-permissions-workspace'

export type AgentSettingsSkillStats = {
  installed: number
  enabled: number
  disabled: number
  core: number
  onDemand: number
  manual: number
}

export type AgentSettingsToolStats = {
  discovered: number
  available: number
  blocked: number
}

export function buildModelRouteIssues(input: { useForChat: boolean; useForPlanner: boolean }): string[] {
  if (!input.useForChat && !input.useForPlanner) return ['allRoutesDisabled']
  return []
}

export function buildModelCompatibilityProbes(input: {
  selectedApiKind: ProviderModelAPIKind
  modelValue: string
  baseURL: string
  apiKeyProvided: boolean
  usesBackendCompatibleBaseURL: boolean
  modelBaseURLHasSecret: boolean
  directModelIdHasSecret: boolean
  useForChat: boolean
  useForPlanner: boolean
  effectiveConfig: ProviderModelConfigPublic | null
}): ModelCompatibilityProbe[] {
  const model = input.modelValue.trim()
  const probes: ModelCompatibilityProbe[] = []
  probes.push({
    id: 'api-mode',
    status: input.selectedApiKind === 'openai_chat_completions' ? 'warning' : 'ready',
    labelKey: 'agents.settings.modelCompatibility.apiMode',
    detailKey: input.selectedApiKind === 'openai_chat_completions'
      ? 'agents.settings.modelCompatibilityDetails.apiModeChatCompatibility'
      : 'agents.settings.modelCompatibilityDetails.apiModeReady',
    detailValues: { apiKind: input.selectedApiKind },
  })

  let modelStatus: ModelCompatibilityProbe['status'] = model ? 'ready' : 'action'
  let modelDetailKey = model ? 'agents.settings.modelCompatibilityDetails.modelIdReady' : 'agents.settings.modelCompatibilityDetails.modelIdMissing'
  if (model && input.directModelIdHasSecret) {
    modelStatus = 'action'
    modelDetailKey = 'agents.settings.modelCompatibilityDetails.modelIdSecret'
  } else if (model && !input.usesBackendCompatibleBaseURL && input.selectedApiKind === 'anthropic_messages' && /^(gpt|o\d|text-|davinci)/i.test(model)) {
    modelStatus = 'warning'
    modelDetailKey = 'agents.settings.modelCompatibilityDetails.modelIdProviderMismatch'
  } else if (model && !input.usesBackendCompatibleBaseURL && (input.selectedApiKind === 'openai_responses' || input.selectedApiKind === 'openai_chat_completions') && /^claude/i.test(model)) {
    modelStatus = 'warning'
    modelDetailKey = 'agents.settings.modelCompatibilityDetails.modelIdProviderMismatch'
  }
  probes.push({
    id: 'model-id',
    status: modelStatus,
    labelKey: 'agents.settings.modelCompatibility.modelId',
    detailKey: modelDetailKey,
    detailValues: { model: model || '-' },
  })

  const credentialStatus = input.effectiveConfig?.apiKind === input.selectedApiKind ? input.effectiveConfig.credentialStatus : undefined
  const hasUsableSettingsApiKey = input.apiKeyProvided || Boolean(input.effectiveConfig?.apiKeyConfigured)
  const usesBackendRequestAuth = input.usesBackendCompatibleBaseURL
  probes.push({
    id: 'credentials',
    status: usesBackendRequestAuth
      ? 'ready'
      : !hasUsableSettingsApiKey
        ? 'action'
        : 'ready',
    labelKey: 'agents.settings.modelCompatibility.credentials',
    detailKey: usesBackendRequestAuth
      ? 'agents.settings.modelCompatibilityDetails.credentialsBackendManaged'
      : !hasUsableSettingsApiKey
        ? 'agents.settings.modelCompatibilityDetails.credentialsMissing'
        : 'agents.settings.modelCompatibilityDetails.credentialsReady',
    detailValues: { env: credentialStatus?.acceptedEnv.join(', ') || 'model settings API key' },
  })

  const hasCustomBaseURL = Boolean(input.baseURL)
  const baseURLLooksValid = !hasCustomBaseURL || isValidHTTPURL(input.baseURL)
  probes.push({
    id: 'base-url',
    status: input.modelBaseURLHasSecret || !baseURLLooksValid ? 'action' : 'ready',
    labelKey: 'agents.settings.modelCompatibility.baseURL',
    detailKey: input.modelBaseURLHasSecret
      ? 'agents.settings.modelCompatibilityDetails.baseURLSecret'
      : !baseURLLooksValid
        ? 'agents.settings.modelCompatibilityDetails.baseURLInvalid'
        : hasCustomBaseURL
          ? 'agents.settings.modelCompatibilityDetails.baseURLCustom'
          : 'agents.settings.modelCompatibilityDetails.baseURLDefault',
    detailValues: { baseURL: input.baseURL || '-' },
  })

  probes.push({
    id: 'routes',
    status: input.useForChat || input.useForPlanner ? 'ready' : 'action',
    labelKey: 'agents.settings.modelCompatibility.routes',
    detailKey: input.useForChat || input.useForPlanner
      ? 'agents.settings.modelCompatibilityDetails.routesReady'
      : 'agents.settings.modelCompatibilityDetails.routesMissing',
  })
  return probes
}

export function buildApiModeSwitchTaskGraph(input: {
  selectedApiKind: ProviderModelAPIKind
  probes: ModelCompatibilityProbe[]
  hasUnsavedChanges: boolean
}): ApiModeSwitchPlanItem[] {
  const probeById = new Map(input.probes.map((probe) => [probe.id, probe]))
  const targetApiKind = recommendedSwitchTarget(input.selectedApiKind)
  const hasActionProbe = input.probes.some((probe) => probe.status === 'action')
  const saveStatus: ApiModeSwitchPlanItem['status'] = hasActionProbe ? 'action' : input.hasUnsavedChanges ? 'warning' : 'ready'
  return [
    {
      id: 'target-mode',
      status: input.selectedApiKind === targetApiKind ? 'ready' : 'warning',
      labelKey: 'agents.settings.apiModeSwitchTaskGraph.targetMode',
      detailKey: input.selectedApiKind === targetApiKind
        ? 'agents.settings.apiModeSwitchPlanDetails.targetModeStable'
        : 'agents.settings.apiModeSwitchPlanDetails.targetModeMigration',
      detailValues: { apiKind: input.selectedApiKind, targetApiKind },
    },
    switchPlanProbeItem('model-id', probeById.get('model-id'), 'agents.settings.apiModeSwitchTaskGraph.modelId'),
    switchPlanProbeItem('credentials', probeById.get('credentials'), 'agents.settings.apiModeSwitchTaskGraph.credentials'),
    switchPlanProbeItem('base-url', probeById.get('base-url'), 'agents.settings.apiModeSwitchTaskGraph.baseURL'),
    switchPlanProbeItem('routes', probeById.get('routes'), 'agents.settings.apiModeSwitchTaskGraph.routes'),
    {
      id: 'save-test',
      status: saveStatus,
      labelKey: 'agents.settings.apiModeSwitchTaskGraph.saveTest',
      detailKey: hasActionProbe
        ? 'agents.settings.apiModeSwitchPlanDetails.saveTestBlocked'
        : input.hasUnsavedChanges
          ? 'agents.settings.apiModeSwitchPlanDetails.saveTestPending'
          : 'agents.settings.apiModeSwitchPlanDetails.saveTestReady',
    },
  ]
}

export function buildSettingsReadinessItems(input: {
  effectiveConfig: ProviderModelConfigPublic | null
  selectedApiKind: ProviderModelAPIKind
  savedDirectModelIdHasSecret: boolean
  modelRoutes: NonNullable<ProviderModelConfigPublic['capabilities']>
  modelRouteIssues: string[]
  currentConfigFile: ProviderCatalogConfigFile | null
  skillConfigIssues: SkillConfigIssue[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  skillStats: AgentSettingsSkillStats
  toolStats: AgentSettingsToolStats
  hasUnsavedChanges: boolean
  hasConfigFileChange: boolean
  hasSkillConfigChange: boolean
  hasToolPermissionsChange: boolean
}): SettingsReadinessItem[] {
  const configuredRoutes = input.modelRoutes.filter((route) => route.configured).length
  const pendingChanges = [input.hasUnsavedChanges, input.hasConfigFileChange, input.hasSkillConfigChange, input.hasToolPermissionsChange].filter(Boolean).length
  const credentialStatus = input.effectiveConfig?.credentialStatus
  const skillConfigHasIssues = input.skillConfigIssues.length > 0
  const toolPermissionsHasWorkspaceIssues = input.toolPermissionsWorkspaceIssues.length > 0
  return [
    {
      id: 'model',
      status: !input.effectiveConfig?.configured || input.savedDirectModelIdHasSecret ? 'action' : 'ready',
      labelKey: 'agents.settings.readiness.model',
      detailKey: input.savedDirectModelIdHasSecret
        ? 'agents.settings.readinessDetails.modelIdSensitive'
        : input.effectiveConfig?.configured
          ? 'agents.settings.readinessDetails.modelReady'
          : 'agents.settings.readinessDetails.modelMissing',
      detailValues: { model: input.effectiveConfig?.model ? redactAgentTraceDebugText(input.effectiveConfig.model) : '-' },
    },
    {
      id: 'api-mode',
      status: input.selectedApiKind === 'openai_chat_completions' ? 'warning' : 'ready',
      labelKey: 'agents.settings.readiness.apiMode',
      detailKey: apiModeReadinessDetailKey(input.selectedApiKind),
    },
    {
      id: 'model-credentials',
      status: credentialStatus?.required && !credentialStatus.configured ? 'action' : 'ready',
      labelKey: 'agents.settings.readiness.modelCredentials',
      detailKey: credentialStatus?.required
        ? credentialStatus.configured
          ? 'agents.settings.readinessDetails.modelCredentialsReady'
          : 'agents.settings.readinessDetails.modelCredentialsMissing'
        : 'agents.settings.readinessDetails.modelCredentialsNotRequired',
      detailValues: {
        env: credentialStatus?.configured ? credentialStatus.sourceEnv.join(', ') : credentialStatus?.acceptedEnv.join(', ') ?? '-',
      },
    },
    {
      id: 'routes',
      status: input.modelRouteIssues.length > 0 ? 'action' : configuredRoutes > 0 ? 'ready' : 'warning',
      labelKey: 'agents.settings.readiness.routes',
      detailKey: input.modelRouteIssues.length > 0
        ? 'agents.settings.readinessDetails.routesInvalid'
        : configuredRoutes > 0
          ? 'agents.settings.readinessDetails.routesReady'
          : 'agents.settings.readinessDetails.routesMissing',
      detailValues: { count: configuredRoutes },
    },
    {
      id: 'configFile',
      status: input.currentConfigFile ? 'ready' : 'action',
      labelKey: 'agents.settings.readiness.configFile',
      detailKey: input.currentConfigFile ? 'agents.settings.readinessDetails.configFileReady' : 'agents.settings.readinessDetails.configFileMissing',
      detailValues: { name: input.currentConfigFile?.name ?? '-' },
    },
    {
      id: 'skills',
      status: skillConfigHasIssues ? 'action' : input.skillStats.installed > 0 ? 'ready' : 'warning',
      labelKey: 'agents.settings.readiness.skills',
      detailKey: skillConfigHasIssues
        ? 'agents.settings.readinessDetails.skillsInvalid'
        : input.skillStats.installed > 0
          ? 'agents.settings.readinessDetails.skillsReady'
          : 'agents.settings.readinessDetails.skillsMissing',
      detailValues: { enabled: input.skillStats.enabled, installed: input.skillStats.installed, count: input.skillConfigIssues.length },
    },
    {
      id: 'tools',
      status: toolPermissionsHasWorkspaceIssues ? 'action' : input.toolStats.available > 0 ? 'ready' : 'warning',
      labelKey: 'agents.settings.readiness.tools',
      detailKey: toolPermissionsHasWorkspaceIssues
        ? 'agents.settings.readinessDetails.toolsInvalid'
        : input.toolStats.available > 0
          ? 'agents.settings.readinessDetails.toolsReady'
          : 'agents.settings.readinessDetails.toolsMissing',
      detailValues: { available: input.toolStats.available, discovered: input.toolStats.discovered, count: input.toolPermissionsWorkspaceIssues.length },
    },
    {
      id: 'pending',
      status: pendingChanges > 0 ? 'warning' : 'ready',
      labelKey: 'agents.settings.readiness.pendingChanges',
      detailKey: pendingChanges > 0 ? 'agents.settings.readinessDetails.pendingChanges' : 'agents.settings.readinessDetails.noPendingChanges',
      detailValues: { count: pendingChanges },
    },
  ]
}

export function buildSettingsActionItems(input: BuildSettingsActionItemsInput): SettingsActionItem[] {
  return buildSettingsActionItemsFromInput(input)
}

function switchPlanProbeItem(
  id: ApiModeSwitchPlanItem['id'],
  probe: ModelCompatibilityProbe | undefined,
  labelKey: string,
): ApiModeSwitchPlanItem {
  return {
    id,
    status: probe?.status ?? 'warning',
    labelKey,
    detailKey: probe?.detailKey ?? 'agents.settings.apiModeSwitchPlanDetails.probeMissing',
    detailValues: probe?.detailValues,
  }
}

function recommendedSwitchTarget(apiKind: ProviderModelAPIKind): ProviderModelAPIKind {
  if (apiKind === 'openai_chat_completions') return 'openai_responses'
  return apiKind
}

function isValidHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function apiModeReadinessDetailKey(apiKind: ProviderModelAPIKind): string {
  if (apiKind === 'openai_responses') return 'agents.settings.readinessDetails.apiModeResponsesRecommended'
  if (apiKind === 'openai_chat_completions') return 'agents.settings.readinessDetails.apiModeChatCompatibility'
  if (apiKind === 'anthropic_messages') return 'agents.settings.readinessDetails.apiModeAnthropicProvider'
  return 'agents.settings.readinessDetails.apiModeBackendManaged'
}

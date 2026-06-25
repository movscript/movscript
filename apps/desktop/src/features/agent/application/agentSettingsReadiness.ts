import { redactAgentTraceDebugText } from '@movscript/core/agent'
import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import type { ProviderModelConfigPublic } from '@movscript/agent-protocol'
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

export function buildSdkAgentReadinessItems(input: {
  agentLabel: string
  agentEnabled: boolean
  runtimeLabel: string
  runtimeAvailable: boolean
  authEnv?: string
  pendingChanges: number
}): SettingsReadinessItem[] {
  const items: SettingsReadinessItem[] = [
    {
      id: 'agent',
      status: input.agentEnabled ? 'ready' : 'action',
      labelKey: 'agents.settings.readiness.agent',
      detailKey: input.agentEnabled
        ? 'agents.settings.readinessDetails.agentReady'
        : 'agents.settings.readinessDetails.agentDisabled',
      detailValues: { agent: input.agentLabel },
    },
    {
      id: 'runtime',
      status: input.runtimeAvailable ? 'ready' : 'action',
      labelKey: 'agents.settings.readiness.runtime',
      detailKey: input.runtimeAvailable
        ? 'agents.settings.readinessDetails.runtimeSdkReady'
        : 'agents.settings.readinessDetails.runtimeUnavailable',
      detailValues: { runtime: input.runtimeLabel },
    },
    ...(input.authEnv ? [{
      id: 'sdk-credentials',
      status: 'warning' as const,
      labelKey: 'agents.settings.readiness.modelCredentials',
      detailKey: 'agents.settings.readinessDetails.sdkCredentialsEnvPreferred',
      detailValues: { env: input.authEnv },
    }] : []),
    {
      id: 'pending',
      status: input.pendingChanges > 0 ? 'warning' : 'ready',
      labelKey: 'agents.settings.readiness.pendingChanges',
      detailKey: input.pendingChanges > 0 ? 'agents.settings.readinessDetails.pendingChanges' : 'agents.settings.readinessDetails.noPendingChanges',
      detailValues: { count: input.pendingChanges },
    },
  ]
  return items
}

export function buildModelRouteIssues(input: { useForChat: boolean; useForPlanner: boolean }): string[] {
  if (!input.useForChat && !input.useForPlanner) return ['allRoutesDisabled']
  return []
}

export function buildSettingsReadinessItems(input: {
  effectiveConfig: ProviderModelConfigPublic | null
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

import type {
  ProviderCatalogConfigFile,
  ProviderSessionCapabilitiesResponse,
} from '@movscript/agent-protocol'
import type { ProviderModelConfigPublic } from '@movscript/agent-protocol'
import type {
  AgentSettingsToolStats,
  SettingsActionItem,
  SettingsActionReason,
  SkillConfigIssue,
  ToolPermissionsWorkspaceIssue,
} from '@/features/agent/application/agentSettingsReadiness'

export interface BuildSettingsActionItemsInput {
  effectiveConfig: ProviderModelConfigPublic | null
  savedDirectModelIdHasSecret: boolean
  modelRoutes: NonNullable<ProviderModelConfigPublic['capabilities']>
  modelRouteIssues: string[]
  currentConfigFile: ProviderCatalogConfigFile | null
  skillConfigIssues: SkillConfigIssue[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  toolStats: AgentSettingsToolStats
  tools?: ProviderSessionCapabilitiesResponse['resolvedTools']
  hasUnsavedChanges: boolean
  hasConfigFileChange: boolean
  hasSkillConfigChange: boolean
  hasToolPermissionsChange: boolean
}

export function buildSettingsActionItemsFromInput(input: BuildSettingsActionItemsInput): SettingsActionItem[] {
  const items: SettingsActionItem[] = []
  const configuredRoutes = input.modelRoutes.filter((route) => route.configured).length

  if (!input.effectiveConfig?.configured) {
    items.push({
      id: 'model-missing',
      status: 'action',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.modelMissing',
      detailKey: 'agents.settings.actionItemDetails.modelMissing',
    })
  } else if (input.hasUnsavedChanges) {
    items.push({
      id: 'model-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.modelUnsaved',
      detailKey: 'agents.settings.actionItemDetails.modelUnsaved',
      quickFix: 'reset-model-workspace',
      quickFixLabelKey: 'agents.settings.quickFixes.resetWorkspace',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  }

  if (input.savedDirectModelIdHasSecret) {
    items.push({
      id: 'model-id-sensitive',
      status: 'action',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.modelIdSensitive',
      detailKey: 'agents.settings.actionItemDetails.modelIdSensitive',
      quickFix: 'confirm-clear-model-config',
      quickFixLabelKey: 'agents.settings.quickFixes.confirmClearModelConfig',
      persistHintKey: 'agents.settings.actionItemPersistHints.useRuntimeEnvForSecrets',
    })
  }

  if (input.effectiveConfig?.credentialStatus?.required && !input.effectiveConfig.credentialStatus.configured) {
    items.push({
      id: 'model-credentials-missing',
      status: 'action',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.modelCredentialsMissing',
      detailKey: 'agents.settings.actionItemDetails.modelCredentialsMissing',
      detailValues: { env: input.effectiveConfig.credentialStatus.acceptedEnv.join(', ') },
      persistHintKey: 'agents.settings.actionItemPersistHints.useRuntimeEnvForSecrets',
    })
  }

  if (input.modelRouteIssues.length > 0) {
    items.push({
      id: 'routes-invalid',
      status: 'action',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.routesInvalid',
      detailKey: 'agents.settings.actionItemDetails.routesInvalid',
      quickFix: 'enable-chat-route',
      quickFixLabelKey: 'agents.settings.quickFixes.enableChatRoute',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveAfterQuickFix',
    })
  } else if (configuredRoutes === 0) {
    items.push({
      id: 'routes-missing',
      status: 'warning',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.routesMissing',
      detailKey: 'agents.settings.actionItemDetails.routesMissing',
    })
  }

  if (!input.currentConfigFile) {
    items.push({
      id: 'config-file-missing',
      status: 'action',
      targetSection: 'agent-settings-config-files',
      labelKey: 'agents.settings.actionItems.configFileMissing',
      detailKey: 'agents.settings.actionItemDetails.configFileMissing',
    })
  } else if (input.hasConfigFileChange) {
    items.push({
      id: 'config-file-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-config-files',
      labelKey: 'agents.settings.actionItems.configFileUnsaved',
      detailKey: 'agents.settings.actionItemDetails.configFileUnsaved',
      quickFix: 'reset-config-file-workspace',
      quickFixLabelKey: 'agents.settings.quickFixes.resetWorkspace',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  }

  if (input.skillConfigIssues.length > 0) {
    items.push({
      id: 'skill-config-invalid',
      status: 'action',
      targetSection: 'agent-settings-skills',
      labelKey: 'agents.settings.actionItems.skillConfigInvalid',
      detailKey: 'agents.settings.actionItemDetails.skillConfigInvalid',
      detailValues: { count: input.skillConfigIssues.length },
      reasons: compactActionReasons(input.skillConfigIssues.map(formatSettingsSkillConfigIssue)),
      quickFix: 'reset-skill-config-workspace',
      quickFixLabelKey: 'agents.settings.quickFixes.resetWorkspace',
    })
  } else if (input.hasSkillConfigChange) {
    items.push({
      id: 'skill-config-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-skills',
      labelKey: 'agents.settings.actionItems.skillConfigUnsaved',
      detailKey: 'agents.settings.actionItemDetails.skillConfigUnsaved',
      quickFix: 'reset-skill-config-workspace',
      quickFixLabelKey: 'agents.settings.quickFixes.resetWorkspace',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  }

  if (input.toolPermissionsWorkspaceIssues.length > 0) {
    items.push({
      id: 'tool-permissions-invalid',
      status: 'action',
      targetSection: 'agent-settings-tools',
      labelKey: 'agents.settings.actionItems.toolPermissionsInvalid',
      detailKey: 'agents.settings.actionItemDetails.toolPermissionsInvalid',
      detailValues: { count: input.toolPermissionsWorkspaceIssues.length },
      reasons: compactActionReasons(input.toolPermissionsWorkspaceIssues.map(formatSettingsToolPermissionsIssue)),
      quickFix: 'fix-tool-permissions-workspace-issues',
      quickFixLabelKey: 'agents.settings.fixToolPermissionsWorkspaceIssues',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveAfterQuickFix',
    })
  } else if (input.hasToolPermissionsChange) {
    items.push({
      id: 'tool-permissions-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-tools',
      labelKey: 'agents.settings.actionItems.toolPermissionsUnsaved',
      detailKey: 'agents.settings.actionItemDetails.toolPermissionsUnsaved',
      quickFix: 'reset-tool-permissions-workspace',
      quickFixLabelKey: 'agents.settings.quickFixes.resetWorkspace',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  } else if (input.toolStats.discovered > 0 && input.toolStats.available === 0) {
    items.push({
      id: 'tools-blocked',
      status: 'warning',
      targetSection: 'agent-settings-tools',
      labelKey: 'agents.settings.actionItems.toolsBlocked',
      detailKey: 'agents.settings.actionItemDetails.toolsBlocked',
      detailValues: { count: input.toolStats.discovered },
      reasons: compactActionReasons(buildToolUnavailableReasonSummary(input.tools)),
    })
  }

  return sortSettingsActionItems(items)
}

function sortSettingsActionItems(items: SettingsActionItem[]): SettingsActionItem[] {
  const statusRank: Record<SettingsActionItem['status'], number> = { action: 0, warning: 1 }
  return [...items].sort((a, b) => statusRank[a.status] - statusRank[b.status])
}

function formatSettingsSkillConfigIssue(issue: SkillConfigIssue): SettingsActionReason {
  if (issue.type === 'dependency') {
    return {
      labelKey: 'agents.settings.actionItemReasons.skillDependency',
      values: { skillId: issue.skillId, dependencyId: issue.relatedSkillId },
    }
  }
  return {
    labelKey: 'agents.settings.actionItemReasons.skillConflict',
    values: { skillId: issue.skillId, conflictId: issue.relatedSkillId },
  }
}

function formatSettingsToolPermissionsIssue(issue: ToolPermissionsWorkspaceIssue): SettingsActionReason {
  if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.notConfigFileGranted') {
    return {
      labelKey: 'agents.settings.actionItemReasons.toolNotConfigFileGranted',
      values: { toolName: issue.toolName },
    }
  }
  if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.unavailableAllow') {
    return {
      labelKey: 'agents.settings.actionItemReasons.toolUnavailableAllow',
      values: { toolName: issue.toolName, ...(issue.values ?? {}) },
    }
  }
  return {
    labelKey: issue.reasonKey,
    values: { toolName: issue.toolName, ...(issue.values ?? {}) },
  }
}

function buildToolUnavailableReasonSummary(tools?: ProviderSessionCapabilitiesResponse['resolvedTools']): SettingsActionReason[] {
  const reasons = new Map<string, number>()
  for (const tool of tools?.blocked ?? []) {
    const reason = tool.unavailableReason?.trim() || 'blocked'
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }
  return [...reasons.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({
      labelKey: 'agents.settings.actionItemReasons.toolUnavailableReason',
      values: { reason, count },
    }))
}

function compactActionReasons(reasons: SettingsActionReason[], limit = 3): SettingsActionReason[] {
  if (reasons.length <= limit) return reasons
  return [
    ...reasons.slice(0, limit),
    {
      labelKey: 'agents.settings.actionItemReasons.more',
      values: { count: reasons.length - limit },
    },
  ]
}

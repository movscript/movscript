import { parseSettingsSnapshot, redactAgentTraceDebugText, type AgentSettingsSnapshot, type ProviderModelAPIKind, type ToolGrantWorkspace } from '@movscript/core/agent'
import type { SettingsActionQuickFix } from '@/features/agent/application/agentSettingsReadiness'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'

type AgentSettingsTranslate = (key: string, values?: Record<string, unknown>) => string

export const NO_MODEL_VALUE = '__none'
export const DEFAULT_API_KIND: ProviderModelAPIKind = 'openai_responses'
export const MAX_SETTINGS_SNAPSHOT_BYTES = 1024 * 1024
export const MAX_CONFIG_FILE_BYTES = 256 * 1024

export const API_KIND_OPTIONS: Array<{ value: ProviderModelAPIKind; labelKey: string; descriptionKey: string }> = [
  { value: 'openai_chat_completions', labelKey: 'agents.settings.apiKinds.openaiChatCompletions', descriptionKey: 'agents.settings.apiKindDescriptions.openaiChatCompletions' },
  { value: 'openai_responses', labelKey: 'agents.settings.apiKinds.openaiResponses', descriptionKey: 'agents.settings.apiKindDescriptions.openaiResponses' },
  { value: 'anthropic_messages', labelKey: 'agents.settings.apiKinds.anthropicMessages', descriptionKey: 'agents.settings.apiKindDescriptions.anthropicMessages' },
]

export type SettingsQuickFixAuditKind =
  | 'workspace_reset'
  | 'workspace_repair'
  | 'sensitive_cleanup'
  | 'mode_migration'
  | 'route_enable'
  | 'clear_confirmation'
export type SettingsQuickFixDescriptor = {
  target: AgentSettingsAuditEntry['target']
  labelKey: string
  auditKind: SettingsQuickFixAuditKind
  feedbackKey: string
  resetModelErrors?: boolean
  scrollTargetSectionId?: string
}
export type SettingsSnapshotTextValidation = {
  snapshot: AgentSettingsSnapshot | null
  error: string | null
}

const SETTINGS_QUICK_FIX_DESCRIPTORS: Record<SettingsActionQuickFix, SettingsQuickFixDescriptor> = {
  'reset-model-workspace': {
    target: 'model',
    labelKey: 'agents.settings.quickFixes.resetWorkspace',
    auditKind: 'workspace_reset',
    feedbackKey: 'agents.settings.quickFixes.applied',
    resetModelErrors: true,
  },
  'confirm-clear-model-config': {
    target: 'model',
    labelKey: 'agents.settings.quickFixes.confirmClearModelConfig',
    auditKind: 'clear_confirmation',
    feedbackKey: 'agents.settings.quickFixes.confirmClearModelConfig',
    resetModelErrors: true,
    scrollTargetSectionId: 'agent-settings-model',
  },
  'enable-chat-route': {
    target: 'model',
    labelKey: 'agents.settings.quickFixes.enableChatRoute',
    auditKind: 'route_enable',
    feedbackKey: 'agents.settings.quickFixes.applied',
  },
  'reset-config-file-workspace': {
    target: 'config_file',
    labelKey: 'agents.settings.quickFixes.resetWorkspace',
    auditKind: 'workspace_reset',
    feedbackKey: 'agents.settings.quickFixes.applied',
  },
  'reset-skill-config-workspace': {
    target: 'skills',
    labelKey: 'agents.settings.quickFixes.resetWorkspace',
    auditKind: 'workspace_reset',
    feedbackKey: 'agents.settings.quickFixes.applied',
  },
  'fix-tool-permissions-workspace-issues': {
    target: 'tools',
    labelKey: 'agents.settings.fixToolPermissionsWorkspaceIssues',
    auditKind: 'workspace_repair',
    feedbackKey: 'agents.settings.quickFixes.applied',
  },
  'reset-tool-permissions-workspace': {
    target: 'tools',
    labelKey: 'agents.settings.quickFixes.resetWorkspace',
    auditKind: 'workspace_reset',
    feedbackKey: 'agents.settings.quickFixes.applied',
  },
}

export function byteLength(value: string): number {
  return new Blob([value]).size
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function settingsErrorMessage(error: unknown): string {
  return redactAgentTraceDebugText(error instanceof Error ? error.message : String(error))
}

export function validateSettingsSnapshotText(input: {
  text: string
  t: AgentSettingsTranslate
  maxBytes?: number
}): SettingsSnapshotTextValidation {
  if (!input.text.trim()) return { snapshot: null, error: null }
  const maxBytes = input.maxBytes ?? MAX_SETTINGS_SNAPSHOT_BYTES
  if (byteLength(input.text) > maxBytes) {
    return {
      snapshot: null,
      error: input.t('agents.settings.settingsSnapshotTooLarge', { size: formatBytes(maxBytes) }),
    }
  }
  try {
    return { snapshot: parseSettingsSnapshot(input.text), error: null }
  } catch (error) {
    return { snapshot: null, error: settingsErrorMessage(error) }
  }
}

export function settingsSnapshotFileSizeError(input: {
  size: number
  t: AgentSettingsTranslate
  maxBytes?: number
}): string | null {
  const maxBytes = input.maxBytes ?? MAX_SETTINGS_SNAPSHOT_BYTES
  return input.size > maxBytes
    ? input.t('agents.settings.settingsSnapshotTooLarge', { size: formatBytes(maxBytes) })
    : null
}

export function settingsSnapshotExportFilename(now = new Date()): string {
  return `agent-settings-snapshot-${now.toISOString().slice(0, 10)}.json`
}

export function settingsQuickFixDescriptor(quickFix: SettingsActionQuickFix): SettingsQuickFixDescriptor {
  return SETTINGS_QUICK_FIX_DESCRIPTORS[quickFix]
}

export function modelAuditSummaryValues(input: {
  t: AgentSettingsTranslate
  useForChat: boolean
  useForPlanner: boolean
  selectedModelLabel?: string
}) {
  const routes = [
    input.useForChat ? input.t('agents.settings.useForChat') : null,
    input.useForPlanner ? input.t('agents.settings.useForPlanner') : null,
  ].filter(Boolean).join(' + ') || '-'
  return {
    model: input.selectedModelLabel ?? '-',
    routes,
  }
}

export function toolPermissionsAuditSummaryValues(grants: ToolGrantWorkspace[]) {
  return {
    count: grants.length,
    allow: grants.filter((grant) => grant.mode === 'allow').length,
    deny: grants.filter((grant) => grant.mode === 'deny').length,
    approvals: grants.filter((grant) => (grant.approval ?? 'never') !== 'never').length,
  }
}

export function settingsQuickFixAuditAction(kind: SettingsQuickFixAuditKind): string {
  if (kind === 'workspace_reset') return 'settings_quick_fix_workspace_reset'
  if (kind === 'workspace_repair') return 'settings_quick_fix_workspace_repair'
  if (kind === 'sensitive_cleanup') return 'settings_quick_fix_sensitive_cleanup'
  if (kind === 'mode_migration') return 'settings_quick_fix_mode_migration'
  if (kind === 'route_enable') return 'settings_quick_fix_route_enable'
  return 'settings_quick_fix_clear_confirmation'
}

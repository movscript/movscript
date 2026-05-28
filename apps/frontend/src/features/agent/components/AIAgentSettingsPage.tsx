import { useRef, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bot, CheckCircle2, Clipboard, Copy, Download, Loader2, Plus, RefreshCw, Save, Settings, Terminal, TestTube2, Trash2, Upload, XCircle } from 'lucide-react'
import {
  AgentDataBlock,
  AgentSettingsApiModeCapabilityMatrix,
  AgentSettingsActionButton,
  AgentSettingsActionItemsPanel,
  AgentSettingsActionRow,
  AgentSettingsBadge,
  AgentSettingsCallout,
  AgentSettingsCodeBlock,
  AgentSettingsFieldHelp,
  AgentSettingsFieldLabel,
  AgentSettingsFormField,
  AgentSettingsFormGrid,
  AgentSettingsHeaderActions,
  AgentSettingsHeaderContent,
  AgentSettingsHeaderCopy,
  AgentSettingsHeaderDescription,
  AgentSettingsHeaderTitle,
  AgentSettingsHeaderTitleRow,
  AgentSettingsIcon,
  AgentSettingsInlineNote,
  AgentSettingsInput,
  AgentSettingsIssueList,
  AgentSettingsItemDetail,
  AgentSettingsItemTitle,
  AgentSettingsMigrationGuide,
  AgentSettingsKeyValue,
  AgentSettingsLayout,
  AgentSettingsMain,
  AgentSettingsModelOptionButton,
  AgentSettingsModelRouteCard,
  AgentSettingsNavigationButton,
  AgentSettingsNavigationList,
  AgentSettingsPanel,
  AgentSettingsProfileCard,
  AgentSettingsProfileDiffPanel,
  AgentSettingsReadinessPanel,
  AgentSettingsRunPresetEditorPanel,
  AgentSettingsRunPresetEffectivePolicyPanel,
  AgentSettingsScopeBadge,
  AgentSettingsScopeRail,
  AgentSettingsRunPresetRow,
  AgentSettingsSelectTrigger,
  AgentSettingsSidebar,
  AgentSettingsSkillBundlePanel,
  AgentSettingsSkillCard,
  AgentSettingsStack,
  AgentSettingsAuditTrailPanel,
  AgentSettingsSnapshotImpactPanel,
  AgentSettingsSnapshotImportScopePanel,
  AgentSettingsSnapshotSummaryPanel,
  AgentSettingsStatusPanel,
  AgentSettingsStateMessage,
  AgentSettingsStatusBadge,
  AgentSettingsSwitchPlanPanel,
  AgentSettingsTextarea,
  AgentSettingsToneText,
  AgentSettingsToolPolicyBulkActionPanel,
  AgentSettingsToolPolicyDiffPanel,
  AgentSettingsToolPolicyFilterPanel,
  AgentSettingsToolPolicyFilterPresetPanel,
  AgentSettingsToolPolicyRow,
  AgentSettingsToggleRow,
  AppInlineError,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  agentSettingsApiModeBadgeRecipe,
  agentSettingsRecipe,
  agentSettingsStatusRecipe,
} from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { buildSettingsSnapshot, parseSettingsSnapshot, resolveSnapshotRunPresetImport, validateSettingsSnapshotReferences, type AgentSettingsSnapshot, type RuntimeModelAPIKind, type SkillPolicyDraft, type ToolGrantDraft } from '@/features/agent/domain/agentSettingsSnapshot'
import { hasSensitiveTextSecret, hasSensitiveURLSecret, redactAgentTraceDebugText, stripSensitiveURLSecrets } from '@/features/agent/domain/agentTraceDebugData'
import { localAgentClient, type AgentCapabilitiesResponse, type AgentCatalogProfile, type AgentCatalogSkill, type AgentDebugTool, type AgentInspectResponse, type AgentSkillBundleInstallResult, type AgentSkillBundleUninstallResult, type RuntimeModelConfigPublic, type RuntimeModelTestResult } from '@/shared/infrastructure/localAgentClient'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { ROUTES } from '@/routes/projectRoutes'
import { agentConfigStatusRecipe, agentTestResultRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { activeRunPresetFromSettings, defaultAgentRunPresets, useAgentStore, type AgentRunPreset, type AgentSettingsAuditEntry, type AgentToolPolicyFilterPreset } from '@/features/agent/state/agentStore'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import type { PublicModel } from '@/types'

const NO_MODEL_VALUE = '__none'
const DEFAULT_API_KIND: RuntimeModelAPIKind = 'openai_chat_completions'
const MAX_SKILL_BUNDLE_FILES = 50
const MAX_SKILL_BUNDLE_FILE_BYTES = 256 * 1024
const MAX_SKILL_BUNDLE_TOTAL_BYTES = 1024 * 1024
const MAX_SETTINGS_SNAPSHOT_BYTES = 1024 * 1024
const RUN_PRESET_TASK_GRAPH_WORKER_OPTIONS = [1, 2, 3, 4] as const
const RUN_PRESET_TASK_GRAPH_ATTEMPT_OPTIONS = [1, 2, 3] as const
const RUN_PRESET_TASK_GRAPH_TIMEOUT_OPTIONS = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000] as const
const DEFAULT_RUN_PRESET_IDS = new Set(defaultAgentRunPresets().map((preset) => preset.id))
const TOOL_POLICY_FILTER_OPTIONS = ['all', 'available', 'blocked', 'profile_granted', 'requires_approval', 'write_risk'] as const
const AGENT_SETTINGS_UI_CONTRACT_MARKERS = [
  'data-testid="agent-settings-api-mode-capabilities"',
  'data-testid="agent-settings-api-mode-capability-item"',
  'data-testid="agent-settings-api-mode-switch-taskGraph"',
  'data-testid="agent-settings-copy-api-mode-switch-taskGraph"',
  'data-testid="agent-settings-api-mode-switch-taskGraph-item"',
  'data-testid="agent-settings-snapshot-impact"',
  'data-testid="agent-settings-snapshot-impact-item"',
  'data-testid="agent-settings-copy-snapshot-impact"',
  "value={snapshot.modelConfig?.model ? redactAgentTraceDebugText(snapshot.modelConfig.model) : '-'}",
  "{t('agents.settings.modelRouteModel')}: {redactAgentTraceDebugText(route.model)}",
  'data-testid="agent-settings-action-items"',
  'data-testid="agent-settings-action-items-counts"',
  'data-testid="agent-settings-action-item"',
  'data-testid="agent-settings-copy-action-items"',
  'data-testid="agent-settings-action-item-reasons"',
  'data-testid="agent-settings-action-jump"',
  'data-testid="agent-settings-action-quick-fix"',
  'data-testid="agent-settings-action-feedback"',
  'data-testid="agent-settings-action-persist-hint"',
  "data-audit-status={isFailure ? 'failed' : 'ok'}",
  "variant={isFailure ? 'soft' : 'outline'}",
  'data-testid="agent-settings-audit-trail"',
  'data-testid="agent-settings-audit-entry"',
  'data-testid="agent-settings-copy-audit"',
  'data-testid="agent-settings-clear-audit"',
  'data-testid="agent-settings-copy-readiness"',
  'data-testid="agent-run-preset-editor"',
  'data-testid="agent-run-preset-effective-policy"',
  'data-testid="agent-settings-snapshot-summary"',
  'data-testid="agent-settings-skill-bundle-draft-summary"',
  'data-testid="agent-settings-skill-bundle-draft-error"',
  'data-testid="agent-settings-uninstall-plugin-id-error"',
  'disabled={skillBundleInstalling || !skillBundleDraftValidation.bundle}',
  'disabled={skillBundleUninstalling || !skillBundleUninstallPluginIdValue || skillBundleUninstallPluginIdInvalid}',
  "variant={skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'solid' : 'ghost'}",
  'data-testid="agent-settings-installed-skill-bundle-uninstall"',
  '<SelectItem value="allow" disabled={!canAllow}>',
] as const
const API_KIND_OPTIONS: Array<{ value: RuntimeModelAPIKind; labelKey: string; descriptionKey: string }> = [
  { value: 'openai_chat_completions', labelKey: 'agents.settings.apiKinds.openaiChatCompletions', descriptionKey: 'agents.settings.apiKindDescriptions.openaiChatCompletions' },
  { value: 'openai_responses', labelKey: 'agents.settings.apiKinds.openaiResponses', descriptionKey: 'agents.settings.apiKindDescriptions.openaiResponses' },
  { value: 'anthropic_messages', labelKey: 'agents.settings.apiKinds.anthropicMessages', descriptionKey: 'agents.settings.apiKindDescriptions.anthropicMessages' },
]
const API_MODE_CAPABILITY_MATRIX: Record<RuntimeModelAPIKind, { badge: 'recommended' | 'managed' | 'compatibility' | 'providerNative'; itemKeys: string[] }> = {
  openai_responses: {
    badge: 'recommended',
    itemKeys: ['agenticPrimitive', 'structuredOutputs', 'responseState', 'builtInTools'],
  },
  openai_chat_completions: {
    badge: 'managed',
    itemKeys: ['centralizedCredentials', 'backendRouting', 'backendAudit', 'functionCalling'],
  },
  anthropic_messages: {
    badge: 'providerNative',
    itemKeys: ['anthropicNative', 'toolUse', 'directCredential', 'separateModelFamily'],
  },
}
const API_MODE_MIGRATION_STEPS: Record<RuntimeModelAPIKind, string[]> = {
  openai_responses: ['recommended', 'stateful', 'futureTools'],
  openai_chat_completions: ['centralize', 'verifyModel', 'switchResponses'],
  anthropic_messages: ['providerNative', 'compare', 'keepSeparate'],
}
const SETTINGS_NAV_SECTIONS = [
  { id: 'agent-settings-model', labelKey: 'agents.settings.modelPanel', descriptionKey: 'agents.settings.sectionDescriptions.model' },
  { id: 'agent-settings-run-presets', labelKey: 'agents.settings.runPresetsPanel', descriptionKey: 'agents.settings.sectionDescriptions.runPresets' },
  { id: 'agent-settings-skills', labelKey: 'agents.settings.skillsPanel', descriptionKey: 'agents.settings.sectionDescriptions.skills' },
  { id: 'agent-settings-profiles', labelKey: 'agents.settings.profilesPanel', descriptionKey: 'agents.settings.sectionDescriptions.profiles' },
  { id: 'agent-settings-tools', labelKey: 'agents.settings.toolPolicyPanel', descriptionKey: 'agents.settings.sectionDescriptions.tools' },
  { id: 'agent-settings-snapshot', labelKey: 'agents.settings.settingsSnapshotPanel', descriptionKey: 'agents.settings.sectionDescriptions.snapshot' },
] as const

type SkillPolicyIssue = { type: 'dependency' | 'conflict'; skillId: string; relatedSkillId: string }
type ProfileDiffSection = { added: string[]; removed: string[]; changed?: string[] }
type ProfileDiff = {
  packs: ProfileDiffSection
  workflows: ProfileDiffSection
  policies: ProfileDiffSection
  tools: ProfileDiffSection
}
type SettingsReadinessItem = {
  id: string
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
type SettingsActionItem = {
  id: string
  status: 'warning' | 'action'
  targetSection: (typeof SETTINGS_NAV_SECTIONS)[number]['id']
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
  reasons?: SettingsActionReason[]
  quickFix?: SettingsActionQuickFix
  quickFixLabelKey?: string
  persistHintKey?: string
}
type SettingsActionReason = {
  labelKey: string
  values?: Record<string, string | number>
}
type ToolPolicyDraftIssue = {
  toolName: string
  reasonKey: string
  values?: Record<string, string | number>
}
type ToolPolicyDiffItem = {
  name: string
  change: 'added' | 'removed' | 'changed'
  beforeMode?: ToolGrantDraft['mode']
  afterMode?: ToolGrantDraft['mode']
  beforeApproval?: ToolGrantDraft['approval']
  afterApproval?: ToolGrantDraft['approval']
}
type SkillSourceKind = 'core' | 'plugin' | 'local' | 'catalog'
type SkillTrustLevel = 'trusted' | 'managed' | 'review'
type ToolPolicyFilter = AgentToolPolicyFilterPreset['filter']
type ToolPolicyBulkAction = 'allow_available' | 'deny' | 'approval_never' | 'approval_on_write' | 'approval_always'
type SettingsSnapshotImportScope = 'model' | 'profile' | 'skills' | 'tools' | 'run-presets'
type SettingsSnapshotImportPresetId = 'all' | 'model-routing' | 'skills-tools' | 'run-presets'
type SettingsSnapshotImpactItem = {
  id: SettingsSnapshotImportScope
  scope: 'runtime' | 'local' | 'skipped'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
type ModelCompatibilityProbe = {
  id: 'api-mode' | 'model-id' | 'credentials' | 'base-url' | 'routes'
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
type ApiModeSwitchPlanItem = {
  id: 'target-mode' | 'model-id' | 'credentials' | 'base-url' | 'routes' | 'save-test'
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
const SETTINGS_SNAPSHOT_IMPORT_SCOPES: SettingsSnapshotImportScope[] = ['model', 'profile', 'skills', 'tools', 'run-presets']
const SETTINGS_SNAPSHOT_IMPORT_PRESETS: Array<{ id: SettingsSnapshotImportPresetId; scopes: SettingsSnapshotImportScope[] }> = [
  { id: 'all', scopes: SETTINGS_SNAPSHOT_IMPORT_SCOPES },
  { id: 'model-routing', scopes: ['model'] },
  { id: 'skills-tools', scopes: ['skills', 'tools'] },
  { id: 'run-presets', scopes: ['run-presets'] },
]
const SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS: Record<SettingsSnapshotImportScope, string> = {
  model: 'agents.settings.settingsSnapshotImpact.model',
  profile: 'agents.settings.settingsSnapshotImpact.profile',
  skills: 'agents.settings.settingsSnapshotImpact.skills',
  tools: 'agents.settings.settingsSnapshotImpact.tools',
  'run-presets': 'agents.settings.settingsSnapshotImpact.runPresets',
}
type SettingsActionQuickFix =
  | 'reset-model-draft'
  | 'confirm-clear-model-config'
  | 'enable-chat-route'
  | 'switch-openai-responses'
  | 'strip-sensitive-base-url-query'
  | 'downgrade-auto-permission'
  | 'reset-profile-draft'
  | 'reset-skill-policy-draft'
  | 'fix-tool-policy-draft-issues'
  | 'reset-tool-policy-draft'
type SettingsQuickFixAuditKind =
  | 'draft_reset'
  | 'draft_repair'
  | 'sensitive_cleanup'
  | 'risk_downgrade'
  | 'mode_migration'
  | 'route_enable'
  | 'clear_confirmation'
export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const skillBundleFileInputRef = useRef<HTMLInputElement | null>(null)
  const settingsSnapshotFileInputRef = useRef<HTMLInputElement | null>(null)
  const agentSettings = useAgentStore((s) => s.settings)
  const updateAgentSettings = useAgentStore((s) => s.updateSettings)
  const recordSettingsAudit = useAgentStore((s) => s.recordSettingsAudit)
  const clearSettingsAudit = useAgentStore((s) => s.clearSettingsAudit)
  const [selectedModelId, setSelectedModelId] = useState<string>(NO_MODEL_VALUE)
  const [directModelId, setDirectModelId] = useState('')
  const [selectedApiKind, setSelectedApiKind] = useState<RuntimeModelAPIKind>(DEFAULT_API_KIND)
  const [baseURL, setBaseURL] = useState('')
  const [modelApiKey, setModelApiKey] = useState('')
  const [useForChat, setUseForChat] = useState(true)
  const [useForPlanner, setUseForPlanner] = useState(true)
  const [testMessage, setTestMessage] = useState(t('agents.settings.testMessageDefault'))
  const [saving, setSaving] = useState(false)
  const [clearingModelConfig, setClearingModelConfig] = useState(false)
  const [modelConfigClearConfirming, setModelConfigClearConfirming] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedConfig, setSavedConfig] = useState<RuntimeModelConfigPublic | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<RuntimeModelTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [catalogReloading, setCatalogReloading] = useState(false)
  const [catalogReloadError, setCatalogReloadError] = useState<string | null>(null)
  const [catalogReloadedAt, setCatalogReloadedAt] = useState<string | null>(null)
  const [skillBundleText, setSkillBundleText] = useState('')
  const [skillBundleFileName, setSkillBundleFileName] = useState<string | null>(null)
  const [skillBundleInstalling, setSkillBundleInstalling] = useState(false)
  const [skillBundleInstallError, setSkillBundleInstallError] = useState<string | null>(null)
  const [skillBundleInstallResult, setSkillBundleInstallResult] = useState<AgentSkillBundleInstallResult | null>(null)
  const [skillBundleUninstallPluginId, setSkillBundleUninstallPluginId] = useState('')
  const [skillBundleUninstalling, setSkillBundleUninstalling] = useState(false)
  const [skillBundleUninstallError, setSkillBundleUninstallError] = useState<string | null>(null)
  const [skillBundleUninstallResult, setSkillBundleUninstallResult] = useState<AgentSkillBundleUninstallResult | null>(null)
  const [skillBundleUninstallConfirmPluginId, setSkillBundleUninstallConfirmPluginId] = useState<string | null>(null)
  const [skillDrafts, setSkillDrafts] = useState<SkillPolicyDraft[]>([])
  const [skillPolicySaving, setSkillPolicySaving] = useState(false)
  const [skillPolicySaveError, setSkillPolicySaveError] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [toolGrantDrafts, setToolGrantDrafts] = useState<ToolGrantDraft[]>([])
  const [toolPolicySaving, setToolPolicySaving] = useState(false)
  const [toolPolicySaveError, setToolPolicySaveError] = useState<string | null>(null)
  const [toolPolicySearch, setToolPolicySearch] = useState('')
  const [toolPolicyFilter, setToolPolicyFilter] = useState<ToolPolicyFilter>('all')
  const [settingsSnapshotText, setSettingsSnapshotText] = useState('')
  const [settingsSnapshotFileName, setSettingsSnapshotFileName] = useState<string | null>(null)
  const [settingsSnapshotImporting, setSettingsSnapshotImporting] = useState(false)
  const [settingsSnapshotImportScopes, setSettingsSnapshotImportScopes] = useState<SettingsSnapshotImportScope[]>([...SETTINGS_SNAPSHOT_IMPORT_SCOPES])
  const [settingsSnapshotError, setSettingsSnapshotError] = useState<string | null>(null)
  const [settingsSnapshotMessage, setSettingsSnapshotMessage] = useState<string | null>(null)
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<string | null>(null)
  const [settingsStatusCopied, setSettingsStatusCopied] = useState(false)
  const settingsImportBackup = agentSettings.lastImportBackup

  const runtimeQuery = useQuery({
    queryKey: ['agent-settings-runtime-model', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getModelConfig()
    },
    retry: false,
  })
  const catalogQuery = useQuery<AgentInspectResponse>({
    queryKey: ['agent-settings-skill-catalog', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.inspect()
    },
    retry: false,
  })
  const capabilitiesQuery = useQuery<AgentCapabilitiesResponse>({
    queryKey: ['agent-settings-tool-policy', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getCapabilities()
    },
    retry: false,
  })
  const modelsQuery = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })

  const textModels = modelsQuery.data ?? []
  const baseURLValue = baseURL.trim()
  const usesBackendCompatibleBaseURL = isBackendCompatibleBaseURL(baseURLValue)
  const usesModelCatalog = !baseURLValue || usesBackendCompatibleBaseURL
  const usesManualModelId = !usesModelCatalog
  const selectedModel = useMemo(() => {
    return textModels.find((model) => publicModelId(model) === selectedModelId) ?? null
  }, [selectedModelId, textModels])
  const directModelIdValue = directModelId.trim()
  const directModelIdHasSecret = usesManualModelId && hasSensitiveTextSecret(directModelIdValue)
  const draftModelValue = usesModelCatalog ? (selectedModel ? publicModelId(selectedModel) : '') : directModelIdValue
  const modelValueMissing = !draftModelValue
  const canSaveModelConfig = Boolean(draftModelValue) && !directModelIdHasSecret
  const effectiveConfig = savedConfig ?? runtimeQuery.data ?? null
  const configStatusRecipe = agentConfigStatusRecipe(Boolean(effectiveConfig?.configured))
  const modelRoutes = effectiveConfig?.capabilities ?? []
  const savedDirectModelIdHasSecret = Boolean(
    effectiveConfig?.configured
    && hasSensitiveTextSecret(effectiveConfig.model),
  )
  const effectiveModelValue = useMemo(() => (
    effectiveConfig?.configured ? runtimeModelValue(textModels, effectiveConfig) : NO_MODEL_VALUE
  ), [effectiveConfig, textModels])
  const configuredModelLabel = effectiveConfig?.configured
    ? redactAgentTraceDebugText(modelDisplayName(textModels, effectiveConfig))
    : t('agents.settings.notConfigured')
  const modelCredentialStatus = effectiveConfig?.credentialStatus
  const modelCredentialAcceptedEnv = modelCredentialStatus?.acceptedEnv?.join(', ') || 'model settings API key'
  const modelCredentialStatusLabel = modelCredentialStatus?.required
    ? modelCredentialStatus.configured
      ? t('agents.settings.modelCredentialStatus.configured', { env: modelCredentialStatus.sourceEnv.join(', ') })
      : t('agents.settings.modelCredentialStatus.missing', { env: modelCredentialAcceptedEnv })
    : t('agents.settings.modelCredentialStatus.notRequired')
  const skillStats = useMemo(() => buildSkillStats(catalogQuery.data?.skills ?? []), [catalogQuery.data?.skills])
  const skillGovernanceStats = useMemo(() => buildSkillGovernanceStats(catalogQuery.data?.skills ?? []), [catalogQuery.data?.skills])
  const skillBundlePlugins = useMemo(() => catalogQuery.data?.pluginCatalog?.skillPlugins ?? [], [catalogQuery.data?.pluginCatalog?.skillPlugins])
  const skillBundleUninstallPluginIdValue = skillBundleUninstallPluginId.trim()
  const skillBundleUninstallPluginIdInvalid = Boolean(skillBundleUninstallPluginIdValue) && !isSafeSkillBundlePluginId(skillBundleUninstallPluginIdValue)
  const skillBundleDraftValidation = useMemo(() => {
    if (!skillBundleText.trim()) return { bundle: null, error: null, totalBytes: 0 }
    try {
      const bundle = parseSkillBundleInput(skillBundleText)
      return {
        bundle,
        error: null,
        totalBytes: bundle.files.reduce((total, file) => total + byteLength(file.content), 0),
      }
    } catch (error) {
      return { bundle: null, error: settingsErrorMessage(error), totalBytes: 0 }
    }
  }, [skillBundleText])
  const skillPolicyBaseline = useMemo(() => buildSkillPolicyDrafts(catalogQuery.data?.skills ?? []), [catalogQuery.data?.skills])
  const skillDraftById = useMemo(() => new Map(skillDrafts.map((draft) => [draft.id, draft])), [skillDrafts])
  const toolStats = useMemo(() => buildToolStats(capabilitiesQuery.data?.resolvedTools), [capabilitiesQuery.data?.resolvedTools])
  const currentProfileId = useMemo(() => currentAgentProfileId(catalogQuery.data), [catalogQuery.data])
  const currentProfile = useMemo(() => {
    const profiles = catalogQuery.data?.profiles ?? []
    return profiles.find((profile) => profile.id === currentProfileId) ?? profiles[0] ?? null
  }, [catalogQuery.data?.profiles, currentProfileId])
  const selectedProfile = useMemo(() => {
    const profiles = catalogQuery.data?.profiles ?? []
    return profiles.find((profile) => profile.id === selectedProfileId) ?? currentProfile
  }, [catalogQuery.data?.profiles, currentProfile, selectedProfileId])
  const selectedProfileDiff = useMemo(
    () => currentProfile && selectedProfile && currentProfile.id !== selectedProfile.id
      ? buildProfileDiff(currentProfile, selectedProfile)
      : null,
    [currentProfile, selectedProfile],
  )
  const settingsSnapshotValidation = useMemo<{ snapshot: AgentSettingsSnapshot | null; error: string | null }>(() => {
    if (!settingsSnapshotText.trim()) return { snapshot: null, error: null }
    if (byteLength(settingsSnapshotText) > MAX_SETTINGS_SNAPSHOT_BYTES) {
      return { snapshot: null, error: t('agents.settings.settingsSnapshotTooLarge', { size: formatBytes(MAX_SETTINGS_SNAPSHOT_BYTES) }) }
    }
    try {
      return { snapshot: parseSettingsSnapshot(settingsSnapshotText), error: null }
    } catch (error) {
      return { snapshot: null, error: settingsErrorMessage(error) }
    }
  }, [settingsSnapshotText, t])
  const parsedSettingsSnapshot = settingsSnapshotValidation.snapshot
  const selectedSettingsSnapshotForImport = useMemo(
    () => parsedSettingsSnapshot ? selectSettingsSnapshotForImport(parsedSettingsSnapshot, settingsSnapshotImportScopes) : null,
    [parsedSettingsSnapshot, settingsSnapshotImportScopes],
  )
  const settingsSnapshotHasSelectedImportScope = Boolean(
    parsedSettingsSnapshot && hasSelectedSettingsSnapshotImportScope(parsedSettingsSnapshot, settingsSnapshotImportScopes),
  )
  const settingsSnapshotNeedsCatalog = Boolean(selectedSettingsSnapshotForImport?.defaultProfileId || selectedSettingsSnapshotForImport?.skillPolicy || selectedSettingsSnapshotForImport?.toolPolicy)
  const settingsSnapshotNeedsCapabilities = Boolean(selectedSettingsSnapshotForImport?.toolPolicy)
  const settingsSnapshotNeedsModelCatalog = Boolean(selectedSettingsSnapshotForImport?.modelConfig?.model.startsWith('model_config:') || selectedSettingsSnapshotForImport?.modelConfig?.modelConfigId)
  const settingsSnapshotReferenceIssues = useMemo(() => (
    selectedSettingsSnapshotForImport && (!settingsSnapshotNeedsCatalog || catalogQuery.data) && (!settingsSnapshotNeedsModelCatalog || modelsQuery.data)
      ? validateSettingsSnapshotReferences(selectedSettingsSnapshotForImport, {
        textModels: modelsQuery.data,
        profiles: catalogQuery.data?.profiles ?? [],
        currentProfile,
        skills: catalogQuery.data?.skills ?? [],
      })
      : []
  ), [catalogQuery.data, currentProfile, modelsQuery.data, selectedSettingsSnapshotForImport, settingsSnapshotNeedsCatalog, settingsSnapshotNeedsModelCatalog])
  const settingsSnapshotCanImport = Boolean(
    parsedSettingsSnapshot
    && settingsSnapshotHasSelectedImportScope
    && settingsSnapshotReferenceIssues.length === 0
    && (!settingsSnapshotNeedsCatalog || catalogQuery.data)
    && (!settingsSnapshotNeedsCapabilities || capabilitiesQuery.data)
    && (!settingsSnapshotNeedsModelCatalog || modelsQuery.data),
  )
  const currentToolGrants = useMemo(() => new Set((currentProfile?.toolGrants ?? []).map((grant) => grant.name)), [currentProfile])
  const toolGrantBaseline = useMemo(
    () => buildToolGrantDrafts(currentProfile, catalogQuery.data?.defaultAgentManifest),
    [catalogQuery.data?.defaultAgentManifest, currentProfile],
  )
  const toolGrantDraftByName = useMemo(() => new Map(toolGrantDrafts.map((grant) => [grant.name, grant])), [toolGrantDrafts])
  const toolPolicyDiffItems = useMemo(() => buildToolPolicyDiffItems(toolGrantBaseline, toolGrantDrafts), [toolGrantBaseline, toolGrantDrafts])
  const activeRunPreset = useMemo(() => activeRunPresetFromSettings(agentSettings), [agentSettings])
  const coreSkills = useMemo(() => (catalogQuery.data?.skills ?? []).filter((skill) => skill.loadMode === 'core'), [catalogQuery.data?.skills])
  const featuredSkills = useMemo(() => {
    const skills = catalogQuery.data?.skills ?? []
    return [...skills]
      .sort((a, b) => {
        const loadRank = skillLoadRank(a) - skillLoadRank(b)
        if (loadRank !== 0) return loadRank
        return (b.priority ?? 0) - (a.priority ?? 0)
      })
      .slice(0, 10)
  }, [catalogQuery.data?.skills])
  const toolPolicyFilteredTools = useMemo(() => {
    const tools = capabilitiesQuery.data?.resolvedTools.discovered ?? []
    const query = toolPolicySearch.trim().toLowerCase()
    return [...tools]
      .filter((tool) => toolPolicyFilterMatches(tool, toolPolicyFilter, currentToolGrants))
      .filter((tool) => {
        if (!query) return true
        return [
          tool.name,
          tool.description,
          tool.source,
          tool.permission,
          tool.risk,
          tool.unavailableReason,
        ].some((value) => String(value ?? '').toLowerCase().includes(query))
      })
      .sort((a, b) => toolPolicyRank(a) - toolPolicyRank(b) || a.name.localeCompare(b.name))
      .slice(0, 80)
  }, [capabilitiesQuery.data?.resolvedTools.discovered, currentToolGrants, toolPolicyFilter, toolPolicySearch])
  const hasUnsavedChanges = effectiveConfig?.configured
    ? draftModelValue !== effectiveModelValue ||
      selectedApiKind !== (effectiveConfig.apiKind ?? DEFAULT_API_KIND) ||
      baseURLValue !== (effectiveConfig.baseURL ?? '') ||
      Boolean(modelApiKey.trim()) ||
      useForChat !== effectiveConfig.useForChat ||
      useForPlanner !== effectiveConfig.useForPlanner
    : canSaveModelConfig
  const modelBaseURLHasSecret = hasSensitiveURLSecret(baseURLValue)
  const modelApiKeyProvided = Boolean(modelApiKey.trim())
  const modelRouteIssues = useMemo(() => buildModelRouteIssues({ useForChat, useForPlanner }), [useForChat, useForPlanner])
  const modelCompatibilityProbes = useMemo(() => buildModelCompatibilityProbes({
    selectedApiKind,
    modelValue: draftModelValue,
    baseURL: baseURLValue,
    apiKeyProvided: modelApiKeyProvided,
    usesBackendCompatibleBaseURL,
    modelBaseURLHasSecret,
    directModelIdHasSecret,
    useForChat,
    useForPlanner,
    effectiveConfig,
  }), [baseURLValue, directModelIdHasSecret, draftModelValue, effectiveConfig, modelApiKeyProvided, modelBaseURLHasSecret, selectedApiKind, useForChat, useForPlanner, usesBackendCompatibleBaseURL])
  const apiModeSwitchTaskGraph = useMemo(() => buildApiModeSwitchTaskGraph({
    selectedApiKind,
    probes: modelCompatibilityProbes,
    hasUnsavedChanges,
  }), [hasUnsavedChanges, modelCompatibilityProbes, selectedApiKind])
  const hasProfileChange = Boolean(selectedProfileId && currentProfile && selectedProfileId !== currentProfile.id)
  const hasSkillPolicyChange = skillPolicySignature(skillDrafts) !== skillPolicySignature(skillPolicyBaseline)
  const skillPolicyIssues = useMemo(
    () => buildSkillPolicyIssues(catalogQuery.data?.skills ?? [], skillDrafts, skillPolicyBaseline),
    [catalogQuery.data?.skills, skillDrafts, skillPolicyBaseline],
  )
  const hasToolPolicyChange = toolGrantSignature(toolGrantDrafts) !== toolGrantSignature(toolGrantBaseline)
  const toolPolicyDraftIssues = useMemo(() => buildToolPolicyDraftIssues({
    drafts: toolGrantDrafts,
    currentProfile,
    tools: capabilitiesQuery.data?.resolvedTools,
  }), [capabilitiesQuery.data?.resolvedTools, currentProfile, toolGrantDrafts])
  const readinessItems = useMemo(() => buildSettingsReadinessItems({
    effectiveConfig,
    selectedApiKind,
    savedDirectModelIdHasSecret,
    modelRoutes,
    modelRouteIssues,
    activeRunPreset,
    currentProfile,
    skillPolicyIssues,
    toolPolicyDraftIssues,
    skillStats,
    toolStats,
    hasUnsavedChanges,
    hasProfileChange,
    hasSkillPolicyChange,
    hasToolPolicyChange,
  }), [
    activeRunPreset,
    currentProfile,
    effectiveConfig,
    savedDirectModelIdHasSecret,
    selectedApiKind,
    hasProfileChange,
    hasSkillPolicyChange,
    hasToolPolicyChange,
    hasUnsavedChanges,
    modelRouteIssues,
    modelRoutes,
    skillPolicyIssues,
    toolPolicyDraftIssues,
    skillStats,
    toolStats,
  ])
  const settingsActionItems = useMemo(() => buildSettingsActionItems({
    effectiveConfig,
    selectedApiKind,
    draftBaseURL: baseURL,
    savedDirectModelIdHasSecret,
    modelRoutes,
    modelRouteIssues,
    activeRunPreset,
    currentProfile,
    skillPolicyIssues,
    toolPolicyDraftIssues,
    toolStats,
    tools: capabilitiesQuery.data?.resolvedTools,
    hasUnsavedChanges,
    hasProfileChange,
    hasSkillPolicyChange,
    hasToolPolicyChange,
  }), [
    currentProfile,
    effectiveConfig,
    savedDirectModelIdHasSecret,
    selectedApiKind,
    hasProfileChange,
    hasSkillPolicyChange,
    hasToolPolicyChange,
    hasUnsavedChanges,
    baseURL,
    modelRouteIssues,
    modelRoutes,
    activeRunPreset,
    skillPolicyIssues,
    toolPolicyDraftIssues,
    capabilitiesQuery.data?.resolvedTools,
    toolStats,
  ])

  async function copySettingsStatusSummary() {
    const lines = [
      t('agents.settings.settingsStatusSummaryTitle'),
      '',
      t('agents.settings.settingsStatusSummaryReadiness'),
      ...readinessItems.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.readinessStatuses.${item.status}`)}] ${t(item.labelKey)} - ${t(item.detailKey, item.detailValues)}`
      )),
      '',
      t('agents.settings.settingsStatusSummaryActionItems'),
      ...(settingsActionItems.length === 0
        ? [t('agents.settings.actionItemsEmpty')]
        : settingsActionItems.flatMap((item, index) => {
          const sectionLabelKey = settingsSectionLabelKey(item.targetSection)
          const parts = [
            `${index + 1}. [${t(`agents.settings.actionStatuses.${item.status}`)}] ${t(item.labelKey)} (${t(sectionLabelKey)}) - ${t(item.detailKey, item.detailValues)}`,
          ]
          if (item.reasons?.length) {
            parts.push(...item.reasons.map((reason) => `   - ${t(reason.labelKey, reason.values)}`))
          }
          if (item.quickFixLabelKey) {
            parts.push(`   ${t('agents.settings.actionItemsSummaryQuickFix', { quickFix: t(item.quickFixLabelKey) })}`)
          }
          if (item.persistHintKey) parts.push(`   ${t(item.persistHintKey)}`)
          return parts
        })),
      '',
      t('agents.settings.settingsStatusSummaryAudit'),
      ...(agentSettings.auditTrail.length === 0
        ? [t('agents.settings.settingsAuditEmpty')]
        : agentSettings.auditTrail.slice(0, 5).map((entry, index) => (
          `${index + 1}. ${redactAgentTraceDebugText(entry.summary)} (${new Date(entry.createdAt).toLocaleString()})`
        ))),
    ]
    await copyRedactedSettingsLines(lines)
    setSettingsStatusCopied(true)
    window.setTimeout(() => setSettingsStatusCopied(false), 1500)
  }

  useEffect(() => {
    if (!runtimeQuery.data) return
    if (runtimeQuery.data.configured) {
      const apiKind = runtimeQuery.data.apiKind ?? DEFAULT_API_KIND
      setSelectedModelId(runtimeConfigUsesModelCatalog(runtimeQuery.data) ? runtimeModelValue(textModels, runtimeQuery.data) : NO_MODEL_VALUE)
      setDirectModelId(runtimeQuery.data.model ?? '')
      setSelectedApiKind(runtimeQuery.data.apiKind ?? DEFAULT_API_KIND)
      setBaseURL(runtimeQuery.data.baseURL ?? '')
      setUseForChat(runtimeQuery.data.useForChat)
      setUseForPlanner(runtimeQuery.data.useForPlanner)
      return
    }
    if (agentSettings.modelId) {
      const storedModel = textModels.find((model) => model.id === agentSettings.modelId)
      if (storedModel) setSelectedModelId(publicModelId(storedModel))
    }
  }, [agentSettings.modelId, runtimeQuery.data, textModels])

  useEffect(() => {
    if (currentProfile?.id) setSelectedProfileId(currentProfile.id)
  }, [currentProfile?.id])

  useEffect(() => {
    setSkillDrafts(skillPolicyBaseline)
  }, [skillPolicyBaseline])

  useEffect(() => {
    setToolGrantDrafts(toolGrantBaseline)
  }, [toolGrantBaseline])

  useEffect(() => {
    setModelConfigClearConfirming(false)
  }, [baseURL, draftModelValue, modelApiKey, selectedApiKind, useForChat, useForPlanner])

  function recordSettingsOperationFailure(target: AgentSettingsAuditEntry['target'], operation: string, error: string) {
    recordSettingsAudit({
      action: 'settings_operation_failed',
      target,
      summary: t('agents.settings.auditSummaries.operationFailed', {
        operation,
        error: redactAgentTraceDebugText(error),
      }),
    })
  }

  function modelAuditSummaryValues() {
    const apiKind = t(API_KIND_OPTIONS.find((option) => option.value === selectedApiKind)?.labelKey ?? API_KIND_OPTIONS[0].labelKey)
    const routes = [
      useForChat ? t('agents.settings.useForChat') : null,
      useForPlanner ? t('agents.settings.useForPlanner') : null,
    ].filter(Boolean).join(' + ') || '-'
    return {
      model: usesModelCatalog ? (selectedModel ? publicModelLabel(selectedModel, true) : '-') : (directModelIdValue || '-'),
      apiKind,
      routes,
    }
  }

  async function saveSettings() {
    if (!draftModelValue) return
    if (directModelIdHasSecret) {
      const message = t('agents.settings.modelIdSecretsBlocked')
      setSaveError(message)
      setTestResult(null)
      recordSettingsOperationFailure('model', t('agents.settings.modelPanel'), message)
      return
    }
    if (modelBaseURLHasSecret) {
      const message = t('agents.settings.baseUrlSecretsBlocked')
      setSaveError(message)
      setTestResult(null)
      recordSettingsOperationFailure('model', t('agents.settings.modelPanel'), message)
      return
    }
    setSaving(true)
    setSaveError(null)
    setTestResult(null)
    setTestError(null)
    try {
      await localAgentClient.ensureRunning()
      const nextConfig = await localAgentClient.saveModelConfig({
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: draftModelValue,
        apiKind: selectedApiKind,
        ...(baseURLValue ? { baseURL: baseURLValue } : {}),
        ...(modelApiKey.trim() ? { apiKey: modelApiKey.trim() } : {}),
        useForChat,
        useForPlanner,
      })
      setSavedConfig(nextConfig)
      updateAgentSettings({ modelId: usesModelCatalog && selectedModel ? selectedModel.id : null })
      setModelApiKey('')
      await runtimeQuery.refetch()
      recordSettingsAudit({
        action: 'model_saved',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelSaved', modelAuditSummaryValues()),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSaveError(message)
      recordSettingsOperationFailure('model', t('agents.settings.modelPanel'), message)
    } finally {
      setSaving(false)
    }
  }

  async function testSettings() {
    if (!draftModelValue) return
    if (directModelIdHasSecret) {
      const message = t('agents.settings.modelIdSecretsBlocked')
      setTestError(message)
      setTestResult(null)
      setSaveError(null)
      recordSettingsOperationFailure('model', t('agents.settings.test'), message)
      return
    }
    if (modelBaseURLHasSecret) {
      const message = t('agents.settings.baseUrlSecretsBlocked')
      setTestError(message)
      setTestResult(null)
      setSaveError(null)
      recordSettingsOperationFailure('model', t('agents.settings.test'), message)
      return
    }
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    setSaveError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveModelConfig({
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: draftModelValue,
        apiKind: selectedApiKind,
        ...(baseURLValue ? { baseURL: baseURLValue } : {}),
        ...(modelApiKey.trim() ? { apiKey: modelApiKey.trim() } : {}),
        useForChat,
        useForPlanner,
      })
      updateAgentSettings({ modelId: usesModelCatalog && selectedModel ? selectedModel.id : null })
      const result = await localAgentClient.testModelConfig({
        message: testMessage.trim() || t('agents.settings.testMessageDefault'),
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: draftModelValue,
        apiKind: selectedApiKind,
        ...(baseURLValue ? { baseURL: baseURLValue } : {}),
        ...(modelApiKey.trim() ? { apiKey: modelApiKey.trim() } : {}),
        useForChat,
        useForPlanner,
      })
      setTestResult(result)
      await runtimeQuery.refetch()
      recordSettingsAudit({
        action: 'model_tested',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelTested', modelAuditSummaryValues()),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setTestError(message)
      recordSettingsOperationFailure('model', t('agents.settings.test'), message)
    } finally {
      setTesting(false)
    }
  }

  async function clearModelConfig() {
    if (!effectiveConfig?.configured && !hasUnsavedChanges) return
    if (!modelConfigClearConfirming) {
      setModelConfigClearConfirming(true)
      setSaveError(null)
      setTestError(null)
      return
    }
    setClearingModelConfig(true)
    setSaveError(null)
    setTestError(null)
    setTestResult(null)
    try {
      await localAgentClient.ensureRunning()
      const nextConfig = await localAgentClient.clearModelConfig()
      setSavedConfig(nextConfig)
      setSelectedModelId(NO_MODEL_VALUE)
      setDirectModelId('')
      setSelectedApiKind(DEFAULT_API_KIND)
      setBaseURL('')
      setUseForChat(true)
      setUseForPlanner(true)
      setModelConfigClearConfirming(false)
      updateAgentSettings({ modelId: null })
      await runtimeQuery.refetch()
      recordSettingsAudit({
        action: 'model_cleared',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelCleared'),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSaveError(message)
      recordSettingsOperationFailure('model', t('agents.settings.clearModelConfig'), message)
    } finally {
      setClearingModelConfig(false)
    }
  }

  async function reloadCatalog() {
    setCatalogReloading(true)
    setCatalogReloadError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.reloadAgentCatalog()
      await catalogQuery.refetch()
      setCatalogReloadedAt(new Date().toISOString())
      recordSettingsAudit({
        action: 'skill_catalog_reloaded',
        target: 'skills',
        summary: t('agents.settings.auditSummaries.skillCatalogReloaded'),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setCatalogReloadError(message)
      recordSettingsOperationFailure('skills', t('agents.settings.reloadCatalog'), message)
    } finally {
      setCatalogReloading(false)
    }
  }

  async function saveDefaultSkillPolicy() {
    setSkillPolicySaving(true)
    setSkillPolicySaveError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveDefaultSkillPolicy({ skills: skillDrafts })
      await catalogQuery.refetch()
      recordSettingsAudit({
        action: 'skill_policy_saved',
        target: 'skills',
        summary: t('agents.settings.auditSummaries.skillPolicySaved', { count: skillDrafts.filter((skill) => skill.enabled).length }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSkillPolicySaveError(message)
      recordSettingsOperationFailure('skills', t('agents.settings.skillsPanel'), message)
    } finally {
      setSkillPolicySaving(false)
    }
  }

  async function installSkillBundle() {
    setSkillBundleInstalling(true)
    setSkillBundleInstallError(null)
    setSkillBundleInstallResult(null)
    try {
      const bundle = skillBundleDraftValidation.bundle ?? parseSkillBundleInput(skillBundleText)
      await localAgentClient.ensureRunning()
      const result = await localAgentClient.installAgentSkillBundle(bundle)
      setSkillBundleInstallResult(result)
      setSkillBundleText('')
      setSkillBundleFileName(null)
      setSkillBundleUninstallPluginId(result.pluginId)
      setSkillBundleUninstallConfirmPluginId(null)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      setCatalogReloadedAt(new Date().toISOString())
      recordSettingsAudit({
        action: 'skill_bundle_installed',
        target: 'skills',
        summary: t('agents.settings.auditSummaries.skillBundleInstalled', { pluginId: result.pluginId, count: result.installedFiles.length }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSkillBundleInstallError(message)
      recordSettingsOperationFailure('skills', t('agents.settings.installSkillBundle'), message)
    } finally {
      setSkillBundleInstalling(false)
    }
  }

  async function loadSkillBundleFile(file?: File | null) {
    if (!file) return
    setSkillBundleInstallError(null)
    setSkillBundleInstallResult(null)
    try {
      const text = await file.text()
      parseSkillBundleInput(text)
      setSkillBundleText(text)
      setSkillBundleFileName(file.name)
    } catch (error) {
      setSkillBundleFileName(null)
      setSkillBundleInstallError(settingsErrorMessage(error))
    } finally {
      if (skillBundleFileInputRef.current) skillBundleFileInputRef.current.value = ''
    }
  }

  async function uninstallSkillBundle(pluginIdInput = skillBundleUninstallPluginId) {
    const pluginId = pluginIdInput.trim()
    if (!pluginId) {
      setSkillBundleUninstallError(t('agents.settings.uninstallSkillBundlePluginIdRequired'))
      return
    }
    if (!isSafeSkillBundlePluginId(pluginId)) {
      setSkillBundleUninstallError(t('agents.settings.uninstallSkillBundlePluginIdInvalid'))
      return
    }
    setSkillBundleUninstallPluginId(pluginId)
    setSkillBundleUninstalling(true)
    setSkillBundleUninstallError(null)
    setSkillBundleUninstallResult(null)
    try {
      await localAgentClient.ensureRunning()
      const result = await localAgentClient.uninstallAgentSkillBundle({ pluginId })
      setSkillBundleUninstallResult(result)
      setSkillBundleUninstallPluginId(result.pluginId)
      setSkillBundleUninstallConfirmPluginId(null)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      setCatalogReloadedAt(new Date().toISOString())
      recordSettingsAudit({
        action: 'skill_bundle_uninstalled',
        target: 'skills',
        summary: t('agents.settings.auditSummaries.skillBundleUninstalled', { pluginId: result.pluginId }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSkillBundleUninstallError(message)
      recordSettingsOperationFailure('skills', t('agents.settings.uninstallSkillBundle'), message)
    } finally {
      setSkillBundleUninstalling(false)
    }
  }

  function updateSkillDraft(id: string, enabled: boolean) {
    setSkillDrafts((drafts) => drafts.map((draft) => draft.id === id ? { ...draft, enabled } : draft))
  }

  async function saveDefaultProfile() {
    if (!selectedProfileId) return
    setProfileSaving(true)
    setProfileSaveError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveDefaultAgentProfile({ profileId: selectedProfileId })
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'profile_saved',
        target: 'profile',
        summary: t('agents.settings.auditSummaries.profileSaved', { profileId: selectedProfileId }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setProfileSaveError(message)
      recordSettingsOperationFailure('profile', t('agents.settings.profilesPanel'), message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function saveDefaultToolPolicy() {
    if (toolPolicyDraftIssues.length > 0) {
      setToolPolicySaveError(t('agents.settings.toolPolicyDraftInvalid', { count: toolPolicyDraftIssues.length }))
      return
    }
    setToolPolicySaving(true)
    setToolPolicySaveError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveDefaultToolPolicy({ toolGrants: toolGrantDrafts })
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'tool_policy_saved',
        target: 'tools',
        summary: t('agents.settings.auditSummaries.toolPolicySaved', toolPolicyAuditSummaryValues(toolGrantDrafts)),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setToolPolicySaveError(message)
      recordSettingsOperationFailure('tools', t('agents.settings.toolPolicyPanel'), message)
    } finally {
      setToolPolicySaving(false)
    }
  }

  function fixToolPolicyDraftIssues(options?: { audit?: boolean }) {
    const issueByTool = new Map(toolPolicyDraftIssues.map((issue) => [issue.toolName, issue]))
    setToolGrantDrafts((drafts) => drafts.flatMap((grant) => {
      const issue = issueByTool.get(grant.name)
      if (!issue) return [grant]
      if (issue.reasonKey === 'agents.settings.toolPolicyDraftIssueDetails.notProfileGranted') return []
      if (issue.reasonKey === 'agents.settings.toolPolicyDraftIssueDetails.unavailableAllow') return [{ ...grant, mode: 'deny' as const }]
      return [grant]
    }))
    setToolPolicySaveError(null)
    if (options?.audit) recordSettingsQuickFix('tools', 'agents.settings.fixToolPolicyDraftIssues', 'draft_repair')
  }

  function toolPolicyAuditSummaryValues(grants: ToolGrantDraft[]) {
    return {
      count: grants.length,
      allow: grants.filter((grant) => grant.mode === 'allow').length,
      deny: grants.filter((grant) => grant.mode === 'deny').length,
      approvals: grants.filter((grant) => (grant.approval ?? 'never') !== 'never').length,
    }
  }

  function updateToolGrantDraft(name: string, patch: Partial<ToolGrantDraft>) {
    setToolGrantDrafts((drafts) => drafts.map((grant) => (
      grant.name === name
        ? { ...grant, ...patch }
        : grant
    )))
  }

  function applyToolPolicyBulkEdit(action: ToolPolicyBulkAction) {
    const visibleToolByName = new Map(toolPolicyFilteredTools.map((tool) => [tool.name, tool]))
    setToolGrantDrafts((drafts) => drafts.map((grant) => {
      const tool = visibleToolByName.get(grant.name)
      if (!tool) return grant
      if (action === 'allow_available') {
        return tool.available && currentToolGrants.has(grant.name) ? { ...grant, mode: 'allow' as const } : grant
      }
      if (action === 'deny') return { ...grant, mode: 'deny' as const }
      if (action === 'approval_never') return { ...grant, approval: 'never' as const }
      if (action === 'approval_on_write') return { ...grant, approval: 'on_write' as const }
      return { ...grant, approval: 'always' as const }
    }))
    setToolPolicySaveError(null)
  }

  function saveToolPolicyFilterPreset() {
    const search = toolPolicySearch.trim()
    const name = toolPolicyFilterPresetName(toolPolicyFilter, search, t)
    const matchingPreset = agentSettings.toolPolicyFilterPresets.find((preset) => preset.filter === toolPolicyFilter && preset.search === search)
    const preset: AgentToolPolicyFilterPreset = {
      id: matchingPreset?.id ?? uniqueToolPolicyFilterPresetId(name, agentSettings.toolPolicyFilterPresets.map((item) => item.id)),
      name,
      search,
      filter: toolPolicyFilter,
    }
    updateAgentSettings({
      toolPolicyFilterPresets: [
        preset,
        ...agentSettings.toolPolicyFilterPresets.filter((item) => item.id !== preset.id),
      ].slice(0, 12),
    })
    recordSettingsAudit({
      action: matchingPreset ? 'tool_filter_preset_updated' : 'tool_filter_preset_saved',
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPolicyFilterPresetSaved', { name }),
    })
  }

  function applyToolPolicyFilterPreset(preset: AgentToolPolicyFilterPreset) {
    setToolPolicyFilter(preset.filter)
    setToolPolicySearch(preset.search)
  }

  function deleteToolPolicyFilterPreset(presetId: string) {
    const preset = agentSettings.toolPolicyFilterPresets.find((item) => item.id === presetId)
    updateAgentSettings({
      toolPolicyFilterPresets: agentSettings.toolPolicyFilterPresets.filter((item) => item.id !== presetId),
    })
    recordSettingsAudit({
      action: 'tool_filter_preset_deleted',
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPolicyFilterPresetDeleted', { name: preset?.name ?? presetId }),
    })
  }

  function selectRunPreset(presetId: string) {
    const preset = agentSettings.runPresets.find((item) => item.id === presetId)
    if (!preset) return
    updateAgentSettings({
      ...runPresetSettingsPatch(preset),
    })
    recordSettingsAudit({
      action: 'run_preset_selected',
      target: 'run_preset',
      summary: t('agents.settings.auditSummaries.runPresetSelected', runPresetAuditSummaryValues(preset)),
    })
  }

  function resetRunPresets() {
    const presets = defaultAgentRunPresets()
    const preset = presets.find((item) => item.id === 'balanced') ?? presets[0]
    if (!preset) return
    updateAgentSettings({
      runPresets: presets,
      ...runPresetSettingsPatch(preset),
    })
    recordSettingsAudit({
      action: 'run_presets_reset',
      target: 'run_preset',
      summary: t('agents.settings.auditSummaries.runPresetsReset', { count: presets.length }),
    })
  }

  function updateRunPreset(presetId: string, patch: Partial<AgentRunPreset>) {
    const currentPreset = agentSettings.runPresets.find((preset) => preset.id === presetId)
    if (!currentPreset) return
    const nextPreset = normalizeRunPresetDraft({ ...currentPreset, ...patch })
    const nextRunPresets = agentSettings.runPresets.map((preset) => (
      preset.id === presetId ? nextPreset : preset
    ))
    updateAgentSettings({
      runPresets: nextRunPresets,
      ...(presetId === agentSettings.activeRunPresetId ? {
        ...runPresetSettingsPatch(nextPreset),
      } : {}),
    })
    recordSettingsAudit({
      action: 'run_preset_updated',
      target: 'run_preset',
      summary: t('agents.settings.auditSummaries.runPresetUpdated', runPresetAuditSummaryValues(nextPreset)),
    })
  }

  function createRunPreset(kind: 'blank' | 'duplicate') {
    const template = kind === 'duplicate'
      ? activeRunPreset
      : defaultAgentRunPresets().find((preset) => preset.id === 'balanced') ?? activeRunPreset
    const name = kind === 'duplicate'
      ? t('agents.settings.runPresetCopyName', { name: activeRunPreset.name })
      : t('agents.settings.runPresetNewName')
    const description = kind === 'duplicate'
      ? t('agents.settings.runPresetCopyDescription', { name: activeRunPreset.name })
      : t('agents.settings.runPresetNewDescription')
    const id = uniqueRunPresetId(name, agentSettings.runPresets.map((preset) => preset.id))
    const preset = normalizeRunPresetDraft({
      ...template,
      id,
      name,
      description,
    })
    updateAgentSettings({
      runPresets: [...agentSettings.runPresets, preset],
      ...runPresetSettingsPatch(preset),
    })
    recordSettingsAudit({
      action: kind === 'duplicate' ? 'run_preset_duplicated' : 'run_preset_created',
      target: 'run_preset',
      summary: t(kind === 'duplicate'
        ? 'agents.settings.auditSummaries.runPresetDuplicated'
        : 'agents.settings.auditSummaries.runPresetCreated', runPresetAuditSummaryValues(preset)),
    })
  }

  function deleteActiveRunPreset() {
    if (DEFAULT_RUN_PRESET_IDS.has(activeRunPreset.id) || agentSettings.runPresets.length <= 1) return
    const nextRunPresets = agentSettings.runPresets.filter((preset) => preset.id !== activeRunPreset.id)
    const nextActivePreset = nextRunPresets.find((preset) => preset.id === 'balanced') ?? nextRunPresets[0]
    if (!nextActivePreset) return
    updateAgentSettings({
      runPresets: nextRunPresets,
      ...runPresetSettingsPatch(nextActivePreset),
    })
    recordSettingsAudit({
      action: 'run_preset_deleted',
      target: 'run_preset',
      summary: t('agents.settings.auditSummaries.runPresetDeleted', {
        preset: activeRunPreset.name,
        nextPreset: nextActivePreset.name,
      }),
    })
  }

  function scrollToSettingsSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function stripModelBaseURLSecrets(options?: { audit?: boolean }) {
    setBaseURL(stripSensitiveURLSecrets(baseURL))
    setSaveError(null)
    setTestError(null)
    if (options?.audit) recordSettingsQuickFix('model', 'agents.settings.quickFixes.stripSensitiveBaseURLQuery', 'sensitive_cleanup')
  }

  function applySettingsActionQuickFix(quickFix: SettingsActionQuickFix) {
    if (quickFix === 'reset-model-draft') {
      if (!effectiveConfig?.configured) return
      const apiKind = effectiveConfig.apiKind ?? DEFAULT_API_KIND
      setSelectedModelId(runtimeConfigUsesModelCatalog(effectiveConfig) ? runtimeModelValue(textModels, effectiveConfig) : NO_MODEL_VALUE)
      setDirectModelId(effectiveConfig.model ?? '')
      setSelectedApiKind(apiKind)
      setBaseURL(effectiveConfig.baseURL ?? '')
      setUseForChat(effectiveConfig.useForChat)
      setUseForPlanner(effectiveConfig.useForPlanner)
      setSaveError(null)
      setTestError(null)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.resetDraft', 'draft_reset')
      return
    }
    if (quickFix === 'confirm-clear-model-config') {
      scrollToSettingsSection('agent-settings-model')
      setModelConfigClearConfirming(true)
      setSaveError(null)
      setTestError(null)
      setSettingsActionFeedback(t('agents.settings.quickFixes.confirmClearModelConfig'))
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.confirmClearModelConfig', 'clear_confirmation')
      return
    }
    if (quickFix === 'enable-chat-route') {
      setUseForChat(true)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.enableChatRoute', 'route_enable')
      return
    }
    if (quickFix === 'switch-openai-responses') {
      setSelectedApiKind('openai_responses')
      setSaveError(null)
      setTestError(null)
      setSettingsActionFeedback(t('agents.settings.quickFixes.switchedToResponses'))
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.switchOpenAIResponses', 'mode_migration')
      return
    }
    if (quickFix === 'strip-sensitive-base-url-query') {
      stripModelBaseURLSecrets()
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.stripSensitiveBaseURLQuery', 'sensitive_cleanup')
      return
    }
    if (quickFix === 'downgrade-auto-permission') {
      updateRunPreset(activeRunPreset.id, { permissionMode: 'suggest' })
      setSettingsActionFeedback(t('agents.settings.quickFixes.downgradedAutoPermission'))
      recordSettingsQuickFix('run_preset', 'agents.settings.quickFixes.downgradeAutoPermission', 'risk_downgrade', { persistence: 'immediate' })
      return
    }
    if (quickFix === 'reset-profile-draft') {
      if (currentProfile?.id) setSelectedProfileId(currentProfile.id)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('profile', 'agents.settings.quickFixes.resetDraft', 'draft_reset')
      return
    }
    if (quickFix === 'reset-skill-policy-draft') {
      setSkillDrafts(skillPolicyBaseline)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('skills', 'agents.settings.quickFixes.resetDraft', 'draft_reset')
      return
    }
    if (quickFix === 'fix-tool-policy-draft-issues') {
      fixToolPolicyDraftIssues()
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('tools', 'agents.settings.fixToolPolicyDraftIssues', 'draft_repair')
      return
    }
    if (quickFix === 'reset-tool-policy-draft') {
      setToolGrantDrafts(toolGrantBaseline)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('tools', 'agents.settings.quickFixes.resetDraft', 'draft_reset')
    }
  }

  function recordSettingsQuickFix(
    target: AgentSettingsAuditEntry['target'],
    quickFixLabelKey: string,
    kind: SettingsQuickFixAuditKind,
    options?: { persistence?: 'after_save' | 'immediate' },
  ) {
    const summaryKey = options?.persistence === 'immediate'
      ? 'agents.settings.auditSummaries.quickFixAppliedImmediate'
      : 'agents.settings.auditSummaries.quickFixApplied'
    recordSettingsAudit({
      action: settingsQuickFixAuditAction(kind),
      target,
      summary: t(summaryKey, {
        quickFix: t(quickFixLabelKey),
        target: t(`agents.settings.auditTargets.${target}`),
      }),
    })
  }

  function buildCurrentSettingsSnapshotText() {
    return JSON.stringify(buildSettingsSnapshot({
      config: effectiveConfig,
      profileId: currentProfileId,
      skillPolicy: skillDrafts,
      toolPolicy: toolGrantDrafts,
      runPresets: agentSettings.runPresets,
      activeRunPresetId: agentSettings.activeRunPresetId,
    }), null, 2)
  }

  function currentSettingsSnapshotText() {
    return settingsSnapshotText.trim() || buildCurrentSettingsSnapshotText()
  }

  function updateSettingsSnapshotText(text: string) {
    setSettingsSnapshotText(text)
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(null)
  }

  function toggleSettingsSnapshotImportScope(scope: SettingsSnapshotImportScope, enabled: boolean) {
    setSettingsSnapshotImportScopes((current) => (
      enabled
        ? [...new Set([...current, scope])]
        : current.filter((item) => item !== scope)
    ))
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(null)
  }

  function applySettingsSnapshotImportPreset(presetId: SettingsSnapshotImportPresetId) {
    const preset = SETTINGS_SNAPSHOT_IMPORT_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const scopes = parsedSettingsSnapshot
      ? preset.scopes.filter((scope) => settingsSnapshotImportScopeAvailable(parsedSettingsSnapshot, scope))
      : [...preset.scopes]
    setSettingsSnapshotImportScopes(scopes)
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(t('agents.settings.settingsSnapshotImportPresetApplied', {
      preset: t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`),
    }))
  }

  function exportSettingsSnapshot() {
    setSettingsSnapshotError(null)
    setSettingsSnapshotText(buildCurrentSettingsSnapshotText())
    setSettingsSnapshotMessage(t('agents.settings.settingsExportReady'))
  }

  async function copySettingsSnapshot() {
    const text = currentSettingsSnapshotText()
    try {
      await navigator.clipboard.writeText(text)
      setSettingsSnapshotText(text)
      setSettingsSnapshotMessage(t('agents.settings.settingsCopied'))
      setSettingsSnapshotError(null)
    } catch (error) {
      setSettingsSnapshotError(settingsErrorMessage(error))
    }
  }

  function downloadSettingsSnapshot() {
    setSettingsSnapshotError(null)
    const text = currentSettingsSnapshotText()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agent-settings-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setSettingsSnapshotText(text)
    setSettingsSnapshotMessage(t('agents.settings.settingsDownloaded'))
  }

  async function loadSettingsSnapshotFile(file?: File | null) {
    if (!file) return
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(null)
    try {
      if (file.size > MAX_SETTINGS_SNAPSHOT_BYTES) throw new Error(t('agents.settings.settingsSnapshotTooLarge', { size: formatBytes(MAX_SETTINGS_SNAPSHOT_BYTES) }))
      const text = await file.text()
      parseSettingsSnapshot(text)
      setSettingsSnapshotText(text)
      setSettingsSnapshotFileName(file.name)
      setSettingsSnapshotMessage(t('agents.settings.settingsSnapshotFileLoaded', { fileName: file.name }))
    } catch (error) {
      setSettingsSnapshotFileName(null)
      setSettingsSnapshotError(settingsErrorMessage(error))
    } finally {
      if (settingsSnapshotFileInputRef.current) settingsSnapshotFileInputRef.current.value = ''
    }
  }

  async function copySettingsImportBackup() {
    if (!settingsImportBackup) return
    try {
      await navigator.clipboard.writeText(settingsImportBackup.text)
      setSettingsSnapshotMessage(t('agents.settings.settingsBackupCopied'))
      setSettingsSnapshotError(null)
    } catch (error) {
      setSettingsSnapshotError(settingsErrorMessage(error))
    }
  }

  function loadSettingsImportBackup() {
    if (!settingsImportBackup) return
    setSettingsSnapshotText(settingsImportBackup.text)
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(t('agents.settings.settingsBackupLoaded'))
  }

  function clearSettingsImportBackup() {
    updateAgentSettings({ lastImportBackup: null })
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(t('agents.settings.settingsBackupCleared'))
    recordSettingsAudit({
      action: 'settings_backup_cleared',
      target: 'snapshot',
      summary: t('agents.settings.auditSummaries.settingsBackupCleared'),
    })
  }

  function settingsSnapshotImportPreflightError(): string | null {
    if (!parsedSettingsSnapshot) return null
    if (settingsSnapshotValidation.error) return t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotValidation.error })
    if (!settingsSnapshotHasSelectedImportScope || !selectedSettingsSnapshotForImport) {
      return t('agents.settings.settingsSnapshotImportScopeEmpty')
    }
    if (settingsSnapshotNeedsModelCatalog && !modelsQuery.data) {
      return t('agents.settings.settingsSnapshotModelCatalogUnavailable')
    }
    if (settingsSnapshotNeedsCatalog && !catalogQuery.data) {
      return t('agents.settings.settingsSnapshotCatalogUnavailable')
    }
    if (settingsSnapshotNeedsCapabilities && !capabilitiesQuery.data) {
      return t('agents.settings.settingsSnapshotCapabilitiesUnavailable')
    }
    if (settingsSnapshotReferenceIssues.length > 0) {
      return settingsSnapshotReferenceIssues.map((issue) => issue.message).join('; ')
    }
    const snapshotToolPolicyIssues = selectedSettingsSnapshotForImport.toolPolicy
      ? buildToolPolicyDraftIssues({
        drafts: selectedSettingsSnapshotForImport.toolPolicy,
        currentProfile: targetSnapshotProfile(selectedSettingsSnapshotForImport, catalogQuery.data, currentProfile),
        tools: capabilitiesQuery.data?.resolvedTools,
      })
      : []
    if (snapshotToolPolicyIssues.length > 0) {
      return t('agents.settings.settingsSnapshotToolPolicyInvalid', { count: snapshotToolPolicyIssues.length })
    }
    return null
  }

  function previewSettingsSnapshotImport() {
    if (!parsedSettingsSnapshot) return
    const preflightError = settingsSnapshotImportPreflightError()
    if (preflightError) {
      setSettingsSnapshotError(preflightError)
      setSettingsSnapshotMessage(null)
      return
    }
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(t('agents.settings.settingsSnapshotDryRunReady', {
      count: selectedSettingsSnapshotForImport ? buildSettingsSnapshotImpactItems(selectedSettingsSnapshotForImport).filter((item) => item.scope !== 'skipped').length : 0,
    }))
  }

  async function importSettingsSnapshot() {
    if (!parsedSettingsSnapshot) return
    const preflightError = settingsSnapshotImportPreflightError()
    if (preflightError) {
      setSettingsSnapshotError(preflightError)
      return
    }
    setSettingsSnapshotImporting(true)
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(null)
    const backupText = buildCurrentSettingsSnapshotText()
    updateAgentSettings({ lastImportBackup: { text: backupText, createdAt: new Date().toISOString() } })
    try {
      const snapshot = selectedSettingsSnapshotForImport
      if (!snapshot) throw new Error(t('agents.settings.settingsSnapshotImportScopeEmpty'))
      const writesRuntime = Boolean(snapshot.modelConfig || snapshot.defaultProfileId || snapshot.skillPolicy || snapshot.toolPolicy)
      if (writesRuntime) await localAgentClient.ensureRunning()
      if (snapshot.modelConfig) await localAgentClient.saveModelConfig(snapshot.modelConfig)
      if (snapshot.defaultProfileId) await localAgentClient.saveDefaultAgentProfile({ profileId: snapshot.defaultProfileId })
      if (snapshot.skillPolicy) await localAgentClient.saveDefaultSkillPolicy({ skills: snapshot.skillPolicy })
      if (snapshot.toolPolicy) await localAgentClient.saveDefaultToolPolicy({ toolGrants: snapshot.toolPolicy })
      if (snapshot.runPresets || snapshot.activeRunPresetId) {
        const runPresetPatch = resolveSnapshotRunPresetImport(snapshot, agentSettings)
        if (runPresetPatch) updateAgentSettings(runPresetPatch)
      }
      if (writesRuntime) await Promise.all([runtimeQuery.refetch(), catalogQuery.refetch(), capabilitiesQuery.refetch()])
      setSavedConfig(null)
      setSettingsSnapshotMessage(t('agents.settings.settingsImportDoneWithBackup'))
      recordSettingsAudit({
        action: 'settings_snapshot_imported',
        target: 'snapshot',
        summary: t('agents.settings.auditSummaries.settingsSnapshotImported', { exportedAt: new Date(snapshot.exportedAt).toLocaleString() }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSettingsSnapshotError(message)
      recordSettingsOperationFailure('snapshot', t('agents.settings.settingsSnapshotPanel'), message)
    } finally {
      setSettingsSnapshotImporting(false)
    }
  }

  return (
    <AgentPageShell data-testid="agent-settings-page">
      <AgentPageShellHeader>
        <AgentSettingsHeaderContent>
          <AgentSettingsHeaderCopy>
            <AgentSettingsHeaderTitleRow>
              <Settings size={18} />
              <AgentSettingsHeaderTitle>{t('agents.settings.title')}</AgentSettingsHeaderTitle>
              <AgentSettingsStatusBadge intent={configStatusRecipe.intent} emphasis={configStatusRecipe.emphasis}>
                {effectiveConfig?.configured ? t('agents.settings.configured') : t('agents.settings.notConfigured')}
              </AgentSettingsStatusBadge>
            </AgentSettingsHeaderTitleRow>
            <AgentSettingsHeaderDescription>{t('agents.settings.description')}</AgentSettingsHeaderDescription>
            <AgentSettingsScopeRail data-testid="agent-settings-scope-boundary" hidden>
              <AgentSettingsScopeBadge>{t('agents.settings.scope.controlPlane')}</AgentSettingsScopeBadge>
              <AgentSettingsScopeBadge muted>{t('agents.settings.scope.futureRuns')}</AgentSettingsScopeBadge>
              <AgentSettingsScopeBadge muted>{t('agents.settings.scope.debugReadOnly')}</AgentSettingsScopeBadge>
            </AgentSettingsScopeRail>
          </AgentSettingsHeaderCopy>
          <AgentSettingsHeaderActions>
            <AgentSettingsActionButton asChild variant="outline" data-testid="agent-settings-open-debug">
              <Link to={ROUTES.agentDebug}>
                <Terminal size={14} />
                {t('agents.settings.openDebug')}
              </Link>
            </AgentSettingsActionButton>
            <AgentSettingsActionButton variant="outline" onClick={() => void copySettingsStatusSummary()} data-testid="agent-settings-copy-status">
              <Clipboard size={14} />
              {settingsStatusCopied ? t('agents.settings.settingsStatusCopied') : t('agents.settings.copySettingsStatus')}
            </AgentSettingsActionButton>
            <AgentSettingsActionButton variant="outline" onClick={() => runtimeQuery.refetch()} disabled={runtimeQuery.isFetching} data-testid="agent-settings-refresh">
              {runtimeQuery.isFetching ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
              {t('agents.settings.refresh')}
            </AgentSettingsActionButton>
          </AgentSettingsHeaderActions>
        </AgentSettingsHeaderContent>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        {runtimeQuery.isLoading || modelsQuery.isLoading ? (
          <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
        ) : runtimeQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(runtimeQuery.error)} />
        ) : modelsQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(modelsQuery.error)} />
        ) : (
          <AgentSettingsLayout>
            <AgentSettingsMain>
              <AgentSettingsPanel icon={Bot} id="agent-settings-model" title={t('agents.settings.modelPanel')}>
                <AgentSettingsStack>
                  <AgentSettingsFormField>
                    <AgentSettingsFieldLabel>
                      {usesModelCatalog ? t('agents.settings.modelLabel') : t('agents.settings.providerModelIdLabel')}
                    </AgentSettingsFieldLabel>
                    {usesModelCatalog ? (
                      <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                        <AgentSettingsSelectTrigger>
                          <SelectValue placeholder={t('agents.settings.selectModel')} />
                        </AgentSettingsSelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MODEL_VALUE} disabled>{t('agents.settings.selectModel')}</SelectItem>
                          {textModels.length === 0 ? (
                            <SelectItem value="__empty_text_models" disabled>{t('agents.settings.noTextModels')}</SelectItem>
                          ) : textModels.map((model) => (
                            <SelectItem key={model.id} value={publicModelId(model)}>
                              {publicModelLabel(model, true)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <AgentSettingsInput
                        value={directModelId}
                        onChange={(event) => setDirectModelId(event.target.value)}
                        placeholder={apiKindModelPlaceholder(selectedApiKind)}
                        data-testid="agent-settings-provider-model-id"
                      />
                    )}
                    <AgentSettingsFieldHelp>
                      {usesModelCatalog ? t('agents.settings.modelHelp') : t('agents.settings.providerModelIdHelp')}
                    </AgentSettingsFieldHelp>
                    {modelValueMissing && (
                      <AgentSettingsToneText tone="danger">
                        {t('agents.settings.modelRequired')}
                      </AgentSettingsToneText>
                    )}
                    {directModelIdHasSecret && (
                      <AgentSettingsCallout data-testid="agent-settings-provider-model-id-secret-warning" tone="danger" compact>
                        {t('agents.settings.modelIdSecretsBlocked')}
                      </AgentSettingsCallout>
                    )}
                  </AgentSettingsFormField>

                  <AgentSettingsFormGrid columns="model">
                    <AgentSettingsFormField>
                      <AgentSettingsFieldLabel>{t('agents.settings.apiKindLabel')}</AgentSettingsFieldLabel>
                      <Select
                        value={selectedApiKind}
                        onValueChange={(value) => {
                          const apiKind = value as RuntimeModelAPIKind
                          setSelectedApiKind(apiKind)
                        }}
                      >
                        <AgentSettingsSelectTrigger>
                          <SelectValue placeholder={t('agents.settings.selectApiKind')} />
                        </AgentSettingsSelectTrigger>
                        <SelectContent>
                          {API_KIND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AgentSettingsFieldHelp>
                        {t(API_KIND_OPTIONS.find((option) => option.value === selectedApiKind)?.descriptionKey ?? API_KIND_OPTIONS[0].descriptionKey)}
                      </AgentSettingsFieldHelp>
                    </AgentSettingsFormField>

                    <AgentSettingsFormField>
                      <AgentSettingsFieldLabel>{t('agents.settings.baseUrlLabel')}</AgentSettingsFieldLabel>
                      <AgentSettingsInput
                        value={baseURL}
                        onChange={(event) => setBaseURL(event.target.value)}
                        placeholder={apiKindBaseURLPlaceholder(selectedApiKind)}
                      />
                      <AgentSettingsFieldHelp>{t('agents.settings.baseUrlHelp')}</AgentSettingsFieldHelp>
                      {modelBaseURLHasSecret && (
                        <AgentSettingsCallout data-testid="agent-settings-base-url-secret-warning" tone="danger" compact>
                          {t('agents.settings.baseUrlSecretsBlocked')}
                          <AgentSettingsActionButton
                            size="xs"
                            variant="outline"
                            onClick={() => stripModelBaseURLSecrets({ audit: true })}
                            data-testid="agent-settings-strip-base-url-secrets"
                          >
                            {t('agents.settings.quickFixes.stripSensitiveBaseURLQuery')}
                          </AgentSettingsActionButton>
                        </AgentSettingsCallout>
                      )}
                      {usesManualModelId && baseURLValue && !usesBackendCompatibleBaseURL && (
                        <AgentSettingsFormField>
                          <AgentSettingsFieldLabel>{t('agents.settings.providerApiKeyLabel')}</AgentSettingsFieldLabel>
                          <AgentSettingsInput
                            value={modelApiKey}
                            onChange={(event) => setModelApiKey(event.target.value)}
                            placeholder={effectiveConfig?.apiKeyConfigured ? t('agents.settings.providerApiKeyConfiguredPlaceholder') : t('agents.settings.providerApiKeyPlaceholder')}
                            type="password"
                            autoComplete="off"
                            data-testid="agent-settings-provider-api-key"
                          />
                          <AgentSettingsFieldHelp>{t('agents.settings.providerCredentialHelp')}</AgentSettingsFieldHelp>
                        </AgentSettingsFormField>
                      )}
                    </AgentSettingsFormField>
                  </AgentSettingsFormGrid>

                  <AgentSettingsFormGrid columns="two">
                    <AgentSettingsToggleRow checked={useForChat} onChange={setUseForChat} title={t('agents.settings.useForChat')} description={t('agents.settings.useForChatHelp')} />
                    <AgentSettingsToggleRow checked={useForPlanner} onChange={setUseForPlanner} title={t('agents.settings.useForPlanner')} description={t('agents.settings.useForPlannerHelp')} />
                  </AgentSettingsFormGrid>
                  <ApiModeCapabilityMatrix apiKind={selectedApiKind} t={t} />
                  <ModelCompatibilityProbePanel probes={modelCompatibilityProbes} />
                  <ApiModeMigrationGuide apiKind={selectedApiKind} onSwitchToResponses={() => setSelectedApiKind('openai_responses')} />
                  <ApiModeSwitchPlanPanel apiKind={selectedApiKind} items={apiModeSwitchTaskGraph} />
                  {modelRouteIssues.length > 0 && (
                    <AgentSettingsCallout tone="warning" compact>
                      {modelRouteIssues.map((issue) => t(`agents.settings.modelRouteIssues.${issue}`)).join('\n')}
                    </AgentSettingsCallout>
                  )}

                  {usesModelCatalog && selectedModel && (
                    <AgentSettingsFormGrid columns="two">
                      <AgentSettingsKeyValue label={t('agents.settings.fields.modelId')} value={publicModelId(selectedModel)} />
                      <AgentSettingsKeyValue label={t('agents.settings.fields.capabilities')} value={selectedModel.capabilities.join(', ') || '-'} />
                      <AgentSettingsKeyValue label={t('agents.settings.fields.provider')} value={selectedModel.provider_name || '-'} />
                      <AgentSettingsKeyValue label={t('agents.settings.fields.configId')} value={`#${selectedModel.id}`} />
                    </AgentSettingsFormGrid>
                  )}

                  <AgentSettingsActionRow>
                    <AgentSettingsActionButton onClick={saveSettings} disabled={!canSaveModelConfig || saving || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
                      {saving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                      {hasUnsavedChanges ? t('agents.settings.save') : t('agents.settings.saved')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton variant="outline" onClick={testSettings} disabled={!canSaveModelConfig || testing || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
                      {testing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <TestTube2 size={14} />}
                      {t('agents.settings.test')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton
                      variant={modelConfigClearConfirming ? 'solid' : 'outline'}
                      onClick={clearModelConfig}
                      disabled={clearingModelConfig || (!effectiveConfig?.configured && !hasUnsavedChanges)}
                      data-testid="agent-settings-clear-model-config"
                     intent={modelConfigClearConfirming ? 'danger' : 'neutral'}>
                      {clearingModelConfig ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Trash2 size={14} />}
                      {modelConfigClearConfirming ? t('agents.settings.clearModelConfigConfirm') : t('agents.settings.clearModelConfig')}
                    </AgentSettingsActionButton>
                  </AgentSettingsActionRow>

                  {saveError && <AppInlineError>{saveError}</AppInlineError>}
                </AgentSettingsStack>
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.testPanel')}>
                <AgentSettingsStack>
                  <AgentSettingsTextarea
                    value={testMessage}
                    onChange={(event) => setTestMessage(event.target.value)}
                  />
                  {testError && <AppInlineError>{testError}</AppInlineError>}
                  {testResult && (
                    <AgentDataBlock>
                      <AgentSettingsActionRow>
                        <AgentSettingsStatusBadge intent={agentTestResultRecipe(testResult.ok).intent} emphasis={agentTestResultRecipe(testResult.ok).emphasis}>
                          {testResult.ok ? t('agents.settings.testOk') : t('agents.settings.testFailed')}
                        </AgentSettingsStatusBadge>
                        <AgentSettingsInlineNote>{redactAgentTraceDebugText(testResult.model)}</AgentSettingsInlineNote>
                        <AgentSettingsInlineNote>{testResult.latencyMs}ms</AgentSettingsInlineNote>
                      </AgentSettingsActionRow>
                      <AgentSettingsCodeBlock>
                        {testResult.content ? redactAgentTraceDebugText(testResult.content) : '-'}
                      </AgentSettingsCodeBlock>
                    </AgentDataBlock>
                  )}
                </AgentSettingsStack>
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} id="agent-settings-run-presets" title={t('agents.settings.runPresetsPanel')}>
                <AgentSettingsStack>
                  <AgentDataBlock>
                    <AgentSettingsFormGrid columns="two">
                    <AgentSettingsFormField>
                      <AgentSettingsFieldLabel>{t('agents.settings.activeRunPreset')}</AgentSettingsFieldLabel>
                      <Select value={agentSettings.activeRunPresetId} onValueChange={selectRunPreset}>
                        <AgentSettingsSelectTrigger>
                          <SelectValue />
                        </AgentSettingsSelectTrigger>
                        <SelectContent>
                          {agentSettings.runPresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AgentSettingsFieldHelp>{t('agents.settings.runPresetsHelp')}</AgentSettingsFieldHelp>
                      <AgentSettingsActionRow>
                        <AgentSettingsActionButton variant="outline" onClick={() => createRunPreset('blank')} data-testid="agent-run-preset-create">
                          <Plus size={14} />
                          {t('agents.settings.createRunPreset')}
                        </AgentSettingsActionButton>
                        <AgentSettingsActionButton variant="outline" onClick={() => createRunPreset('duplicate')} data-testid="agent-run-preset-duplicate">
                          <Copy size={14} />
                          {t('agents.settings.duplicateRunPreset')}
                        </AgentSettingsActionButton>
                        <AgentSettingsActionButton
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={deleteActiveRunPreset}
                          disabled={DEFAULT_RUN_PRESET_IDS.has(activeRunPreset.id) || agentSettings.runPresets.length <= 1}
                          data-testid="agent-run-preset-delete"
                        >
                          <Trash2 size={14} />
                          {t('agents.settings.deleteRunPreset')}
                        </AgentSettingsActionButton>
                        <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={resetRunPresets}>
                          <RefreshCw size={14} />
                          {t('agents.settings.resetRunPresets')}
                        </AgentSettingsActionButton>
                      </AgentSettingsActionRow>
                    </AgentSettingsFormField>
                    <AgentSettingsFormGrid columns="two">
                      <AgentSettingsKeyValue label={t('agents.settings.runPresetFields.maxToolCalls')} value={activeRunPreset.maxToolCalls} />
                      <AgentSettingsKeyValue label={t('agents.settings.runPresetFields.maxIterations')} value={activeRunPreset.maxIterations} />
                      <AgentSettingsKeyValue label={t('agents.settings.runPresetFields.permissionMode')} value={t(`agents.settings.runPresetPermissionModes.${activeRunPreset.permissionMode}`)} />
                      <AgentSettingsKeyValue label={t('agents.settings.runPresetFields.planWorkers')} value={activeRunPreset.planMaxWorkers} />
                    </AgentSettingsFormGrid>
                    </AgentSettingsFormGrid>
                  </AgentDataBlock>
                  <AgentSettingsRunPresetEditorPanel
                    title={t('agents.settings.editRunPreset')}
                    nameLabel={t('agents.settings.runPresetFields.name')}
                    nameValue={activeRunPreset.name}
                    onNameChange={(value) => updateRunPreset(activeRunPreset.id, { name: value })}
                    descriptionLabel={t('agents.settings.runPresetFields.description')}
                    descriptionValue={activeRunPreset.description}
                    onDescriptionChange={(value) => updateRunPreset(activeRunPreset.id, { description: value })}
                    maxToolCallsLabel={t('agents.settings.runPresetFields.maxToolCalls')}
                    maxToolCallsValue={activeRunPreset.maxToolCalls}
                    onMaxToolCallsChange={(value) => updateRunPreset(activeRunPreset.id, { maxToolCalls: value })}
                    maxIterationsLabel={t('agents.settings.runPresetFields.maxIterations')}
                    maxIterationsValue={activeRunPreset.maxIterations}
                    onMaxIterationsChange={(value) => updateRunPreset(activeRunPreset.id, { maxIterations: value })}
                    permissionModeLabel={t('agents.settings.runPresetFields.permissionMode')}
                    permissionModeValue={activeRunPreset.permissionMode}
                    permissionModeOptions={[
                      { value: 'ask', label: t('agents.settings.runPresetPermissionModes.ask') },
                      { value: 'suggest', label: t('agents.settings.runPresetPermissionModes.suggest') },
                      { value: 'auto', label: t('agents.settings.runPresetPermissionModes.auto') },
                    ]}
                    onPermissionModeChange={(value) => updateRunPreset(activeRunPreset.id, { permissionMode: value as AgentRunPreset['permissionMode'] })}
                    planWorkersLabel={t('agents.settings.runPresetFields.planWorkers')}
                    planWorkersValue={String(activeRunPreset.planMaxWorkers)}
                    planWorkerOptions={RUN_PRESET_TASK_GRAPH_WORKER_OPTIONS.map((value) => ({ value: String(value), label: value }))}
                    onPlanWorkersChange={(value) => updateRunPreset(activeRunPreset.id, { planMaxWorkers: Number(value) })}
                    planAttemptsLabel={t('agents.settings.runPresetFields.planAttempts')}
                    planAttemptsValue={String(activeRunPreset.planMaxTaskAttempts)}
                    planAttemptOptions={RUN_PRESET_TASK_GRAPH_ATTEMPT_OPTIONS.map((value) => ({ value: String(value), label: value }))}
                    onPlanAttemptsChange={(value) => updateRunPreset(activeRunPreset.id, { planMaxTaskAttempts: Number(value) })}
                    planTimeoutLabel={t('agents.settings.runPresetFields.planTimeout')}
                    planTimeoutValue={String(activeRunPreset.planWorkerTimeoutMs)}
                    planTimeoutOptions={RUN_PRESET_TASK_GRAPH_TIMEOUT_OPTIONS.map((timeoutMs) => ({ value: String(timeoutMs), label: formatDurationMinutes(timeoutMs) }))}
                    onPlanTimeoutChange={(value) => updateRunPreset(activeRunPreset.id, { planWorkerTimeoutMs: Number(value) })}
                    autoTaskGraphLabel={t('agents.settings.runPresetFields.autoTaskGraph')}
                    autoTaskGraphChecked={activeRunPreset.autoTaskGraph}
                    onAutoTaskGraphChange={(checked) => updateRunPreset(activeRunPreset.id, { autoTaskGraph: checked })}
                  />
                  <AgentSettingsRunPresetEffectivePolicyPanel
                    title={t('agents.settings.effectiveRunPolicy')}
                    items={[
                      { id: 'maxToolCalls', label: t('agents.settings.runPresetFields.maxToolCalls'), value: activeRunPreset.maxToolCalls },
                      { id: 'maxIterations', label: t('agents.settings.runPresetFields.maxIterations'), value: activeRunPreset.maxIterations },
                      { id: 'permissionMode', label: t('agents.settings.runPresetFields.permissionMode'), value: t(`agents.settings.runPresetPermissionModes.${activeRunPreset.permissionMode}`) },
                      { id: 'autoTaskGraph', label: t('agents.settings.runPresetFields.autoTaskGraph'), value: activeRunPreset.autoTaskGraph ? t('agents.settings.values.enabled') : t('agents.settings.values.disabled') },
                      { id: 'planWorkers', label: t('agents.settings.runPresetFields.planWorkers'), value: activeRunPreset.planMaxWorkers },
                      { id: 'planAttempts', label: t('agents.settings.runPresetFields.planAttempts'), value: activeRunPreset.planMaxTaskAttempts },
                      { id: 'planTimeout', label: t('agents.settings.runPresetFields.planTimeout'), value: formatDurationMinutes(activeRunPreset.planWorkerTimeoutMs) },
                    ]}
                  />
                  <AgentSettingsFormGrid columns="three">
                    {agentSettings.runPresets.map((preset) => (
                      <RunPresetRow
                        key={preset.id}
                        preset={preset}
                        active={preset.id === agentSettings.activeRunPresetId}
                        onSelect={selectRunPreset}
                      />
                    ))}
                  </AgentSettingsFormGrid>
                </AgentSettingsStack>
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} id="agent-settings-skills" title={t('agents.settings.skillsPanel')}>
                {catalogQuery.isLoading ? (
                  <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
                ) : catalogQuery.error ? (
                  <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
                ) : (
                  <AgentSettingsStack>
                    <AgentSettingsFormGrid columns="four">
                      <AgentSettingsKeyValue label={t('agents.settings.skillFields.installed')} value={skillStats.installed} />
                      <AgentSettingsKeyValue label={t('agents.settings.skillFields.enabled')} value={skillStats.enabled} />
                      <AgentSettingsKeyValue label={t('agents.settings.skillFields.core')} value={skillStats.core} />
                      <AgentSettingsKeyValue label={t('agents.settings.skillFields.onDemand')} value={skillStats.onDemand} />
                    </AgentSettingsFormGrid>
                    <AgentDataBlock data-testid="agent-settings-skill-governance">
                      <AgentSettingsFieldLabel>{t('agents.settings.skillGovernancePanel')}</AgentSettingsFieldLabel>
                      <AgentSettingsFieldHelp>{t('agents.settings.skillGovernanceHelp')}</AgentSettingsFieldHelp>
                      <AgentSettingsFormGrid columns="five">
                        <AgentSettingsKeyValue label={t('agents.settings.skillGovernanceFields.versioned')} value={skillGovernanceStats.versioned} />
                        <AgentSettingsKeyValue label={t('agents.settings.skillSources.core')} value={skillGovernanceStats.core} />
                        <AgentSettingsKeyValue label={t('agents.settings.skillSources.plugin')} value={skillGovernanceStats.plugin} />
                        <AgentSettingsKeyValue label={t('agents.settings.skillSources.local')} value={skillGovernanceStats.local} />
                        <AgentSettingsKeyValue label={t('agents.settings.skillTrustLevels.review')} value={skillGovernanceStats.review} />
                      </AgentSettingsFormGrid>
                    </AgentDataBlock>

                    <AgentSettingsActionRow>
                      <AgentSettingsActionButton variant="outline" onClick={reloadCatalog} disabled={catalogReloading || catalogQuery.isFetching}>
                        {catalogReloading || catalogQuery.isFetching ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
                        {t('agents.settings.reloadCatalog')}
                      </AgentSettingsActionButton>
                      {catalogReloadedAt && <AgentSettingsInlineNote>{t('agents.settings.reloadCatalogDone', { time: new Date(catalogReloadedAt).toLocaleTimeString() })}</AgentSettingsInlineNote>}
                    </AgentSettingsActionRow>
                    {catalogReloadError && <AppInlineError>{catalogReloadError}</AppInlineError>}

                    <AgentSettingsSkillBundlePanel
                      title={t('agents.settings.installSkillBundle')}
                      description={t('agents.settings.installSkillBundleHelp')}
                      fileInputRef={skillBundleFileInputRef}
                      onFileChange={(file) => void loadSkillBundleFile(file)}
                      loadFileLabel={t('agents.settings.loadSkillBundleFile')}
                      onLoadFile={() => skillBundleFileInputRef.current?.click()}
                      installLabel={t('agents.settings.installSkillBundleAction')}
                      installIcon={skillBundleInstalling ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                      installDisabled={skillBundleInstalling || !skillBundleDraftValidation.bundle}
                      onInstall={installSkillBundle}
                      fileLoadedLabel={skillBundleFileName ? t('agents.settings.skillBundleFileLoaded', { fileName: skillBundleFileName }) : undefined}
                      textValue={skillBundleText}
                      onTextChange={(value) => {
                        setSkillBundleText(value)
                        setSkillBundleInstallError(null)
                        setSkillBundleInstallResult(null)
                      }}
                      placeholder={t('agents.settings.installSkillBundlePlaceholder')}
                      draftSummary={skillBundleDraftValidation.bundle ? t('agents.settings.skillBundleDraftSummary', {
                        pluginId: skillBundleDraftValidation.bundle.pluginId,
                        count: skillBundleDraftValidation.bundle.files.length,
                        size: formatBytes(skillBundleDraftValidation.totalBytes),
                      }) : undefined}
                      draftError={skillBundleDraftValidation.error}
                      installError={skillBundleInstallError}
                      installResult={skillBundleInstallResult ? t('agents.settings.installSkillBundleDone', { count: skillBundleInstallResult.installedFiles.length, pluginId: skillBundleInstallResult.pluginId }) : undefined}
                      installedTitle={t('agents.settings.installedSkillBundles')}
                      installedPlugins={skillBundlePlugins.map((plugin) => ({
                        id: plugin.pluginId,
                        path: plugin.path,
                        actionLabel: t(skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'agents.settings.uninstallSkillBundleConfirm' : 'agents.settings.uninstallSkillBundleAction'),
                        actionIcon: skillBundleUninstalling && skillBundleUninstallPluginId === plugin.pluginId ? <AgentSettingsIcon icon={Loader2} size={12} spinning /> : <Trash2 size={12} />,
                        actionIntent: skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'danger' : 'neutral',
                        actionVariant: skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'solid' : 'ghost',
                        disabled: skillBundleUninstalling,
                        onAction: () => {
                          if (skillBundleUninstallConfirmPluginId === plugin.pluginId) {
                            void uninstallSkillBundle(plugin.pluginId)
                            return
                          }
                          setSkillBundleUninstallConfirmPluginId(plugin.pluginId)
                          setSkillBundleUninstallError(null)
                        },
                      }))}
                      uninstallLabel={t('agents.settings.uninstallSkillBundle')}
                      uninstallValue={skillBundleUninstallPluginId}
                      onUninstallValueChange={(value) => {
                        setSkillBundleUninstallPluginId(value)
                        setSkillBundleUninstallError(null)
                        setSkillBundleUninstallResult(null)
                      }}
                      uninstallPlaceholder={t('agents.settings.uninstallSkillBundlePlaceholder')}
                      uninstallActionLabel={t('agents.settings.uninstallSkillBundleAction')}
                      uninstallIcon={skillBundleUninstalling ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Trash2 size={14} />}
                      uninstallDisabled={skillBundleUninstalling || !skillBundleUninstallPluginIdValue || skillBundleUninstallPluginIdInvalid}
                      onUninstall={() => void uninstallSkillBundle()}
                      uninstallHelp={t('agents.settings.uninstallSkillBundleHelp')}
                      uninstallInputError={!skillBundleUninstallError && skillBundleUninstallPluginIdInvalid ? t('agents.settings.uninstallSkillBundlePluginIdInvalid') : undefined}
                      uninstallError={skillBundleUninstallError}
                      uninstallResult={skillBundleUninstallResult
                        ? skillBundleUninstallResult.removed
                          ? t('agents.settings.uninstallSkillBundleDone', { pluginId: skillBundleUninstallResult.pluginId })
                          : t('agents.settings.uninstallSkillBundleMissing', { pluginId: skillBundleUninstallResult.pluginId })
                        : undefined}
                    />

                    <AgentSettingsActionRow>
                      <AgentSettingsActionButton onClick={saveDefaultSkillPolicy} disabled={!hasSkillPolicyChange || skillPolicySaving || skillDrafts.length === 0 || skillPolicyIssues.length > 0}>
                        {skillPolicySaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                        {hasSkillPolicyChange ? t('agents.settings.saveSkillPolicy') : t('agents.settings.skillPolicySaved')}
                      </AgentSettingsActionButton>
                      <AgentSettingsActionButton variant="outline" onClick={() => setSkillDrafts(skillPolicyBaseline)} disabled={!hasSkillPolicyChange || skillPolicySaving}>
                        {t('agents.settings.resetSkillPolicy')}
                      </AgentSettingsActionButton>
                      <AgentSettingsInlineNote>{t('agents.settings.skillPolicyEditHelp')}</AgentSettingsInlineNote>
                    </AgentSettingsActionRow>
                    {skillPolicySaveError && <AppInlineError>{skillPolicySaveError}</AppInlineError>}
                    {skillPolicyIssues.length > 0 && (
                      <AgentSettingsCallout tone="warning" compact>
                        <AgentSettingsToneText tone="warning">
                          {t('agents.settings.skillPolicyIssues')}
                        </AgentSettingsToneText>
                        <AgentSettingsIssueList
                          items={skillPolicyIssues.map((issue) => (
                            issue.type === 'dependency'
                              ? t('agents.settings.skillPolicyIssueDependency', { skillId: issue.skillId, dependencyId: issue.relatedSkillId })
                              : t('agents.settings.skillPolicyIssueConflict', { skillId: issue.skillId, conflictId: issue.relatedSkillId })
                          ))}
                        />
                        <AgentSettingsActionButton variant="outline" onClick={() => fixToolPolicyDraftIssues({ audit: true })} data-testid="agent-settings-fix-tool-policy-draft-issues">
                          {t('agents.settings.fixToolPolicyDraftIssues')}
                        </AgentSettingsActionButton>
                      </AgentSettingsCallout>
                    )}

                    {coreSkills.length > 0 && (
                      <AgentDataBlock>
                        <AgentSettingsFieldLabel>{t('agents.settings.coreSkills')}</AgentSettingsFieldLabel>
                        <AgentSettingsActionRow>
                          {coreSkills.map((skill) => (
                            <AgentSettingsBadge key={skill.id}>{skill.name}</AgentSettingsBadge>
                          ))}
                        </AgentSettingsActionRow>
                      </AgentDataBlock>
                    )}

                    <AgentSettingsStack>
                      {featuredSkills.length === 0 ? (
                        <AgentSettingsStateMessage text={t('agents.settings.noSkills')} />
                      ) : featuredSkills.map((skill) => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          draft={skillDraftById.get(skill.id)}
                          onDraftChange={updateSkillDraft}
                        />
                      ))}
                    </AgentSettingsStack>
                  </AgentSettingsStack>
                )}
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} id="agent-settings-profiles" title={t('agents.settings.profilesPanel')}>
                {catalogQuery.isLoading ? (
                  <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
                ) : catalogQuery.error ? (
                  <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
                ) : (
                  <AgentSettingsStack>
                    <AgentSettingsFormGrid columns="four">
                      <AgentSettingsKeyValue label={t('agents.settings.profileFields.total')} value={catalogQuery.data?.profiles.length ?? 0} />
                      <AgentSettingsKeyValue label={t('agents.settings.profileFields.current')} value={currentProfile?.name ?? '-'} />
                      <AgentSettingsKeyValue label={t('agents.settings.profileFields.packs')} value={currentProfile?.enabledPacks.length ?? 0} />
                      <AgentSettingsKeyValue label={t('agents.settings.profileFields.toolGrants')} value={currentProfile?.toolGrants.length ?? 0} />
                    </AgentSettingsFormGrid>

                    {(catalogQuery.data?.profiles.length ?? 0) > 0 && (
                      <AgentDataBlock>
                        <AgentSettingsFormGrid columns="model">
                        <AgentSettingsFormField>
                          <AgentSettingsFieldLabel>{t('agents.settings.defaultProfileLabel')}</AgentSettingsFieldLabel>
                          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                            <AgentSettingsSelectTrigger>
                              <SelectValue placeholder={t('agents.settings.selectProfile')} />
                            </AgentSettingsSelectTrigger>
                            <SelectContent>
                              {(catalogQuery.data?.profiles ?? []).map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <AgentSettingsFieldHelp>{t('agents.settings.defaultProfileHelp')}</AgentSettingsFieldHelp>
                        </AgentSettingsFormField>
                        <AgentSettingsActionRow>
                          <AgentSettingsActionButton onClick={saveDefaultProfile} disabled={!hasProfileChange || profileSaving}>
                            {profileSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                            {hasProfileChange ? t('agents.settings.saveProfile') : t('agents.settings.profileSaved')}
                          </AgentSettingsActionButton>
                        </AgentSettingsActionRow>
                        </AgentSettingsFormGrid>
                      </AgentDataBlock>
                    )}
                    {profileSaveError && <AppInlineError>{profileSaveError}</AppInlineError>}

                    {selectedProfile && selectedProfile.id !== currentProfile?.id && (
                      <AgentSettingsStack>
                        {selectedProfileDiff && <ProfileDiffPanel diff={selectedProfileDiff} />}
                        <AgentSettingsCallout tone="warning" compact>
                          {t('agents.settings.profileSwitchResetsToolPolicy')}
                        </AgentSettingsCallout>
                        <ProfileRow profile={selectedProfile} preview />
                      </AgentSettingsStack>
                    )}

                    {currentProfile ? (
                      <ProfileRow profile={currentProfile} current />
                    ) : (
                      <AgentSettingsStateMessage text={t('agents.settings.noProfiles')} />
                    )}

                    {(catalogQuery.data?.profiles ?? []).filter((profile) => profile.id !== currentProfile?.id).slice(0, 6).map((profile) => (
                      <ProfileRow key={profile.id} profile={profile} />
                    ))}
                  </AgentSettingsStack>
                )}
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} id="agent-settings-tools" title={t('agents.settings.toolPolicyPanel')}>
                {capabilitiesQuery.isLoading ? (
                  <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
                ) : capabilitiesQuery.error ? (
                  <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(capabilitiesQuery.error)} />
                ) : (
                  <AgentSettingsStack>
                    <AgentSettingsFormGrid columns="four">
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.discovered')} value={toolStats.discovered} />
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.available')} value={toolStats.available} />
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.blocked')} value={toolStats.blocked} />
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.requiresApproval')} value={toolStats.requiresApproval} />
                    </AgentSettingsFormGrid>

                    <AgentSettingsFormGrid columns="three">
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.writeRisk')} value={toolStats.writeRisk} />
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.projectScoped')} value={toolStats.projectScoped} />
                      <AgentSettingsKeyValue label={t('agents.settings.toolPolicyFields.profileGrants')} value={currentProfile?.toolGrants.length ?? 0} />
                    </AgentSettingsFormGrid>

                    <AgentSettingsActionRow>
                      <AgentSettingsActionButton onClick={saveDefaultToolPolicy} disabled={!hasToolPolicyChange || toolPolicySaving || toolGrantDrafts.length === 0 || toolPolicyDraftIssues.length > 0}>
                        {toolPolicySaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                        {hasToolPolicyChange ? t('agents.settings.saveToolPolicy') : t('agents.settings.toolPolicySaved')}
                      </AgentSettingsActionButton>
                      <AgentSettingsActionButton variant="outline" onClick={() => setToolGrantDrafts(toolGrantBaseline)} disabled={!hasToolPolicyChange || toolPolicySaving}>
                        {t('agents.settings.resetToolPolicy')}
                      </AgentSettingsActionButton>
                      <AgentSettingsInlineNote>{t('agents.settings.toolPolicyEditHelp')}</AgentSettingsInlineNote>
                    </AgentSettingsActionRow>
                    {hasToolPolicyChange && <ToolPolicyDiffPreview items={toolPolicyDiffItems} />}
                    {toolPolicySaveError && <AppInlineError>{toolPolicySaveError}</AppInlineError>}
                    {toolPolicyDraftIssues.length > 0 && (
                      <AgentSettingsCallout data-testid="agent-settings-tool-policy-draft-issues" tone="warning" compact>
                        <AgentSettingsToneText tone="warning">
                          {t('agents.settings.toolPolicyDraftIssues')}
                        </AgentSettingsToneText>
                        <AgentSettingsIssueList
                          items={toolPolicyDraftIssues.slice(0, 5).map((issue) => (
                            `${issue.toolName}: ${t(issue.reasonKey, issue.values)}`
                          ))}
                        />
                      </AgentSettingsCallout>
                    )}

                    <AgentSettingsToolPolicyFilterPanel
                      searchValue={toolPolicySearch}
                      onSearchChange={setToolPolicySearch}
                      searchPlaceholder={t('agents.settings.toolPolicySearchPlaceholder')}
                      filterValue={toolPolicyFilter}
                      onFilterChange={(value) => setToolPolicyFilter(value as ToolPolicyFilter)}
                      filterOptions={TOOL_POLICY_FILTER_OPTIONS.map((filter) => ({
                        value: filter,
                        label: t(`agents.settings.toolPolicyFilters.${filter}`),
                      }))}
                      summary={t('agents.settings.toolPolicyFilterSummary', {
                        shown: toolPolicyFilteredTools.length,
                        total: capabilitiesQuery.data?.resolvedTools.discovered.length ?? 0,
                      })}
                    />
                    <AgentSettingsToolPolicyFilterPresetPanel
                      title={t('agents.settings.toolPolicyFilterPresets')}
                      saveLabel={t('agents.settings.saveToolPolicyFilterPreset')}
                      saveIcon={<Plus size={14} />}
                      help={t('agents.settings.toolPolicyFilterPresetsHelp')}
                      emptyLabel={t('agents.settings.toolPolicyFilterPresetsEmpty')}
                      deleteLabel={t('agents.settings.deleteToolPolicyFilterPreset')}
                      deleteIcon={<Trash2 size={14} />}
                      onSave={saveToolPolicyFilterPreset}
                      presets={agentSettings.toolPolicyFilterPresets.map((preset) => ({
                        id: preset.id,
                        name: preset.name,
                        title: preset.name,
                        onSelect: () => applyToolPolicyFilterPreset(preset),
                        onDelete: () => deleteToolPolicyFilterPreset(preset.id),
                      }))}
                    />
                    <AgentSettingsToolPolicyBulkActionPanel
                      title={t('agents.settings.toolPolicyBulkActions')}
                      help={t('agents.settings.toolPolicyBulkHelp')}
                      actions={[
                        { id: 'allow_available', label: t('agents.settings.toolPolicyBulkAllowAvailable'), onClick: () => applyToolPolicyBulkEdit('allow_available'), disabled: toolPolicyFilteredTools.length === 0 },
                        { id: 'deny', label: t('agents.settings.toolPolicyBulkDeny'), onClick: () => applyToolPolicyBulkEdit('deny'), disabled: toolPolicyFilteredTools.length === 0 },
                        { id: 'approval_never', label: t('agents.settings.toolPolicyBulkApprovalNever'), onClick: () => applyToolPolicyBulkEdit('approval_never'), disabled: toolPolicyFilteredTools.length === 0 },
                        { id: 'approval_on_write', label: t('agents.settings.toolPolicyBulkApprovalOnWrite'), onClick: () => applyToolPolicyBulkEdit('approval_on_write'), disabled: toolPolicyFilteredTools.length === 0 },
                        { id: 'approval_always', label: t('agents.settings.toolPolicyBulkApprovalAlways'), onClick: () => applyToolPolicyBulkEdit('approval_always'), disabled: toolPolicyFilteredTools.length === 0 },
                      ]}
                    />

                    {toolPolicyFilteredTools.length === 0 ? (
                      <AgentSettingsStateMessage text={t('agents.settings.noTools')} />
                    ) : (
                      <AgentSettingsStack>
                        {toolPolicyFilteredTools.map((tool) => (
                          <ToolPolicyRow
                            key={tool.name}
                            tool={tool}
                            draft={toolGrantDraftByName.get(tool.name)}
                            profileGranted={currentToolGrants.has(tool.name)}
                            onDraftChange={updateToolGrantDraft}
                          />
                        ))}
                      </AgentSettingsStack>
                    )}
                  </AgentSettingsStack>
                )}
              </AgentSettingsPanel>
            </AgentSettingsMain>

            <AgentSettingsSidebar>
              <AgentSettingsPanel icon={Bot} title={t('agents.settings.configurationMapPanel')}>
                <ConfigurationMapPanel onJump={scrollToSettingsSection} />
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.currentRuntime')}>
                <AgentSettingsStack>
                  <AgentSettingsKeyValue label={t('agents.settings.fields.baseUrl')} value={redactAgentTraceDebugText(localAgentClient.baseURL)} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.configuredModel')} value={configuredModelLabel} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.apiKind')} value={effectiveConfig?.apiKind ?? DEFAULT_API_KIND} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.modelBaseUrl')} value={redactAgentTraceDebugText(effectiveConfig?.baseURL || apiKindBaseURLPlaceholder(effectiveConfig?.apiKind ?? DEFAULT_API_KIND))} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.modelCredentials')} value={modelCredentialStatusLabel} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.source')} value={effectiveConfig?.source ?? 'none'} />
                  <AgentSettingsKeyValue label={t('agents.settings.fields.updatedAt')} value={effectiveConfig?.updatedAt ? new Date(effectiveConfig.updatedAt).toLocaleString() : '-'} />
                </AgentSettingsStack>
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.actionItemsPanel')}>
                <SettingsActionItemsPanel items={settingsActionItems} feedback={settingsActionFeedback} onJump={scrollToSettingsSection} onQuickFix={applySettingsActionQuickFix} />
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.readinessPanel')}>
                <SettingsReadinessPanel items={readinessItems} />
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.settingsAuditPanel')}>
                <SettingsAuditTrailPanel entries={agentSettings.auditTrail} onClear={clearSettingsAudit} />
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} id="agent-settings-snapshot" title={t('agents.settings.settingsSnapshotPanel')}>
                <AgentSettingsStack>
                  <AgentSettingsActionRow>
                    <AgentSettingsInput
                      ref={settingsSnapshotFileInputRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(event) => void loadSettingsSnapshotFile(event.target.files?.[0])}
                    />
                    <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={exportSettingsSnapshot}>
                      <Save size={14} />
                      {t('agents.settings.exportSettings')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={() => settingsSnapshotFileInputRef.current?.click()}>
                      <Upload size={14} />
                      {t('agents.settings.loadSettingsSnapshotFile')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={() => void copySettingsSnapshot()}>
                      <Clipboard size={14} />
                      {t('agents.settings.copySettings')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={downloadSettingsSnapshot}>
                      <Download size={14} />
                      {t('agents.settings.downloadSettings')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={previewSettingsSnapshotImport} disabled={!parsedSettingsSnapshot || Boolean(settingsSnapshotValidation.error) || !settingsSnapshotHasSelectedImportScope} data-testid="agent-settings-preview-import-dry-run">
                      <TestTube2 size={14} />
                      {t('agents.settings.previewSettingsImportDryRun')}
                    </AgentSettingsActionButton>
                    <AgentSettingsActionButton type="button" size="sm" onClick={() => void importSettingsSnapshot()} disabled={settingsSnapshotImporting || !settingsSnapshotCanImport}>
                      {settingsSnapshotImporting ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Upload size={14} />}
                      {t('agents.settings.importSettings')}
                    </AgentSettingsActionButton>
                  </AgentSettingsActionRow>
                  <AgentSettingsFieldHelp>{t('agents.settings.settingsSnapshotHelp')}</AgentSettingsFieldHelp>
                  {settingsSnapshotFileName && <AgentSettingsInlineNote>{t('agents.settings.settingsSnapshotFileLoaded', { fileName: settingsSnapshotFileName })}</AgentSettingsInlineNote>}
                  {settingsImportBackup && (
                    <AgentSettingsCallout data-testid="agent-settings-import-backup" tone="warning" compact>
                      <AgentSettingsItemTitle>{t('agents.settings.settingsImportBackup')}</AgentSettingsItemTitle>
                      <AgentSettingsItemDetail>
                        {t('agents.settings.settingsImportBackupHelp', { time: new Date(settingsImportBackup.createdAt).toLocaleString() })}
                      </AgentSettingsItemDetail>
                      <AgentSettingsActionRow>
                        <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={loadSettingsImportBackup} data-testid="agent-settings-load-import-backup">
                          <RefreshCw size={14} />
                          {t('agents.settings.loadImportBackup')}
                        </AgentSettingsActionButton>
                        <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={() => void copySettingsImportBackup()} data-testid="agent-settings-copy-import-backup">
                          <Clipboard size={14} />
                          {t('agents.settings.copyImportBackup')}
                        </AgentSettingsActionButton>
                        <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={clearSettingsImportBackup} data-testid="agent-settings-clear-import-backup">
                          <Trash2 size={14} />
                          {t('agents.settings.clearImportBackup')}
                        </AgentSettingsActionButton>
                      </AgentSettingsActionRow>
                    </AgentSettingsCallout>
                  )}
                  <AgentSettingsTextarea
                    value={settingsSnapshotText}
                    onChange={(event) => updateSettingsSnapshotText(event.target.value)}
                    placeholder={t('agents.settings.settingsSnapshotPlaceholder')}
                    minRows="large"
                  />
                  {parsedSettingsSnapshot && <SettingsSnapshotSummary snapshot={parsedSettingsSnapshot} />}
                  {parsedSettingsSnapshot && (
                    <SettingsSnapshotImportScopeSelector
                      snapshot={parsedSettingsSnapshot}
                      selectedScopes={settingsSnapshotImportScopes}
                      onScopeChange={toggleSettingsSnapshotImportScope}
                      onPresetChange={applySettingsSnapshotImportPreset}
                    />
                  )}
                  {selectedSettingsSnapshotForImport && <SettingsSnapshotImpactPreview snapshot={selectedSettingsSnapshotForImport} />}
                  {settingsSnapshotError && <AppInlineError>{settingsSnapshotError}</AppInlineError>}
                  {!settingsSnapshotError && parsedSettingsSnapshot && !settingsSnapshotHasSelectedImportScope && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotImportScopeEmpty')}</AppInlineError>
                  )}
                  {!settingsSnapshotError && settingsSnapshotValidation.error && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotValidation.error })}</AppInlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsCatalog && !catalogQuery.data && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotCatalogUnavailable')}</AppInlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsCapabilities && !capabilitiesQuery.data && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotCapabilitiesUnavailable')}</AppInlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsModelCatalog && !modelsQuery.data && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotModelCatalogUnavailable')}</AppInlineError>
                  )}
                  {!settingsSnapshotError && settingsSnapshotReferenceIssues.length > 0 && (
                    <AppInlineError>{t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotReferenceIssues.map((issue) => issue.message).join('; ') })}</AppInlineError>
                  )}
                  {settingsSnapshotMessage && <AgentSettingsInlineNote>{settingsSnapshotMessage}</AgentSettingsInlineNote>}
                </AgentSettingsStack>
              </AgentSettingsPanel>

              <AgentSettingsPanel icon={Bot} title={t('agents.settings.modelRoutesPanel')}>
                {modelRoutes.length === 0 ? (
                  <AgentSettingsStateMessage text={t('agents.settings.modelRoutesEmpty')} />
                ) : (
                  <AgentSettingsStack>
                    {modelRoutes.map((route) => (
                      <AgentSettingsModelRouteCard
                        key={route.capability}
                        title={t(`agents.settings.modelCapabilities.${route.capability}`)}
                        statusVariant={route.configured ? 'soft' : 'outline'}
                        statusLabel={route.configured ? t('agents.settings.modelRouteConfigured') : t('agents.settings.modelRouteUnavailable')}
                        sourceLabel={t(`agents.settings.modelRouteSources.${route.source}`)}
                        modelLabel={route.model ? `${t('agents.settings.modelRouteModel')}: ${redactAgentTraceDebugText(route.model)}` : undefined}
                      />
                    ))}
                  </AgentSettingsStack>
                )}
              </AgentSettingsPanel>

              {usesModelCatalog ? (
                <AgentSettingsPanel icon={Bot} title={t('agents.settings.availableModels')}>
                  {textModels.length === 0 ? (
                    <AgentSettingsStateMessage text={t('agents.settings.noTextModels')} />
                  ) : (
                    <AgentSettingsStack>
                      {textModels.slice(0, 12).map((model) => (
                        <AgentSettingsModelOptionButton
                          key={model.id}
                          selected={selectedModelId === publicModelId(model)}
                          selectedIcon={<AgentSettingsIcon icon={CheckCircle2} size={14} selected />}
                          title={publicModelLabel(model, true)}
                          detail={model.capabilities.join(', ')}
                          onSelect={() => setSelectedModelId(publicModelId(model))}
                        />
                      ))}
                    </AgentSettingsStack>
                  )}
                </AgentSettingsPanel>
              ) : (
                <AgentSettingsPanel icon={Bot} title={t('agents.settings.providerModelPanel')}>
                  <AgentSettingsFieldHelp>{t('agents.settings.providerModelPanelHelp')}</AgentSettingsFieldHelp>
                </AgentSettingsPanel>
              )}
            </AgentSettingsSidebar>
          </AgentSettingsLayout>
        )}
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function currentAgentProfileId(inspect?: AgentInspectResponse): string {
  const raw = inspect?.defaultAgentManifest.metadata?.profileId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'movscript.profile.default'
}

function buildSkillStats(skills: AgentCatalogSkill[]) {
  return {
    installed: skills.length,
    enabled: skills.filter((skill) => skill.enabled !== false).length,
    core: skills.filter((skill) => skill.loadMode === 'core').length,
    onDemand: skills.filter((skill) => skill.loadMode === 'on_demand' || !skill.loadMode).length,
  }
}

function buildSkillGovernanceStats(skills: AgentCatalogSkill[]) {
  return {
    versioned: skills.filter((skill) => Boolean(skill.version)).length,
    core: skills.filter((skill) => skillSourceKind(skill) === 'core').length,
    plugin: skills.filter((skill) => skillSourceKind(skill) === 'plugin').length,
    local: skills.filter((skill) => skillSourceKind(skill) === 'local').length,
    review: skills.filter((skill) => skillTrustLevel(skill) === 'review').length,
  }
}

function buildModelRouteIssues(input: { useForChat: boolean; useForPlanner: boolean }): string[] {
  if (!input.useForChat && !input.useForPlanner) return ['allRoutesDisabled']
  return []
}

function buildModelCompatibilityProbes(input: {
  selectedApiKind: RuntimeModelAPIKind
  modelValue: string
  baseURL: string
  apiKeyProvided: boolean
  usesBackendCompatibleBaseURL: boolean
  modelBaseURLHasSecret: boolean
  directModelIdHasSecret: boolean
  useForChat: boolean
  useForPlanner: boolean
  effectiveConfig: RuntimeModelConfigPublic | null
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

function buildApiModeSwitchTaskGraph(input: {
  selectedApiKind: RuntimeModelAPIKind
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

function recommendedSwitchTarget(apiKind: RuntimeModelAPIKind): RuntimeModelAPIKind {
  if (apiKind === 'openai_chat_completions') return 'openai_responses'
  return apiKind
}

function buildSettingsReadinessItems(input: {
  effectiveConfig: RuntimeModelConfigPublic | null
  selectedApiKind: RuntimeModelAPIKind
  savedDirectModelIdHasSecret: boolean
  modelRoutes: NonNullable<RuntimeModelConfigPublic['capabilities']>
  modelRouteIssues: string[]
  activeRunPreset: AgentRunPreset
  currentProfile: AgentCatalogProfile | null
  skillPolicyIssues: SkillPolicyIssue[]
  toolPolicyDraftIssues: ToolPolicyDraftIssue[]
  skillStats: ReturnType<typeof buildSkillStats>
  toolStats: ReturnType<typeof buildToolStats>
  hasUnsavedChanges: boolean
  hasProfileChange: boolean
  hasSkillPolicyChange: boolean
  hasToolPolicyChange: boolean
}): SettingsReadinessItem[] {
  const configuredRoutes = input.modelRoutes.filter((route) => route.configured).length
  const pendingChanges = [input.hasUnsavedChanges, input.hasProfileChange, input.hasSkillPolicyChange, input.hasToolPolicyChange].filter(Boolean).length
  const credentialStatus = input.effectiveConfig?.credentialStatus
  const runPresetHasAutoWriteRisk = input.activeRunPreset.permissionMode === 'auto' && input.toolStats.availableWriteRisk > 0
  const skillPolicyHasIssues = input.skillPolicyIssues.length > 0
  const toolPolicyHasDraftIssues = input.toolPolicyDraftIssues.length > 0
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
      id: 'preset',
      status: runPresetHasAutoWriteRisk ? 'warning' : 'ready',
      labelKey: 'agents.settings.readiness.runPreset',
      detailKey: runPresetHasAutoWriteRisk
        ? 'agents.settings.readinessDetails.runPresetAutoWriteRisk'
        : 'agents.settings.readinessDetails.runPresetReady',
      detailValues: {
        name: input.activeRunPreset.name,
        maxToolCalls: input.activeRunPreset.maxToolCalls,
        maxIterations: input.activeRunPreset.maxIterations,
        count: input.toolStats.availableWriteRisk,
      },
    },
    {
      id: 'profile',
      status: input.currentProfile ? 'ready' : 'action',
      labelKey: 'agents.settings.readiness.profile',
      detailKey: input.currentProfile ? 'agents.settings.readinessDetails.profileReady' : 'agents.settings.readinessDetails.profileMissing',
      detailValues: { name: input.currentProfile?.name ?? '-' },
    },
    {
      id: 'skills',
      status: skillPolicyHasIssues ? 'action' : input.skillStats.installed > 0 ? 'ready' : 'warning',
      labelKey: 'agents.settings.readiness.skills',
      detailKey: skillPolicyHasIssues
        ? 'agents.settings.readinessDetails.skillsInvalid'
        : input.skillStats.installed > 0
          ? 'agents.settings.readinessDetails.skillsReady'
          : 'agents.settings.readinessDetails.skillsMissing',
      detailValues: { enabled: input.skillStats.enabled, installed: input.skillStats.installed, count: input.skillPolicyIssues.length },
    },
    {
      id: 'tools',
      status: toolPolicyHasDraftIssues ? 'action' : input.toolStats.available > 0 ? 'ready' : 'warning',
      labelKey: 'agents.settings.readiness.tools',
      detailKey: toolPolicyHasDraftIssues
        ? 'agents.settings.readinessDetails.toolsInvalid'
        : input.toolStats.available > 0
          ? 'agents.settings.readinessDetails.toolsReady'
          : 'agents.settings.readinessDetails.toolsMissing',
      detailValues: { available: input.toolStats.available, discovered: input.toolStats.discovered, count: input.toolPolicyDraftIssues.length },
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

function buildSettingsActionItems(input: {
  effectiveConfig: RuntimeModelConfigPublic | null
  selectedApiKind: RuntimeModelAPIKind
  draftBaseURL: string
  savedDirectModelIdHasSecret: boolean
  modelRoutes: NonNullable<RuntimeModelConfigPublic['capabilities']>
  modelRouteIssues: string[]
  activeRunPreset: AgentRunPreset
  currentProfile: AgentCatalogProfile | null
  skillPolicyIssues: SkillPolicyIssue[]
  toolPolicyDraftIssues: ToolPolicyDraftIssue[]
  toolStats: ReturnType<typeof buildToolStats>
  tools?: AgentCapabilitiesResponse['resolvedTools']
  hasUnsavedChanges: boolean
  hasProfileChange: boolean
  hasSkillPolicyChange: boolean
  hasToolPolicyChange: boolean
}): SettingsActionItem[] {
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
      quickFix: 'reset-model-draft',
      quickFixLabelKey: 'agents.settings.quickFixes.resetDraft',
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

  if (input.selectedApiKind === 'openai_chat_completions') {
    items.push({
      id: 'api-mode-compatibility',
      status: 'warning',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.apiModeCompatibility',
      detailKey: 'agents.settings.actionItemDetails.apiModeCompatibility',
      quickFix: 'switch-openai-responses',
      quickFixLabelKey: 'agents.settings.quickFixes.switchOpenAIResponses',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveAfterQuickFix',
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

  if (hasSensitiveURLSecret(input.draftBaseURL)) {
    items.push({
      id: 'model-base-url-sensitive',
      status: 'warning',
      targetSection: 'agent-settings-model',
      labelKey: 'agents.settings.actionItems.modelBaseURLSensitive',
      detailKey: 'agents.settings.actionItemDetails.modelBaseURLSensitive',
      quickFix: 'strip-sensitive-base-url-query',
      quickFixLabelKey: 'agents.settings.quickFixes.stripSensitiveBaseURLQuery',
      persistHintKey: 'agents.settings.actionItemPersistHints.useRuntimeEnvForSecrets',
    })
  }

  if (input.activeRunPreset.permissionMode === 'auto' && input.toolStats.availableWriteRisk > 0) {
    items.push({
      id: 'auto-permission-write-risk',
      status: 'warning',
      targetSection: 'agent-settings-run-presets',
      labelKey: 'agents.settings.actionItems.autoPermissionWriteRisk',
      detailKey: 'agents.settings.actionItemDetails.autoPermissionWriteRisk',
      detailValues: { count: input.toolStats.availableWriteRisk },
      quickFix: 'downgrade-auto-permission',
      quickFixLabelKey: 'agents.settings.quickFixes.downgradeAutoPermission',
      persistHintKey: 'agents.settings.actionItemPersistHints.localDefaultsImmediately',
    })
  }

  if (!input.currentProfile) {
    items.push({
      id: 'profile-missing',
      status: 'action',
      targetSection: 'agent-settings-profiles',
      labelKey: 'agents.settings.actionItems.profileMissing',
      detailKey: 'agents.settings.actionItemDetails.profileMissing',
    })
  } else if (input.hasProfileChange) {
    items.push({
      id: 'profile-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-profiles',
      labelKey: 'agents.settings.actionItems.profileUnsaved',
      detailKey: 'agents.settings.actionItemDetails.profileUnsaved',
      quickFix: 'reset-profile-draft',
      quickFixLabelKey: 'agents.settings.quickFixes.resetDraft',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  }

  if (input.skillPolicyIssues.length > 0) {
    items.push({
      id: 'skill-policy-invalid',
      status: 'action',
      targetSection: 'agent-settings-skills',
      labelKey: 'agents.settings.actionItems.skillPolicyInvalid',
      detailKey: 'agents.settings.actionItemDetails.skillPolicyInvalid',
      detailValues: { count: input.skillPolicyIssues.length },
      reasons: compactActionReasons(input.skillPolicyIssues.map(formatSettingsSkillPolicyIssue)),
      quickFix: 'reset-skill-policy-draft',
      quickFixLabelKey: 'agents.settings.quickFixes.resetDraft',
    })
  } else if (input.hasSkillPolicyChange) {
    items.push({
      id: 'skill-policy-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-skills',
      labelKey: 'agents.settings.actionItems.skillPolicyUnsaved',
      detailKey: 'agents.settings.actionItemDetails.skillPolicyUnsaved',
      quickFix: 'reset-skill-policy-draft',
      quickFixLabelKey: 'agents.settings.quickFixes.resetDraft',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveOrReset',
    })
  }

  if (input.toolPolicyDraftIssues.length > 0) {
    items.push({
      id: 'tool-policy-invalid',
      status: 'action',
      targetSection: 'agent-settings-tools',
      labelKey: 'agents.settings.actionItems.toolPolicyInvalid',
      detailKey: 'agents.settings.actionItemDetails.toolPolicyInvalid',
      detailValues: { count: input.toolPolicyDraftIssues.length },
      reasons: compactActionReasons(input.toolPolicyDraftIssues.map(formatSettingsToolPolicyIssue)),
      quickFix: 'fix-tool-policy-draft-issues',
      quickFixLabelKey: 'agents.settings.fixToolPolicyDraftIssues',
      persistHintKey: 'agents.settings.actionItemPersistHints.saveAfterQuickFix',
    })
  } else if (input.hasToolPolicyChange) {
    items.push({
      id: 'tool-policy-unsaved',
      status: 'warning',
      targetSection: 'agent-settings-tools',
      labelKey: 'agents.settings.actionItems.toolPolicyUnsaved',
      detailKey: 'agents.settings.actionItemDetails.toolPolicyUnsaved',
      quickFix: 'reset-tool-policy-draft',
      quickFixLabelKey: 'agents.settings.quickFixes.resetDraft',
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

async function copyRedactedSettingsLines(lines: string[]) {
  await navigator.clipboard.writeText(lines.map(redactAgentTraceDebugText).join('\n'))
}

function formatSettingsSkillPolicyIssue(issue: SkillPolicyIssue): SettingsActionReason {
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

function formatSettingsToolPolicyIssue(issue: ToolPolicyDraftIssue): SettingsActionReason {
  if (issue.reasonKey === 'agents.settings.toolPolicyDraftIssueDetails.notProfileGranted') {
    return {
      labelKey: 'agents.settings.actionItemReasons.toolNotProfileGranted',
      values: { toolName: issue.toolName },
    }
  }
  if (issue.reasonKey === 'agents.settings.toolPolicyDraftIssueDetails.unavailableAllow') {
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

function buildToolUnavailableReasonSummary(tools?: AgentCapabilitiesResponse['resolvedTools']): SettingsActionReason[] {
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

function skillLoadRank(skill: AgentCatalogSkill): number {
  if (skill.loadMode === 'core') return 0
  if (skill.loadMode === 'on_demand' || !skill.loadMode) return 1
  return 2
}

function buildSkillPolicyDrafts(skills: AgentCatalogSkill[]): SkillPolicyDraft[] {
  return skills.map((skill) => ({ id: skill.id, enabled: skill.enabled !== false }))
}

function buildSkillPolicyIssues(
  skills: AgentCatalogSkill[],
  drafts: SkillPolicyDraft[],
  baseline: SkillPolicyDraft[],
): SkillPolicyIssue[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const enabledById = new Map(skills.map((skill) => [skill.id, skill.enabled !== false]))
  for (const draft of drafts) enabledById.set(draft.id, draft.enabled)
  const baselineById = new Map(baseline.map((draft) => [draft.id, draft.enabled]))
  const changedIds = drafts
    .filter((draft) => baselineById.get(draft.id) !== draft.enabled)
    .map((draft) => draft.id)
  const issues = new Map<string, SkillPolicyIssue>()

  for (const id of changedIds) {
    const skill = skillById.get(id)
    if (!skill) continue
    const enabled = enabledById.get(id) !== false
    if (!enabled) {
      for (const candidate of skills) {
        if (enabledById.get(candidate.id) === false || !(candidate.dependencies ?? []).includes(id)) continue
        const key = `dependency:${candidate.id}:${id}`
        issues.set(key, { type: 'dependency', skillId: candidate.id, relatedSkillId: id })
      }
      continue
    }
    for (const dependencyId of skill.dependencies ?? []) {
      if (enabledById.get(dependencyId) === false || !skillById.has(dependencyId)) {
        const key = `dependency:${skill.id}:${dependencyId}`
        issues.set(key, { type: 'dependency', skillId: skill.id, relatedSkillId: dependencyId })
      }
    }
    for (const conflictId of skill.conflicts ?? []) {
      if (enabledById.get(conflictId) === false) continue
      const key = `conflict:${skill.id}:${conflictId}`
      issues.set(key, { type: 'conflict', skillId: skill.id, relatedSkillId: conflictId })
    }
    for (const candidate of skills) {
      if (candidate.id === skill.id || enabledById.get(candidate.id) === false || !(candidate.conflicts ?? []).includes(skill.id)) continue
      const key = `conflict:${skill.id}:${candidate.id}`
      issues.set(key, { type: 'conflict', skillId: skill.id, relatedSkillId: candidate.id })
    }
  }

  return Array.from(issues.values())
}

function parseSkillBundleInput(text: string): Parameters<typeof localAgentClient.installAgentSkillBundle>[0] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('skill bundle JSON is invalid')
  }
  if (!isRecord(parsed)) throw new Error('skill bundle must be a JSON object')
  const pluginId = typeof parsed.pluginId === 'string' && parsed.pluginId.trim() ? parsed.pluginId.trim() : ''
  if (!pluginId) throw new Error('skill bundle pluginId is required')
  if (!isSafeSkillBundlePluginId(pluginId)) throw new Error('skill bundle pluginId may only contain letters, numbers, dot, underscore, or hyphen')
  if (!Array.isArray(parsed.files) || parsed.files.length === 0) throw new Error('skill bundle files are required')
  if (parsed.files.length > MAX_SKILL_BUNDLE_FILES) throw new Error(`skill bundle may include at most ${MAX_SKILL_BUNDLE_FILES} files`)
  let totalBytes = 0
  const seenPaths = new Set<string>()
  const files = parsed.files.map((file, index) => {
    if (!isRecord(file)) throw new Error(`skill bundle file ${index + 1} must be an object`)
    const path = typeof file.path === 'string' ? file.path.trim() : ''
    if (!path) throw new Error(`skill bundle file ${index + 1} path is required`)
    if (!isSafeSkillBundleFilePath(path)) throw new Error(`skill bundle file ${index + 1} path must be a safe relative path`)
    if (seenPaths.has(path)) throw new Error(`skill bundle file ${index + 1} path is duplicated`)
    seenPaths.add(path)
    if (typeof file.content !== 'string') throw new Error(`skill bundle file ${index + 1} content must be a string`)
    const fileBytes = byteLength(file.content)
    if (fileBytes > MAX_SKILL_BUNDLE_FILE_BYTES) throw new Error(`skill bundle file ${index + 1} is too large`)
    totalBytes += fileBytes
    if (totalBytes > MAX_SKILL_BUNDLE_TOTAL_BYTES) throw new Error('skill bundle total content is too large')
    return { path, content: file.content }
  })
  return { pluginId, files }
}

function byteLength(value: string): number {
  return new Blob([value]).size
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isSafeSkillBundlePluginId(pluginId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(pluginId)
}

function isSafeSkillBundleFilePath(path: string): boolean {
  if (path.includes('\0') || path.includes('\\')) return false
  if (path.startsWith('/') || path.startsWith('~') || /^[a-zA-Z]:\//.test(path)) return false
  const parts = path.split('/')
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function skillPolicySignature(drafts: SkillPolicyDraft[]): string {
  return JSON.stringify([...drafts].sort((a, b) => a.id.localeCompare(b.id)))
}

function buildToolStats(tools?: AgentCapabilitiesResponse['resolvedTools']) {
  const discovered = tools?.discovered ?? []
  const writeRisks = new Set<AgentDebugTool['risk']>(['write', 'generate', 'destructive', 'ui'])
  return {
    discovered: discovered.length,
    available: tools?.available.length ?? 0,
    blocked: tools?.blocked.length ?? 0,
    requiresApproval: discovered.filter((tool) => tool.requiresApproval).length,
    writeRisk: discovered.filter((tool) => writeRisks.has(tool.risk)).length,
    availableWriteRisk: (tools?.available ?? []).filter((tool) => writeRisks.has(tool.risk)).length,
    projectScoped: discovered.filter((tool) => tool.projectScoped).length,
  }
}

function buildToolGrantDrafts(profile: AgentCatalogProfile | null, manifest?: AgentInspectResponse['defaultAgentManifest']): ToolGrantDraft[] {
  const grants = profile?.toolGrants ?? []
  const manifestByName = new Map((manifest?.tools ?? []).map((grant) => [grant.name, grant]))
  return grants.map((grant) => {
    const manifestGrant = manifestByName.get(grant.name)
    return {
      name: grant.name,
      mode: manifestGrant?.mode ?? grant.mode,
      ...(manifestGrant?.approval ?? grant.approval ? { approval: manifestGrant?.approval ?? grant.approval } : {}),
    }
  })
}

function buildToolPolicyDraftIssues(input: {
  drafts: ToolGrantDraft[]
  currentProfile: AgentCatalogProfile | null
  tools?: AgentCapabilitiesResponse['resolvedTools']
}): ToolPolicyDraftIssue[] {
  const profileGranted = new Set((input.currentProfile?.toolGrants ?? []).map((grant) => grant.name))
  const discoveredByName = new Map((input.tools?.discovered ?? []).map((tool) => [tool.name, tool]))
  return input.drafts.flatMap((draft) => {
    if (!profileGranted.has(draft.name)) {
      return [{
        toolName: draft.name,
        reasonKey: 'agents.settings.toolPolicyDraftIssueDetails.notProfileGranted',
      }]
    }
    const discovered = discoveredByName.get(draft.name)
    if (discovered && !discovered.available && draft.mode === 'allow') {
      return [{
        toolName: draft.name,
        reasonKey: 'agents.settings.toolPolicyDraftIssueDetails.unavailableAllow',
        values: { reason: discovered.unavailableReason?.trim() || 'blocked' },
      }]
    }
    return []
  })
}

function targetSnapshotProfile(
  snapshot: AgentSettingsSnapshot,
  catalog: AgentInspectResponse | undefined,
  fallbackProfile: AgentCatalogProfile | null,
): AgentCatalogProfile | null {
  if (!snapshot.defaultProfileId) return fallbackProfile
  return catalog?.profiles.find((profile) => profile.id === snapshot.defaultProfileId) ?? fallbackProfile
}

function selectSettingsSnapshotForImport(
  snapshot: AgentSettingsSnapshot,
  selectedScopes: SettingsSnapshotImportScope[],
): AgentSettingsSnapshot {
  const selected = new Set(selectedScopes)
  return {
    schema: snapshot.schema,
    schemaVersion: snapshot.schemaVersion,
    schemaUrl: snapshot.schemaUrl,
    exportedAt: snapshot.exportedAt,
    ...(selected.has('model') && snapshot.modelConfig ? { modelConfig: { ...snapshot.modelConfig } } : {}),
    ...(selected.has('profile') && snapshot.defaultProfileId ? { defaultProfileId: snapshot.defaultProfileId } : {}),
    ...(selected.has('skills') && snapshot.skillPolicy ? { skillPolicy: snapshot.skillPolicy.map((skill) => ({ ...skill })) } : {}),
    ...(selected.has('tools') && snapshot.toolPolicy ? { toolPolicy: snapshot.toolPolicy.map((grant) => ({ ...grant })) } : {}),
    ...(selected.has('run-presets') && snapshot.activeRunPresetId ? { activeRunPresetId: snapshot.activeRunPresetId } : {}),
    ...(selected.has('run-presets') && snapshot.runPresets ? { runPresets: snapshot.runPresets.map((preset) => ({ ...preset })) } : {}),
  }
}

function hasSelectedSettingsSnapshotImportScope(
  snapshot: AgentSettingsSnapshot,
  selectedScopes: SettingsSnapshotImportScope[],
): boolean {
  return SETTINGS_SNAPSHOT_IMPORT_SCOPES.some((scope) => (
    selectedScopes.includes(scope) && settingsSnapshotImportScopeAvailable(snapshot, scope)
  ))
}

function settingsSnapshotImportScopeAvailable(snapshot: AgentSettingsSnapshot, scope: SettingsSnapshotImportScope): boolean {
  if (scope === 'model') return Boolean(snapshot.modelConfig)
  if (scope === 'profile') return Boolean(snapshot.defaultProfileId)
  if (scope === 'skills') return Boolean(snapshot.skillPolicy)
  if (scope === 'tools') return Boolean(snapshot.toolPolicy)
  return Boolean(snapshot.runPresets || snapshot.activeRunPresetId)
}

function buildProfileDiff(current: AgentCatalogProfile, next: AgentCatalogProfile): ProfileDiff {
  return {
    packs: diffStringLists(current.enabledPacks, next.enabledPacks),
    workflows: diffStringLists(current.enabledWorkflows, next.enabledWorkflows),
    policies: diffStringLists(current.enabledPolicies, next.enabledPolicies),
    tools: diffToolGrants(current.toolGrants, next.toolGrants),
  }
}

function diffStringLists(current: string[], next: string[]): ProfileDiffSection {
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  return {
    added: next.filter((item) => !currentSet.has(item)),
    removed: current.filter((item) => !nextSet.has(item)),
  }
}

function diffToolGrants(current: AgentCatalogProfile['toolGrants'], next: AgentCatalogProfile['toolGrants']): ProfileDiffSection {
  const currentByName = new Map(current.map((grant) => [grant.name, grant]))
  const nextByName = new Map(next.map((grant) => [grant.name, grant]))
  return {
    added: next.filter((grant) => !currentByName.has(grant.name)).map((grant) => grant.name),
    removed: current.filter((grant) => !nextByName.has(grant.name)).map((grant) => grant.name),
    changed: next
      .filter((grant) => {
        const previous = currentByName.get(grant.name)
        return previous && (previous.mode !== grant.mode || (previous.approval ?? 'never') !== (grant.approval ?? 'never'))
      })
      .map((grant) => grant.name),
  }
}

function toolGrantSignature(grants: ToolGrantDraft[]): string {
  return JSON.stringify([...grants]
    .map((grant) => ({ name: grant.name, mode: grant.mode, approval: grant.approval ?? 'never' }))
    .sort((a, b) => a.name.localeCompare(b.name)))
}

function buildToolPolicyDiffItems(before: ToolGrantDraft[], after: ToolGrantDraft[]): ToolPolicyDiffItem[] {
  const beforeByName = new Map(before.map((grant) => [grant.name, grant]))
  const afterByName = new Map(after.map((grant) => [grant.name, grant]))
  const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort((a, b) => a.localeCompare(b))
  return names.flatMap((name): ToolPolicyDiffItem[] => {
    const previous = beforeByName.get(name)
    const next = afterByName.get(name)
    if (!previous && next) {
      return [{
        name,
        change: 'added' as const,
        afterMode: next.mode,
        afterApproval: next.approval,
      }]
    }
    if (previous && !next) {
      return [{
        name,
        change: 'removed' as const,
        beforeMode: previous.mode,
        beforeApproval: previous.approval,
      }]
    }
    if (previous && next && (previous.mode !== next.mode || (previous.approval ?? 'never') !== (next.approval ?? 'never'))) {
      return [{
        name,
        change: 'changed' as const,
        beforeMode: previous.mode,
        afterMode: next.mode,
        beforeApproval: previous.approval,
        afterApproval: next.approval,
      }]
    }
    return []
  })
}

function toolPolicyRank(tool: AgentDebugTool): number {
  if (!tool.available) return 0
  if (tool.requiresApproval) return 1
  if (tool.risk === 'destructive') return 2
  if (tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'ui') return 3
  return 4
}

function toolPolicyFilterMatches(tool: AgentDebugTool, filter: ToolPolicyFilter, currentToolGrants: Set<string>): boolean {
  if (filter === 'available') return tool.available
  if (filter === 'blocked') return !tool.available
  if (filter === 'profile_granted') return currentToolGrants.has(tool.name)
  if (filter === 'requires_approval') return Boolean(tool.requiresApproval)
  if (filter === 'write_risk') return tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'ui' || tool.risk === 'destructive'
  return true
}

function runtimeModelValue(models: PublicModel[], config: RuntimeModelConfigPublic): string {
  const byPublicID = models.find((model) => publicModelId(model) === config.model)
  if (byPublicID) return publicModelId(byPublicID)
  const byLegacyID = config.modelConfigId ? models.find((model) => model.id === config.modelConfigId) : undefined
  return byLegacyID ? publicModelId(byLegacyID) : config.model
}

function modelDisplayName(models: PublicModel[], config: RuntimeModelConfigPublic) {
  const value = runtimeModelValue(models, config)
  const model = models.find((item) => publicModelId(item) === value)
  return model ? publicModelLabel(model, true) : config.model
}

function runtimeConfigUsesModelCatalog(config: RuntimeModelConfigPublic): boolean {
  const baseURL = config.baseURL?.trim() ?? ''
  return !baseURL || isBackendCompatibleBaseURL(baseURL)
}

function apiKindBaseURLPlaceholder(apiKind: RuntimeModelAPIKind): string {
  if (apiKind === 'openai_chat_completions') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'openai_responses') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'anthropic_messages') return `${getAPIBaseURL()}/v1`
  return `${getAPIBaseURL()}/v1`
}

function apiKindModelPlaceholder(apiKind: RuntimeModelAPIKind): string {
  if (apiKind === 'anthropic_messages') return 'claude-sonnet-4-5'
  if (apiKind === 'openai_chat_completions') return 'gpt-4.1'
  if (apiKind === 'openai_responses') return 'gpt-5.1'
  return 'model_config:1'
}

function isValidHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isBackendCompatibleBaseURL(value: string): boolean {
  if (!value.trim()) return true
  try {
    return new URL(toCompatibleGatewayBaseURL(value)).origin === new URL(toCompatibleGatewayBaseURL(getAPIBaseURL())).origin
  } catch {
    return false
  }
}

function toCompatibleGatewayBaseURL(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}

function apiModeReadinessDetailKey(apiKind: RuntimeModelAPIKind): string {
  if (apiKind === 'openai_responses') return 'agents.settings.readinessDetails.apiModeResponsesRecommended'
  if (apiKind === 'openai_chat_completions') return 'agents.settings.readinessDetails.apiModeChatCompatibility'
  if (apiKind === 'anthropic_messages') return 'agents.settings.readinessDetails.apiModeAnthropicProvider'
  return 'agents.settings.readinessDetails.apiModeBackendManaged'
}

function settingsErrorMessage(error: unknown): string {
  return redactAgentTraceDebugText(error instanceof Error ? error.message : String(error))
}

function formatDurationMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)}m`
}

function runPresetAuditSummaryValues(preset: AgentRunPreset) {
  return {
    preset: preset.name,
    maxToolCalls: preset.maxToolCalls,
    maxIterations: preset.maxIterations,
    permissionMode: preset.permissionMode,
    workers: preset.planMaxWorkers,
    attempts: preset.planMaxTaskAttempts,
    timeout: formatDurationMinutes(preset.planWorkerTimeoutMs),
  }
}

function runPresetSettingsPatch(preset: AgentRunPreset) {
  return {
    activeRunPresetId: preset.id,
    permissionMode: preset.permissionMode,
    autoTaskGraph: preset.autoTaskGraph,
    planMaxWorkers: preset.planMaxWorkers,
    planMaxTaskAttempts: preset.planMaxTaskAttempts,
    planWorkerTimeoutMs: preset.planWorkerTimeoutMs,
  }
}

function settingsQuickFixAuditAction(kind: SettingsQuickFixAuditKind): string {
  if (kind === 'draft_reset') return 'settings_quick_fix_draft_reset'
  if (kind === 'draft_repair') return 'settings_quick_fix_draft_repair'
  if (kind === 'sensitive_cleanup') return 'settings_quick_fix_sensitive_cleanup'
  if (kind === 'risk_downgrade') return 'settings_quick_fix_risk_downgrade'
  if (kind === 'mode_migration') return 'settings_quick_fix_mode_migration'
  if (kind === 'route_enable') return 'settings_quick_fix_route_enable'
  return 'settings_quick_fix_clear_confirmation'
}

function uniqueRunPresetId(name: string, existingIds: string[]): string {
  const existing = new Set(existingIds)
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-preset'
  let id = base
  let suffix = 2
  while (existing.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

function uniqueToolPolicyFilterPresetId(name: string, existingIds: string[]): string {
  const existing = new Set(existingIds)
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tool-filter'
  let id = base
  let suffix = 2
  while (existing.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

function toolPolicyFilterPresetName(filter: ToolPolicyFilter, search: string, t: ReturnType<typeof useTranslation>['t']): string {
  const filterLabel = t(`agents.settings.toolPolicyFilters.${filter}`)
  return search ? `${filterLabel}: ${search}` : filterLabel
}

function normalizeRunPresetDraft(preset: AgentRunPreset): AgentRunPreset {
  const permissionMode: AgentRunPreset['permissionMode'] =
    preset.permissionMode === 'suggest' || preset.permissionMode === 'auto' ? preset.permissionMode : 'ask'
  return {
    ...preset,
    permissionMode,
    autoTaskGraph: preset.autoTaskGraph !== false,
    maxToolCalls: clampInteger(preset.maxToolCalls, 1, 200),
    maxIterations: clampInteger(preset.maxIterations, 1, 200),
    planMaxWorkers: normalizeOption(preset.planMaxWorkers, RUN_PRESET_TASK_GRAPH_WORKER_OPTIONS, 2),
    planMaxTaskAttempts: normalizeOption(preset.planMaxTaskAttempts, RUN_PRESET_TASK_GRAPH_ATTEMPT_OPTIONS, 2),
    planWorkerTimeoutMs: normalizeOption(preset.planWorkerTimeoutMs, RUN_PRESET_TASK_GRAPH_TIMEOUT_OPTIONS, 15 * 60_000),
  }
}

function clampInteger(value: unknown, min: number, max: number): number {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function normalizeOption<T extends number>(value: unknown, options: readonly T[], fallback: T): T {
  const number = Number(value)
  return options.includes(number as T) ? number as T : fallback
}

function SettingsSnapshotImportScopeSelector({
  snapshot,
  selectedScopes,
  onScopeChange,
  onPresetChange,
}: {
  snapshot: AgentSettingsSnapshot
  selectedScopes: SettingsSnapshotImportScope[]
  onScopeChange: (scope: SettingsSnapshotImportScope, enabled: boolean) => void
  onPresetChange: (presetId: SettingsSnapshotImportPresetId) => void
}) {
  const { t } = useTranslation()
  return (
    <AgentSettingsSnapshotImportScopePanel
      title={t('agents.settings.settingsSnapshotImportScopes')}
      description={t('agents.settings.settingsSnapshotImportScopesHelp')}
      presetsLabel={t('agents.settings.settingsSnapshotImportPresets')}
      presetsHelp={t('agents.settings.settingsSnapshotImportPresetsHelp')}
      presets={SETTINGS_SNAPSHOT_IMPORT_PRESETS.map((preset) => ({
        id: preset.id,
        label: t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`),
        enabled: preset.scopes.some((scope) => settingsSnapshotImportScopeAvailable(snapshot, scope)),
        onSelect: () => onPresetChange(preset.id),
      }))}
      scopes={SETTINGS_SNAPSHOT_IMPORT_SCOPES.map((scope) => {
        const available = settingsSnapshotImportScopeAvailable(snapshot, scope)
        return {
          id: scope,
          scope,
          label: t(SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS[scope]),
          detail: t(`agents.settings.settingsSnapshotImportScopeDetails.${scope}`),
          checked: available && selectedScopes.includes(scope),
          available,
          onChange: (nextChecked) => onScopeChange(scope, nextChecked),
        }
      })}
    />
  )
}

function SettingsSnapshotSummary({ snapshot }: { snapshot: AgentSettingsSnapshot }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsSnapshotSummaryPanel
      title={t('agents.settings.settingsSnapshotSummary')}
      items={[
        { id: 'exportedAt', label: t('agents.settings.settingsSnapshotFields.exportedAt'), value: new Date(snapshot.exportedAt).toLocaleString() },
        { id: 'model', label: t('agents.settings.settingsSnapshotFields.model'), value: snapshot.modelConfig?.model ? redactAgentTraceDebugText(snapshot.modelConfig.model) : '-' },
        { id: 'profile', label: t('agents.settings.settingsSnapshotFields.profile'), value: snapshot.defaultProfileId ?? '-' },
        { id: 'skills', label: t('agents.settings.settingsSnapshotFields.skills'), value: snapshot.skillPolicy?.length ?? 0 },
        { id: 'tools', label: t('agents.settings.settingsSnapshotFields.tools'), value: snapshot.toolPolicy?.length ?? 0 },
        { id: 'runPresets', label: t('agents.settings.settingsSnapshotFields.runPresets'), value: snapshot.runPresets?.length ?? 0 },
        { id: 'activeRunPreset', label: t('agents.settings.settingsSnapshotFields.activeRunPreset'), value: snapshot.activeRunPresetId ?? '-' },
      ]}
    />
  )
}

function SettingsAuditTrailPanel({ entries, onClear }: { entries: AgentSettingsAuditEntry[]; onClear: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copyAuditSummary() {
    const lines = [
      t('agents.settings.settingsAuditSummaryTitle'),
      ...entries.slice(0, 25).map((entry, index) => (
        `${index + 1}. [${t(`agents.settings.auditTargets.${entry.target}`)} / ${formatSettingsAuditAction(t, entry.action)}] ${redactAgentTraceDebugText(entry.summary)} (${new Date(entry.createdAt).toLocaleString()})`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsAuditTrailPanel
      entries={entries.map((entry) => ({
        id: entry.id,
        summary: redactAgentTraceDebugText(entry.summary),
        createdAtLabel: new Date(entry.createdAt).toLocaleString(),
        targetLabel: t(`agents.settings.auditTargets.${entry.target}`),
        actionLabel: formatSettingsAuditAction(t, entry.action),
        failed: entry.action.endsWith('_failed'),
      }))}
      emptyLabel={t('agents.settings.settingsAuditEmpty')}
      help={t('agents.settings.settingsAuditHelp')}
      copyLabel={t('agents.settings.copySettingsAudit')}
      copiedLabel={t('agents.settings.settingsAuditCopied')}
      copied={copied}
      clearLabel={t('agents.settings.clearSettingsAudit')}
      copyIcon={<Clipboard size={14} />}
      clearIcon={<Trash2 size={14} />}
      onCopy={() => void copyAuditSummary()}
      onClear={onClear}
    />
  )
}

function formatSettingsAuditAction(t: ReturnType<typeof useTranslation>['t'], action: string): string {
  return t(`agents.settings.auditActions.${action}`, { defaultValue: action })
}

function SettingsSnapshotImpactPreview({ snapshot }: { snapshot: AgentSettingsSnapshot }) {
  const { t } = useTranslation()
  const items = buildSettingsSnapshotImpactItems(snapshot)
  const [copied, setCopied] = useState(false)
  async function copySnapshotImpactSummary() {
    const lines = [
      t('agents.settings.settingsSnapshotImpactSummaryTitle'),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.settingsSnapshotImpactScopes.${item.scope}`)}] ${t(item.labelKey)}\n   ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsSnapshotImpactPanel
      title={t('agents.settings.settingsSnapshotImpactPreview')}
      copyLabel={t('agents.settings.copySettingsSnapshotImpact')}
      copiedLabel={t('agents.settings.settingsSnapshotImpactCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copySnapshotImpactSummary()}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        scopeLabel: t(`agents.settings.settingsSnapshotImpactScopes.${item.scope}`),
        statusProps: agentSettingsRecipe(item.scope === 'runtime' ? 'warning' : 'neutral'),
      }))}
    />
  )
}

function buildSettingsSnapshotImpactItems(snapshot: AgentSettingsSnapshot): SettingsSnapshotImpactItem[] {
  return [
    snapshot.modelConfig
      ? {
        id: 'model',
        scope: 'runtime',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.model',
        detailValues: { model: redactAgentTraceDebugText(snapshot.modelConfig.model) },
      }
      : {
        id: 'model',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.modelSkipped',
      },
    snapshot.defaultProfileId
      ? {
        id: 'profile',
        scope: 'runtime',
        labelKey: 'agents.settings.settingsSnapshotImpact.profile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.profile',
        detailValues: { profileId: snapshot.defaultProfileId },
      }
      : {
        id: 'profile',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.profile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.profileSkipped',
      },
    snapshot.skillPolicy
      ? {
        id: 'skills',
        scope: 'runtime',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skills',
        detailValues: { count: snapshot.skillPolicy.length },
      }
      : {
        id: 'skills',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skillsSkipped',
      },
    snapshot.toolPolicy
      ? {
        id: 'tools',
        scope: 'runtime',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.tools',
        detailValues: { count: snapshot.toolPolicy.length },
      }
      : {
        id: 'tools',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.toolsSkipped',
      },
    snapshot.runPresets || snapshot.activeRunPresetId
      ? {
        id: 'run-presets',
        scope: 'local',
        labelKey: 'agents.settings.settingsSnapshotImpact.runPresets',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.runPresets',
        detailValues: {
          count: snapshot.runPresets?.length ?? 0,
          activeRunPresetId: snapshot.activeRunPresetId ?? '-',
        },
      }
      : {
        id: 'run-presets',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.runPresets',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.runPresetsSkipped',
      },
  ]
}

function RunPresetRow({ preset, active, onSelect }: { preset: AgentRunPreset; active: boolean; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsRunPresetRow
      name={preset.name}
      description={preset.description}
      active={active}
      activeIcon={<CheckCircle2 size={14} />}
      onSelect={() => onSelect(preset.id)}
      metaItems={[
        { id: 'maxToolCalls', label: `${t('agents.settings.runPresetFields.maxToolCalls')}: ${preset.maxToolCalls}` },
        { id: 'maxIterations', label: `${t('agents.settings.runPresetFields.maxIterations')}: ${preset.maxIterations}` },
        { id: 'permissionMode', label: t(`agents.settings.runPresetPermissionModes.${preset.permissionMode}`) },
        { id: 'planWorkers', label: `${preset.planMaxWorkers}x / ${preset.planMaxTaskAttempts}r` },
      ]}
    />
  )
}

function SettingsReadinessPanel({ items }: { items: SettingsReadinessItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copyReadinessSummary() {
    const lines = [
      t('agents.settings.readinessSummaryTitle'),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.readinessStatuses.${item.status}`)}] ${t(item.labelKey)}\n   ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsReadinessPanel
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      copyLabel={t('agents.settings.copyReadiness')}
      copiedLabel={t('agents.settings.readinessCopied')}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        statusProps: agentSettingsStatusRecipe(item.status),
        statusLabel: t(`agents.settings.readinessStatuses.${item.status}`),
      }))}
      onCopy={() => void copyReadinessSummary()}
    />
  )
}

function SettingsActionItemsPanel({
  items,
  feedback,
  onJump,
  onQuickFix,
}: {
  items: SettingsActionItem[]
  feedback?: string | null
  onJump: (sectionId: string) => void
  onQuickFix: (quickFix: SettingsActionQuickFix) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const actionCount = items.filter((item) => item.status === 'action').length
  const warningCount = items.filter((item) => item.status === 'warning').length
  async function copyActionItemsSummary() {
    const lines = [
      t('agents.settings.actionItemsSummaryTitle'),
      ...(items.length === 0
        ? [t('agents.settings.actionItemsEmpty')]
        : items.map((item, index) => {
          const sectionLabelKey = settingsSectionLabelKey(item.targetSection)
          const parts = [
            `${index + 1}. [${t(`agents.settings.actionStatuses.${item.status}`)}] ${t(item.labelKey)}`,
            `   ${t('agents.settings.actionItemsSummarySection', { section: t(sectionLabelKey) })}`,
            `   ${t(item.detailKey, item.detailValues)}`,
          ]
          if (item.reasons?.length) {
            parts.push(...item.reasons.map((reason) => `   - ${t(reason.labelKey, reason.values)}`))
          }
          if (item.quickFixLabelKey) {
            parts.push(`   ${t('agents.settings.actionItemsSummaryQuickFix', { quickFix: t(item.quickFixLabelKey) })}`)
          }
          if (item.persistHintKey) parts.push(`   ${t(item.persistHintKey)}`)
          return parts.join('\n')
        })),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsActionItemsPanel
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      copyLabel={t('agents.settings.copyActionItems')}
      copiedLabel={t('agents.settings.actionItemsCopied')}
      countLabel={t('agents.settings.actionItemsCountSummary', { actions: actionCount, warnings: warningCount })}
      emptyLabel={t('agents.settings.actionItemsEmpty')}
      feedback={feedback}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        statusProps: agentSettingsStatusRecipe(item.status),
        statusLabel: t(`agents.settings.actionStatuses.${item.status}`),
        reasons: item.reasons?.map((reason) => t(reason.labelKey, reason.values)),
        persistHint: item.persistHintKey ? t(item.persistHintKey) : undefined,
        jumpLabel: t('agents.settings.quickFixes.jumpToSection'),
        onJump: () => onJump(item.targetSection),
        quickFixLabel: item.quickFix && item.quickFixLabelKey ? t(item.quickFixLabelKey) : undefined,
        onQuickFix: item.quickFix ? () => onQuickFix(item.quickFix!) : undefined,
      }))}
      onCopy={() => void copyActionItemsSummary()}
    />
  )
}

function settingsSectionLabelKey(sectionId: SettingsActionItem['targetSection']): string {
  return SETTINGS_NAV_SECTIONS.find((section) => section.id === sectionId)?.labelKey ?? 'agents.settings.title'
}

function ConfigurationMapPanel({ onJump }: { onJump: (sectionId: string) => void }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsNavigationList>
      {SETTINGS_NAV_SECTIONS.map((section) => (
        <AgentSettingsNavigationButton
          key={section.id}
          title={t(section.labelKey)}
          description={t(section.descriptionKey)}
          onClick={() => onJump(section.id)}
        />
      ))}
    </AgentSettingsNavigationList>
  )
}

function SkillRow({
  skill,
  draft,
  onDraftChange,
}: {
  skill: AgentCatalogSkill
  draft?: SkillPolicyDraft
  onDraftChange: (id: string, enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const dependencyCount = skill.dependencies?.length ?? 0
  const conflictCount = skill.conflicts?.length ?? 0
  const isCore = skill.loadMode === 'core'
  return (
    <AgentSettingsSkillCard
      name={skill.name}
      idLabel={skill.id}
      description={skill.description}
      enabled={skill.enabled !== false}
      enabledLabel={t('agents.settings.skillStatus.enabled')}
      disabledLabel={t('agents.settings.skillStatus.disabled')}
      kindLabel={skillKindLabel(skill.kind, t)}
      loadModeLabel={skillLoadModeLabel(skill.loadMode, t)}
      versionLabel={skill.version ? `v${skill.version}` : undefined}
      sourceLabel={skillSourceLabel(skill, t)}
      trustLabel={skillTrustLabel(skill, t)}
      trustProps={agentSettingsRecipe(skillTrustLevel(skill) === 'review' ? 'warning' : skillTrustLevel(skill) === 'trusted' ? 'success' : 'neutral')}
      priorityLabel={typeof skill.priority === 'number' ? `p${skill.priority}` : undefined}
      draftEnabled={draft?.enabled}
      draftDisabled={isCore}
      draftLocked={isCore}
      draftTitle={draft ? (draft.enabled ? t('agents.settings.skillStatus.enabled') : t('agents.settings.skillStatus.disabled')) : undefined}
      draftHelp={draft ? (isCore ? t('agents.settings.skillPolicyCoreLocked') : t('agents.settings.skillPolicyToggleHelp')) : undefined}
      onDraftChange={draft ? (checked) => onDraftChange(skill.id, checked) : undefined}
      metaItems={skillMetaItems(skill, dependencyCount, conflictCount, t)}
    />
  )
}

function skillMetaItems(
  skill: AgentCatalogSkill,
  dependencyCount: number,
  conflictCount: number,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return [
    ...(dependencyCount > 0 ? [{ id: 'dependencies', label: `${t('agents.settings.skillFields.dependencies')}: ${dependencyCount}` }] : []),
    ...(conflictCount > 0 ? [{ id: 'conflicts', label: `${t('agents.settings.skillFields.conflicts')}: ${conflictCount}` }] : []),
    ...(skill.tags?.slice(0, 4).map((tag) => ({ id: `tag:${tag}`, label: tag })) ?? []),
  ]
}

function ProfileRow({ profile, current = false, preview = false }: { profile: AgentCatalogProfile; current?: boolean; preview?: boolean }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsProfileCard
      name={profile.name}
      idLabel={profile.id}
      description={profile.description}
      versionLabel={`v${profile.version}`}
      current={current}
      preview={preview}
      currentLabel={t('agents.settings.profileStatus.current')}
      previewLabel={t('agents.settings.profileStatus.selected')}
      summaryItems={profileSummaryItems(profile, t)}
    />
  )
}

function ProfileDiffPanel({ diff }: { diff: ProfileDiff }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsProfileDiffPanel
      title={t('agents.settings.profileDiffTitle')}
      sections={[
        profileDiffSection('packs', t('agents.settings.profileFields.packs'), diff.packs, t),
        profileDiffSection('workflows', t('agents.settings.profileFields.workflows'), diff.workflows, t),
        profileDiffSection('policies', t('agents.settings.profileFields.policies'), diff.policies, t),
        profileDiffSection('tools', t('agents.settings.profileFields.tools'), diff.tools, t),
      ]}
    />
  )
}

function profileSummaryItems(profile: AgentCatalogProfile, t: ReturnType<typeof useTranslation>['t']) {
  return [
    { id: 'packs', label: t('agents.settings.profileFields.packs'), value: profileSummaryValue(profile.enabledPacks) },
    { id: 'workflows', label: t('agents.settings.profileFields.workflows'), value: profileSummaryValue(profile.enabledWorkflows) },
    { id: 'policies', label: t('agents.settings.profileFields.policies'), value: profileSummaryValue(profile.enabledPolicies) },
    { id: 'tools', label: t('agents.settings.profileFields.tools'), value: profileSummaryValue(profile.toolGrants.map((grant) => `${grant.name}:${grant.mode}`)) },
  ]
}

function profileSummaryValue(values: string[]) {
  return values.length > 0 ? values.slice(0, 3).join(', ') : '-'
}

function profileDiffSection(
  id: string,
  label: string,
  section: ProfileDiffSection,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const lines = [
    ...(section.added.length > 0 ? [`${t('agents.settings.profileDiffAdded')}: ${section.added.slice(0, 4).join(', ')}`] : []),
    ...(section.removed.length > 0 ? [`${t('agents.settings.profileDiffRemoved')}: ${section.removed.slice(0, 4).join(', ')}`] : []),
    ...((section.changed?.length ?? 0) > 0 ? [`${t('agents.settings.profileDiffChanged')}: ${section.changed!.slice(0, 4).join(', ')}`] : []),
  ]
  return {
    id,
    label,
    lines,
    emptyLabel: t('agents.settings.profileDiffNoChange'),
  }
}

function ToolPolicyDiffPreview({ items }: { items: ToolPolicyDiffItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const added = items.filter((item) => item.change === 'added').length
  const removed = items.filter((item) => item.change === 'removed').length
  const changed = items.filter((item) => item.change === 'changed').length
  async function copyToolPolicyDiffSummary() {
    const lines = [
      t('agents.settings.toolPolicyDiffSummaryTitle'),
      t('agents.settings.toolPolicyDiffSummary', { added, removed, changed }),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.toolPolicyDiffChangeTypes.${item.change}`)}] ${item.name}: ${formatToolPolicyDiffValue(t, item.beforeMode, item.beforeApproval)} -> ${formatToolPolicyDiffValue(t, item.afterMode, item.afterApproval)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (items.length === 0) return null
  return (
    <AgentSettingsToolPolicyDiffPanel
      title={t('agents.settings.toolPolicyDiffPreview')}
      summary={t('agents.settings.toolPolicyDiffSummary', { added, removed, changed })}
      copyLabel={t('agents.settings.copyToolPolicyDiff')}
      copiedLabel={t('agents.settings.toolPolicyDiffCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copyToolPolicyDiffSummary()}
      items={items.map((item) => ({
        id: `${item.change}:${item.name}`,
        name: item.name,
        beforeLabel: formatToolPolicyDiffValue(t, item.beforeMode, item.beforeApproval),
        afterLabel: formatToolPolicyDiffValue(t, item.afterMode, item.afterApproval),
        changeLabel: t(`agents.settings.toolPolicyDiffChangeTypes.${item.change}`),
        statusProps: agentSettingsRecipe(item.change === 'removed' ? 'warning' : item.change === 'added' ? 'success' : 'neutral'),
      }))}
    />
  )
}

function formatToolPolicyDiffValue(
  t: ReturnType<typeof useTranslation>['t'],
  mode?: ToolGrantDraft['mode'],
  approval?: ToolGrantDraft['approval'],
): string {
  if (!mode) return t('agents.settings.toolPolicyDiffValues.none')
  const approvalKey = approval ?? 'never'
  return t('agents.settings.toolPolicyDiffValues.policy', {
    mode: t(`agents.settings.toolPolicyModes.${mode}`),
    approval: t(`agents.settings.toolPolicyApprovals.${approvalKey === 'on_write' ? 'onWrite' : approvalKey}`),
  })
}

function ToolPolicyRow({
  tool,
  draft,
  profileGranted,
  onDraftChange,
}: {
  tool: AgentDebugTool
  draft?: ToolGrantDraft
  profileGranted: boolean
  onDraftChange: (name: string, patch: Partial<ToolGrantDraft>) => void
}) {
  const { t } = useTranslation()
  const canAllow = tool.available && profileGranted
  return (
    <AgentSettingsToolPolicyRow
      name={tool.name}
      sourceLabel={tool.source}
      permissionLabel={tool.permission ?? t('agents.settings.toolPolicyValues.none')}
      riskLabel={tool.risk ?? t('agents.settings.toolPolicyValues.unknown')}
      approvalStatusLabel={tool.approval}
      available={tool.available}
      availableLabel={t('agents.settings.toolPolicyStatus.available')}
      blockedLabel={t('agents.settings.toolPolicyStatus.blocked')}
      profileGranted={profileGranted}
      profileGrantedLabel={t('agents.settings.toolPolicyStatus.profileGranted')}
      requiresApproval={tool.requiresApproval}
      description={tool.description}
      draft={draft ? { mode: draft.mode, approval: draft.approval ?? 'never', canAllow } : undefined}
      modeLabel={t('agents.settings.toolPolicyFields.mode')}
      approvalLabel={t('agents.settings.toolPolicyFields.approval')}
      allowLabel={t('agents.settings.toolPolicyModes.allow')}
      denyLabel={t('agents.settings.toolPolicyModes.deny')}
      approvalNeverLabel={t('agents.settings.toolPolicyApprovals.never')}
      approvalOnWriteLabel={t('agents.settings.toolPolicyApprovals.onWrite')}
      approvalAlwaysLabel={t('agents.settings.toolPolicyApprovals.always')}
      allowDisabledHelp={t('agents.settings.toolPolicyAllowDisabled')}
      onModeChange={(mode) => onDraftChange(tool.name, { mode })}
      onApprovalChange={(approval) => onDraftChange(tool.name, { approval })}
      metaItems={toolPolicyMetaItems(tool, t)}
    />
  )
}

function toolPolicyMetaItems(
  tool: AgentDebugTool,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return [
    {
      id: 'registered',
      label: `${t('agents.settings.toolPolicyFields.registered')}: ${tool.registered ? t('agents.settings.toolPolicyValues.yes') : t('agents.settings.toolPolicyValues.no')}`,
    },
    {
      id: 'granted',
      label: `${t('agents.settings.toolPolicyFields.granted')}: ${tool.granted ? t('agents.settings.toolPolicyValues.yes') : t('agents.settings.toolPolicyValues.no')}`,
    },
    ...(tool.projectScoped ? [{ id: 'projectScoped', label: t('agents.settings.toolPolicyFields.projectScoped') }] : []),
    ...(tool.unavailableReason ? [{ id: 'unavailableReason', label: tool.unavailableReason, tone: 'warning' as const }] : []),
  ]
}

function skillKindLabel(kind: AgentCatalogSkill['kind'], t: (key: string) => string): string {
  if (kind === 'persona') return t('agents.settings.skillKinds.persona')
  if (kind === 'workflow') return t('agents.settings.skillKinds.workflow')
  if (kind === 'policy') return t('agents.settings.skillKinds.policy')
  return t('agents.settings.skillKinds.expertise')
}

function skillSourceKind(skill: AgentCatalogSkill): SkillSourceKind {
  if (skill.loadMode === 'core') return 'core'
  const source = typeof skill.metadata?.source === 'string' ? skill.metadata.source : ''
  const pluginId = typeof skill.metadata?.pluginId === 'string' ? skill.metadata.pluginId : ''
  if (source === 'plugin' || pluginId) return 'plugin'
  if (skill.loadMode === 'manual' || source === 'local') return 'local'
  return 'catalog'
}

function skillTrustLevel(skill: AgentCatalogSkill): SkillTrustLevel {
  if (skill.loadMode === 'core') return 'trusted'
  if (skill.loadMode === 'manual' || skillSourceKind(skill) === 'local') return 'review'
  return 'managed'
}

function skillSourceLabel(skill: AgentCatalogSkill, t: (key: string) => string): string {
  return t(`agents.settings.skillSources.${skillSourceKind(skill)}`)
}

function skillTrustLabel(skill: AgentCatalogSkill, t: (key: string) => string): string {
  return t(`agents.settings.skillTrustLevels.${skillTrustLevel(skill)}`)
}

function skillLoadModeLabel(loadMode: AgentCatalogSkill['loadMode'], t: (key: string) => string): string {
  if (loadMode === 'core') return t('agents.settings.skillLoadModes.core')
  if (loadMode === 'manual') return t('agents.settings.skillLoadModes.manual')
  return t('agents.settings.skillLoadModes.onDemand')
}

function ApiModeCapabilityMatrix({ apiKind, t }: { apiKind: RuntimeModelAPIKind; t: (key: string) => string }) {
  const mode = API_MODE_CAPABILITY_MATRIX[apiKind] ?? API_MODE_CAPABILITY_MATRIX.openai_chat_completions
  return (
    <AgentSettingsApiModeCapabilityMatrix
      title={t('agents.settings.apiModeCapabilityPanel')}
      description={t('agents.settings.apiModeCapabilityHelp')}
      badgeLabel={t(`agents.settings.apiModeCapabilityBadges.${mode.badge}`)}
      badgeProps={agentSettingsApiModeBadgeRecipe(mode.badge)}
      items={mode.itemKeys.map((itemKey) => ({
        id: itemKey,
        label: t(`agents.settings.apiModeCapabilityItems.${itemKey}.label`),
        detail: t(`agents.settings.apiModeCapabilityItems.${itemKey}.detail`),
      }))}
    />
  )
}

function ModelCompatibilityProbePanel({ probes }: { probes: ModelCompatibilityProbe[] }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsStatusPanel
      testId="agent-settings-model-compatibility-probes"
      itemTestId="agent-settings-model-compatibility-probe"
      title={t('agents.settings.modelCompatibilityPanel')}
      description={t('agents.settings.modelCompatibilityHelp')}
      items={probes.map((probe) => ({
        id: probe.id,
        label: t(probe.labelKey),
        detail: t(probe.detailKey, probe.detailValues),
        statusProps: agentSettingsStatusRecipe(probe.status),
        statusLabel: t(`agents.settings.modelCompatibilityStatuses.${probe.status}`),
      }))}
    />
  )
}

function ApiModeMigrationGuide({
  apiKind,
  onSwitchToResponses,
}: {
  apiKind: RuntimeModelAPIKind
  onSwitchToResponses: () => void
}) {
  const { t } = useTranslation()
  const stepKeys = API_MODE_MIGRATION_STEPS[apiKind] ?? API_MODE_MIGRATION_STEPS.openai_chat_completions
  return (
    <AgentSettingsMigrationGuide
      apiKind={apiKind}
      title={t('agents.settings.apiModeMigrationGuide')}
      description={t(`agents.settings.apiModeMigration.${apiKind}.detail`)}
      switchLabel={apiKind === 'openai_chat_completions' ? t('agents.settings.switchToResponses') : undefined}
      onSwitch={apiKind === 'openai_chat_completions' ? onSwitchToResponses : undefined}
      steps={stepKeys.map((stepKey, index) => ({
        id: stepKey,
        eyebrow: t('agents.settings.apiModeMigrationStep', { index: index + 1 }),
        label: t(`agents.settings.apiModeMigrationSteps.${stepKey}`),
      }))}
    />
  )
}

function ApiModeSwitchPlanPanel({ apiKind, items }: { apiKind: RuntimeModelAPIKind; items: ApiModeSwitchPlanItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const actionCount = items.filter((item) => item.status === 'action').length
  const warningCount = items.filter((item) => item.status === 'warning').length
  async function copySwitchTaskGraph() {
    const lines = [
      t('agents.settings.apiModeSwitchPlanTitle'),
      t('agents.settings.apiModeSwitchPlanCopyContext', { apiKind }),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.modelCompatibilityStatuses.${item.status}`)}] ${t(item.labelKey)} - ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsSwitchPlanPanel
      title={t('agents.settings.apiModeSwitchPlanTitle')}
      description={t('agents.settings.apiModeSwitchPlanHelp', { actions: actionCount, warnings: warningCount })}
      copyLabel={t('agents.settings.copyApiModeSwitchTaskGraph')}
      copiedLabel={t('agents.settings.apiModeSwitchPlanCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copySwitchTaskGraph()}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        statusProps: agentSettingsStatusRecipe(item.status),
        statusLabel: t(`agents.settings.modelCompatibilityStatuses.${item.status}`),
      }))}
    />
  )
}

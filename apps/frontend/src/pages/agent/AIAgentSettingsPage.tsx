import { useRef, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bot, CheckCircle2, Clipboard, Copy, Download, Loader2, Plus, RefreshCw, Save, Settings, Terminal, TestTube2, Trash2, Upload, XCircle } from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movscript/ui'
import { api } from '@/lib/api'
import { getAPIBaseURL } from '@/lib/config'
import { buildSettingsSnapshot, parseSettingsSnapshot, resolveSnapshotRunPresetImport, validateSettingsSnapshotReferences, type AgentSettingsSnapshot, type RuntimeModelAPIKind, type SkillPolicyDraft, type ToolGrantDraft } from '@/lib/agentSettingsSnapshot'
import { hasSensitiveTextSecret, hasSensitiveURLSecret, redactAgentTraceDebugText, stripSensitiveURLSecrets } from '@/lib/agentTraceDebugData'
import { localAgentClient, type AgentCapabilitiesResponse, type AgentCatalogProfile, type AgentCatalogSkill, type AgentDebugTool, type AgentInspectResponse, type AgentSkillBundleInstallResult, type AgentSkillBundleUninstallResult, type RuntimeModelConfigPublic, type RuntimeModelTestResult } from '@/lib/localAgentClient'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'
import { activeRunPresetFromSettings, defaultAgentRunPresets, useAgentStore, type AgentRunPreset, type AgentSettingsAuditEntry, type AgentToolPolicyFilterPreset } from '@/store/agentStore'
import type { PublicModel } from '@/types'

const NO_MODEL_VALUE = '__none'
const DEFAULT_API_KIND: RuntimeModelAPIKind = 'openai_chat_completions'
const MAX_SKILL_BUNDLE_FILES = 50
const MAX_SKILL_BUNDLE_FILE_BYTES = 256 * 1024
const MAX_SKILL_BUNDLE_TOTAL_BYTES = 1024 * 1024
const MAX_SETTINGS_SNAPSHOT_BYTES = 1024 * 1024
const RUN_PRESET_PLAN_WORKER_OPTIONS = [1, 2, 3, 4] as const
const RUN_PRESET_PLAN_ATTEMPT_OPTIONS = [1, 2, 3] as const
const RUN_PRESET_PLAN_TIMEOUT_OPTIONS = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000] as const
const DEFAULT_RUN_PRESET_IDS = new Set(defaultAgentRunPresets().map((preset) => preset.id))
const TOOL_POLICY_FILTER_OPTIONS = ['all', 'available', 'blocked', 'profile_granted', 'requires_approval', 'write_risk'] as const
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
  const selectedModel = useMemo(() => {
    return textModels.find((model) => publicModelId(model) === selectedModelId) ?? null
  }, [selectedModelId, textModels])
  const usesModelCatalog = selectedApiKind === 'openai_chat_completions'
  const usesManualModelId = !usesModelCatalog
  const directModelIdValue = directModelId.trim()
  const directModelIdHasSecret = usesManualModelId && hasSensitiveTextSecret(directModelIdValue)
  const draftModelValue = usesModelCatalog ? (selectedModel ? publicModelId(selectedModel) : '') : directModelIdValue
  const modelValueMissing = !draftModelValue
  const canSaveModelConfig = Boolean(draftModelValue) && !directModelIdHasSecret
  const effectiveConfig = savedConfig ?? runtimeQuery.data ?? null
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
      baseURL.trim() !== (effectiveConfig.baseURL ?? '') ||
      Boolean(modelApiKey.trim()) ||
      useForChat !== effectiveConfig.useForChat ||
      useForPlanner !== effectiveConfig.useForPlanner
    : canSaveModelConfig
  const modelBaseURLHasSecret = hasSensitiveURLSecret(baseURL.trim())
  const usesBackendCompatibleBaseURL = isBackendCompatibleBaseURL(baseURL)
  const modelApiKeyProvided = Boolean(modelApiKey.trim())
  const modelRouteIssues = useMemo(() => buildModelRouteIssues({ useForChat, useForPlanner }), [useForChat, useForPlanner])
  const modelCompatibilityProbes = useMemo(() => buildModelCompatibilityProbes({
    selectedApiKind,
    modelValue: draftModelValue,
    baseURL: baseURL.trim(),
    apiKeyProvided: modelApiKeyProvided,
    usesBackendCompatibleBaseURL,
    modelBaseURLHasSecret,
    directModelIdHasSecret,
    useForChat,
    useForPlanner,
    effectiveConfig,
  }), [baseURL, directModelIdHasSecret, draftModelValue, effectiveConfig, modelApiKeyProvided, modelBaseURLHasSecret, selectedApiKind, useForChat, useForPlanner, usesBackendCompatibleBaseURL])
  const apiModeSwitchPlan = useMemo(() => buildApiModeSwitchPlan({
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
      setSelectedModelId(apiKind === 'openai_chat_completions' ? runtimeModelValue(textModels, runtimeQuery.data) : NO_MODEL_VALUE)
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
        ...(baseURL.trim() ? { baseURL: baseURL.trim() } : {}),
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
        ...(baseURL.trim() ? { baseURL: baseURL.trim() } : {}),
        ...(modelApiKey.trim() ? { apiKey: modelApiKey.trim() } : {}),
        useForChat,
        useForPlanner,
      })
      updateAgentSettings({ modelId: usesModelCatalog && selectedModel ? selectedModel.id : null })
      const result = await localAgentClient.testModelConfig({ message: testMessage.trim() || t('agents.settings.testMessageDefault') })
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
      setSelectedModelId(apiKind === 'openai_chat_completions' ? runtimeModelValue(textModels, effectiveConfig) : NO_MODEL_VALUE)
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
    <div data-testid="agent-settings-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings size={18} />
              <h1 className="text-lg font-semibold text-foreground">{t('agents.settings.title')}</h1>
              <Badge variant={effectiveConfig?.configured ? 'success' : 'warning'}>
                {effectiveConfig?.configured ? t('agents.settings.configured') : t('agents.settings.notConfigured')}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{t('agents.settings.description')}</p>
            <div data-testid="agent-settings-scope-boundary" className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px] leading-4">
              <span className="rounded border border-border bg-muted/30 px-2 py-1 text-foreground">{t('agents.settings.scope.controlPlane')}</span>
              <span className="rounded border border-border bg-background px-2 py-1 text-muted-foreground">{t('agents.settings.scope.futureRuns')}</span>
              <span className="rounded border border-border bg-background px-2 py-1 text-muted-foreground">{t('agents.settings.scope.debugReadOnly')}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" data-testid="agent-settings-open-debug">
              <Link to={ROUTES.agentDebug}>
                <Terminal size={13} />
                {t('agents.settings.openDebug')}
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void copySettingsStatusSummary()} data-testid="agent-settings-copy-status">
              <Clipboard size={13} />
              {settingsStatusCopied ? t('agents.settings.settingsStatusCopied') : t('agents.settings.copySettingsStatus')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => runtimeQuery.refetch()} disabled={runtimeQuery.isFetching} data-testid="agent-settings-refresh">
              <RefreshCw size={13} className={runtimeQuery.isFetching ? 'animate-spin' : ''} />
              {t('agents.settings.refresh')}
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {runtimeQuery.isLoading || modelsQuery.isLoading ? (
          <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
        ) : runtimeQuery.error ? (
          <StateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(runtimeQuery.error)} />
        ) : modelsQuery.error ? (
          <StateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(modelsQuery.error)} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-4">
              <Panel id="agent-settings-model" title={t('agents.settings.modelPanel')}>
                <div className="grid gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">
                      {usesModelCatalog ? t('agents.settings.modelLabel') : t('agents.settings.providerModelIdLabel')}
                    </label>
                    {usesModelCatalog ? (
                      <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('agents.settings.selectModel')} />
                        </SelectTrigger>
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
                      <Input
                        value={directModelId}
                        onChange={(event) => setDirectModelId(event.target.value)}
                        placeholder={apiKindModelPlaceholder(selectedApiKind)}
                        className="text-xs"
                        data-testid="agent-settings-provider-model-id"
                      />
                    )}
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {usesModelCatalog ? t('agents.settings.modelHelp') : t('agents.settings.providerModelIdHelp')}
                    </p>
                    {modelValueMissing && (
                      <p className="mt-1 text-[11px] leading-4 text-destructive">{t('agents.settings.modelRequired')}</p>
                    )}
                    {directModelIdHasSecret && (
                      <div data-testid="agent-settings-provider-model-id-secret-warning" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] leading-4 text-destructive">
                        {t('agents.settings.modelIdSecretsBlocked')}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.apiKindLabel')}</label>
                      <Select
                        value={selectedApiKind}
                        onValueChange={(value) => {
                          const apiKind = value as RuntimeModelAPIKind
                          setSelectedApiKind(apiKind)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('agents.settings.selectApiKind')} />
                        </SelectTrigger>
                        <SelectContent>
                          {API_KIND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        {t(API_KIND_OPTIONS.find((option) => option.value === selectedApiKind)?.descriptionKey ?? API_KIND_OPTIONS[0].descriptionKey)}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.baseUrlLabel')}</label>
                      <Input
                        value={baseURL}
                        onChange={(event) => setBaseURL(event.target.value)}
                        placeholder={apiKindBaseURLPlaceholder(selectedApiKind)}
                        className="text-xs"
                      />
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.baseUrlHelp')}</p>
                      {modelBaseURLHasSecret && (
                        <div data-testid="agent-settings-base-url-secret-warning" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] leading-4 text-destructive">
                          <p>{t('agents.settings.baseUrlSecretsBlocked')}</p>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="mt-2"
                            onClick={() => stripModelBaseURLSecrets({ audit: true })}
                            data-testid="agent-settings-strip-base-url-secrets"
                          >
                            {t('agents.settings.quickFixes.stripSensitiveBaseURLQuery')}
                          </Button>
                        </div>
                      )}
                      {usesManualModelId && baseURL.trim() && !usesBackendCompatibleBaseURL && (
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.providerApiKeyLabel')}</label>
                          <Input
                            value={modelApiKey}
                            onChange={(event) => setModelApiKey(event.target.value)}
                            placeholder={effectiveConfig?.apiKeyConfigured ? t('agents.settings.providerApiKeyConfiguredPlaceholder') : t('agents.settings.providerApiKeyPlaceholder')}
                            type="password"
                            autoComplete="off"
                            className="text-xs"
                            data-testid="agent-settings-provider-api-key"
                          />
                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.providerCredentialHelp')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <ToggleRow checked={useForChat} onChange={setUseForChat} title={t('agents.settings.useForChat')} description={t('agents.settings.useForChatHelp')} />
                    <ToggleRow checked={useForPlanner} onChange={setUseForPlanner} title={t('agents.settings.useForPlanner')} description={t('agents.settings.useForPlannerHelp')} />
                  </div>
                  <ApiModeCapabilityMatrix apiKind={selectedApiKind} t={t} />
                  <ModelCompatibilityProbePanel probes={modelCompatibilityProbes} />
                  <ApiModeMigrationGuide apiKind={selectedApiKind} onSwitchToResponses={() => setSelectedApiKind('openai_responses')} />
                  <ApiModeSwitchPlanPanel apiKind={selectedApiKind} items={apiModeSwitchPlan} />
                  {modelRouteIssues.length > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                      {modelRouteIssues.map((issue) => <p key={issue}>{t(`agents.settings.modelRouteIssues.${issue}`)}</p>)}
                    </div>
                  )}

                  {usesModelCatalog && selectedModel && (
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <SummaryItem label={t('agents.settings.fields.modelId')} value={publicModelId(selectedModel)} />
                      <SummaryItem label={t('agents.settings.fields.capabilities')} value={selectedModel.capabilities.join(', ') || '-'} />
                      <SummaryItem label={t('agents.settings.fields.provider')} value={selectedModel.provider_name || '-'} />
                      <SummaryItem label={t('agents.settings.fields.configId')} value={`#${selectedModel.id}`} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={saveSettings} disabled={!canSaveModelConfig || saving || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {hasUnsavedChanges ? t('agents.settings.save') : t('agents.settings.saved')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={testSettings} disabled={!canSaveModelConfig || testing || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
                      {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
                      {t('agents.settings.test')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={modelConfigClearConfirming ? 'destructive' : 'outline'}
                      onClick={clearModelConfig}
                      disabled={clearingModelConfig || (!effectiveConfig?.configured && !hasUnsavedChanges)}
                      data-testid="agent-settings-clear-model-config"
                    >
                      {clearingModelConfig ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      {modelConfigClearConfirming ? t('agents.settings.clearModelConfigConfirm') : t('agents.settings.clearModelConfig')}
                    </Button>
                  </div>

                  {saveError && <InlineError>{saveError}</InlineError>}
                </div>
              </Panel>

              <Panel title={t('agents.settings.testPanel')}>
                <div className="space-y-3">
                  <Textarea
                    value={testMessage}
                    onChange={(event) => setTestMessage(event.target.value)}
                    className="min-h-24 text-xs"
                  />
                  {testError && <InlineError>{testError}</InlineError>}
                  {testResult && (
                    <div className="rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={testResult.ok ? 'success' : 'destructive'}>
                          {testResult.ok ? t('agents.settings.testOk') : t('agents.settings.testFailed')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{redactAgentTraceDebugText(testResult.model)}</span>
                        <span className="text-xs text-muted-foreground">{testResult.latencyMs}ms</span>
                      </div>
                      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs leading-5 text-foreground">
                        {testResult.content ? redactAgentTraceDebugText(testResult.content) : '-'}
                      </pre>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel id="agent-settings-run-presets" title={t('agents.settings.runPresetsPanel')}>
                <div className="space-y-3">
                  <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.activeRunPreset')}</label>
                      <Select value={agentSettings.activeRunPresetId} onValueChange={selectRunPreset}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {agentSettings.runPresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.runPresetsHelp')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => createRunPreset('blank')} data-testid="agent-run-preset-create">
                          <Plus size={13} />
                          {t('agents.settings.createRunPreset')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => createRunPreset('duplicate')} data-testid="agent-run-preset-duplicate">
                          <Copy size={13} />
                          {t('agents.settings.duplicateRunPreset')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={deleteActiveRunPreset}
                          disabled={DEFAULT_RUN_PRESET_IDS.has(activeRunPreset.id) || agentSettings.runPresets.length <= 1}
                          data-testid="agent-run-preset-delete"
                        >
                          <Trash2 size={13} />
                          {t('agents.settings.deleteRunPreset')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={resetRunPresets}>
                          <RefreshCw size={13} />
                          {t('agents.settings.resetRunPresets')}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <SummaryItem label={t('agents.settings.runPresetFields.maxToolCalls')} value={activeRunPreset.maxToolCalls} />
                      <SummaryItem label={t('agents.settings.runPresetFields.maxIterations')} value={activeRunPreset.maxIterations} />
                      <SummaryItem label={t('agents.settings.runPresetFields.permissionMode')} value={t(`agents.settings.runPresetPermissionModes.${activeRunPreset.permissionMode}`)} />
                      <SummaryItem label={t('agents.settings.runPresetFields.planWorkers')} value={activeRunPreset.planMaxWorkers} />
                    </div>
                  </div>
                  <div data-testid="agent-run-preset-editor" className="rounded-md border border-border bg-muted/20 p-2">
                    <p className="text-xs font-medium text-foreground">{t('agents.settings.editRunPreset')}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="space-y-1 sm:col-span-2">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.name')}</span>
                        <Input
                          value={activeRunPreset.name}
                          onChange={(event) => updateRunPreset(activeRunPreset.id, { name: event.target.value })}
                          className="h-8 text-xs"
                        />
                      </label>
                      <label className="space-y-1 sm:col-span-2">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.description')}</span>
                        <Input
                          value={activeRunPreset.description}
                          onChange={(event) => updateRunPreset(activeRunPreset.id, { description: event.target.value })}
                          className="h-8 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.maxToolCalls')}</span>
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          value={activeRunPreset.maxToolCalls}
                          onChange={(event) => updateRunPreset(activeRunPreset.id, { maxToolCalls: Number(event.target.value) })}
                          className="h-8 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.maxIterations')}</span>
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          value={activeRunPreset.maxIterations}
                          onChange={(event) => updateRunPreset(activeRunPreset.id, { maxIterations: Number(event.target.value) })}
                          className="h-8 text-xs"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.permissionMode')}</span>
                        <Select value={activeRunPreset.permissionMode} onValueChange={(value) => updateRunPreset(activeRunPreset.id, { permissionMode: value as AgentRunPreset['permissionMode'] })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ask">{t('agents.settings.runPresetPermissionModes.ask')}</SelectItem>
                            <SelectItem value="suggest">{t('agents.settings.runPresetPermissionModes.suggest')}</SelectItem>
                            <SelectItem value="auto">{t('agents.settings.runPresetPermissionModes.auto')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.planWorkers')}</span>
                        <Select value={String(activeRunPreset.planMaxWorkers)} onValueChange={(value) => updateRunPreset(activeRunPreset.id, { planMaxWorkers: Number(value) })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RUN_PRESET_PLAN_WORKER_OPTIONS.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.planAttempts')}</span>
                        <Select value={String(activeRunPreset.planMaxTaskAttempts)} onValueChange={(value) => updateRunPreset(activeRunPreset.id, { planMaxTaskAttempts: Number(value) })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RUN_PRESET_PLAN_ATTEMPT_OPTIONS.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-medium text-muted-foreground">{t('agents.settings.runPresetFields.planTimeout')}</span>
                        <Select value={String(activeRunPreset.planWorkerTimeoutMs)} onValueChange={(value) => updateRunPreset(activeRunPreset.id, { planWorkerTimeoutMs: Number(value) })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RUN_PRESET_PLAN_TIMEOUT_OPTIONS.map((timeoutMs) => (
                              <SelectItem key={timeoutMs} value={String(timeoutMs)}>{formatDurationMinutes(timeoutMs)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs">
                        <input
                          type="checkbox"
                          checked={activeRunPreset.autoPlan}
                          onChange={(event) => updateRunPreset(activeRunPreset.id, { autoPlan: event.target.checked })}
                          className="size-3.5 rounded border-input"
                        />
                        <span>{t('agents.settings.runPresetFields.autoPlan')}</span>
                      </label>
                    </div>
                  </div>
                  <div data-testid="agent-run-preset-effective-policy" className="rounded-md border border-border bg-background p-2">
                    <p className="text-xs font-medium text-foreground">{t('agents.settings.effectiveRunPolicy')}</p>
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <SummaryItem label={t('agents.settings.runPresetFields.maxToolCalls')} value={activeRunPreset.maxToolCalls} />
                      <SummaryItem label={t('agents.settings.runPresetFields.maxIterations')} value={activeRunPreset.maxIterations} />
                      <SummaryItem label={t('agents.settings.runPresetFields.permissionMode')} value={t(`agents.settings.runPresetPermissionModes.${activeRunPreset.permissionMode}`)} />
                      <SummaryItem label={t('agents.settings.runPresetFields.autoPlan')} value={activeRunPreset.autoPlan ? t('agents.settings.values.enabled') : t('agents.settings.values.disabled')} />
                      <SummaryItem label={t('agents.settings.runPresetFields.planWorkers')} value={activeRunPreset.planMaxWorkers} />
                      <SummaryItem label={t('agents.settings.runPresetFields.planAttempts')} value={activeRunPreset.planMaxTaskAttempts} />
                      <SummaryItem label={t('agents.settings.runPresetFields.planTimeout')} value={formatDurationMinutes(activeRunPreset.planWorkerTimeoutMs)} />
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {agentSettings.runPresets.map((preset) => (
                      <RunPresetRow
                        key={preset.id}
                        preset={preset}
                        active={preset.id === agentSettings.activeRunPresetId}
                        onSelect={selectRunPreset}
                      />
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel id="agent-settings-skills" title={t('agents.settings.skillsPanel')}>
                {catalogQuery.isLoading ? (
                  <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
                ) : catalogQuery.error ? (
                  <StateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 text-xs sm:grid-cols-4">
                      <SummaryItem label={t('agents.settings.skillFields.installed')} value={skillStats.installed} />
                      <SummaryItem label={t('agents.settings.skillFields.enabled')} value={skillStats.enabled} />
                      <SummaryItem label={t('agents.settings.skillFields.core')} value={skillStats.core} />
                      <SummaryItem label={t('agents.settings.skillFields.onDemand')} value={skillStats.onDemand} />
                    </div>
                    <div data-testid="agent-settings-skill-governance" className="rounded-md border border-border bg-background p-2">
                      <p className="text-xs font-medium text-foreground">{t('agents.settings.skillGovernancePanel')}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.skillGovernanceHelp')}</p>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-5">
                        <SummaryItem label={t('agents.settings.skillGovernanceFields.versioned')} value={skillGovernanceStats.versioned} />
                        <SummaryItem label={t('agents.settings.skillSources.core')} value={skillGovernanceStats.core} />
                        <SummaryItem label={t('agents.settings.skillSources.plugin')} value={skillGovernanceStats.plugin} />
                        <SummaryItem label={t('agents.settings.skillSources.local')} value={skillGovernanceStats.local} />
                        <SummaryItem label={t('agents.settings.skillTrustLevels.review')} value={skillGovernanceStats.review} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={reloadCatalog} disabled={catalogReloading || catalogQuery.isFetching}>
                        {catalogReloading || catalogQuery.isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        {t('agents.settings.reloadCatalog')}
                      </Button>
                      {catalogReloadedAt && <span className="text-[11px] text-muted-foreground">{t('agents.settings.reloadCatalogDone', { time: new Date(catalogReloadedAt).toLocaleTimeString() })}</span>}
                    </div>
                    {catalogReloadError && <InlineError>{catalogReloadError}</InlineError>}

                    <div className="rounded-md border border-border bg-muted/20 p-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">{t('agents.settings.installSkillBundle')}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.installSkillBundleHelp')}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            ref={skillBundleFileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(event) => void loadSkillBundleFile(event.target.files?.[0])}
                          />
                          <Button type="button" size="sm" variant="outline" onClick={() => skillBundleFileInputRef.current?.click()}>
                            {t('agents.settings.loadSkillBundleFile')}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={installSkillBundle} disabled={skillBundleInstalling || !skillBundleDraftValidation.bundle}>
                            {skillBundleInstalling ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            {t('agents.settings.installSkillBundleAction')}
                          </Button>
                        </div>
                      </div>
                      {skillBundleFileName && <p className="mt-2 text-[11px] text-muted-foreground">{t('agents.settings.skillBundleFileLoaded', { fileName: skillBundleFileName })}</p>}
                      <Textarea
                        value={skillBundleText}
                        onChange={(event) => {
                          setSkillBundleText(event.target.value)
                          setSkillBundleInstallError(null)
                          setSkillBundleInstallResult(null)
                        }}
                        placeholder={t('agents.settings.installSkillBundlePlaceholder')}
                        className="mt-2 min-h-24 text-xs"
                      />
                      {skillBundleDraftValidation.bundle && (
                        <p data-testid="agent-settings-skill-bundle-draft-summary" className="mt-2 text-[11px] leading-4 text-muted-foreground">
                          {t('agents.settings.skillBundleDraftSummary', {
                            pluginId: skillBundleDraftValidation.bundle.pluginId,
                            count: skillBundleDraftValidation.bundle.files.length,
                            size: formatBytes(skillBundleDraftValidation.totalBytes),
                          })}
                        </p>
                      )}
                      {!skillBundleInstallError && skillBundleDraftValidation.error && (
                        <div className="mt-2" data-testid="agent-settings-skill-bundle-draft-error"><InlineError>{skillBundleDraftValidation.error}</InlineError></div>
                      )}
                      {skillBundleInstallError && <div className="mt-2"><InlineError>{skillBundleInstallError}</InlineError></div>}
                      {skillBundleInstallResult && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {t('agents.settings.installSkillBundleDone', { count: skillBundleInstallResult.installedFiles.length, pluginId: skillBundleInstallResult.pluginId })}
                        </p>
                      )}
                      <div className="mt-3 border-t border-border pt-3">
                        {skillBundlePlugins.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            <p className="text-[11px] font-medium text-foreground">{t('agents.settings.installedSkillBundles')}</p>
                            {skillBundlePlugins.map((plugin) => (
                              <div key={plugin.pluginId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-background px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-foreground">{plugin.pluginId}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">{plugin.path}</p>
                                </div>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant={skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'destructive' : 'ghost'}
                                  onClick={() => {
                                    if (skillBundleUninstallConfirmPluginId === plugin.pluginId) {
                                      void uninstallSkillBundle(plugin.pluginId)
                                      return
                                    }
                                    setSkillBundleUninstallConfirmPluginId(plugin.pluginId)
                                    setSkillBundleUninstallError(null)
                                  }}
                                  disabled={skillBundleUninstalling}
                                  data-testid="agent-settings-installed-skill-bundle-uninstall"
                                >
                                  {skillBundleUninstalling && skillBundleUninstallPluginId === plugin.pluginId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  {t(skillBundleUninstallConfirmPluginId === plugin.pluginId ? 'agents.settings.uninstallSkillBundleConfirm' : 'agents.settings.uninstallSkillBundleAction')}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-56 flex-1">
                            <label className="mb-1 block text-[11px] font-medium text-foreground">{t('agents.settings.uninstallSkillBundle')}</label>
                            <Input
                              value={skillBundleUninstallPluginId}
                              onChange={(event) => {
                                setSkillBundleUninstallPluginId(event.target.value)
                                setSkillBundleUninstallError(null)
                                setSkillBundleUninstallResult(null)
                              }}
                              placeholder={t('agents.settings.uninstallSkillBundlePlaceholder')}
                              className="h-8 text-xs"
                            />
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={() => void uninstallSkillBundle()} disabled={skillBundleUninstalling || !skillBundleUninstallPluginIdValue || skillBundleUninstallPluginIdInvalid}>
                            {skillBundleUninstalling ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            {t('agents.settings.uninstallSkillBundleAction')}
                          </Button>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.uninstallSkillBundleHelp')}</p>
                        {!skillBundleUninstallError && skillBundleUninstallPluginIdInvalid && (
                          <div className="mt-2" data-testid="agent-settings-uninstall-plugin-id-error"><InlineError>{t('agents.settings.uninstallSkillBundlePluginIdInvalid')}</InlineError></div>
                        )}
                        {skillBundleUninstallError && <div className="mt-2"><InlineError>{skillBundleUninstallError}</InlineError></div>}
                        {skillBundleUninstallResult && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {skillBundleUninstallResult.removed
                              ? t('agents.settings.uninstallSkillBundleDone', { pluginId: skillBundleUninstallResult.pluginId })
                              : t('agents.settings.uninstallSkillBundleMissing', { pluginId: skillBundleUninstallResult.pluginId })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={saveDefaultSkillPolicy} disabled={!hasSkillPolicyChange || skillPolicySaving || skillDrafts.length === 0 || skillPolicyIssues.length > 0}>
                        {skillPolicySaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {hasSkillPolicyChange ? t('agents.settings.saveSkillPolicy') : t('agents.settings.skillPolicySaved')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSkillDrafts(skillPolicyBaseline)} disabled={!hasSkillPolicyChange || skillPolicySaving}>
                        {t('agents.settings.resetSkillPolicy')}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{t('agents.settings.skillPolicyEditHelp')}</span>
                    </div>
                    {skillPolicySaveError && <InlineError>{skillPolicySaveError}</InlineError>}
                    {skillPolicyIssues.length > 0 && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t('agents.settings.skillPolicyIssues')}</p>
                        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                          {skillPolicyIssues.map((issue) => (
                            <li key={`${issue.type}:${issue.skillId}:${issue.relatedSkillId}`}>
                              {issue.type === 'dependency'
                                ? t('agents.settings.skillPolicyIssueDependency', { skillId: issue.skillId, dependencyId: issue.relatedSkillId })
                                : t('agents.settings.skillPolicyIssueConflict', { skillId: issue.skillId, conflictId: issue.relatedSkillId })}
                            </li>
                          ))}
                        </ul>
                        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => fixToolPolicyDraftIssues({ audit: true })} data-testid="agent-settings-fix-tool-policy-draft-issues">
                          {t('agents.settings.fixToolPolicyDraftIssues')}
                        </Button>
                      </div>
                    )}

                    {coreSkills.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-foreground">{t('agents.settings.coreSkills')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {coreSkills.map((skill) => (
                            <Badge key={skill.id} variant="secondary">{skill.name}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {featuredSkills.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('agents.settings.noSkills')}</p>
                      ) : featuredSkills.map((skill) => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          draft={skillDraftById.get(skill.id)}
                          onDraftChange={updateSkillDraft}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <Panel id="agent-settings-profiles" title={t('agents.settings.profilesPanel')}>
                {catalogQuery.isLoading ? (
                  <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
                ) : catalogQuery.error ? (
                  <StateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 text-xs sm:grid-cols-4">
                      <SummaryItem label={t('agents.settings.profileFields.total')} value={catalogQuery.data?.profiles.length ?? 0} />
                      <SummaryItem label={t('agents.settings.profileFields.current')} value={currentProfile?.name ?? '-'} />
                      <SummaryItem label={t('agents.settings.profileFields.packs')} value={currentProfile?.enabledPacks.length ?? 0} />
                      <SummaryItem label={t('agents.settings.profileFields.toolGrants')} value={currentProfile?.toolGrants.length ?? 0} />
                    </div>

                    {(catalogQuery.data?.profiles.length ?? 0) > 0 && (
                      <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.defaultProfileLabel')}</label>
                          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('agents.settings.selectProfile')} />
                            </SelectTrigger>
                            <SelectContent>
                              {(catalogQuery.data?.profiles ?? []).map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.defaultProfileHelp')}</p>
                        </div>
                        <div className="flex items-end">
                          <Button type="button" size="sm" onClick={saveDefaultProfile} disabled={!hasProfileChange || profileSaving}>
                            {profileSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            {hasProfileChange ? t('agents.settings.saveProfile') : t('agents.settings.profileSaved')}
                          </Button>
                        </div>
                      </div>
                    )}
                    {profileSaveError && <InlineError>{profileSaveError}</InlineError>}

                    {selectedProfile && selectedProfile.id !== currentProfile?.id && (
                      <div className="space-y-2">
                        {selectedProfileDiff && <ProfileDiffPanel diff={selectedProfileDiff} />}
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-muted-foreground">
                          {t('agents.settings.profileSwitchResetsToolPolicy')}
                        </div>
                        <ProfileRow profile={selectedProfile} preview />
                      </div>
                    )}

                    {currentProfile ? (
                      <ProfileRow profile={currentProfile} current />
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('agents.settings.noProfiles')}</p>
                    )}

                    {(catalogQuery.data?.profiles ?? []).filter((profile) => profile.id !== currentProfile?.id).slice(0, 6).map((profile) => (
                      <ProfileRow key={profile.id} profile={profile} />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel id="agent-settings-tools" title={t('agents.settings.toolPolicyPanel')}>
                {capabilitiesQuery.isLoading ? (
                  <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
                ) : capabilitiesQuery.error ? (
                  <StateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(capabilitiesQuery.error)} />
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 text-xs sm:grid-cols-4">
                      <SummaryItem label={t('agents.settings.toolPolicyFields.discovered')} value={toolStats.discovered} />
                      <SummaryItem label={t('agents.settings.toolPolicyFields.available')} value={toolStats.available} />
                      <SummaryItem label={t('agents.settings.toolPolicyFields.blocked')} value={toolStats.blocked} />
                      <SummaryItem label={t('agents.settings.toolPolicyFields.requiresApproval')} value={toolStats.requiresApproval} />
                    </div>

                    <div className="grid gap-2 text-xs sm:grid-cols-3">
                      <SummaryItem label={t('agents.settings.toolPolicyFields.writeRisk')} value={toolStats.writeRisk} />
                      <SummaryItem label={t('agents.settings.toolPolicyFields.projectScoped')} value={toolStats.projectScoped} />
                      <SummaryItem label={t('agents.settings.toolPolicyFields.profileGrants')} value={currentProfile?.toolGrants.length ?? 0} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={saveDefaultToolPolicy} disabled={!hasToolPolicyChange || toolPolicySaving || toolGrantDrafts.length === 0 || toolPolicyDraftIssues.length > 0}>
                        {toolPolicySaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {hasToolPolicyChange ? t('agents.settings.saveToolPolicy') : t('agents.settings.toolPolicySaved')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setToolGrantDrafts(toolGrantBaseline)} disabled={!hasToolPolicyChange || toolPolicySaving}>
                        {t('agents.settings.resetToolPolicy')}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{t('agents.settings.toolPolicyEditHelp')}</span>
                    </div>
                    {hasToolPolicyChange && <ToolPolicyDiffPreview items={toolPolicyDiffItems} />}
                    {toolPolicySaveError && <InlineError>{toolPolicySaveError}</InlineError>}
                    {toolPolicyDraftIssues.length > 0 && (
                      <div data-testid="agent-settings-tool-policy-draft-issues" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t('agents.settings.toolPolicyDraftIssues')}</p>
                        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                          {toolPolicyDraftIssues.slice(0, 5).map((issue) => (
                            <li key={`${issue.reasonKey}:${issue.toolName}`}>
                              {issue.toolName}: {t(issue.reasonKey, issue.values)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div data-testid="agent-settings-tool-policy-filters" className="grid gap-2 rounded-md border border-border bg-background p-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                      <Input
                        value={toolPolicySearch}
                        onChange={(event) => setToolPolicySearch(event.target.value)}
                        placeholder={t('agents.settings.toolPolicySearchPlaceholder')}
                        className="h-8 text-xs"
                        data-testid="agent-settings-tool-policy-search"
                      />
                      <Select value={toolPolicyFilter} onValueChange={(value) => setToolPolicyFilter(value as ToolPolicyFilter)}>
                        <SelectTrigger className="h-8 text-xs" data-testid="agent-settings-tool-policy-filter">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TOOL_POLICY_FILTER_OPTIONS.map((filter) => (
                            <SelectItem key={filter} value={filter}>{t(`agents.settings.toolPolicyFilters.${filter}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-[11px] leading-4 text-muted-foreground" data-testid="agent-settings-tool-policy-filter-summary">
                        {t('agents.settings.toolPolicyFilterSummary', {
                          shown: toolPolicyFilteredTools.length,
                          total: capabilitiesQuery.data?.resolvedTools.discovered.length ?? 0,
                        })}
                      </div>
                    </div>
                    <div data-testid="agent-settings-tool-policy-filter-presets" className="rounded-md border border-border bg-background p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-foreground">{t('agents.settings.toolPolicyFilterPresets')}</span>
                        <Button type="button" size="sm" variant="outline" onClick={saveToolPolicyFilterPreset}>
                          <Plus size={13} />
                          {t('agents.settings.saveToolPolicyFilterPreset')}
                        </Button>
                        <span className="text-[10px] leading-4 text-muted-foreground">{t('agents.settings.toolPolicyFilterPresetsHelp')}</span>
                      </div>
                      {agentSettings.toolPolicyFilterPresets.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {agentSettings.toolPolicyFilterPresets.map((preset) => (
                            <div key={preset.id} className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                              <Button type="button" size="sm" variant="ghost" className="max-w-[260px]" title={preset.name} onClick={() => applyToolPolicyFilterPreset(preset)}>
                                <span className="truncate">{preset.name}</span>
                              </Button>
                              <Button type="button" size="icon" variant="ghost" aria-label={t('agents.settings.deleteToolPolicyFilterPreset')} onClick={() => deleteToolPolicyFilterPreset(preset.id)}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{t('agents.settings.toolPolicyFilterPresetsEmpty')}</p>
                      )}
                    </div>
                    <div data-testid="agent-settings-tool-policy-bulk-actions" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
                      <span className="text-[11px] font-medium text-foreground">{t('agents.settings.toolPolicyBulkActions')}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyToolPolicyBulkEdit('allow_available')} disabled={toolPolicyFilteredTools.length === 0}>
                        {t('agents.settings.toolPolicyBulkAllowAvailable')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyToolPolicyBulkEdit('deny')} disabled={toolPolicyFilteredTools.length === 0}>
                        {t('agents.settings.toolPolicyBulkDeny')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyToolPolicyBulkEdit('approval_never')} disabled={toolPolicyFilteredTools.length === 0}>
                        {t('agents.settings.toolPolicyBulkApprovalNever')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyToolPolicyBulkEdit('approval_on_write')} disabled={toolPolicyFilteredTools.length === 0}>
                        {t('agents.settings.toolPolicyBulkApprovalOnWrite')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyToolPolicyBulkEdit('approval_always')} disabled={toolPolicyFilteredTools.length === 0}>
                        {t('agents.settings.toolPolicyBulkApprovalAlways')}
                      </Button>
                      <span className="text-[10px] leading-4 text-muted-foreground">{t('agents.settings.toolPolicyBulkHelp')}</span>
                    </div>

                    {toolPolicyFilteredTools.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('agents.settings.noTools')}</p>
                    ) : (
                      <div className="space-y-2">
                        {toolPolicyFilteredTools.map((tool) => (
                          <ToolPolicyRow
                            key={tool.name}
                            tool={tool}
                            draft={toolGrantDraftByName.get(tool.name)}
                            profileGranted={currentToolGrants.has(tool.name)}
                            onDraftChange={updateToolGrantDraft}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            </section>

            <aside className="space-y-4">
              <Panel title={t('agents.settings.configurationMapPanel')}>
                <ConfigurationMapPanel onJump={scrollToSettingsSection} />
              </Panel>

              <Panel title={t('agents.settings.currentRuntime')}>
                <div className="space-y-2 text-xs">
                  <SummaryItem label={t('agents.settings.fields.baseUrl')} value={redactAgentTraceDebugText(localAgentClient.baseURL)} />
                  <SummaryItem label={t('agents.settings.fields.configuredModel')} value={configuredModelLabel} />
                  <SummaryItem label={t('agents.settings.fields.apiKind')} value={effectiveConfig?.apiKind ?? DEFAULT_API_KIND} />
                  <SummaryItem label={t('agents.settings.fields.modelBaseUrl')} value={redactAgentTraceDebugText(effectiveConfig?.baseURL || apiKindBaseURLPlaceholder(effectiveConfig?.apiKind ?? DEFAULT_API_KIND))} />
                  <SummaryItem label={t('agents.settings.fields.modelCredentials')} value={modelCredentialStatusLabel} />
                  <SummaryItem label={t('agents.settings.fields.source')} value={effectiveConfig?.source ?? 'none'} />
                  <SummaryItem label={t('agents.settings.fields.updatedAt')} value={effectiveConfig?.updatedAt ? new Date(effectiveConfig.updatedAt).toLocaleString() : '-'} />
                </div>
              </Panel>

              <Panel title={t('agents.settings.actionItemsPanel')}>
                <SettingsActionItemsPanel items={settingsActionItems} feedback={settingsActionFeedback} onJump={scrollToSettingsSection} onQuickFix={applySettingsActionQuickFix} />
              </Panel>

              <Panel title={t('agents.settings.readinessPanel')}>
                <SettingsReadinessPanel items={readinessItems} />
              </Panel>

              <Panel title={t('agents.settings.settingsAuditPanel')}>
                <SettingsAuditTrailPanel entries={agentSettings.auditTrail} onClear={clearSettingsAudit} />
              </Panel>

              <Panel id="agent-settings-snapshot" title={t('agents.settings.settingsSnapshotPanel')}>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={settingsSnapshotFileInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => void loadSettingsSnapshotFile(event.target.files?.[0])}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={exportSettingsSnapshot}>
                      <Save size={13} />
                      {t('agents.settings.exportSettings')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => settingsSnapshotFileInputRef.current?.click()}>
                      <Upload size={13} />
                      {t('agents.settings.loadSettingsSnapshotFile')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copySettingsSnapshot()}>
                      <Clipboard size={13} />
                      {t('agents.settings.copySettings')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={downloadSettingsSnapshot}>
                      <Download size={13} />
                      {t('agents.settings.downloadSettings')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={previewSettingsSnapshotImport} disabled={!parsedSettingsSnapshot || Boolean(settingsSnapshotValidation.error) || !settingsSnapshotHasSelectedImportScope} data-testid="agent-settings-preview-import-dry-run">
                      <TestTube2 size={13} />
                      {t('agents.settings.previewSettingsImportDryRun')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => void importSettingsSnapshot()} disabled={settingsSnapshotImporting || !settingsSnapshotCanImport}>
                      {settingsSnapshotImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {t('agents.settings.importSettings')}
                    </Button>
                  </div>
                  <p className="text-[11px] leading-4 text-muted-foreground">{t('agents.settings.settingsSnapshotHelp')}</p>
                  {settingsSnapshotFileName && <p className="text-[11px] text-muted-foreground">{t('agents.settings.settingsSnapshotFileLoaded', { fileName: settingsSnapshotFileName })}</p>}
                  {settingsImportBackup && (
                    <div data-testid="agent-settings-import-backup" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                      <p className="text-xs font-medium text-foreground">{t('agents.settings.settingsImportBackup')}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                        {t('agents.settings.settingsImportBackupHelp', { time: new Date(settingsImportBackup.createdAt).toLocaleString() })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={loadSettingsImportBackup} data-testid="agent-settings-load-import-backup">
                          <RefreshCw size={13} />
                          {t('agents.settings.loadImportBackup')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void copySettingsImportBackup()} data-testid="agent-settings-copy-import-backup">
                          <Clipboard size={13} />
                          {t('agents.settings.copyImportBackup')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={clearSettingsImportBackup} data-testid="agent-settings-clear-import-backup">
                          <Trash2 size={13} />
                          {t('agents.settings.clearImportBackup')}
                        </Button>
                      </div>
                    </div>
                  )}
                  <Textarea
                    value={settingsSnapshotText}
                    onChange={(event) => updateSettingsSnapshotText(event.target.value)}
                    placeholder={t('agents.settings.settingsSnapshotPlaceholder')}
                    className="min-h-36 text-xs"
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
                  {settingsSnapshotError && <InlineError>{settingsSnapshotError}</InlineError>}
                  {!settingsSnapshotError && parsedSettingsSnapshot && !settingsSnapshotHasSelectedImportScope && (
                    <InlineError>{t('agents.settings.settingsSnapshotImportScopeEmpty')}</InlineError>
                  )}
                  {!settingsSnapshotError && settingsSnapshotValidation.error && (
                    <InlineError>{t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotValidation.error })}</InlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsCatalog && !catalogQuery.data && (
                    <InlineError>{t('agents.settings.settingsSnapshotCatalogUnavailable')}</InlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsCapabilities && !capabilitiesQuery.data && (
                    <InlineError>{t('agents.settings.settingsSnapshotCapabilitiesUnavailable')}</InlineError>
                  )}
                  {!settingsSnapshotError && !settingsSnapshotValidation.error && settingsSnapshotNeedsModelCatalog && !modelsQuery.data && (
                    <InlineError>{t('agents.settings.settingsSnapshotModelCatalogUnavailable')}</InlineError>
                  )}
                  {!settingsSnapshotError && settingsSnapshotReferenceIssues.length > 0 && (
                    <InlineError>{t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotReferenceIssues.map((issue) => issue.message).join('; ') })}</InlineError>
                  )}
                  {settingsSnapshotMessage && <p className="text-[11px] text-muted-foreground">{settingsSnapshotMessage}</p>}
                </div>
              </Panel>

              <Panel title={t('agents.settings.modelRoutesPanel')}>
                {modelRoutes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('agents.settings.modelRoutesEmpty')}</p>
                ) : (
                  <div className="space-y-2">
                    {modelRoutes.map((route) => (
                      <div key={route.capability} className="rounded-md border border-border bg-muted/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">{t(`agents.settings.modelCapabilities.${route.capability}`)}</span>
                          <Badge variant={route.configured ? 'default' : 'outline'} className="text-[10px]">
                            {route.configured ? t('agents.settings.modelRouteConfigured') : t('agents.settings.modelRouteUnavailable')}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {t(`agents.settings.modelRouteSources.${route.source}`)}
                        </p>
                        {route.model && (
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {t('agents.settings.modelRouteModel')}: {redactAgentTraceDebugText(route.model)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {usesModelCatalog ? (
                <Panel title={t('agents.settings.availableModels')}>
                  {textModels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('agents.settings.noTextModels')}</p>
                  ) : (
                    <div className="space-y-2">
                      {textModels.slice(0, 12).map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setSelectedModelId(publicModelId(model))}
                          className={cn(
                            'w-full rounded-md border p-2 text-left transition-colors',
                            selectedModelId === publicModelId(model) ? 'border-ring bg-muted/50' : 'border-border bg-background hover:bg-muted/30',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-xs font-medium text-foreground">{publicModelLabel(model, true)}</span>
                            {selectedModelId === publicModelId(model) && <CheckCircle2 size={13} className="shrink-0 text-primary" />}
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{model.capabilities.join(', ')}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>
              ) : (
                <Panel title={t('agents.settings.providerModelPanel')}>
                  <p className="text-xs leading-5 text-muted-foreground">{t('agents.settings.providerModelPanelHelp')}</p>
                </Panel>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
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
  } else if (model && input.selectedApiKind === 'anthropic_messages' && /^(gpt|o\d|text-|davinci)/i.test(model)) {
    modelStatus = 'warning'
    modelDetailKey = 'agents.settings.modelCompatibilityDetails.modelIdProviderMismatch'
  } else if (model && (input.selectedApiKind === 'openai_responses' || input.selectedApiKind === 'openai_chat_completions') && /^claude/i.test(model)) {
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

function buildApiModeSwitchPlan(input: {
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
      labelKey: 'agents.settings.apiModeSwitchPlan.targetMode',
      detailKey: input.selectedApiKind === targetApiKind
        ? 'agents.settings.apiModeSwitchPlanDetails.targetModeStable'
        : 'agents.settings.apiModeSwitchPlanDetails.targetModeMigration',
      detailValues: { apiKind: input.selectedApiKind, targetApiKind },
    },
    switchPlanProbeItem('model-id', probeById.get('model-id'), 'agents.settings.apiModeSwitchPlan.modelId'),
    switchPlanProbeItem('credentials', probeById.get('credentials'), 'agents.settings.apiModeSwitchPlan.credentials'),
    switchPlanProbeItem('base-url', probeById.get('base-url'), 'agents.settings.apiModeSwitchPlan.baseURL'),
    switchPlanProbeItem('routes', probeById.get('routes'), 'agents.settings.apiModeSwitchPlan.routes'),
    {
      id: 'save-test',
      status: saveStatus,
      labelKey: 'agents.settings.apiModeSwitchPlan.saveTest',
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
    autoPlan: preset.autoPlan,
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
    autoPlan: preset.autoPlan !== false,
    maxToolCalls: clampInteger(preset.maxToolCalls, 1, 200),
    maxIterations: clampInteger(preset.maxIterations, 1, 200),
    planMaxWorkers: normalizeOption(preset.planMaxWorkers, RUN_PRESET_PLAN_WORKER_OPTIONS, 2),
    planMaxTaskAttempts: normalizeOption(preset.planMaxTaskAttempts, RUN_PRESET_PLAN_ATTEMPT_OPTIONS, 2),
    planWorkerTimeoutMs: normalizeOption(preset.planWorkerTimeoutMs, RUN_PRESET_PLAN_TIMEOUT_OPTIONS, 15 * 60_000),
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
    <div data-testid="agent-settings-snapshot-import-scopes" className="rounded-md border border-border bg-background p-2">
      <p className="text-xs font-medium text-foreground">{t('agents.settings.settingsSnapshotImportScopes')}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{t('agents.settings.settingsSnapshotImportScopesHelp')}</p>
      <div data-testid="agent-settings-snapshot-import-presets" className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">{t('agents.settings.settingsSnapshotImportPresets')}</span>
        {SETTINGS_SNAPSHOT_IMPORT_PRESETS.map((preset) => {
          const enabled = preset.scopes.some((scope) => settingsSnapshotImportScopeAvailable(snapshot, scope))
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={!enabled}
              onClick={() => onPresetChange(preset.id)}
              data-testid="agent-settings-snapshot-import-preset"
            >
              {t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`)}
            </Button>
          )
        })}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{t('agents.settings.settingsSnapshotImportPresetsHelp')}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {SETTINGS_SNAPSHOT_IMPORT_SCOPES.map((scope) => {
          const available = settingsSnapshotImportScopeAvailable(snapshot, scope)
          const checked = available && selectedScopes.includes(scope)
          return (
            <label
              key={scope}
              data-testid="agent-settings-snapshot-import-scope"
              data-scope={scope}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-2',
                available ? 'border-border bg-muted/20' : 'cursor-not-allowed border-border/60 bg-muted/10 opacity-60',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!available}
                onChange={(event) => onScopeChange(scope, event.target.checked)}
                className="mt-0.5 size-4 rounded border-input"
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{t(SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS[scope])}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                  {t(`agents.settings.settingsSnapshotImportScopeDetails.${scope}`)}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function SettingsSnapshotSummary({ snapshot }: { snapshot: AgentSettingsSnapshot }) {
  const { t } = useTranslation()
  return (
    <div data-testid="agent-settings-snapshot-summary" className="rounded-md border border-border bg-muted/20 p-2">
      <p className="text-xs font-medium text-foreground">{t('agents.settings.settingsSnapshotSummary')}</p>
      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.exportedAt')} value={new Date(snapshot.exportedAt).toLocaleString()} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.model')} value={snapshot.modelConfig?.model ? redactAgentTraceDebugText(snapshot.modelConfig.model) : '-'} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.profile')} value={snapshot.defaultProfileId ?? '-'} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.skills')} value={snapshot.skillPolicy?.length ?? 0} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.tools')} value={snapshot.toolPolicy?.length ?? 0} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.runPresets')} value={snapshot.runPresets?.length ?? 0} />
        <SummaryItem label={t('agents.settings.settingsSnapshotFields.activeRunPreset')} value={snapshot.activeRunPresetId ?? '-'} />
      </div>
    </div>
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

  if (entries.length === 0) {
    return (
      <div data-testid="agent-settings-audit-trail" className="space-y-2">
        <div className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
          {t('agents.settings.settingsAuditEmpty')}
        </div>
      </div>
    )
  }
  return (
    <div data-testid="agent-settings-audit-trail" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{t('agents.settings.settingsAuditHelp')}</span>
        <span className="flex shrink-0 flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => void copyAuditSummary()} data-testid="agent-settings-copy-audit">
            <Clipboard size={13} />
            {copied ? t('agents.settings.settingsAuditCopied') : t('agents.settings.copySettingsAudit')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClear} data-testid="agent-settings-clear-audit">
            <Trash2 size={13} />
            {t('agents.settings.clearSettingsAudit')}
          </Button>
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.slice(0, 8).map((entry) => {
          const isFailure = entry.action.endsWith('_failed')
          return (
            <div
              key={entry.id}
              data-testid="agent-settings-audit-entry"
              data-audit-status={isFailure ? 'failed' : 'ok'}
              className={cn(
                'rounded-md border bg-muted/20 p-2',
                isFailure ? 'border-destructive/40 bg-destructive/5' : 'border-border',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-foreground">{redactAgentTraceDebugText(entry.summary)}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Badge variant="secondary">{t(`agents.settings.auditTargets.${entry.target}`)}</Badge>
                  <Badge variant={isFailure ? 'destructive' : 'outline'}>{formatSettingsAuditAction(t, entry.action)}</Badge>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
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
    <div data-testid="agent-settings-snapshot-impact" className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{t('agents.settings.settingsSnapshotImpactPreview')}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void copySnapshotImpactSummary()} data-testid="agent-settings-copy-snapshot-impact">
          <Clipboard size={13} />
          {copied ? t('agents.settings.settingsSnapshotImpactCopied') : t('agents.settings.copySettingsSnapshotImpact')}
        </Button>
      </div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item.id} data-testid="agent-settings-snapshot-impact-item" className="flex items-start justify-between gap-2 rounded border border-border bg-muted/20 px-2 py-1.5">
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-foreground">{t(item.labelKey)}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
            </span>
            <Badge variant={item.scope === 'runtime' ? 'warning' : item.scope === 'local' ? 'secondary' : 'outline'} className="shrink-0">
              {t(`agents.settings.settingsSnapshotImpactScopes.${item.scope}`)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
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
    <button
      type="button"
      onClick={() => onSelect(preset.id)}
      className={cn(
        'rounded-md border p-2 text-left transition-colors',
        active ? 'border-ring bg-muted/50' : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{preset.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{preset.description}</p>
        </div>
        {active && <CheckCircle2 size={13} className="shrink-0 text-primary" />}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{t('agents.settings.runPresetFields.maxToolCalls')}: {preset.maxToolCalls}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{t('agents.settings.runPresetFields.maxIterations')}: {preset.maxIterations}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{t(`agents.settings.runPresetPermissionModes.${preset.permissionMode}`)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{preset.planMaxWorkers}x / {preset.planMaxTaskAttempts}r</span>
      </div>
    </button>
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
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => void copyReadinessSummary()} data-testid="agent-settings-copy-readiness">
          <Clipboard size={13} />
          {copied ? t('agents.settings.readinessCopied') : t('agents.settings.copyReadiness')}
        </Button>
      </div>
      {items.map((item) => <SettingsReadinessRow key={item.id} item={item} />)}
    </div>
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

  if (items.length === 0) {
    return (
      <div data-testid="agent-settings-action-items" className="space-y-2">
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => void copyActionItemsSummary()} data-testid="agent-settings-copy-action-items">
            <Clipboard size={13} />
            {copied ? t('agents.settings.actionItemsCopied') : t('agents.settings.copyActionItems')}
          </Button>
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-300">
          {t('agents.settings.actionItemsEmpty')}
        </div>
        {feedback && <ActionFeedback text={feedback} />}
      </div>
    )
  }
  return (
    <div data-testid="agent-settings-action-items" className="space-y-2">
      {feedback && <ActionFeedback text={feedback} />}
      <div className="flex items-center justify-between gap-2">
        <span data-testid="agent-settings-action-items-counts" className="text-[11px] text-muted-foreground">
          {t('agents.settings.actionItemsCountSummary', { actions: actionCount, warnings: warningCount })}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyActionItemsSummary()} data-testid="agent-settings-copy-action-items">
          <Clipboard size={13} />
          {copied ? t('agents.settings.actionItemsCopied') : t('agents.settings.copyActionItems')}
        </Button>
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          data-testid="agent-settings-action-item"
          className={cn(
            'rounded-md border p-2',
            item.status === 'action'
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-amber-500/40 bg-amber-500/10',
          )}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">{t(item.labelKey)}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
              {item.reasons && item.reasons.length > 0 && (
                <span data-testid="agent-settings-action-item-reasons" className="mt-1 flex flex-wrap gap-1">
                  {item.reasons.map((reason) => (
                    <span key={`${reason.labelKey}:${JSON.stringify(reason.values ?? {})}`} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t(reason.labelKey, reason.values)}
                    </span>
                  ))}
                </span>
              )}
              {item.persistHintKey && (
                <span data-testid="agent-settings-action-persist-hint" className="mt-1 block text-[10px] leading-4 text-amber-800 dark:text-amber-200">
                  {t(item.persistHintKey)}
                </span>
              )}
            </span>
            <Badge variant={item.status === 'action' ? 'destructive' : 'warning'} className="shrink-0">
              {t(`agents.settings.actionStatuses.${item.status}`)}
            </Badge>
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => onJump(item.targetSection)} data-testid="agent-settings-action-jump">
              {t('agents.settings.quickFixes.jumpToSection')}
            </Button>
            {item.quickFix && item.quickFixLabelKey && (
              <Button type="button" size="sm" variant="secondary" onClick={() => onQuickFix(item.quickFix!)} data-testid="agent-settings-action-quick-fix">
                {t(item.quickFixLabelKey)}
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function settingsSectionLabelKey(sectionId: SettingsActionItem['targetSection']): string {
  return SETTINGS_NAV_SECTIONS.find((section) => section.id === sectionId)?.labelKey ?? 'agents.settings.title'
}

function ActionFeedback({ text }: { text: string }) {
  return (
    <div data-testid="agent-settings-action-feedback" role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] leading-4 text-emerald-800 dark:text-emerald-300">
      {text}
    </div>
  )
}

function ConfigurationMapPanel({ onJump }: { onJump: (sectionId: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      {SETTINGS_NAV_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onJump(section.id)}
          className="w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
        >
          <span className="block text-xs font-medium text-foreground">{t(section.labelKey)}</span>
          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(section.descriptionKey)}</span>
        </button>
      ))}
    </div>
  )
}

function SettingsReadinessRow({ item }: { item: SettingsReadinessItem }) {
  const { t } = useTranslation()
  const icon = item.status === 'ready'
    ? <CheckCircle2 size={13} className="text-emerald-600" />
    : item.status === 'action'
      ? <XCircle size={13} className="text-destructive" />
      : <XCircle size={13} className="text-amber-600" />
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{t(item.labelKey)}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
      </span>
    </div>
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
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-medium text-foreground">{skill.name}</p>
            <Badge variant={skill.enabled === false ? 'outline' : 'success'}>{skill.enabled === false ? t('agents.settings.skillStatus.disabled') : t('agents.settings.skillStatus.enabled')}</Badge>
            <Badge variant="secondary">{skillKindLabel(skill.kind, t)}</Badge>
            <Badge variant="outline">{skillLoadModeLabel(skill.loadMode, t)}</Badge>
            {skill.version && <Badge variant="outline">v{skill.version}</Badge>}
            <Badge variant="outline">{skillSourceLabel(skill, t)}</Badge>
            <Badge variant={skillTrustLevel(skill) === 'review' ? 'warning' : skillTrustLevel(skill) === 'trusted' ? 'success' : 'secondary'}>{skillTrustLabel(skill, t)}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{skill.id}</p>
        </div>
        {typeof skill.priority === 'number' && <span className="text-[10px] text-muted-foreground">p{skill.priority}</span>}
      </div>
      {skill.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{skill.description}</p>}
      {draft && (
        <label className={cn(
          'mt-2 flex items-start gap-2 rounded bg-background px-2 py-1.5 text-[11px]',
          isCore ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
        )}>
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={isCore}
            onChange={(event) => onDraftChange(skill.id, event.target.checked)}
            className="mt-0.5 size-3.5 rounded border-input"
          />
          <span className="min-w-0">
            <span className="block font-medium text-foreground">
              {draft.enabled ? t('agents.settings.skillStatus.enabled') : t('agents.settings.skillStatus.disabled')}
            </span>
            <span className="block text-muted-foreground">
              {isCore ? t('agents.settings.skillPolicyCoreLocked') : t('agents.settings.skillPolicyToggleHelp')}
            </span>
          </span>
        </label>
      )}
      {(dependencyCount > 0 || conflictCount > 0 || (skill.tags?.length ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {dependencyCount > 0 && <span className="rounded bg-background px-1.5 py-0.5">{t('agents.settings.skillFields.dependencies')}: {dependencyCount}</span>}
          {conflictCount > 0 && <span className="rounded bg-background px-1.5 py-0.5">{t('agents.settings.skillFields.conflicts')}: {conflictCount}</span>}
          {skill.tags?.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-background px-1.5 py-0.5">{tag}</span>)}
        </div>
      )}
    </div>
  )
}

function ProfileRow({ profile, current = false, preview = false }: { profile: AgentCatalogProfile; current?: boolean; preview?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={cn(
      'rounded-md border p-2',
      current ? 'border-ring bg-muted/40' : preview ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20',
    )}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-medium text-foreground">{profile.name}</p>
            {current && <Badge variant="success">{t('agents.settings.profileStatus.current')}</Badge>}
            {preview && <Badge variant="secondary">{t('agents.settings.profileStatus.selected')}</Badge>}
            <Badge variant="secondary">v{profile.version}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{profile.id}</p>
        </div>
      </div>
      {profile.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{profile.description}</p>}
      <div className="mt-2 grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-2">
        <ProfileSummaryList label={t('agents.settings.profileFields.packs')} values={profile.enabledPacks} />
        <ProfileSummaryList label={t('agents.settings.profileFields.workflows')} values={profile.enabledWorkflows} />
        <ProfileSummaryList label={t('agents.settings.profileFields.policies')} values={profile.enabledPolicies} />
        <ProfileSummaryList label={t('agents.settings.profileFields.tools')} values={profile.toolGrants.map((grant) => `${grant.name}:${grant.mode}`)} />
      </div>
    </div>
  )
}

function ProfileDiffPanel({ diff }: { diff: ProfileDiff }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <p className="text-xs font-medium text-foreground">{t('agents.settings.profileDiffTitle')}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <ProfileDiffSectionView label={t('agents.settings.profileFields.packs')} section={diff.packs} />
        <ProfileDiffSectionView label={t('agents.settings.profileFields.workflows')} section={diff.workflows} />
        <ProfileDiffSectionView label={t('agents.settings.profileFields.policies')} section={diff.policies} />
        <ProfileDiffSectionView label={t('agents.settings.profileFields.tools')} section={diff.tools} />
      </div>
    </div>
  )
}

function ProfileDiffSectionView({ label, section }: { label: string; section: ProfileDiffSection }) {
  const { t } = useTranslation()
  const hasChanges = section.added.length > 0 || section.removed.length > 0 || (section.changed?.length ?? 0) > 0
  return (
    <div className="min-w-0 rounded bg-background px-2 py-1.5 text-[10px]">
      <p className="font-medium text-foreground">{label}</p>
      {hasChanges ? (
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          {section.added.length > 0 && <p>{t('agents.settings.profileDiffAdded')}: {section.added.slice(0, 4).join(', ')}</p>}
          {section.removed.length > 0 && <p>{t('agents.settings.profileDiffRemoved')}: {section.removed.slice(0, 4).join(', ')}</p>}
          {(section.changed?.length ?? 0) > 0 && <p>{t('agents.settings.profileDiffChanged')}: {section.changed!.slice(0, 4).join(', ')}</p>}
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">{t('agents.settings.profileDiffNoChange')}</p>
      )}
    </div>
  )
}

function ProfileSummaryList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0 rounded bg-background px-2 py-1">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 truncate">{values.length > 0 ? values.slice(0, 3).join(', ') : '-'}</p>
    </div>
  )
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
    <div data-testid="agent-settings-tool-policy-diff" className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <span>
          <p className="text-xs font-medium text-foreground">{t('agents.settings.toolPolicyDiffPreview')}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            {t('agents.settings.toolPolicyDiffSummary', { added, removed, changed })}
          </p>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyToolPolicyDiffSummary()} data-testid="agent-settings-copy-tool-policy-diff">
          <Clipboard size={13} />
          {copied ? t('agents.settings.toolPolicyDiffCopied') : t('agents.settings.copyToolPolicyDiff')}
        </Button>
      </div>
      <div className="mt-2 space-y-1.5">
        {items.slice(0, 8).map((item) => (
          <div key={`${item.change}:${item.name}`} data-testid="agent-settings-tool-policy-diff-item" className="flex items-start justify-between gap-2 rounded border border-border bg-muted/20 px-2 py-1.5">
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-foreground">{item.name}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                {formatToolPolicyDiffValue(t, item.beforeMode, item.beforeApproval)} {'->'} {formatToolPolicyDiffValue(t, item.afterMode, item.afterApproval)}
              </span>
            </span>
            <Badge variant={item.change === 'removed' ? 'warning' : item.change === 'added' ? 'success' : 'secondary'} className="shrink-0">
              {t(`agents.settings.toolPolicyDiffChangeTypes.${item.change}`)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
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
    <div className={cn(
      'rounded-md border p-2',
      tool.available ? 'border-border bg-muted/20' : 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20',
    )}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-medium text-foreground">{tool.name}</p>
            <Badge variant={tool.available ? 'success' : 'warning'}>{tool.available ? t('agents.settings.toolPolicyStatus.available') : t('agents.settings.toolPolicyStatus.blocked')}</Badge>
            {profileGranted && <Badge variant="secondary">{t('agents.settings.toolPolicyStatus.profileGranted')}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {tool.source} / {tool.permission ?? t('agents.settings.toolPolicyValues.none')} / {tool.risk ?? t('agents.settings.toolPolicyValues.unknown')}
          </p>
        </div>
        <Badge variant={tool.requiresApproval ? 'warning' : 'outline'}>{tool.approval}</Badge>
      </div>
      {tool.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>}
      {draft && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{t('agents.settings.toolPolicyFields.mode')}</label>
            <Select value={draft.mode} onValueChange={(value) => onDraftChange(tool.name, { mode: value as ToolGrantDraft['mode'] })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow" disabled={!canAllow}>{t('agents.settings.toolPolicyModes.allow')}</SelectItem>
                <SelectItem value="deny">{t('agents.settings.toolPolicyModes.deny')}</SelectItem>
              </SelectContent>
            </Select>
            {!canAllow && (
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{t('agents.settings.toolPolicyAllowDisabled')}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{t('agents.settings.toolPolicyFields.approval')}</label>
            <Select value={draft.approval ?? 'never'} onValueChange={(value) => onDraftChange(tool.name, { approval: value as NonNullable<ToolGrantDraft['approval']> })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{t('agents.settings.toolPolicyApprovals.never')}</SelectItem>
                <SelectItem value="on_write">{t('agents.settings.toolPolicyApprovals.onWrite')}</SelectItem>
                <SelectItem value="always">{t('agents.settings.toolPolicyApprovals.always')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        <span className="rounded bg-background px-1.5 py-0.5">
          {t('agents.settings.toolPolicyFields.registered')}: {tool.registered ? t('agents.settings.toolPolicyValues.yes') : t('agents.settings.toolPolicyValues.no')}
        </span>
        <span className="rounded bg-background px-1.5 py-0.5">
          {t('agents.settings.toolPolicyFields.granted')}: {tool.granted ? t('agents.settings.toolPolicyValues.yes') : t('agents.settings.toolPolicyValues.no')}
        </span>
        {tool.projectScoped && <span className="rounded bg-background px-1.5 py-0.5">{t('agents.settings.toolPolicyFields.projectScoped')}</span>}
        {tool.unavailableReason && <span className="rounded bg-background px-1.5 py-0.5 text-amber-700 dark:text-amber-300">{tool.unavailableReason}</span>}
      </div>
    </div>
  )
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
    <div data-testid="agent-settings-api-mode-capabilities" className="rounded-md border border-border bg-muted/20 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{t('agents.settings.apiModeCapabilityPanel')}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.apiModeCapabilityHelp')}</p>
        </div>
        <Badge variant={apiModeCapabilityBadgeVariant(mode.badge)} className="shrink-0">
          {t(`agents.settings.apiModeCapabilityBadges.${mode.badge}`)}
        </Badge>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="agent-settings-api-mode-capability-items">
        {mode.itemKeys.map((itemKey) => (
          <div key={itemKey} data-testid="agent-settings-api-mode-capability-item" className="rounded border border-border bg-background px-2 py-1.5">
            <p className="text-[11px] font-medium leading-4 text-foreground">{t(`agents.settings.apiModeCapabilityItems.${itemKey}.label`)}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{t(`agents.settings.apiModeCapabilityItems.${itemKey}.detail`)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelCompatibilityProbePanel({ probes }: { probes: ModelCompatibilityProbe[] }) {
  const { t } = useTranslation()
  return (
    <div data-testid="agent-settings-model-compatibility-probes" className="rounded-md border border-border bg-background p-2">
      <p className="text-xs font-medium text-foreground">{t('agents.settings.modelCompatibilityPanel')}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.modelCompatibilityHelp')}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {probes.map((probe) => (
          <div key={probe.id} data-testid="agent-settings-model-compatibility-probe" className="rounded border border-border bg-muted/20 px-2 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-[11px] font-medium leading-4 text-foreground">{t(probe.labelKey)}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(probe.detailKey, probe.detailValues)}</span>
              </span>
              <Badge variant={probe.status === 'ready' ? 'success' : probe.status === 'warning' ? 'warning' : 'destructive'} className="shrink-0">
                {t(`agents.settings.modelCompatibilityStatuses.${probe.status}`)}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
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
    <div data-testid="agent-settings-api-mode-migration-guide" data-api-kind={apiKind} className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <p className="text-xs font-medium text-foreground">{t('agents.settings.apiModeMigrationGuide')}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t(`agents.settings.apiModeMigration.${apiKind}.detail`)}</p>
        </span>
        {apiKind === 'openai_chat_completions' && (
          <Button type="button" size="sm" variant="outline" onClick={onSwitchToResponses} data-testid="agent-settings-switch-responses-from-migration">
            {t('agents.settings.switchToResponses')}
          </Button>
        )}
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {stepKeys.map((stepKey, index) => (
          <div key={stepKey} data-testid="agent-settings-api-mode-migration-step" className="rounded border border-border bg-muted/20 px-2 py-1.5">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('agents.settings.apiModeMigrationStep', { index: index + 1 })}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-foreground">{t(`agents.settings.apiModeMigrationSteps.${stepKey}`)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ApiModeSwitchPlanPanel({ apiKind, items }: { apiKind: RuntimeModelAPIKind; items: ApiModeSwitchPlanItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const actionCount = items.filter((item) => item.status === 'action').length
  const warningCount = items.filter((item) => item.status === 'warning').length
  async function copySwitchPlan() {
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
    <div data-testid="agent-settings-api-mode-switch-plan" className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <p className="text-xs font-medium text-foreground">{t('agents.settings.apiModeSwitchPlanTitle')}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {t('agents.settings.apiModeSwitchPlanHelp', { actions: actionCount, warnings: warningCount })}
          </p>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void copySwitchPlan()} data-testid="agent-settings-copy-api-mode-switch-plan">
          <Clipboard size={13} />
          {copied ? t('agents.settings.apiModeSwitchPlanCopied') : t('agents.settings.copyApiModeSwitchPlan')}
        </Button>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} data-testid="agent-settings-api-mode-switch-plan-item" className="rounded border border-border bg-muted/20 px-2 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-[11px] font-medium leading-4 text-foreground">{t(item.labelKey)}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
              </span>
              <Badge variant={item.status === 'ready' ? 'success' : item.status === 'warning' ? 'warning' : 'destructive'} className="shrink-0">
                {t(`agents.settings.modelCompatibilityStatuses.${item.status}`)}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function apiModeCapabilityBadgeVariant(badge: 'recommended' | 'managed' | 'compatibility' | 'providerNative') {
  if (badge === 'recommended') return 'success'
  if (badge === 'managed') return 'secondary'
  if (badge === 'providerNative') return 'warning'
  return 'outline'
}

function Panel({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bot size={13} className="text-muted-foreground" />
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function ToggleRow({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 p-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function SummaryItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value ?? '-'}</p>
    </div>
  )
}

function InlineError({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{children}</div>
}

function StateMessage({ icon, text, tone = 'muted' }: { icon: React.ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md border p-3 text-sm',
      tone === 'danger' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/20 text-muted-foreground',
    )}>
      {icon}
      <span>{text}</span>
    </div>
  )
}

import { useRef, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, Clipboard, Copy, Download, Loader2, Plus, RefreshCw, Save, Settings, TestTube2, Trash2, Upload, XCircle } from 'lucide-react'
import {
  AgentDataBlock,
  AgentSettingsApiModeCapabilityMatrix,
  AgentSettingsActionButton,
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
  AgentSettingsMigrationGuide,
  AgentSettingsKeyValue,
  AgentSettingsLayout,
  AgentSettingsMain,
  AgentSettingsModelOptionButton,
  AgentSettingsModelRouteCard,
  AgentSettingsPanel,
  AgentSettingsConfigFileCard,
  AgentSettingsConfigFileBrowser,
  AgentSettingsConfigFileDiffPanel,
  AgentSettingsConfigFileEditor,
  AgentSettingsConfigFileEditorHeader,
  AgentSettingsConfigFileEditorPane,
  AgentSettingsConfigFileEditorSection,
  AgentSettingsConfigFileList,
  AgentSettingsConfigFileListButton,
  AgentSettingsScopeBadge,
  AgentSettingsScopeRail,
  AgentSettingsSelectTrigger,
  AgentSettingsSidebar,
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
  AgentSettingsToolPermissionsBulkActionPanel,
  AgentSettingsToolPermissionsDiffPanel,
  AgentSettingsToolPermissionsFilterPanel,
  AgentSettingsToolPermissionsFilterPresetPanel,
  AgentSettingsToolPermissionsRow,
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
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { buildConfigFileExportText, buildSettingsSnapshot, parseConfigFileExport, parseSettingsSnapshot, validateSettingsSnapshotReferences, type AgentSettingsSnapshot, type ConfigFileToolPermissionOverrides, type RuntimeModelAPIKind, type SkillConfigWorkspace, type ToolGrantWorkspace } from '@/features/agent/domain/agentSettingsSnapshot'
import { hasSensitiveTextSecret, hasSensitiveURLSecret, redactAgentTraceDebugText, stripSensitiveURLSecrets } from '@/features/agent/domain/agentTraceDebugData'
import { AGENT_BACKEND_MODEL_CAPABILITY_QUERY, fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { localAgentClient, type AgentCapabilitiesResponse, type AgentCatalogConfigFile, type AgentCatalogSkill, type AgentDebugTool, type AgentInspectResponse, type RuntimeModelConfigPublic, type RuntimeModelTestResult } from '@/shared/infrastructure/localAgentClient'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { agentConfigStatusRecipe, agentTestResultRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { useAgentStore, type AgentSettingsAuditEntry, type AgentSettingsConfigFileBackup, type AgentToolPermissionsFilterPreset } from '@/features/agent/state/agentStore'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import type { PublicModel } from '@/types'

const NO_MODEL_VALUE = '__none'
const DEFAULT_API_KIND: RuntimeModelAPIKind = 'openai_responses'
const MAX_SETTINGS_SNAPSHOT_BYTES = 1024 * 1024
const MAX_CONFIG_FILE_BYTES = 256 * 1024
const TOOL_PERMISSIONS_FILTER_OPTIONS = ['all', 'available', 'blocked', 'config_file_granted', 'requires_approval', 'write_risk'] as const
const AGENT_SETTINGS_UI_CONTRACT_MARKERS = [
  'data-testid="agent-settings-api-mode-capabilities"',
  'data-testid="agent-settings-api-mode-capability-item"',
  'data-testid="agent-settings-api-mode-switch-taskGraph"',
  'data-testid="agent-settings-copy-api-mode-switch-taskGraph"',
  'data-testid="agent-settings-api-mode-switch-taskGraph-item"',
  'data-testid="agent-settings-snapshot-impact"',
  'data-testid="agent-settings-snapshot-impact-item"',
  'data-testid="agent-settings-copy-snapshot-impact"',
  "value={snapshot.model?.model ? redactAgentTraceDebugText(snapshot.model.model) : '-'}",
  "{t('agents.settings.modelRouteModel')}: {redactAgentTraceDebugText(route.model)}",
  "data-audit-status={isFailure ? 'failed' : 'ok'}",
  "variant={isFailure ? 'soft' : 'outline'}",
  'data-testid="agent-settings-audit-trail"',
  'data-testid="agent-settings-audit-entry"',
  'data-testid="agent-settings-copy-audit"',
  'data-testid="agent-settings-clear-audit"',
  'data-testid="agent-settings-copy-readiness"',
  'data-testid="agent-settings-snapshot-summary"',
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
  { id: 'agent-settings-config-files', labelKey: 'agents.settings.configFilesPanel', descriptionKey: 'agents.settings.sectionDescriptions.configFiles' },
  { id: 'agent-settings-installed-capabilities', labelKey: 'agents.settings.installedCapabilitiesPanel', descriptionKey: 'agents.settings.sectionDescriptions.installedCapabilities' },
  { id: 'agent-settings-skills', labelKey: 'agents.settings.skillsPanel', descriptionKey: 'agents.settings.sectionDescriptions.skills' },
  { id: 'agent-settings-tools', labelKey: 'agents.settings.toolPermissionsPanel', descriptionKey: 'agents.settings.sectionDescriptions.tools' },
  { id: 'agent-settings-model', labelKey: 'agents.settings.modelPanel', descriptionKey: 'agents.settings.sectionDescriptions.model' },
  { id: 'agent-settings-snapshot', labelKey: 'agents.settings.settingsSnapshotPanel', descriptionKey: 'agents.settings.sectionDescriptions.snapshot' },
] as const
const CONFIG_FILE_LIMIT_KEYS = [
  'maxToolCalls',
  'maxIterations',
  'contextWindowCharLimit',
  'systemPromptCharLimit',
  'maxRetrievedContextChars',
  'maxHistoryMessages',
  'maxThreadSummaryChars',
  'maxActiveTriggeredSkills',
  'maxReferenceCharsPerRun',
  'maxReferenceChunksPerRun',
] as const
const CONFIG_FILE_APPROVAL_DEFAULT_KEYS = ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'] as const
const CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS = ['inherit', 'never', 'on_write', 'always'] as const

type SkillConfigIssue = { type: 'dependency' | 'conflict'; skillId: string; relatedSkillId: string }
type ConfigFileLimitKey = (typeof CONFIG_FILE_LIMIT_KEYS)[number]
type ConfigFileApprovalDefaultKey = (typeof CONFIG_FILE_APPROVAL_DEFAULT_KEYS)[number]
type ConfigFileApprovalDefaultWorkspaceValue = (typeof CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS)[number]
type ConfigFileDiffSection = { added: string[]; removed: string[]; changed?: string[] }
type ConfigFileDiff = {
  packs: ConfigFileDiffSection
  skills: ConfigFileDiffSection
  tools: ConfigFileDiffSection
  approvalDefaults: ConfigFileDiffSection
  limits: ConfigFileDiffSection
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
type ToolPermissionsWorkspaceIssue = {
  toolName: string
  reasonKey: string
  values?: Record<string, string | number>
}
type ToolPermissionsDiffItem = {
  name: string
  change: 'added' | 'removed' | 'changed'
  beforeMode?: ToolGrantWorkspace['mode']
  afterMode?: ToolGrantWorkspace['mode']
  beforeApproval?: ToolGrantWorkspace['approval']
  afterApproval?: ToolGrantWorkspace['approval']
}
type SkillSourceKind = 'core' | 'plugin' | 'local' | 'team' | 'mcp' | 'catalog'
type ToolPermissionsFilter = AgentToolPermissionsFilterPreset['filter']
type ToolPermissionsBulkAction = 'allow_available' | 'deny' | 'approval_never' | 'approval_on_write' | 'approval_always'
const SKILL_SOURCE_FILTERS = ['all', 'core', 'plugin', 'local', 'team', 'mcp', 'catalog'] as const
type SkillSourceFilter = (typeof SKILL_SOURCE_FILTERS)[number]
type SettingsSnapshotImportScope = 'model' | 'configFile' | 'limits' | 'skills' | 'tools'
type SettingsSnapshotImportPresetId = 'all' | 'model-routing' | 'skills-tools' | 'limits'
type SettingsSnapshotImpactItem = {
  id: SettingsSnapshotImportScope
  scope: 'config' | 'local' | 'skipped'
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
const SETTINGS_SNAPSHOT_IMPORT_SCOPES: SettingsSnapshotImportScope[] = ['model', 'configFile', 'limits', 'skills', 'tools']
const SETTINGS_SNAPSHOT_IMPORT_PRESETS: Array<{ id: SettingsSnapshotImportPresetId; scopes: SettingsSnapshotImportScope[] }> = [
  { id: 'all', scopes: SETTINGS_SNAPSHOT_IMPORT_SCOPES },
  { id: 'model-routing', scopes: ['model'] },
  { id: 'skills-tools', scopes: ['skills', 'tools'] },
  { id: 'limits', scopes: ['limits'] },
]
const SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS: Record<SettingsSnapshotImportScope, string> = {
  model: 'agents.settings.settingsSnapshotImpact.model',
  configFile: 'agents.settings.settingsSnapshotImpact.configFile',
  limits: 'agents.settings.settingsSnapshotImpact.limits',
  skills: 'agents.settings.settingsSnapshotImpact.skills',
  tools: 'agents.settings.settingsSnapshotImpact.tools',
}
type SettingsActionQuickFix =
  | 'reset-model-workspace'
  | 'confirm-clear-model-config'
  | 'enable-chat-route'
  | 'switch-openai-responses'
  | 'strip-sensitive-base-url-query'
  | 'reset-config-file-workspace'
  | 'reset-skill-config-workspace'
  | 'fix-tool-permissions-workspace-issues'
  | 'reset-tool-permissions-workspace'
type SettingsQuickFixAuditKind =
  | 'workspace_reset'
  | 'workspace_repair'
  | 'sensitive_cleanup'
  | 'mode_migration'
  | 'route_enable'
  | 'clear_confirmation'
export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const configFileInputRef = useRef<HTMLInputElement | null>(null)
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
  const [skillWorkspaces, setSkillWorkspaces] = useState<SkillConfigWorkspace[]>([])
  const [skillConfigSaving, setSkillConfigSaving] = useState(false)
  const [skillConfigSaveError, setSkillConfigSaveError] = useState<string | null>(null)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillSourceFilter, setSkillSourceFilter] = useState<SkillSourceFilter>('all')
  const [selectedConfigFileId, setSelectedConfigFileId] = useState('')
  const [configFileNameWorkspace, setConfigFileNameWorkspace] = useState('')
  const [configFileDescriptionWorkspace, setConfigFileDescriptionWorkspace] = useState('')
  const [configFileLimitWorkspaces, setConfigFileLimitWorkspaces] = useState<Record<ConfigFileLimitKey, string>>(() => emptyConfigFileLimitWorkspaces())
  const [configFileApprovalDefaultWorkspaces, setConfigFileApprovalDefaultWorkspaces] = useState<Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>>(() => emptyConfigFileApprovalDefaultWorkspaces())
  const [configFileSaving, setConfigFileSaving] = useState(false)
  const [configFileManaging, setConfigFileManaging] = useState(false)
  const [configFileSaveError, setConfigFileSaveError] = useState<string | null>(null)
  const [configFileMessage, setConfigFileMessage] = useState<string | null>(null)
  const [toolGrantWorkspaces, setToolGrantWorkspaces] = useState<ToolGrantWorkspace[]>([])
  const [toolPermissionsSaving, setToolPermissionsSaving] = useState(false)
  const [toolPermissionsSaveError, setToolPermissionsSaveError] = useState<string | null>(null)
  const [toolPermissionsSearch, setToolPermissionsSearch] = useState('')
  const [toolPermissionsFilter, setToolPermissionsFilter] = useState<ToolPermissionsFilter>('all')
  const [settingsSnapshotText, setSettingsSnapshotText] = useState('')
  const [settingsSnapshotFileName, setSettingsSnapshotFileName] = useState<string | null>(null)
  const [settingsSnapshotImporting, setSettingsSnapshotImporting] = useState(false)
  const [settingsSnapshotImportScopes, setSettingsSnapshotImportScopes] = useState<SettingsSnapshotImportScope[]>([...SETTINGS_SNAPSHOT_IMPORT_SCOPES])
  const [settingsSnapshotError, setSettingsSnapshotError] = useState<string | null>(null)
  const [settingsSnapshotMessage, setSettingsSnapshotMessage] = useState<string | null>(null)
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<string | null>(null)
  const [settingsStatusCopied, setSettingsStatusCopied] = useState(false)
  const settingsImportBackup = agentSettings.lastImportBackup
  const configFileRollbackBackup = agentSettings.lastConfigFileBackup
  const runtimeQuery = useQuery({
    queryKey: ['agent-settings-runtime-model', localAgentClient.baseURL],
    queryFn: () => localAgentClient.getWorkspaceModelConfig(),
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
    queryKey: ['agent-settings-tool-permissions', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getCapabilities()
    },
    retry: false,
  })
  const baseURLValue = baseURL.trim()
  const usesBackendCompatibleBaseURL = isBackendCompatibleBaseURL(baseURLValue)
  const usesModelCatalog = !baseURLValue || usesBackendCompatibleBaseURL
  const usesManualModelId = !usesModelCatalog
  const modelsQuery = useQuery<PublicModel[]>({
    queryKey: ['models', 'agent-backend', AGENT_BACKEND_MODEL_CAPABILITY_QUERY, baseURLValue || 'default-backend'],
    queryFn: () => fetchAgentBackendModels(),
    enabled: usesModelCatalog,
  })

  const textModels = modelsQuery.data ?? []
  const selectedModel = useMemo(() => {
    return textModels.find((model) => publicModelId(model) === selectedModelId) ?? null
  }, [selectedModelId, textModels])
  const directModelIdValue = directModelId.trim()
  const directModelIdHasSecret = usesManualModelId && hasSensitiveTextSecret(directModelIdValue)
  const workspaceModelValue = usesModelCatalog ? (selectedModel ? publicModelId(selectedModel) : '') : directModelIdValue
  const modelValueMissing = !workspaceModelValue
  const canSaveModelConfig = Boolean(workspaceModelValue) && !directModelIdHasSecret
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
  const filteredSkills = useMemo(() => filterSkills(catalogQuery.data?.skills ?? [], {
    search: skillSearch,
    source: skillSourceFilter,
  }), [catalogQuery.data?.skills, skillSearch, skillSourceFilter])
  const toolStats = useMemo(() => buildToolStats(capabilitiesQuery.data?.resolvedTools), [capabilitiesQuery.data?.resolvedTools])
  const currentConfigFileId = useMemo(() => currentAgentConfigFileId(catalogQuery.data), [catalogQuery.data])
  const currentConfigFile = useMemo(() => {
    const configFiles = catalogQuery.data?.configFiles ?? []
    return configFiles.find((configFile) => configFile.id === currentConfigFileId) ?? configFiles[0] ?? null
  }, [catalogQuery.data?.configFiles, currentConfigFileId])
  const selectedConfigFile = useMemo(() => {
    const configFiles = catalogQuery.data?.configFiles ?? []
    return configFiles.find((configFile) => configFile.id === selectedConfigFileId) ?? currentConfigFile
  }, [catalogQuery.data?.configFiles, currentConfigFile, selectedConfigFileId])
  const selectedConfigFileEditable = isManagedConfigFile(selectedConfigFile)
  const selectedConfigFileReadonly = Boolean(selectedConfigFile && !selectedConfigFileEditable)
  const skillConfigBaseline = useMemo(() => buildSkillConfigWorkspaces(catalogQuery.data?.skills ?? [], selectedConfigFile), [catalogQuery.data?.skills, selectedConfigFile])
  const skillWorkspaceById = useMemo(() => new Map(skillWorkspaces.map((workspace) => [workspace.id, workspace])), [skillWorkspaces])
  const selectedConfigFileDiff = useMemo(
    () => currentConfigFile && selectedConfigFile && currentConfigFile.id !== selectedConfigFile.id
      ? buildConfigFileDiff(currentConfigFile, selectedConfigFile, t)
      : null,
    [currentConfigFile, selectedConfigFile, t],
  )
  const configFileNameWorkspaceValue = configFileNameWorkspace.trim()
  const configFileDescriptionWorkspaceValue = configFileDescriptionWorkspace.trim()
  const normalizedConfigFileLimitWorkspaces = useMemo(() => normalizeConfigFileLimitWorkspaces(configFileLimitWorkspaces), [configFileLimitWorkspaces])
  const normalizedConfigFileApprovalDefaultWorkspaces = useMemo(() => normalizeConfigFileApprovalDefaultWorkspaces(configFileApprovalDefaultWorkspaces), [configFileApprovalDefaultWorkspaces])
  const hasConfigFileDetailsChange = Boolean(
    selectedConfigFile
    && (
      configFileNameWorkspaceValue !== selectedConfigFile.name
      || configFileDescriptionWorkspaceValue !== (selectedConfigFile.description ?? '')
      || configFileLimitSignature(normalizedConfigFileLimitWorkspaces) !== configFileLimitSignature(selectedConfigFile.limits)
      || configFileApprovalDefaultSignature(normalizedConfigFileApprovalDefaultWorkspaces) !== configFileApprovalDefaultSignature(selectedConfigFile.approvalDefaults)
    ),
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
  const settingsSnapshotNeedsCatalog = Boolean(selectedSettingsSnapshotForImport?.configFiles || selectedSettingsSnapshotForImport?.runtimeLimits || selectedSettingsSnapshotForImport?.activeConfigFileId || selectedSettingsSnapshotForImport?.skillConfig || selectedSettingsSnapshotForImport?.toolPermissionOverrides)
  const settingsSnapshotNeedsCapabilities = Boolean(selectedSettingsSnapshotForImport?.toolPermissionOverrides)
  const settingsSnapshotNeedsModelCatalog = Boolean(selectedSettingsSnapshotForImport?.model?.model.startsWith('model_config:') || selectedSettingsSnapshotForImport?.model?.platformModelId)
  const settingsSnapshotReferenceIssues = useMemo(() => (
    selectedSettingsSnapshotForImport && (!settingsSnapshotNeedsCatalog || catalogQuery.data) && (!settingsSnapshotNeedsModelCatalog || modelsQuery.data)
      ? validateSettingsSnapshotReferences(selectedSettingsSnapshotForImport, {
        textModels: modelsQuery.data,
        configFiles: catalogQuery.data?.configFiles ?? [],
        currentConfigFile,
        skills: catalogQuery.data?.skills ?? [],
      })
      : []
  ), [catalogQuery.data, currentConfigFile, modelsQuery.data, selectedSettingsSnapshotForImport, settingsSnapshotNeedsCatalog, settingsSnapshotNeedsModelCatalog])
  const settingsSnapshotCanImport = Boolean(
    parsedSettingsSnapshot
    && settingsSnapshotHasSelectedImportScope
    && settingsSnapshotReferenceIssues.length === 0
    && (!settingsSnapshotNeedsCatalog || catalogQuery.data)
    && (!settingsSnapshotNeedsCapabilities || capabilitiesQuery.data)
    && (!settingsSnapshotNeedsModelCatalog || modelsQuery.data),
  )
  const currentToolGrants = useMemo(() => new Set((selectedConfigFile?.toolGrants ?? []).map((grant) => grant.name)), [selectedConfigFile])
  const toolGrantBaseline = useMemo(
    () => buildToolGrantWorkspaces(selectedConfigFile),
    [selectedConfigFile],
  )
  const toolGrantWorkspaceByName = useMemo(() => new Map(toolGrantWorkspaces.map((grant) => [grant.name, grant])), [toolGrantWorkspaces])
  const toolPermissionsDiffItems = useMemo(() => buildToolPermissionsDiffItems(toolGrantBaseline, toolGrantWorkspaces), [toolGrantBaseline, toolGrantWorkspaces])
  const toolPermissionsFilteredTools = useMemo(() => {
    const tools = capabilitiesQuery.data?.resolvedTools.discovered ?? []
    const query = toolPermissionsSearch.trim().toLowerCase()
    return [...tools]
      .filter((tool) => toolPermissionsFilterMatches(tool, toolPermissionsFilter, currentToolGrants))
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
      .sort((a, b) => toolPermissionsRank(a) - toolPermissionsRank(b) || a.name.localeCompare(b.name))
      .slice(0, 80)
  }, [capabilitiesQuery.data?.resolvedTools.discovered, currentToolGrants, toolPermissionsFilter, toolPermissionsSearch])
  const hasUnsavedChanges = effectiveConfig?.configured
    ? workspaceModelValue !== effectiveModelValue ||
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
    modelValue: workspaceModelValue,
    baseURL: baseURLValue,
    apiKeyProvided: modelApiKeyProvided,
    usesBackendCompatibleBaseURL,
    modelBaseURLHasSecret,
    directModelIdHasSecret,
    useForChat,
    useForPlanner,
    effectiveConfig,
  }), [baseURLValue, directModelIdHasSecret, workspaceModelValue, effectiveConfig, modelApiKeyProvided, modelBaseURLHasSecret, selectedApiKind, useForChat, useForPlanner, usesBackendCompatibleBaseURL])
  const apiModeSwitchTaskGraph = useMemo(() => buildApiModeSwitchTaskGraph({
    selectedApiKind,
    probes: modelCompatibilityProbes,
    hasUnsavedChanges,
  }), [hasUnsavedChanges, modelCompatibilityProbes, selectedApiKind])
  const hasConfigFileChange = Boolean(selectedConfigFileId && currentConfigFile && selectedConfigFileId !== currentConfigFile.id)
  const skillConfigChanges = useMemo(() => buildSkillConfigChanges(skillWorkspaces, skillConfigBaseline), [skillWorkspaces, skillConfigBaseline])
  const workspaceSkillIds = useMemo(() => buildConfigFileSkillIds(skillWorkspaces), [skillWorkspaces])
  const hasSkillConfigSelectionChange = Boolean(selectedConfigFile && stringListSignature(workspaceSkillIds) !== stringListSignature(selectedConfigFile.skillIds))
  const hasSkillConfigChange = skillConfigChanges.length > 0
  const skillConfigIssues = useMemo(
    () => buildSkillConfigIssues(catalogQuery.data?.skills ?? [], skillWorkspaces, skillConfigBaseline),
    [catalogQuery.data?.skills, skillWorkspaces, skillConfigBaseline],
  )
  const hasToolPermissionsChange = toolGrantSignature(toolGrantWorkspaces) !== toolGrantSignature(toolGrantBaseline)
  const toolPermissionsWorkspaceIssues = useMemo(() => buildToolPermissionsWorkspaceIssues({
    workspaces: toolGrantWorkspaces,
    currentConfigFile: selectedConfigFile,
    tools: capabilitiesQuery.data?.resolvedTools,
  }), [capabilitiesQuery.data?.resolvedTools, selectedConfigFile, toolGrantWorkspaces])
  const readinessItems = useMemo(() => buildSettingsReadinessItems({
    effectiveConfig,
    selectedApiKind,
    savedDirectModelIdHasSecret,
    modelRoutes,
    modelRouteIssues,
    currentConfigFile,
    skillConfigIssues,
    toolPermissionsWorkspaceIssues,
    skillStats,
    toolStats,
    hasUnsavedChanges,
    hasConfigFileChange,
    hasSkillConfigChange,
    hasToolPermissionsChange,
  }), [
    currentConfigFile,
    effectiveConfig,
    savedDirectModelIdHasSecret,
    selectedApiKind,
    hasConfigFileChange,
    hasSkillConfigChange,
    hasToolPermissionsChange,
    hasUnsavedChanges,
    modelRouteIssues,
    modelRoutes,
    skillConfigIssues,
    toolPermissionsWorkspaceIssues,
    skillStats,
    toolStats,
  ])
  const settingsActionItems = useMemo(() => buildSettingsActionItems({
    effectiveConfig,
    selectedApiKind,
    workspaceBaseURL: baseURL,
    savedDirectModelIdHasSecret,
    modelRoutes,
    modelRouteIssues,
    currentConfigFile,
    skillConfigIssues,
    toolPermissionsWorkspaceIssues,
    toolStats,
    tools: capabilitiesQuery.data?.resolvedTools,
    hasUnsavedChanges,
    hasConfigFileChange,
    hasSkillConfigChange,
    hasToolPermissionsChange,
  }), [
    currentConfigFile,
    effectiveConfig,
    savedDirectModelIdHasSecret,
    selectedApiKind,
    hasConfigFileChange,
    hasSkillConfigChange,
    hasToolPermissionsChange,
    hasUnsavedChanges,
    baseURL,
    modelRouteIssues,
    modelRoutes,
    skillConfigIssues,
    toolPermissionsWorkspaceIssues,
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
    if (currentConfigFile?.id) setSelectedConfigFileId(currentConfigFile.id)
  }, [currentConfigFile?.id])

  useEffect(() => {
    setConfigFileNameWorkspace(selectedConfigFile?.name ?? '')
    setConfigFileDescriptionWorkspace(selectedConfigFile?.description ?? '')
    setConfigFileLimitWorkspaces(configFileLimitWorkspacesFromConfigFile(selectedConfigFile))
    setConfigFileApprovalDefaultWorkspaces(configFileApprovalDefaultWorkspacesFromConfigFile(selectedConfigFile))
  }, [selectedConfigFile?.approvalDefaults, selectedConfigFile?.description, selectedConfigFile?.id, selectedConfigFile?.name, selectedConfigFile?.limits])

  useEffect(() => {
    setSkillWorkspaces(skillConfigBaseline)
  }, [skillConfigBaseline])

  useEffect(() => {
    setToolGrantWorkspaces(toolGrantBaseline)
  }, [toolGrantBaseline])

  useEffect(() => {
    setModelConfigClearConfirming(false)
  }, [baseURL, workspaceModelValue, modelApiKey, selectedApiKind, useForChat, useForPlanner])

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
    if (!workspaceModelValue) return
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
      const nextConfig = await localAgentClient.saveWorkspaceModelConfig({
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: workspaceModelValue,
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
    if (!workspaceModelValue) return
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
      await localAgentClient.saveWorkspaceModelConfig({
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: workspaceModelValue,
        apiKind: selectedApiKind,
        ...(baseURLValue ? { baseURL: baseURLValue } : {}),
        ...(modelApiKey.trim() ? { apiKey: modelApiKey.trim() } : {}),
        useForChat,
        useForPlanner,
      })
      updateAgentSettings({ modelId: usesModelCatalog && selectedModel ? selectedModel.id : null })
      await localAgentClient.ensureRunning()
      const result = await localAgentClient.testModelConfig({
        message: testMessage.trim() || t('agents.settings.testMessageDefault'),
        ...(usesModelCatalog && selectedModel ? { modelConfigId: selectedModel.id } : {}),
        model: workspaceModelValue,
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
      const nextConfig = await localAgentClient.clearWorkspaceModelConfig()
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

  async function saveConfigFileSkillActivation() {
    if (!selectedConfigFile) {
      setSkillConfigSaveError(t('agents.settings.configFileMissing'))
      return
    }
    if (!selectedConfigFileEditable) {
      setSkillConfigSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    setSkillConfigSaving(true)
    setSkillConfigSaveError(null)
    const rollbackConfigFile = duplicateSnapshotConfigFile(selectedConfigFile)
    try {
      await localAgentClient.ensureRunning()
      if (hasSkillConfigSelectionChange) {
        await localAgentClient.saveAgentConfigFile({
          configFile: {
            ...selectedConfigFile,
            skillIds: workspaceSkillIds,
            metadata: { ...(selectedConfigFile.metadata ?? {}), managed: true },
          },
          activate: selectedConfigFile.id === currentConfigFile?.id,
        })
        updateAgentSettings({
          lastConfigFileBackup: buildConfigFileRollbackBackup({
            configFile: rollbackConfigFile,
            activeConfigFileId: currentConfigFile?.id ?? null,
          }),
        })
      }
      await catalogQuery.refetch()
      recordSettingsAudit({
        action: 'skill_config_saved',
        target: 'skills',
        summary: t('agents.settings.auditSummaries.skillConfigSaved', { count: workspaceSkillIds.length }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSkillConfigSaveError(message)
      recordSettingsOperationFailure('skills', t('agents.settings.skillsPanel'), message)
    } finally {
      setSkillConfigSaving(false)
    }
  }

  function updateSkillWorkspace(id: string, enabled: boolean) {
    setSkillWorkspaces((workspaces) => workspaces.map((workspace) => workspace.id === id ? { ...workspace, enabled } : workspace))
  }

  async function saveActiveConfigFile() {
    if (!selectedConfigFileId) return
    const rollbackConfigFile = currentConfigFile ? duplicateSnapshotConfigFile(currentConfigFile) : null
    setConfigFileSaving(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveActiveAgentConfigFile({ configFileId: selectedConfigFileId })
      if (rollbackConfigFile) {
        updateAgentSettings({
          lastConfigFileBackup: buildConfigFileRollbackBackup({
            configFile: rollbackConfigFile,
            activeConfigFileId: currentConfigFile?.id ?? null,
          }),
        })
      }
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileSaved', { configFileId: selectedConfigFileId }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.configFilesPanel'), message)
    } finally {
      setConfigFileSaving(false)
    }
  }

  async function duplicateSelectedConfigFile() {
    const sourceConfigFile = selectedConfigFile ?? currentConfigFile
    if (!sourceConfigFile) return
    const rollbackConfigFile = currentConfigFile ? duplicateSnapshotConfigFile(currentConfigFile) : null
    setConfigFileManaging(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      const nextConfigFile = duplicateConfigFileForManagement(sourceConfigFile, catalogQuery.data?.configFiles ?? [], t('agents.settings.configFileCopySuffix'))
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({ configFile: nextConfigFile, activate: true })
      if (rollbackConfigFile) {
        updateAgentSettings({
          lastConfigFileBackup: buildConfigFileRollbackBackup({
            configFile: rollbackConfigFile,
            activeConfigFileId: currentConfigFile?.id ?? null,
          }),
        })
      }
      setSelectedConfigFileId(nextConfigFile.id)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDuplicated', { configFileId: nextConfigFile.id }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.duplicateConfigFile'), message)
    } finally {
      setConfigFileManaging(false)
    }
  }

  async function createBlankConfigFile() {
    const rollbackConfigFile = currentConfigFile ? duplicateSnapshotConfigFile(currentConfigFile) : null
    setConfigFileManaging(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      const nextConfigFile = createBlankConfigFileForManagement(catalogQuery.data?.configFiles ?? [], t('agents.settings.configFileCreateName'))
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({ configFile: nextConfigFile, activate: true })
      if (rollbackConfigFile) {
        updateAgentSettings({
          lastConfigFileBackup: buildConfigFileRollbackBackup({
            configFile: rollbackConfigFile,
            activeConfigFileId: currentConfigFile?.id ?? null,
          }),
        })
      }
      setSelectedConfigFileId(nextConfigFile.id)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_created',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileCreated', { configFileId: nextConfigFile.id }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.createConfigFile'), message)
    } finally {
      setConfigFileManaging(false)
    }
  }

  async function copySelectedConfigFile() {
    if (!selectedConfigFile) return
    try {
      await navigator.clipboard.writeText(buildConfigFileExportText(selectedConfigFile))
      setConfigFileSaveError(null)
      setConfigFileMessage(t('agents.settings.configFileCopied', { configFileId: selectedConfigFile.id }))
    } catch (error) {
      setConfigFileSaveError(settingsErrorMessage(error))
      setConfigFileMessage(null)
    }
  }

  function downloadSelectedConfigFile() {
    if (!selectedConfigFile) return
    const text = buildConfigFileExportText(selectedConfigFile)
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = createObjectUrl(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agent-config-file-${safeConfigFileExportName(selectedConfigFile)}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    revokeObjectUrl(url)
    setConfigFileSaveError(null)
    setConfigFileMessage(t('agents.settings.configFileDownloaded', { configFileId: selectedConfigFile.id }))
  }

  async function loadConfigFileFile(file?: File | null) {
    if (!file) return
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      if (file.size > MAX_CONFIG_FILE_BYTES) throw new Error(t('agents.settings.configFileTooLarge', { size: formatBytes(MAX_CONFIG_FILE_BYTES) }))
      const configFile = markConfigFileManaged(parseConfigFileExport(await file.text()))
      const rollbackConfigFile = currentConfigFile ? duplicateSnapshotConfigFile(currentConfigFile) : null
      setConfigFileManaging(true)
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({ configFile, activate: true })
      if (rollbackConfigFile) {
        updateAgentSettings({
          lastConfigFileBackup: buildConfigFileRollbackBackup({
            configFile: rollbackConfigFile,
            activeConfigFileId: currentConfigFile?.id ?? null,
          }),
        })
      }
      setSelectedConfigFileId(configFile.id)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      setConfigFileMessage(t('agents.settings.configFileImported', { configFileId: configFile.id, fileName: file.name }))
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileImported', { configFileId: configFile.id, fileName: file.name }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.importConfigFile'), message)
    } finally {
      setConfigFileManaging(false)
      if (configFileInputRef.current) configFileInputRef.current.value = ''
    }
  }

  async function saveSelectedConfigFileDetails() {
    if (!selectedConfigFile) return
    if (!selectedConfigFileEditable) {
      setConfigFileSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    if (!configFileNameWorkspaceValue) {
      setConfigFileSaveError(t('agents.settings.configFileNameRequired'))
      return
    }
    const rollbackConfigFile = duplicateSnapshotConfigFile(selectedConfigFile)
    setConfigFileManaging(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      const nextConfigFile: AgentCatalogConfigFile = {
        ...selectedConfigFile,
        name: configFileNameWorkspaceValue,
        metadata: { ...(selectedConfigFile.metadata ?? {}), managed: true },
      }
      if (configFileDescriptionWorkspaceValue) {
        nextConfigFile.description = configFileDescriptionWorkspaceValue
      } else {
        delete nextConfigFile.description
      }
      if (Object.keys(normalizedConfigFileLimitWorkspaces).length > 0) {
        nextConfigFile.limits = normalizedConfigFileLimitWorkspaces
      } else {
        delete nextConfigFile.limits
      }
      if (Object.keys(normalizedConfigFileApprovalDefaultWorkspaces).length > 0) {
        nextConfigFile.approvalDefaults = normalizedConfigFileApprovalDefaultWorkspaces
      } else {
        delete nextConfigFile.approvalDefaults
      }
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({
        configFile: nextConfigFile,
        activate: selectedConfigFile.id === currentConfigFile?.id,
      })
      updateAgentSettings({
        lastConfigFileBackup: buildConfigFileRollbackBackup({
          configFile: rollbackConfigFile,
          activeConfigFileId: currentConfigFile?.id ?? null,
        }),
      })
      setSelectedConfigFileId(nextConfigFile.id)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDetailsSaved', { configFileId: nextConfigFile.id, name: nextConfigFile.name }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.saveConfigFileDetails'), message)
    } finally {
      setConfigFileManaging(false)
    }
  }

  async function deleteSelectedConfigFile() {
    if (!selectedConfigFile || selectedConfigFile.id === currentConfigFile?.id) return
    if (!selectedConfigFileEditable) {
      setConfigFileSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    const rollbackConfigFile = duplicateSnapshotConfigFile(selectedConfigFile)
    setConfigFileManaging(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.deleteAgentConfigFile({ configFileId: selectedConfigFile.id })
      updateAgentSettings({
        lastConfigFileBackup: buildConfigFileRollbackBackup({
          configFile: rollbackConfigFile,
          activeConfigFileId: currentConfigFile?.id ?? null,
        }),
      })
      setSelectedConfigFileId(currentConfigFile?.id ?? '')
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_deleted',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDeleted', { configFileId: selectedConfigFile.id }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.deleteConfigFile'), message)
    } finally {
      setConfigFileManaging(false)
    }
  }

  async function restoreConfigFileRollbackBackup() {
    if (!configFileRollbackBackup) return
    const currentVersion = (catalogQuery.data?.configFiles ?? []).find((configFile) => configFile.id === configFileRollbackBackup.configFile.id)
      ?? selectedConfigFile
      ?? currentConfigFile
    setConfigFileManaging(true)
    setConfigFileSaveError(null)
    setConfigFileMessage(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({
        configFile: configFileRollbackBackup.configFile,
        activate: configFileRollbackBackup.activeConfigFileId === configFileRollbackBackup.configFile.id,
      })
      updateAgentSettings({
        lastConfigFileBackup: currentVersion
          ? buildConfigFileRollbackBackup({
              configFile: duplicateSnapshotConfigFile(currentVersion),
              activeConfigFileId: currentConfigFile?.id ?? null,
            })
          : null,
      })
      setSelectedConfigFileId(configFileRollbackBackup.configFile.id)
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'config_file_rollback_restored',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileRollbackRestored', { configFileId: configFileRollbackBackup.configFile.id }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setConfigFileSaveError(message)
      recordSettingsOperationFailure('config_file', t('agents.settings.restoreConfigFileBackup'), message)
    } finally {
      setConfigFileManaging(false)
    }
  }

  async function saveConfigFileToolPermissions() {
    if (!selectedConfigFile?.id) {
      setToolPermissionsSaveError(t('agents.settings.configFileMissing'))
      return
    }
    if (!selectedConfigFileEditable) {
      setToolPermissionsSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    if (toolPermissionsWorkspaceIssues.length > 0) {
      setToolPermissionsSaveError(t('agents.settings.toolPermissionsWorkspaceInvalid', { count: toolPermissionsWorkspaceIssues.length }))
      return
    }
    setToolPermissionsSaving(true)
    setToolPermissionsSaveError(null)
    const rollbackConfigFile = duplicateSnapshotConfigFile(selectedConfigFile)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveAgentConfigFile({
        configFile: {
          ...selectedConfigFile,
          toolGrants: toolGrantWorkspaces.map((grant) => ({
            name: grant.name,
            mode: grant.mode,
            ...(grant.approval ? { approval: grant.approval } : {}),
          })),
          metadata: { ...(selectedConfigFile.metadata ?? {}), managed: true },
        },
        activate: selectedConfigFile.id === currentConfigFile?.id,
      })
      updateAgentSettings({
        lastConfigFileBackup: buildConfigFileRollbackBackup({
          configFile: rollbackConfigFile,
          activeConfigFileId: currentConfigFile?.id ?? null,
        }),
      })
      await Promise.all([catalogQuery.refetch(), capabilitiesQuery.refetch()])
      recordSettingsAudit({
        action: 'tool_permissions_saved',
        target: 'tools',
        summary: t('agents.settings.auditSummaries.toolPermissionsSaved', toolPermissionsAuditSummaryValues(toolGrantWorkspaces)),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setToolPermissionsSaveError(message)
      recordSettingsOperationFailure('tools', t('agents.settings.toolPermissionsPanel'), message)
    } finally {
      setToolPermissionsSaving(false)
    }
  }

  function fixToolPermissionsWorkspaceIssues(options?: { audit?: boolean }) {
    const issueByTool = new Map(toolPermissionsWorkspaceIssues.map((issue) => [issue.toolName, issue]))
    setToolGrantWorkspaces((workspaces) => workspaces.flatMap((grant) => {
      const issue = issueByTool.get(grant.name)
      if (!issue) return [grant]
      if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.notConfigFileGranted') return []
      if (issue.reasonKey === 'agents.settings.toolPermissionsWorkspaceIssueDetails.unavailableAllow') return [{ ...grant, mode: 'deny' as const }]
      return [grant]
    }))
    setToolPermissionsSaveError(null)
    if (options?.audit) recordSettingsQuickFix('tools', 'agents.settings.fixToolPermissionsWorkspaceIssues', 'workspace_repair')
  }

  function toolPermissionsAuditSummaryValues(grants: ToolGrantWorkspace[]) {
    return {
      count: grants.length,
      allow: grants.filter((grant) => grant.mode === 'allow').length,
      deny: grants.filter((grant) => grant.mode === 'deny').length,
      approvals: grants.filter((grant) => (grant.approval ?? 'never') !== 'never').length,
    }
  }

  function updateToolGrantWorkspace(name: string, patch: Partial<ToolGrantWorkspace>) {
    if (!selectedConfigFileEditable) return
    setToolGrantWorkspaces((workspaces) => workspaces.map((grant) => (
      grant.name === name
        ? { ...grant, ...patch }
        : grant
    )))
  }

  function applyToolPermissionsBulkEdit(action: ToolPermissionsBulkAction) {
    if (!selectedConfigFileEditable) return
    const visibleToolByName = new Map(toolPermissionsFilteredTools.map((tool) => [tool.name, tool]))
    setToolGrantWorkspaces((workspaces) => workspaces.map((grant) => {
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
    setToolPermissionsSaveError(null)
  }

  function saveToolPermissionsFilterPreset() {
    const search = toolPermissionsSearch.trim()
    const name = toolPermissionsFilterPresetName(toolPermissionsFilter, search, t)
    const matchingPreset = agentSettings.toolPermissionsFilterPresets.find((preset) => preset.filter === toolPermissionsFilter && preset.search === search)
    const preset: AgentToolPermissionsFilterPreset = {
      id: matchingPreset?.id ?? uniqueToolPermissionsFilterPresetId(name, agentSettings.toolPermissionsFilterPresets.map((item) => item.id)),
      name,
      search,
      filter: toolPermissionsFilter,
    }
    updateAgentSettings({
      toolPermissionsFilterPresets: [
        preset,
        ...agentSettings.toolPermissionsFilterPresets.filter((item) => item.id !== preset.id),
      ].slice(0, 12),
    })
    recordSettingsAudit({
      action: matchingPreset ? 'tool_filter_preset_updated' : 'tool_filter_preset_saved',
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPermissionsFilterPresetSaved', { name }),
    })
  }

  function applyToolPermissionsFilterPreset(preset: AgentToolPermissionsFilterPreset) {
    setToolPermissionsFilter(preset.filter)
    setToolPermissionsSearch(preset.search)
  }

  function deleteToolPermissionsFilterPreset(presetId: string) {
    const preset = agentSettings.toolPermissionsFilterPresets.find((item) => item.id === presetId)
    updateAgentSettings({
      toolPermissionsFilterPresets: agentSettings.toolPermissionsFilterPresets.filter((item) => item.id !== presetId),
    })
    recordSettingsAudit({
      action: 'tool_filter_preset_deleted',
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPermissionsFilterPresetDeleted', { name: preset?.name ?? presetId }),
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
    if (quickFix === 'reset-model-workspace') {
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
      recordSettingsQuickFix('model', 'agents.settings.quickFixes.resetWorkspace', 'workspace_reset')
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
    if (quickFix === 'reset-config-file-workspace') {
      if (currentConfigFile?.id) setSelectedConfigFileId(currentConfigFile.id)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('config_file', 'agents.settings.quickFixes.resetWorkspace', 'workspace_reset')
      return
    }
    if (quickFix === 'reset-skill-config-workspace') {
      setSkillWorkspaces(skillConfigBaseline)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('skills', 'agents.settings.quickFixes.resetWorkspace', 'workspace_reset')
      return
    }
    if (quickFix === 'fix-tool-permissions-workspace-issues') {
      fixToolPermissionsWorkspaceIssues()
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('tools', 'agents.settings.fixToolPermissionsWorkspaceIssues', 'workspace_repair')
      return
    }
    if (quickFix === 'reset-tool-permissions-workspace') {
      setToolGrantWorkspaces(toolGrantBaseline)
      setSettingsActionFeedback(t('agents.settings.quickFixes.applied'))
      recordSettingsQuickFix('tools', 'agents.settings.quickFixes.resetWorkspace', 'workspace_reset')
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
      configFileId: currentConfigFileId,
      configFiles: catalogQuery.data?.configFiles ?? [],
      skillConfig: skillWorkspaces,
      toolPermissionOverrides: buildSettingsSnapshotToolPermissionOverrides({
        currentConfigFileId: selectedConfigFile?.id ?? currentConfigFileId,
        currentToolGrantWorkspaces: toolGrantWorkspaces,
      }),
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
      name: t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`),
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
    const url = createObjectUrl(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agent-settings-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    revokeObjectUrl(url)
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

  async function restoreSettingsImportBackup() {
    if (!settingsImportBackup) return
    let snapshot: AgentSettingsSnapshot
    try {
      snapshot = selectSettingsSnapshotForImport(parseSettingsSnapshot(settingsImportBackup.text), SETTINGS_SNAPSHOT_IMPORT_SCOPES)
    } catch (error) {
      setSettingsSnapshotError(settingsErrorMessage(error))
      return
    }
    const preflightError = settingsSnapshotImportPreflightErrorForSnapshot(snapshot)
    if (preflightError) {
      setSettingsSnapshotError(preflightError)
      setSettingsSnapshotMessage(null)
      return
    }
    setSettingsSnapshotImporting(true)
    setSettingsSnapshotError(null)
    setSettingsSnapshotMessage(null)
    const rollbackBackupText = buildCurrentSettingsSnapshotText()
    updateAgentSettings({ lastImportBackup: { text: rollbackBackupText, createdAt: new Date().toISOString() } })
    try {
      await applySettingsSnapshotWrites(snapshot)
      setSettingsSnapshotText(settingsImportBackup.text)
      setSavedConfig(null)
      setSettingsSnapshotMessage(t('agents.settings.settingsBackupRestored'))
      recordSettingsAudit({
        action: 'settings_snapshot_restored',
        target: 'snapshot',
        summary: t('agents.settings.auditSummaries.settingsSnapshotRestored', { exportedAt: new Date(snapshot.exportedAt).toLocaleString() }),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSettingsSnapshotError(message)
      recordSettingsOperationFailure('snapshot', t('agents.settings.restoreImportBackup'), message)
    } finally {
      setSettingsSnapshotImporting(false)
    }
  }

  function settingsSnapshotImportPreflightErrorForSnapshot(snapshot: AgentSettingsSnapshot): string | null {
    const needsModelCatalog = Boolean(snapshot.model?.model.startsWith('model_config:') || snapshot.model?.platformModelId)
    const needsCatalog = Boolean(snapshot.configFiles || snapshot.runtimeLimits || snapshot.activeConfigFileId || snapshot.skillConfig || snapshot.toolPermissionOverrides)
    const needsCapabilities = Boolean(snapshot.toolPermissionOverrides)
    if (needsModelCatalog && !modelsQuery.data) {
      return t('agents.settings.settingsSnapshotModelCatalogUnavailable')
    }
    if (needsCatalog && !catalogQuery.data) {
      return t('agents.settings.settingsSnapshotCatalogUnavailable')
    }
    if (snapshot.runtimeLimits && !targetSnapshotConfigFile(snapshot, catalogQuery.data, currentConfigFile)) {
      return t('agents.settings.settingsSnapshotLimitsTargetMissing')
    }
    if (snapshot.skillConfig && !targetSnapshotConfigFile(snapshot, catalogQuery.data, currentConfigFile)) {
      return t('agents.settings.settingsSnapshotSkillsTargetMissing')
    }
    if (needsCapabilities && !capabilitiesQuery.data) {
      return t('agents.settings.settingsSnapshotCapabilitiesUnavailable')
    }
    const referenceIssues = (!needsCatalog || catalogQuery.data) && (!needsModelCatalog || modelsQuery.data)
      ? validateSettingsSnapshotReferences(snapshot, {
        textModels: modelsQuery.data,
        configFiles: catalogQuery.data?.configFiles ?? [],
        currentConfigFile,
        skills: catalogQuery.data?.skills ?? [],
      })
      : []
    if (referenceIssues.length > 0) return referenceIssues.map((issue) => issue.message).join('; ')
    const snapshotToolPermissionsIssues = (snapshot.toolPermissionOverrides ?? []).flatMap((overrides) => (
      buildToolPermissionsWorkspaceIssues({
        workspaces: overrides.toolGrants,
        currentConfigFile: snapshotConfigFileById(snapshot, overrides.configFileId, catalogQuery.data, currentConfigFile),
        tools: capabilitiesQuery.data?.resolvedTools,
      })
    ))
    if (snapshotToolPermissionsIssues.length > 0) {
      return t('agents.settings.settingsSnapshotToolPermissionsInvalid', { count: snapshotToolPermissionsIssues.length })
    }
    return null
  }

  function settingsSnapshotImportPreflightError(): string | null {
    if (!parsedSettingsSnapshot) return null
    if (settingsSnapshotValidation.error) return t('agents.settings.settingsSnapshotInvalid', { error: settingsSnapshotValidation.error })
    if (!settingsSnapshotHasSelectedImportScope || !selectedSettingsSnapshotForImport) {
      return t('agents.settings.settingsSnapshotImportScopeEmpty')
    }
    return settingsSnapshotImportPreflightErrorForSnapshot(selectedSettingsSnapshotForImport)
  }

  async function applySettingsSnapshotWrites(snapshot: AgentSettingsSnapshot) {
    const writesRuntime = Boolean(snapshot.configFiles || snapshot.runtimeLimits || snapshot.activeConfigFileId || snapshot.skillConfig || snapshot.toolPermissionOverrides)
    if (writesRuntime) await localAgentClient.ensureRunning()
    if (snapshot.model) await localAgentClient.saveWorkspaceModelConfig(buildRuntimeModelConfigFromSnapshotModel(snapshot.model))
    const configFileWrites = new Map<string, AgentCatalogConfigFile>()
    const configFileWriteActivations = new Map<string, boolean>()
    function queueConfigFileWrite(configFile: AgentCatalogConfigFile, activate: boolean) {
      configFileWrites.set(configFile.id, configFile)
      configFileWriteActivations.set(configFile.id, Boolean(configFileWriteActivations.get(configFile.id) || activate))
    }
    function targetConfigFileForSnapshot(errorMessage: string): AgentCatalogConfigFile {
      const targetConfigFile = targetSnapshotConfigFile(snapshot, catalogQuery.data, currentConfigFile)
      if (!targetConfigFile) throw new Error(errorMessage)
      return configFileWrites.get(targetConfigFile.id) ?? targetConfigFile
    }
    if (snapshot.configFiles) {
      for (const configFile of snapshot.configFiles) {
        queueConfigFileWrite(markConfigFileManaged(configFile), Boolean(snapshot.activeConfigFileId && configFile.id === snapshot.activeConfigFileId))
      }
    }
    if (snapshot.runtimeLimits) {
      const targetConfigFile = targetConfigFileForSnapshot(t('agents.settings.settingsSnapshotLimitsTargetMissing'))
      queueConfigFileWrite({
        ...targetConfigFile,
        limits: { ...snapshot.runtimeLimits },
        metadata: { ...(targetConfigFile.metadata ?? {}), managed: true },
      }, targetConfigFile.id === currentConfigFile?.id || targetConfigFile.id === snapshot.activeConfigFileId)
    }
    if (snapshot.skillConfig) {
      const targetConfigFile = targetConfigFileForSnapshot(t('agents.settings.settingsSnapshotSkillsTargetMissing'))
      queueConfigFileWrite({
        ...targetConfigFile,
        skillIds: buildConfigFileSkillIds(snapshot.skillConfig),
        metadata: { ...(targetConfigFile.metadata ?? {}), managed: true },
      }, targetConfigFile.id === currentConfigFile?.id || targetConfigFile.id === snapshot.activeConfigFileId)
    }
    if (snapshot.toolPermissionOverrides) {
      for (const overrides of snapshot.toolPermissionOverrides) {
        const targetConfigFile = snapshotConfigFileById(snapshot, overrides.configFileId, catalogQuery.data, currentConfigFile)
        if (!targetConfigFile) throw new Error(`config file ${overrides.configFileId} not found`)
        queueConfigFileWrite({
          ...targetConfigFile,
          toolGrants: overrides.toolGrants.map((grant) => ({
            name: grant.name,
            mode: grant.mode,
            ...(grant.approval ? { approval: grant.approval } : {}),
          })),
          metadata: { ...(targetConfigFile.metadata ?? {}), managed: true },
        }, targetConfigFile.id === currentConfigFile?.id || targetConfigFile.id === snapshot.activeConfigFileId)
      }
    }
    for (const configFile of configFileWrites.values()) {
      await localAgentClient.saveAgentConfigFile({
        configFile,
        activate: Boolean(configFileWriteActivations.get(configFile.id)),
      })
    }
    if (snapshot.activeConfigFileId && !configFileWrites.has(snapshot.activeConfigFileId)) {
      await localAgentClient.saveActiveAgentConfigFile({ configFileId: snapshot.activeConfigFileId })
    }
    if (writesRuntime) await Promise.all([runtimeQuery.refetch(), catalogQuery.refetch(), capabilitiesQuery.refetch()])
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
      await applySettingsSnapshotWrites(snapshot)
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
          <AgentSettingsMain>
              <AgentSettingsPanel icon={Bot} id="agent-settings-config-files" title={t('agents.settings.configFilesPanel')}>
                {catalogQuery.isLoading ? (
                  <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
                ) : catalogQuery.error ? (
                  <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
                ) : (
                  <AgentSettingsStack>
                    <AgentSettingsFormGrid columns="four">
                      <AgentSettingsKeyValue label={t('agents.settings.configFileFields.total')} value={catalogQuery.data?.configFiles.length ?? 0} />
                      <AgentSettingsKeyValue label={t('agents.settings.configFileFields.current')} value={currentConfigFile?.name ?? '-'} />
                      <AgentSettingsKeyValue label={t('agents.settings.configFileFields.packs')} value={currentConfigFile?.enabledPackIds.length ?? 0} />
                      <AgentSettingsKeyValue label={t('agents.settings.configFileFields.toolGrants')} value={currentConfigFile?.toolGrants.length ?? 0} />
                    </AgentSettingsFormGrid>
                    <AgentSettingsCallout tone="neutral" compact>
                      {t('agents.settings.configFileScopeHelp')}
                    </AgentSettingsCallout>
                    <AgentSettingsInput
                      ref={configFileInputRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(event) => void loadConfigFileFile(event.target.files?.[0])}
                    />
                    <AgentSettingsConfigFileEditor>
                      <AgentSettingsConfigFileBrowser>
                        <AgentSettingsConfigFileEditorSection
                          title={t('agents.settings.configFilesPanel')}
                          description={t('agents.settings.activeConfigFileHelp')}
                        >
                          <AgentSettingsActionRow>
                            <AgentSettingsActionButton variant="outline" onClick={createBlankConfigFile} disabled={configFileManaging} data-testid="agent-settings-create-config-file">
                              {configFileManaging ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Plus size={14} />}
                              {t('agents.settings.createConfigFile')}
                            </AgentSettingsActionButton>
                            <AgentSettingsActionButton variant="outline" onClick={() => configFileInputRef.current?.click()} disabled={configFileManaging} data-testid="agent-settings-import-config-file">
                              {configFileManaging ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Upload size={14} />}
                              {t('agents.settings.importConfigFile')}
                            </AgentSettingsActionButton>
                          </AgentSettingsActionRow>
                          {(catalogQuery.data?.configFiles.length ?? 0) === 0 ? (
                            <AgentSettingsStateMessage text={t('agents.settings.noConfigFiles')} />
                          ) : (
                            <AgentSettingsConfigFileList>
                              {(catalogQuery.data?.configFiles ?? []).map((configFile) => (
                                <AgentSettingsConfigFileListButton
                                  key={configFile.id}
                                  name={configFile.name}
                                  idLabel={configFile.id}
                                  description={configFile.description}
                                  versionLabel={`v${configFile.version}`}
                                  current={configFile.id === currentConfigFile?.id}
                                  selected={configFile.id === selectedConfigFile?.id}
                                  currentLabel={t('agents.settings.configFileStatus.current')}
                                  selectedLabel={t('agents.settings.configFileStatus.selected')}
                                  summaryLabel={configFileListSummary(configFile, t)}
                                  onSelect={() => setSelectedConfigFileId(configFile.id)}
                                />
                              ))}
                            </AgentSettingsConfigFileList>
                          )}
                        </AgentSettingsConfigFileEditorSection>
                      </AgentSettingsConfigFileBrowser>

                      <AgentSettingsConfigFileEditorPane>
                        {selectedConfigFile ? (
                          <>
                            <AgentSettingsConfigFileEditorHeader
                              title={configFileNameWorkspace || selectedConfigFile.name}
                              description={selectedConfigFile.id}
                              badges={(
                                <>
                                  {selectedConfigFile.id === currentConfigFile?.id && (
                                    <AgentSettingsStatusBadge {...agentSettingsStatusRecipe('ready')}>
                                      {t('agents.settings.configFileStatus.current')}
                                    </AgentSettingsStatusBadge>
                                  )}
                                  {selectedConfigFile.id !== currentConfigFile?.id && (
                                    <AgentSettingsBadge>{t('agents.settings.configFileStatus.selected')}</AgentSettingsBadge>
                                  )}
                                  <AgentSettingsBadge variant="outline">v{selectedConfigFile.version}</AgentSettingsBadge>
                                </>
                              )}
                              actions={(
                                <>
                                  <AgentSettingsActionButton onClick={saveActiveConfigFile} disabled={!hasConfigFileChange || configFileSaving}>
                                    {configFileSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                                    {hasConfigFileChange ? t('agents.settings.saveConfigFile') : t('agents.settings.configFileSaved')}
                                  </AgentSettingsActionButton>
                                  <AgentSettingsActionButton variant="outline" onClick={() => void copySelectedConfigFile()} disabled={!selectedConfigFile || configFileManaging} data-testid="agent-settings-copy-config-file">
                                    <Clipboard size={14} />
                                    {t('agents.settings.copyConfigFile')}
                                  </AgentSettingsActionButton>
                                  <AgentSettingsActionButton variant="outline" onClick={downloadSelectedConfigFile} disabled={!selectedConfigFile || configFileManaging} data-testid="agent-settings-download-config-file">
                                    <Download size={14} />
                                    {t('agents.settings.downloadConfigFile')}
                                  </AgentSettingsActionButton>
                                </>
                              )}
                            />
                            {configFileMessage && (
                              <AgentSettingsCallout tone="success" compact data-testid="agent-settings-config-file-message">
                                {configFileMessage}
                              </AgentSettingsCallout>
                            )}
                            {configFileSaveError && <AppInlineError>{configFileSaveError}</AppInlineError>}
                            {selectedConfigFile.id !== currentConfigFile?.id && (
                              <AgentSettingsCallout tone="warning" compact>
                                {t('agents.settings.configFileSwitchResetsToolPermissions')}
                              </AgentSettingsCallout>
                            )}
                            {selectedConfigFileReadonly && (
                              <AgentSettingsCallout tone="neutral" compact data-testid="agent-settings-config-file-readonly">
                                {t('agents.settings.configFileReadonlyHelp')}
                                <AgentSettingsActionButton size="sm" variant="outline" onClick={duplicateSelectedConfigFile} disabled={configFileManaging}>
                                  <Copy size={14} />
                                  {t('agents.settings.duplicateConfigFile')}
                                </AgentSettingsActionButton>
                              </AgentSettingsCallout>
                            )}
                            <AgentSettingsConfigFileEditorSection
                              title={t('agents.settings.modelPanel')}
                              description={t('agents.settings.sectionDescriptions.model')}
                              id="agent-settings-model"
                            >
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
                                    placeholder={t('agents.settings.providerModelIdPlaceholder')}
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

                              <AgentSettingsFormGrid columns="two">
                                <AgentSettingsToggleRow checked={useForChat} onChange={setUseForChat} title={t('agents.settings.useForChat')} description={t('agents.settings.useForChatHelp')} />
                                <AgentSettingsToggleRow checked={useForPlanner} onChange={setUseForPlanner} title={t('agents.settings.useForPlanner')} description={t('agents.settings.useForPlannerHelp')} />
                              </AgentSettingsFormGrid>
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
                                  intent={modelConfigClearConfirming ? 'danger' : 'neutral'}
                                >
                                  {clearingModelConfig ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Trash2 size={14} />}
                                  {modelConfigClearConfirming ? t('agents.settings.clearModelConfigConfirm') : t('agents.settings.clearModelConfig')}
                                </AgentSettingsActionButton>
                              </AgentSettingsActionRow>
                              {saveError && <AppInlineError>{saveError}</AppInlineError>}
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
                            </AgentSettingsConfigFileEditorSection>
                            <AgentSettingsConfigFileEditorSection title={t('agents.settings.configFileFields.current')}>
                              <AgentSettingsFormGrid columns="two">
                                <AgentSettingsFormField>
                                  <AgentSettingsFieldLabel>{t('agents.settings.configFileNameLabel')}</AgentSettingsFieldLabel>
                                  <AgentSettingsInput
                                    value={configFileNameWorkspace}
                                    disabled={!selectedConfigFileEditable}
                                    onChange={(event) => {
                                      setConfigFileNameWorkspace(event.target.value)
                                      setConfigFileSaveError(null)
                                    }}
                                    data-testid="agent-settings-config-file-name"
                                  />
                                </AgentSettingsFormField>
                                <AgentSettingsFormField>
                                  <AgentSettingsFieldLabel>{t('agents.settings.configFileDescriptionLabel')}</AgentSettingsFieldLabel>
                                  <AgentSettingsInput
                                    value={configFileDescriptionWorkspace}
                                    disabled={!selectedConfigFileEditable}
                                    onChange={(event) => {
                                      setConfigFileDescriptionWorkspace(event.target.value)
                                      setConfigFileSaveError(null)
                                    }}
                                    data-testid="agent-settings-config-file-description"
                                  />
                                </AgentSettingsFormField>
                              </AgentSettingsFormGrid>
                              <AgentSettingsActionRow>
                                <AgentSettingsActionButton variant="outline" onClick={saveSelectedConfigFileDetails} disabled={!selectedConfigFileEditable || !hasConfigFileDetailsChange || configFileManaging} data-testid="agent-settings-save-config-file-details">
                                  {configFileManaging ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                                  {t('agents.settings.saveConfigFileDetails')}
                                </AgentSettingsActionButton>
                                <AgentSettingsActionButton variant="outline" onClick={duplicateSelectedConfigFile} disabled={configFileManaging} data-testid="agent-settings-duplicate-config-file">
                                  {configFileManaging ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Copy size={14} />}
                                  {t('agents.settings.duplicateConfigFile')}
                                </AgentSettingsActionButton>
                                <AgentSettingsActionButton variant="outline" onClick={deleteSelectedConfigFile} disabled={!selectedConfigFileEditable || selectedConfigFile.id === currentConfigFile?.id || configFileManaging} data-testid="agent-settings-delete-config-file">
                                  <Trash2 size={14} />
                                  {t('agents.settings.deleteConfigFile')}
                                </AgentSettingsActionButton>
                              </AgentSettingsActionRow>
                            </AgentSettingsConfigFileEditorSection>
                            <AgentSettingsConfigFileEditorSection
                              title={t('agents.settings.configFileLimitsLabel')}
                              description={t('agents.settings.configFileLimitsHelp')}
                            >
                              <AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-limits">
                                {CONFIG_FILE_LIMIT_KEYS.map((key) => (
                                  <AgentSettingsFormField key={key}>
                                    <AgentSettingsFieldLabel>{t(`agents.settings.configFileLimitFields.${key}`)}</AgentSettingsFieldLabel>
                                    <AgentSettingsInput
                                      type="number"
                                      min="0"
                                      value={configFileLimitWorkspaces[key]}
                                      disabled={!selectedConfigFileEditable}
                                      onChange={(event) => {
                                        setConfigFileLimitWorkspaces((workspaces) => ({ ...workspaces, [key]: event.target.value }))
                                        setConfigFileSaveError(null)
                                      }}
                                      data-testid={`agent-settings-config-file-limit-${key}`}
                                    />
                                  </AgentSettingsFormField>
                                ))}
                              </AgentSettingsFormGrid>
                            </AgentSettingsConfigFileEditorSection>
                            <AgentSettingsConfigFileEditorSection
                              title={t('agents.settings.configFileApprovalDefaultsLabel')}
                              description={t('agents.settings.configFileApprovalDefaultsHelp')}
                            >
                              <AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-approval-defaults">
                                {CONFIG_FILE_APPROVAL_DEFAULT_KEYS.map((key) => (
                                  <AgentSettingsFormField key={key}>
                                    <AgentSettingsFieldLabel>{t(`agents.settings.configFileApprovalDefaultFields.${key}`)}</AgentSettingsFieldLabel>
                                    <Select
                                      value={configFileApprovalDefaultWorkspaces[key]}
                                      disabled={!selectedConfigFileEditable}
                                      onValueChange={(value) => {
                                        setConfigFileApprovalDefaultWorkspaces((workspaces) => ({ ...workspaces, [key]: value as ConfigFileApprovalDefaultWorkspaceValue }))
                                        setConfigFileSaveError(null)
                                      }}
                                    >
                                      <AgentSettingsSelectTrigger data-testid={`agent-settings-config-file-approval-default-${key}`}>
                                        <SelectValue placeholder={t('agents.settings.configFileApprovalDefaultInherited')} />
                                      </AgentSettingsSelectTrigger>
                                      <SelectContent>
                                        {CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS.map((approval) => (
                                          <SelectItem key={approval} value={approval}>
                                            {approval === 'inherit' ? t('agents.settings.configFileApprovalDefaultInherited') : t(`agents.settings.toolPermissionsApprovals.${approval === 'on_write' ? 'onWrite' : approval}`)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </AgentSettingsFormField>
                                ))}
                              </AgentSettingsFormGrid>
                            </AgentSettingsConfigFileEditorSection>
                            <AgentSettingsConfigFileEditorSection
                              title={t('agents.settings.skillsPanel')}
                              description={t('agents.settings.skillConfigEditHelp')}
                              id="agent-settings-skills"
                            >
                              <AgentSettingsFormGrid columns="three">
                                <AgentSettingsKeyValue label={t('agents.settings.configFileFields.skills')} value={workspaceSkillIds.length} />
                                <AgentSettingsKeyValue label={t('agents.settings.skillConfigSelected')} value={workspaceSkillIds.length} />
                                <AgentSettingsKeyValue label={t('agents.settings.configFileFields.current')} value={selectedConfigFile.name} />
                              </AgentSettingsFormGrid>
                              <AgentSettingsFormGrid columns="two" data-testid="agent-settings-skill-filters">
                                <AgentSettingsFormField>
                                  <AgentSettingsFieldLabel>{t('agents.settings.skillFilters.search')}</AgentSettingsFieldLabel>
                                  <AgentSettingsInput
                                    value={skillSearch}
                                    onChange={(event) => setSkillSearch(event.target.value)}
                                    placeholder={t('agents.settings.toolPermissionsSearchPlaceholder')}
                                    data-testid="agent-settings-skill-search"
                                  />
                                </AgentSettingsFormField>
                                <AgentSettingsFormField>
                                  <AgentSettingsFieldLabel>{t('agents.settings.skillFilters.source')}</AgentSettingsFieldLabel>
                                  <Select value={skillSourceFilter} onValueChange={(value) => setSkillSourceFilter(value as SkillSourceFilter)}>
                                    <AgentSettingsSelectTrigger data-testid="agent-settings-skill-source-filter">
                                      <SelectValue />
                                    </AgentSettingsSelectTrigger>
                                    <SelectContent>
                                      {SKILL_SOURCE_FILTERS.map((filter) => (
                                        <SelectItem key={filter} value={filter}>{t(`agents.settings.skillSourceFilters.${filter}`)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </AgentSettingsFormField>
                              </AgentSettingsFormGrid>
                              <AgentSettingsInlineNote>
                                {t('agents.settings.skillFilterResult', { count: filteredSkills.length, total: catalogQuery.data?.skills.length ?? 0 })}
                              </AgentSettingsInlineNote>
                              {skillConfigIssues.length > 0 && (
                                <AgentSettingsCallout tone="warning" compact data-testid="agent-settings-skill-config-issues">
                                  <AgentSettingsIssueList
                                    items={skillConfigIssues.map((issue) => (
                                      issue.type === 'dependency'
                                        ? t('agents.settings.skillConfigIssueDependency', { skillId: issue.skillId, dependencyId: issue.relatedSkillId })
                                        : t('agents.settings.skillConfigIssueConflict', { skillId: issue.skillId, conflictId: issue.relatedSkillId })
                                    ))}
                                  />
                                </AgentSettingsCallout>
                              )}
                              <AgentSettingsActionRow>
                                <AgentSettingsActionButton
                                  onClick={saveConfigFileSkillActivation}
                                  disabled={!selectedConfigFileEditable || !hasSkillConfigSelectionChange || skillConfigSaving || skillConfigIssues.length > 0}
                                  data-testid="agent-settings-save-skill-config"
                                >
                                  {skillConfigSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                                  {hasSkillConfigSelectionChange ? t('agents.settings.saveSkillConfig') : t('agents.settings.skillConfigSaved')}
                                </AgentSettingsActionButton>
                                <AgentSettingsActionButton variant="outline" onClick={() => setSkillWorkspaces(skillConfigBaseline)} disabled={!selectedConfigFileEditable || !hasSkillConfigChange || skillConfigSaving}>
                                  {t('agents.settings.resetSkillConfig')}
                                </AgentSettingsActionButton>
                              </AgentSettingsActionRow>
                              {skillConfigSaveError && <AppInlineError>{skillConfigSaveError}</AppInlineError>}
                              {filteredSkills.length === 0 ? (
                                <AgentSettingsStateMessage text={t('agents.settings.noSkills')} />
                              ) : (
                                <AgentSettingsStack data-testid="agent-settings-config-file-skill-activation">
                                  {filteredSkills.map((skill) => (
                                    <SkillRow
                                      key={skill.id}
                                      skill={skill}
                                      workspace={skillWorkspaceById.get(skill.id)}
                                      readOnly={!selectedConfigFileEditable}
                                      onWorkspaceChange={updateSkillWorkspace}
                                    />
                                  ))}
                                </AgentSettingsStack>
                              )}
                            </AgentSettingsConfigFileEditorSection>
                            <AgentSettingsConfigFileEditorSection
                              title={t('agents.settings.toolPermissionsPanel')}
                              description={t('agents.settings.toolPermissionsEditHelp')}
                              id="agent-settings-tools"
                            >
                              {capabilitiesQuery.isLoading ? (
                                <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
                              ) : capabilitiesQuery.error ? (
                                <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(capabilitiesQuery.error)} />
                              ) : (
                                <AgentSettingsStack>
                                  <AgentSettingsFormGrid columns="four">
                                    <AgentSettingsKeyValue label={t('agents.settings.configFileFields.toolGrants')} value={selectedConfigFile.toolGrants.length} />
                                    <AgentSettingsKeyValue label={t('agents.settings.toolPermissionsModes.allow')} value={toolGrantWorkspaces.filter((grant) => grant.mode === 'allow').length} />
                                    <AgentSettingsKeyValue label={t('agents.settings.toolPermissionsModes.deny')} value={toolGrantWorkspaces.filter((grant) => grant.mode === 'deny').length} />
                                    <AgentSettingsKeyValue label={t('agents.settings.toolPermissionsWorkspaceIssues')} value={toolPermissionsWorkspaceIssues.length} />
                                  </AgentSettingsFormGrid>
                                  <AgentSettingsToolPermissionsFilterPanel
                                    searchValue={toolPermissionsSearch}
                                    onSearchChange={setToolPermissionsSearch}
                                    searchPlaceholder={t('agents.settings.toolPermissionsSearchPlaceholder')}
                                    filterValue={toolPermissionsFilter}
                                    onFilterChange={(value) => setToolPermissionsFilter(value as ToolPermissionsFilter)}
                                    filterOptions={TOOL_PERMISSIONS_FILTER_OPTIONS.map((filter) => ({
                                      value: filter,
                                      label: t(`agents.settings.toolPermissionsFilters.${filter}`),
                                    }))}
                                    summary={t('agents.settings.toolPermissionsFilterSummary', {
                                      shown: toolPermissionsFilteredTools.length,
                                      total: capabilitiesQuery.data?.resolvedTools.discovered.length ?? 0,
                                    })}
                                  />
                                  <AgentSettingsToolPermissionsBulkActionPanel
                                    title={t('agents.settings.toolPermissionsBulkActions')}
                                    help={t('agents.settings.toolPermissionsBulkHelp')}
                                    actions={[
                                      { id: 'allow_available', label: t('agents.settings.toolPermissionsBulkAllowAvailable'), onClick: () => applyToolPermissionsBulkEdit('allow_available') },
                                      { id: 'deny', label: t('agents.settings.toolPermissionsBulkDeny'), onClick: () => applyToolPermissionsBulkEdit('deny') },
                                      { id: 'approval_never', label: t('agents.settings.toolPermissionsBulkApprovalNever'), onClick: () => applyToolPermissionsBulkEdit('approval_never') },
                                      { id: 'approval_on_write', label: t('agents.settings.toolPermissionsBulkApprovalOnWrite'), onClick: () => applyToolPermissionsBulkEdit('approval_on_write') },
                                      { id: 'approval_always', label: t('agents.settings.toolPermissionsBulkApprovalAlways'), onClick: () => applyToolPermissionsBulkEdit('approval_always') },
                                    ]}
                                  />
                                  <AgentSettingsToolPermissionsFilterPresetPanel
                                    title={t('agents.settings.toolPermissionsFilterPresets')}
                                    saveLabel={t('agents.settings.saveToolPermissionsFilterPreset')}
                                    saveIcon={<Save size={14} />}
                                    help={t('agents.settings.toolPermissionsFilterPresetsHelp')}
                                    emptyLabel={t('agents.settings.toolPermissionsFilterPresetsEmpty')}
                                    presets={agentSettings.toolPermissionsFilterPresets.map((preset) => ({
                                      id: preset.id,
                                      name: preset.name,
                                      title: `${preset.name}: ${preset.search || t(`agents.settings.toolPermissionsFilters.${preset.filter}`)}`,
                                      onSelect: () => applyToolPermissionsFilterPreset(preset),
                                      onDelete: () => deleteToolPermissionsFilterPreset(preset.id),
                                    }))}
                                    deleteLabel={t('agents.settings.deleteToolPermissionsFilterPreset')}
                                    onSave={saveToolPermissionsFilterPreset}
                                  />
                                  {toolPermissionsWorkspaceIssues.length > 0 && (
                                    <AgentSettingsCallout tone="warning" compact data-testid="agent-settings-tool-permissions-workspace-issues">
                                      <AgentSettingsIssueList
                                        items={toolPermissionsWorkspaceIssues.map((issue) => (
                                          `${issue.toolName}: ${t(issue.reasonKey, issue.values)}`
                                        ))}
                                      />
                                      <AgentSettingsActionButton size="sm" variant="outline" onClick={() => fixToolPermissionsWorkspaceIssues({ audit: true })}>
                                        {t('agents.settings.fixToolPermissionsWorkspaceIssues')}
                                      </AgentSettingsActionButton>
                                    </AgentSettingsCallout>
                                  )}
                                  <ToolPermissionsDiffPreview items={toolPermissionsDiffItems} />
                                  <AgentSettingsActionRow>
                                    <AgentSettingsActionButton
                                      onClick={saveConfigFileToolPermissions}
                                      disabled={!selectedConfigFileEditable || !hasToolPermissionsChange || toolPermissionsSaving || toolPermissionsWorkspaceIssues.length > 0}
                                      data-testid="agent-settings-save-tool-permissions"
                                    >
                                      {toolPermissionsSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
                                      {hasToolPermissionsChange ? t('agents.settings.saveToolPermissions') : t('agents.settings.toolPermissionsSaved')}
                                    </AgentSettingsActionButton>
                                    <AgentSettingsActionButton variant="outline" onClick={() => setToolGrantWorkspaces(toolGrantBaseline)} disabled={!selectedConfigFileEditable || !hasToolPermissionsChange || toolPermissionsSaving}>
                                      {t('agents.settings.resetToolPermissions')}
                                    </AgentSettingsActionButton>
                                  </AgentSettingsActionRow>
                                  {toolPermissionsSaveError && <AppInlineError>{toolPermissionsSaveError}</AppInlineError>}
                                  {toolPermissionsFilteredTools.length === 0 ? (
                                    <AgentSettingsStateMessage text={t('agents.settings.noTools')} />
                                  ) : (
                                    <AgentSettingsStack data-testid="agent-settings-config-file-tool-permissions">
                                      {toolPermissionsFilteredTools.map((tool) => (
                                        <ToolPermissionsRow
                                          key={tool.name}
                                          tool={tool}
                                          workspace={toolGrantWorkspaceByName.get(tool.name)}
                                          configFileGranted={currentToolGrants.has(tool.name)}
                                          readOnly={!selectedConfigFileEditable}
                                          onWorkspaceChange={updateToolGrantWorkspace}
                                        />
                                      ))}
                                    </AgentSettingsStack>
                                  )}
                                </AgentSettingsStack>
                              )}
                            </AgentSettingsConfigFileEditorSection>
                            {selectedConfigFileDiff && <ConfigFileDiffPanel diff={selectedConfigFileDiff} />}
                            {configFileRollbackBackup && (
                              <AgentSettingsCallout data-testid="agent-settings-config-file-backup" tone="warning" compact>
                                <AgentSettingsStack>
                                  <AgentSettingsFieldHelp>
                                    {t('agents.settings.configFileBackupHelp', {
                                      name: configFileRollbackBackup.configFile.name,
                                      time: new Date(configFileRollbackBackup.createdAt).toLocaleString(),
                                    })}
                                  </AgentSettingsFieldHelp>
                                  <AgentSettingsActionRow>
                                    <AgentSettingsActionButton
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void restoreConfigFileRollbackBackup()}
                                      disabled={configFileManaging}
                                      data-testid="agent-settings-restore-config-file-backup"
                                    >
                                      {configFileManaging ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
                                      {t('agents.settings.restoreConfigFileBackup')}
                                    </AgentSettingsActionButton>
                                  </AgentSettingsActionRow>
                                </AgentSettingsStack>
                              </AgentSettingsCallout>
                            )}
                          </>
                        ) : (
                          <AgentSettingsStateMessage text={t('agents.settings.noConfigFiles')} />
                        )}
                      </AgentSettingsConfigFileEditorPane>
                    </AgentSettingsConfigFileEditor>
                  </AgentSettingsStack>
                )}
              </AgentSettingsPanel>



          </AgentSettingsMain>
        )}
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function currentAgentConfigFileId(inspect?: AgentInspectResponse): string {
  const raw = inspect?.activeConfigFileId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'movscript.config_file.base'
}

function buildSkillStats(skills: AgentCatalogSkill[]) {
  return {
    installed: skills.length,
    enabled: skills.filter((skill) => skill.enabled !== false).length,
    disabled: skills.filter((skill) => skill.enabled === false).length,
    core: skills.filter((skill) => skill.loadMode === 'core').length,
    onDemand: skills.filter((skill) => skill.loadMode === 'on_demand' || !skill.loadMode).length,
    manual: skills.filter((skill) => skill.loadMode === 'manual').length,
  }
}

function filterSkills(
  skills: AgentCatalogSkill[],
  filters: {
    search: string
    source: SkillSourceFilter
  },
): AgentCatalogSkill[] {
  const query = filters.search.trim().toLowerCase()
  return skills
    .filter((skill) => filters.source === 'all' || skillSourceKind(skill) === filters.source)
    .filter((skill) => {
      if (!query) return true
      const searchableValues = [
        skill.id,
        skill.name,
        skill.description,
        skill.version,
        skill.enabled ? 'enabled' : 'disabled',
        skill.instruction,
        skill.instructionTemplate,
        skill.source,
        skill.outputContract,
        skillSourceKind(skill),
        ...(skill.tags ?? []),
        ...(skill.aliases ?? []),
        ...(skill.useWhen ?? []),
        ...(skill.dependencies ?? []),
        ...(skill.conflicts ?? []),
        ...(skill.toolGrants ?? []),
        ...(skill.toolGrants ?? []),
        ...(skill.schemaRefs ?? []),
        ...(skill.toolHints ?? []),
        ...(skill.runtime?.dependencyIds ?? []),
        ...(skill.runtime?.conflictIds ?? []),
        ...(skill.runtime?.toolGrantNames ?? []),
      ]
      return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
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
  currentConfigFile: AgentCatalogConfigFile | null
  skillConfigIssues: SkillConfigIssue[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  skillStats: ReturnType<typeof buildSkillStats>
  toolStats: ReturnType<typeof buildToolStats>
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

function buildSettingsActionItems(input: {
  effectiveConfig: RuntimeModelConfigPublic | null
  selectedApiKind: RuntimeModelAPIKind
  workspaceBaseURL: string
  savedDirectModelIdHasSecret: boolean
  modelRoutes: NonNullable<RuntimeModelConfigPublic['capabilities']>
  modelRouteIssues: string[]
  currentConfigFile: AgentCatalogConfigFile | null
  skillConfigIssues: SkillConfigIssue[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  toolStats: ReturnType<typeof buildToolStats>
  tools?: AgentCapabilitiesResponse['resolvedTools']
  hasUnsavedChanges: boolean
  hasConfigFileChange: boolean
  hasSkillConfigChange: boolean
  hasToolPermissionsChange: boolean
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

  if (hasSensitiveURLSecret(input.workspaceBaseURL)) {
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

async function copyRedactedSettingsLines(lines: string[]) {
  await navigator.clipboard.writeText(lines.map(redactAgentTraceDebugText).join('\n'))
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

function buildSkillConfigWorkspaces(skills: AgentCatalogSkill[], configFile: AgentCatalogConfigFile | null): SkillConfigWorkspace[] {
  const configSkillIds = new Set(configFile?.skillIds ?? [])
  return skills.map((skill) => ({
    id: skill.id,
    enabled: skill.loadMode === 'core' || (configFile ? configSkillIds.has(skill.id) : skill.enabled !== false),
  }))
}

function buildSkillConfigChanges(workspaces: SkillConfigWorkspace[], baseline: SkillConfigWorkspace[]): SkillConfigWorkspace[] {
  const baselineById = new Map(baseline.map((workspace) => [workspace.id, workspace]))
  return workspaces.flatMap((workspace) => {
    const before = baselineById.get(workspace.id)
    if (!before) return [workspace]
    const change: SkillConfigWorkspace = { id: workspace.id, enabled: workspace.enabled }
    let changed = false
    if (before.enabled !== workspace.enabled) {
      change.enabled = workspace.enabled
      changed = true
    }
    return changed ? [change] : []
  })
}

function buildConfigFileSkillIds(workspaces: SkillConfigWorkspace[]): string[] {
  return workspaces.flatMap((workspace) => workspace.enabled ? [workspace.id] : [])
}

function buildSkillConfigIssues(
  skills: AgentCatalogSkill[],
  workspaces: SkillConfigWorkspace[],
  baseline: SkillConfigWorkspace[],
): SkillConfigIssue[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const enabledById = new Map(baseline.map((workspace) => [workspace.id, workspace.enabled]))
  for (const workspace of workspaces) enabledById.set(workspace.id, workspace.enabled)
  const baselineById = new Map(baseline.map((workspace) => [workspace.id, workspace.enabled]))
  const changedIds = workspaces
    .filter((workspace) => baselineById.get(workspace.id) !== workspace.enabled)
    .map((workspace) => workspace.id)
  const issues = new Map<string, SkillConfigIssue>()

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

function byteLength(value: string): number {
  return new Blob([value]).size
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function skillConfigSignature(workspaces: SkillConfigWorkspace[]): string {
  return JSON.stringify([...workspaces].sort((a, b) => a.id.localeCompare(b.id)))
}

function stringListSignature(values: string[]): string {
  return JSON.stringify([...new Set(values)].sort())
}

function buildToolStats(tools?: AgentCapabilitiesResponse['resolvedTools']) {
  const discovered = tools?.discovered ?? []
  const writeRisks = new Set<AgentDebugTool['risk']>(['write', 'generate', 'destructive', 'ui'])
  return {
    discovered: discovered.length,
    available: tools?.available.length ?? 0,
    blocked: tools?.blocked.length ?? 0,
    requiresApproval: discovered.filter((tool) => tool.runtime?.approvalRequired ?? tool.requiresApproval).length,
    writeRisk: discovered.filter((tool) => writeRisks.has(tool.risk)).length,
    availableWriteRisk: (tools?.available ?? []).filter((tool) => writeRisks.has(tool.risk)).length,
    projectScoped: discovered.filter((tool) => tool.projectScoped).length,
    readOnly: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.readOnly).length,
    concurrencySafe: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.concurrencySafe).length,
    destructive: discovered.filter((tool) => (tool.runtime?.execution ?? tool.execution)?.destructive).length,
    runtimeAllowed: discovered.filter((tool) => tool.runtime?.grantMode === 'allow').length,
    runtimeDenied: discovered.filter((tool) => tool.runtime?.grantMode === 'deny').length,
    runtimeNotGranted: discovered.filter((tool) => tool.runtime?.grantMode === 'none').length,
    runtime: discovered.filter((tool) => tool.source === 'runtime').length,
    local: discovered.filter((tool) => tool.source === 'local').length,
    plugin: discovered.filter((tool) => tool.source === 'plugin').length,
    mcp: discovered.filter((tool) => tool.source === 'mcp').length,
  }
}

function buildToolGrantWorkspaces(configFile: AgentCatalogConfigFile | null): ToolGrantWorkspace[] {
  const grants = configFile?.toolGrants ?? []
  return grants.map((grant) => ({
    name: grant.name,
    mode: grant.mode,
    ...(grant.approval ? { approval: grant.approval } : {}),
  }))
}

function buildSettingsSnapshotToolPermissionOverrides(input: {
  currentConfigFileId: string
  currentToolGrantWorkspaces: ToolGrantWorkspace[]
}): ConfigFileToolPermissionOverrides[] {
  const overridesByConfigFile = new Map<string, ToolGrantWorkspace[]>()
  if (input.currentConfigFileId) {
    overridesByConfigFile.set(input.currentConfigFileId, input.currentToolGrantWorkspaces)
  }
  return [...overridesByConfigFile.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([configFileId, toolGrants]) => ({
      configFileId,
      toolGrants: toolGrants.map((grant) => ({
        name: grant.name,
        mode: grant.mode,
        ...(grant.approval ? { approval: grant.approval } : {}),
      })),
    }))
}

function buildConfigFileRollbackBackup(input: {
  configFile: AgentCatalogConfigFile
  activeConfigFileId: string | null
}): AgentSettingsConfigFileBackup {
  return {
    configFile: input.configFile,
    toolPermissionOverrides: [],
    activeConfigFileId: input.activeConfigFileId,
    createdAt: new Date().toISOString(),
  }
}

function buildToolPermissionsWorkspaceIssues(input: {
  workspaces: ToolGrantWorkspace[]
  currentConfigFile: AgentCatalogConfigFile | null
  tools?: AgentCapabilitiesResponse['resolvedTools']
}): ToolPermissionsWorkspaceIssue[] {
  const configFileGranted = new Set((input.currentConfigFile?.toolGrants ?? []).map((grant) => grant.name))
  const discoveredByName = new Map((input.tools?.discovered ?? []).map((tool) => [tool.name, tool]))
  return input.workspaces.flatMap((workspace) => {
    if (!configFileGranted.has(workspace.name)) {
      return [{
        toolName: workspace.name,
        reasonKey: 'agents.settings.toolPermissionsWorkspaceIssueDetails.notConfigFileGranted',
      }]
    }
    const discovered = discoveredByName.get(workspace.name)
    if (discovered && !discovered.available && workspace.mode === 'allow') {
      return [{
        toolName: workspace.name,
        reasonKey: 'agents.settings.toolPermissionsWorkspaceIssueDetails.unavailableAllow',
        values: { reason: discovered.unavailableReason?.trim() || 'blocked' },
      }]
    }
    return []
  })
}

function targetSnapshotConfigFile(
  snapshot: AgentSettingsSnapshot,
  catalog: AgentInspectResponse | undefined,
  fallbackConfigFile: AgentCatalogConfigFile | null,
): AgentCatalogConfigFile | null {
  if (!snapshot.activeConfigFileId) return fallbackConfigFile
  return snapshot.configFiles?.find((configFile) => configFile.id === snapshot.activeConfigFileId)
    ?? catalog?.configFiles.find((configFile) => configFile.id === snapshot.activeConfigFileId)
    ?? fallbackConfigFile
}

function snapshotConfigFileById(
  snapshot: AgentSettingsSnapshot,
  configFileId: string,
  catalog: AgentInspectResponse | undefined,
  fallbackConfigFile: AgentCatalogConfigFile | null,
): AgentCatalogConfigFile | null {
  return snapshot.configFiles?.find((configFile) => configFile.id === configFileId)
    ?? catalog?.configFiles.find((configFile) => configFile.id === configFileId)
    ?? (fallbackConfigFile?.id === configFileId ? fallbackConfigFile : null)
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
    ...(selected.has('model') && snapshot.model ? { model: { ...snapshot.model } } : {}),
    ...(selected.has('configFile') && snapshot.activeConfigFileId ? { activeConfigFileId: snapshot.activeConfigFileId } : {}),
    ...(selected.has('configFile') && snapshot.configFiles ? { configFiles: snapshot.configFiles.map((configFile) => duplicateSnapshotConfigFile(configFile)) } : {}),
    ...(selected.has('limits') && snapshotRuntimeLimits(snapshot) ? { runtimeLimits: { ...snapshotRuntimeLimits(snapshot)! } } : {}),
    ...(selected.has('skills') && snapshot.skillConfig ? { skillConfig: snapshot.skillConfig.map((skill) => ({ ...skill })) } : {}),
    ...(selected.has('tools') && snapshot.toolPermissionOverrides ? { toolPermissionOverrides: snapshot.toolPermissionOverrides.map(cloneSnapshotToolPermissionOverrides) } : {}),
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
  if (scope === 'model') return Boolean(snapshot.model)
  if (scope === 'configFile') return Boolean(snapshot.activeConfigFileId || snapshot.configFiles?.length)
  if (scope === 'limits') return Boolean(snapshotRuntimeLimits(snapshot))
  if (scope === 'skills') return Boolean(snapshot.skillConfig)
  return Boolean(snapshot.toolPermissionOverrides)
}

function cloneSnapshotToolPermissionOverrides(overrides: ConfigFileToolPermissionOverrides): ConfigFileToolPermissionOverrides {
  return {
    configFileId: overrides.configFileId,
    toolGrants: overrides.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
  }
}

function snapshotRuntimeLimits(snapshot: AgentSettingsSnapshot): NonNullable<AgentSettingsSnapshot['runtimeLimits']> | undefined {
  if (snapshot.runtimeLimits && Object.keys(snapshot.runtimeLimits).length > 0) return cloneRuntimeLimits(snapshot.runtimeLimits)
  const target = targetSnapshotConfigFile(snapshot, undefined, snapshot.configFiles?.[0] ?? null)
  return target?.limits && Object.keys(target.limits).length > 0 ? cloneRuntimeLimits(target.limits) : undefined
}

function cloneRuntimeLimits(limits: AgentSettingsSnapshot['runtimeLimits']): NonNullable<AgentSettingsSnapshot['runtimeLimits']> | undefined {
  if (!limits) return undefined
  const cloned: NonNullable<AgentSettingsSnapshot['runtimeLimits']> = {}
  for (const [key, value] of Object.entries(limits)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      ;(cloned as Record<string, number>)[key] = value
      continue
    }
    if (key === 'executionMode' && (value === 'compact' || value === 'standard' || value === 'deep')) {
      cloned.executionMode = value
      continue
    }
    if (key === 'allowForcedToolCalls' && typeof value === 'boolean') {
      cloned.allowForcedToolCalls = value
    }
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined
}

function duplicateSnapshotConfigFile(configFile: AgentCatalogConfigFile): AgentCatalogConfigFile {
  return {
    ...configFile,
    enabledPackIds: [...configFile.enabledPackIds],
    skillIds: [...configFile.skillIds],
    ...(configFile.approvalDefaults ? { approvalDefaults: { ...configFile.approvalDefaults } } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({ ...grant })),
    ...(configFile.model ? { model: { ...configFile.model, ...(Array.isArray(configFile.model.routes) ? { routes: [...configFile.model.routes] } : {}) } } : {}),
    ...(configFile.limits ? { limits: { ...configFile.limits } } : {}),
    ...(configFile.metadata ? { metadata: { ...configFile.metadata } } : {}),
  }
}

function isManagedConfigFile(configFile: AgentCatalogConfigFile | null | undefined): boolean {
  return configFile?.metadata?.managed === true
}

function markConfigFileManaged(configFile: AgentCatalogConfigFile): AgentCatalogConfigFile {
  return {
    ...configFile,
    metadata: { ...(configFile.metadata ?? {}), managed: true },
  }
}

function safeConfigFileExportName(configFile: AgentCatalogConfigFile): string {
  return (configFile.name || configFile.id)
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    || 'config-file'
}

function emptyConfigFileLimitWorkspaces(): Record<ConfigFileLimitKey, string> {
  return Object.fromEntries(CONFIG_FILE_LIMIT_KEYS.map((key) => [key, ''])) as Record<ConfigFileLimitKey, string>
}

function emptyConfigFileApprovalDefaultWorkspaces(): Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue> {
  return Object.fromEntries(CONFIG_FILE_APPROVAL_DEFAULT_KEYS.map((key) => [key, 'inherit'])) as Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>
}

function configFileLimitWorkspacesFromConfigFile(configFile: AgentCatalogConfigFile | null): Record<ConfigFileLimitKey, string> {
  const workspaces = emptyConfigFileLimitWorkspaces()
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const value = configFile?.limits?.[key]
    workspaces[key] = typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
  }
  return workspaces
}

function normalizeConfigFileLimitWorkspaces(workspaces: Record<ConfigFileLimitKey, string>): NonNullable<AgentCatalogConfigFile['limits']> {
  const limits: NonNullable<AgentCatalogConfigFile['limits']> = {}
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const raw = workspaces[key].trim()
    if (!raw) continue
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0) limits[key] = Math.floor(value)
  }
  return limits
}

function configFileLimitSignature(limits: AgentCatalogConfigFile['limits']): string {
  return JSON.stringify(Object.fromEntries(CONFIG_FILE_LIMIT_KEYS.flatMap((key) => (
    typeof limits?.[key] === 'number' && Number.isFinite(limits[key]) ? [[key, Math.floor(limits[key])]] : []
  ))))
}

function configFileApprovalDefaultWorkspacesFromConfigFile(configFile: AgentCatalogConfigFile | null): Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue> {
  const workspaces = emptyConfigFileApprovalDefaultWorkspaces()
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const value = configFile?.approvalDefaults?.[key]
    workspaces[key] = value === 'never' || value === 'on_write' || value === 'always' ? value : 'inherit'
  }
  return workspaces
}

function normalizeConfigFileApprovalDefaultWorkspaces(
  workspaces: Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>,
): NonNullable<AgentCatalogConfigFile['approvalDefaults']> {
  const config: NonNullable<AgentCatalogConfigFile['approvalDefaults']> = {}
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const approval = workspaces[key]
    if (approval !== 'inherit') config[key] = approval
  }
  return config
}

function configFileApprovalDefaultSignature(config: AgentCatalogConfigFile['approvalDefaults']): string {
  return JSON.stringify(Object.fromEntries(CONFIG_FILE_APPROVAL_DEFAULT_KEYS.flatMap((key) => {
    const approval = config?.[key]
    return approval === 'never' || approval === 'on_write' || approval === 'always' ? [[key, approval]] : []
  })))
}

function buildConfigFileDiff(
  current: AgentCatalogConfigFile,
  next: AgentCatalogConfigFile,
  t: ReturnType<typeof useTranslation>['t'],
): ConfigFileDiff {
  return {
    packs: diffStringLists(current.enabledPackIds, next.enabledPackIds),
    skills: diffStringLists(current.skillIds, next.skillIds),
    tools: diffToolGrants(current.toolGrants, next.toolGrants),
    approvalDefaults: diffConfigFileApprovalDefaults(current.approvalDefaults, next.approvalDefaults, t),
    limits: diffConfigFileLimits(current.limits, next.limits, t),
  }
}

function duplicateConfigFileForManagement(configFile: AgentCatalogConfigFile, existing: AgentCatalogConfigFile[], copySuffix: string): AgentCatalogConfigFile {
  const existingIds = new Set(existing.map((item) => item.id))
  const baseId = `${configFile.id}.copy`.replace(/[^a-zA-Z0-9._-]/g, '_')
  let id = baseId
  let index = 2
  while (existingIds.has(id)) {
    id = `${baseId}.${index}`
    index += 1
  }
  return {
    ...configFile,
    id,
    name: `${configFile.name} ${copySuffix}`.trim(),
    version: '1.0.0',
    enabledPackIds: [...configFile.enabledPackIds],
    skillIds: [...configFile.skillIds],
    ...(configFile.approvalDefaults ? { approvalDefaults: { ...configFile.approvalDefaults } } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({ ...grant })),
    ...(configFile.model ? { model: { ...configFile.model } } : {}),
    ...(configFile.limits ? { limits: { ...configFile.limits } } : {}),
    ...(configFile.metadata ? { metadata: { ...configFile.metadata, managed: true } } : { metadata: { managed: true } }),
  }
}

function createBlankConfigFileForManagement(existing: AgentCatalogConfigFile[], name: string): AgentCatalogConfigFile {
  const existingIds = new Set(existing.map((item) => item.id))
  const baseId = 'config_file.custom'
  let id = baseId
  let index = 2
  while (existingIds.has(id)) {
    id = `${baseId}.${index}`
    index += 1
  }
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version: '1.0.0',
    name,
    enabledPackIds: [],
    skillIds: [],
    toolGrants: [],
    metadata: { managed: true },
  }
}

function diffStringLists(current: string[], next: string[]): ConfigFileDiffSection {
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  return {
    added: next.filter((item) => !currentSet.has(item)),
    removed: current.filter((item) => !nextSet.has(item)),
  }
}

function diffToolGrants(current: AgentCatalogConfigFile['toolGrants'], next: AgentCatalogConfigFile['toolGrants']): ConfigFileDiffSection {
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

function diffConfigFileApprovalDefaults(
  current: AgentCatalogConfigFile['approvalDefaults'],
  next: AgentCatalogConfigFile['approvalDefaults'],
  t: ReturnType<typeof useTranslation>['t'],
): ConfigFileDiffSection {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const currentValue = current?.[key]
    const nextValue = next?.[key]
    if (currentValue === nextValue) continue
    if (!currentValue && nextValue) added.push(configFileApprovalDefaultDiffLabel(key, nextValue, t))
    else if (currentValue && !nextValue) removed.push(configFileApprovalDefaultDiffLabel(key, currentValue, t))
    else changed.push(`${configFileApprovalDefaultFieldLabel(key, t)}: ${configFileApprovalValueLabel(currentValue, t)} -> ${configFileApprovalValueLabel(nextValue, t)}`)
  }
  return { added, removed, changed }
}

function diffConfigFileLimits(
  current: AgentCatalogConfigFile['limits'],
  next: AgentCatalogConfigFile['limits'],
  t: ReturnType<typeof useTranslation>['t'],
): ConfigFileDiffSection {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const currentValue = configFileLimitValue(current, key)
    const nextValue = configFileLimitValue(next, key)
    if (currentValue === nextValue) continue
    if (currentValue === undefined && nextValue !== undefined) added.push(configFileLimitDiffLabel(key, nextValue, t))
    else if (currentValue !== undefined && nextValue === undefined) removed.push(configFileLimitDiffLabel(key, currentValue, t))
    else changed.push(`${configFileLimitFieldLabel(key, t)}: ${currentValue} -> ${nextValue}`)
  }
  return { added, removed, changed }
}

function configFileLimitValue(limits: AgentCatalogConfigFile['limits'], key: ConfigFileLimitKey): number | undefined {
  const value = limits?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined
}

function configFileApprovalDefaultDiffLabel(
  key: ConfigFileApprovalDefaultKey,
  value: NonNullable<AgentCatalogConfigFile['approvalDefaults']>[ConfigFileApprovalDefaultKey],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return `${configFileApprovalDefaultFieldLabel(key, t)}:${configFileApprovalValueLabel(value, t)}`
}

function configFileApprovalDefaultFieldLabel(key: ConfigFileApprovalDefaultKey, t: ReturnType<typeof useTranslation>['t']): string {
  return t(`agents.settings.configFileApprovalDefaultFields.${key}`)
}

function configFileApprovalValueLabel(value: string | undefined, t: ReturnType<typeof useTranslation>['t']): string {
  if (!value) return t('agents.settings.configFileApprovalDefaultInherited')
  return t(`agents.settings.toolPermissionsApprovals.${value === 'on_write' ? 'onWrite' : value}`)
}

function configFileLimitDiffLabel(key: ConfigFileLimitKey, value: number, t: ReturnType<typeof useTranslation>['t']): string {
  return `${configFileLimitFieldLabel(key, t)}:${value}`
}

function configFileLimitFieldLabel(key: ConfigFileLimitKey, t: ReturnType<typeof useTranslation>['t']): string {
  return t(`agents.settings.configFileLimitFields.${key}`)
}

function toolGrantSignature(grants: ToolGrantWorkspace[]): string {
  return JSON.stringify([...grants]
    .map((grant) => ({ name: grant.name, mode: grant.mode, approval: grant.approval ?? 'never' }))
    .sort((a, b) => a.name.localeCompare(b.name)))
}

function buildToolPermissionsDiffItems(before: ToolGrantWorkspace[], after: ToolGrantWorkspace[]): ToolPermissionsDiffItem[] {
  const beforeByName = new Map(before.map((grant) => [grant.name, grant]))
  const afterByName = new Map(after.map((grant) => [grant.name, grant]))
  const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort((a, b) => a.localeCompare(b))
  return names.flatMap((name): ToolPermissionsDiffItem[] => {
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

function toolPermissionsRank(tool: AgentDebugTool): number {
  if (!tool.available) return 0
  if (tool.requiresApproval) return 1
  if (tool.risk === 'destructive') return 2
  if (tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'ui') return 3
  return 4
}

function toolPermissionsFilterMatches(tool: AgentDebugTool, filter: ToolPermissionsFilter, currentToolGrants: Set<string>): boolean {
  if (filter === 'available') return tool.available
  if (filter === 'blocked') return !tool.available
  if (filter === 'config_file_granted') return currentToolGrants.has(tool.name)
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

function buildRuntimeModelConfigFromSnapshotModel(
  model: NonNullable<AgentSettingsSnapshot['model']>,
): Parameters<typeof localAgentClient.saveModelConfig>[0] {
  const platformModelId = model.platformModelId ? Number(model.platformModelId) : NaN
  return {
    model: model.model,
    ...(Number.isFinite(platformModelId) ? { modelConfigId: platformModelId } : {}),
    ...(model.apiKind ? { apiKind: model.apiKind } : {}),
    ...(model.baseURL ? { baseURL: model.baseURL } : {}),
    useForChat: model.useForChat !== false,
    useForPlanner: model.useForPlanner !== false,
  }
}

function apiKindBaseURLPlaceholder(apiKind: RuntimeModelAPIKind): string {
  if (apiKind === 'openai_chat_completions') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'openai_responses') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'anthropic_messages') return `${getAPIBaseURL()}/v1`
  return `${getAPIBaseURL()}/v1`
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

function settingsQuickFixAuditAction(kind: SettingsQuickFixAuditKind): string {
  if (kind === 'workspace_reset') return 'settings_quick_fix_workspace_reset'
  if (kind === 'workspace_repair') return 'settings_quick_fix_workspace_repair'
  if (kind === 'sensitive_cleanup') return 'settings_quick_fix_sensitive_cleanup'
  if (kind === 'mode_migration') return 'settings_quick_fix_mode_migration'
  if (kind === 'route_enable') return 'settings_quick_fix_route_enable'
  return 'settings_quick_fix_clear_confirmation'
}

function uniqueToolPermissionsFilterPresetId(name: string, existingIds: string[]): string {
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

function toolPermissionsFilterPresetName(filter: ToolPermissionsFilter, search: string, t: ReturnType<typeof useTranslation>['t']): string {
  const filterLabel = t(`agents.settings.toolPermissionsFilters.${filter}`)
  return search ? `${filterLabel}: ${search}` : filterLabel
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
        { id: 'model', label: t('agents.settings.settingsSnapshotFields.model'), value: snapshot.model?.model ? redactAgentTraceDebugText(snapshot.model.model) : '-' },
        { id: 'configFile', label: t('agents.settings.settingsSnapshotFields.configFile'), value: snapshot.activeConfigFileId ?? '-' },
        { id: 'configFiles', label: t('agents.settings.settingsSnapshotFields.configFiles'), value: snapshot.configFiles?.length ?? 0 },
        { id: 'runtimeLimits', label: t('agents.settings.settingsSnapshotFields.runtimeLimits'), value: snapshotRuntimeLimits(snapshot) ? Object.keys(snapshotRuntimeLimits(snapshot)!).length : 0 },
        { id: 'skills', label: t('agents.settings.settingsSnapshotFields.skills'), value: snapshot.skillConfig?.length ?? 0 },
        { id: 'tools', label: t('agents.settings.settingsSnapshotFields.tools'), value: settingsSnapshotToolPermissionOverrideGrantCount(snapshot.toolPermissionOverrides) },
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
        statusProps: agentSettingsRecipe(item.scope === 'config' || item.scope === 'local' ? 'warning' : 'neutral'),
      }))}
    />
  )
}

function buildSettingsSnapshotImpactItems(snapshot: AgentSettingsSnapshot): SettingsSnapshotImpactItem[] {
  return [
    snapshot.model
      ? {
        id: 'model',
        scope: 'local',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.model',
        detailValues: { model: redactAgentTraceDebugText(snapshot.model.model) },
      }
      : {
        id: 'model',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.modelSkipped',
      },
    snapshot.activeConfigFileId || snapshot.configFiles?.length
      ? {
        id: 'configFile',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.configFile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.configFile',
        detailValues: { configFileId: snapshot.activeConfigFileId ?? '-', count: snapshot.configFiles?.length ?? 0 },
      }
      : {
        id: 'configFile',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.configFile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.configFileSkipped',
      },
    snapshotRuntimeLimits(snapshot)
      ? {
        id: 'limits',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.limits',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.limits',
        detailValues: { count: Object.keys(snapshotRuntimeLimits(snapshot)!).length },
      }
      : {
        id: 'limits',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.limits',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.limitsSkipped',
      },
    snapshot.skillConfig
      ? {
        id: 'skills',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skills',
        detailValues: { count: snapshot.skillConfig.length },
      }
      : {
        id: 'skills',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skillsSkipped',
      },
    snapshot.toolPermissionOverrides
      ? {
        id: 'tools',
        scope: 'local',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.tools',
        detailValues: { count: settingsSnapshotToolPermissionOverrideGrantCount(snapshot.toolPermissionOverrides) },
      }
      : {
        id: 'tools',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.toolsSkipped',
      },
  ]
}

function settingsSnapshotToolPermissionOverrideGrantCount(overrides: ConfigFileToolPermissionOverrides[] | undefined): number {
  return (overrides ?? []).reduce((sum, item) => sum + item.toolGrants.length, 0)
}

function settingsSectionLabelKey(sectionId: SettingsActionItem['targetSection']): string {
  return SETTINGS_NAV_SECTIONS.find((section) => section.id === sectionId)?.labelKey ?? 'agents.settings.title'
}

function SkillRow({
  skill,
  workspace,
  readOnly = false,
  onWorkspaceChange,
}: {
  skill: AgentCatalogSkill
  workspace?: SkillConfigWorkspace
  readOnly?: boolean
  onWorkspaceChange: (id: string, enabled: boolean) => void
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
      versionLabel={skill.version ? `v${skill.version}` : undefined}
      sourceLabel={skillSourceLabel(skill, t)}
      priorityLabel={typeof skill.priority === 'number' ? `p${skill.priority}` : undefined}
      workspaceEnabled={workspace?.enabled}
      workspaceDisabled={readOnly || isCore}
      workspaceLocked={readOnly || isCore}
      workspaceTitle={workspace ? (workspace.enabled ? t('agents.settings.skillStatus.enabled') : t('agents.settings.skillStatus.disabled')) : undefined}
      workspaceHelp={workspace ? (readOnly ? t('agents.settings.configFileReadonlyHelp') : isCore ? t('agents.settings.skillConfigCoreLocked') : t('agents.settings.skillConfigToggleHelp')) : undefined}
      onWorkspaceChange={workspace ? (checked) => onWorkspaceChange(skill.id, checked) : undefined}
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

function ConfigFileRow({ configFile, current = false, preview = false }: { configFile: AgentCatalogConfigFile; current?: boolean; preview?: boolean }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsConfigFileCard
      name={configFile.name}
      idLabel={configFile.id}
      description={configFile.description}
      versionLabel={`v${configFile.version}`}
      current={current}
      preview={preview}
      currentLabel={t('agents.settings.configFileStatus.current')}
      previewLabel={t('agents.settings.configFileStatus.selected')}
      summaryItems={configFileSummaryItems(configFile, t)}
    />
  )
}

function ConfigFileDiffPanel({ diff }: { diff: ConfigFileDiff }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsConfigFileDiffPanel
      title={t('agents.settings.configFileDiffTitle')}
      sections={[
        configFileDiffSection('packs', t('agents.settings.configFileFields.packs'), diff.packs, t),
        configFileDiffSection('skills', t('agents.settings.configFileFields.skills'), diff.skills, t),
        configFileDiffSection('tools', t('agents.settings.configFileFields.tools'), diff.tools, t),
        configFileDiffSection('approvalDefaults', t('agents.settings.configFileFields.approvalDefaults'), diff.approvalDefaults, t),
        configFileDiffSection('limits', t('agents.settings.configFileLimitsLabel'), diff.limits, t),
      ]}
    />
  )
}

function configFileSummaryItems(configFile: AgentCatalogConfigFile, t: ReturnType<typeof useTranslation>['t']) {
  return [
    { id: 'packs', label: t('agents.settings.configFileFields.packs'), value: configFileSummaryValue(configFile.enabledPackIds) },
    { id: 'skills', label: t('agents.settings.configFileFields.skills'), value: configFileSummaryValue(configFile.skillIds) },
    { id: 'approvalDefaults', label: t('agents.settings.configFileFields.approvalDefaults'), value: configFileSummaryValue(configFileApprovalDefaultSummaryValues(configFile.approvalDefaults, t)) },
    { id: 'limits', label: t('agents.settings.configFileLimitsLabel'), value: configFileSummaryValue(configFileLimitSummaryValues(configFile.limits, t)) },
    { id: 'tools', label: t('agents.settings.configFileFields.tools'), value: configFileSummaryValue(configFile.toolGrants.map((grant) => `${grant.name}:${grant.mode}`)) },
  ]
}

function configFileListSummary(configFile: AgentCatalogConfigFile, t: ReturnType<typeof useTranslation>['t']) {
  return [
    `${t('agents.settings.configFileFields.packs')}: ${configFile.enabledPackIds.length}`,
    `${t('agents.settings.configFileFields.skills')}: ${configFile.skillIds.length}`,
    `${t('agents.settings.configFileFields.toolGrants')}: ${configFile.toolGrants.length}`,
  ].join(' / ')
}

function configFileSummaryValue(values: string[]) {
  return values.length > 0 ? values.slice(0, 3).join(', ') : '-'
}

function configFileApprovalDefaultSummaryValues(
  config: AgentCatalogConfigFile['approvalDefaults'],
  t: ReturnType<typeof useTranslation>['t'],
): string[] {
  return CONFIG_FILE_APPROVAL_DEFAULT_KEYS.flatMap((key) => {
    const value = config?.[key]
    return value ? [configFileApprovalDefaultDiffLabel(key, value, t)] : []
  })
}

function configFileLimitSummaryValues(
  limits: AgentCatalogConfigFile['limits'],
  t: ReturnType<typeof useTranslation>['t'],
): string[] {
  return CONFIG_FILE_LIMIT_KEYS.flatMap((key) => {
    const value = configFileLimitValue(limits, key)
    return value === undefined ? [] : [configFileLimitDiffLabel(key, value, t)]
  })
}

function configFileDiffSection(
  id: string,
  label: string,
  section: ConfigFileDiffSection,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const lines = [
    ...(section.added.length > 0 ? [`${t('agents.settings.configFileDiffAdded')}: ${section.added.slice(0, 4).join(', ')}`] : []),
    ...(section.removed.length > 0 ? [`${t('agents.settings.configFileDiffRemoved')}: ${section.removed.slice(0, 4).join(', ')}`] : []),
    ...((section.changed?.length ?? 0) > 0 ? [`${t('agents.settings.configFileDiffChanged')}: ${section.changed!.slice(0, 4).join(', ')}`] : []),
  ]
  return {
    id,
    label,
    lines,
    emptyLabel: t('agents.settings.configFileDiffNoChange'),
  }
}

function ToolPermissionsDiffPreview({ items }: { items: ToolPermissionsDiffItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const added = items.filter((item) => item.change === 'added').length
  const removed = items.filter((item) => item.change === 'removed').length
  const changed = items.filter((item) => item.change === 'changed').length
  async function copyToolPermissionsDiffSummary() {
    const lines = [
      t('agents.settings.toolPermissionsDiffSummaryTitle'),
      t('agents.settings.toolPermissionsDiffSummary', { added, removed, changed }),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.toolPermissionsDiffChangeTypes.${item.change}`)}] ${item.name}: ${formatToolPermissionsDiffValue(t, item.beforeMode, item.beforeApproval)} -> ${formatToolPermissionsDiffValue(t, item.afterMode, item.afterApproval)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (items.length === 0) return null
  return (
    <AgentSettingsToolPermissionsDiffPanel
      title={t('agents.settings.toolPermissionsDiffPreview')}
      summary={t('agents.settings.toolPermissionsDiffSummary', { added, removed, changed })}
      copyLabel={t('agents.settings.copyToolPermissionsDiff')}
      copiedLabel={t('agents.settings.toolPermissionsDiffCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copyToolPermissionsDiffSummary()}
      items={items.map((item) => ({
        id: `${item.change}:${item.name}`,
        name: item.name,
        beforeLabel: formatToolPermissionsDiffValue(t, item.beforeMode, item.beforeApproval),
        afterLabel: formatToolPermissionsDiffValue(t, item.afterMode, item.afterApproval),
        changeLabel: t(`agents.settings.toolPermissionsDiffChangeTypes.${item.change}`),
        statusProps: agentSettingsRecipe(item.change === 'removed' ? 'warning' : item.change === 'added' ? 'success' : 'neutral'),
      }))}
    />
  )
}

function formatToolPermissionsDiffValue(
  t: ReturnType<typeof useTranslation>['t'],
  mode?: ToolGrantWorkspace['mode'],
  approval?: ToolGrantWorkspace['approval'],
): string {
  if (!mode) return t('agents.settings.toolPermissionsDiffValues.none')
  const approvalKey = approval ?? 'never'
  return t('agents.settings.toolPermissionsDiffValues.grant', {
    mode: t(`agents.settings.toolPermissionsModes.${mode}`),
    approval: t(`agents.settings.toolPermissionsApprovals.${approvalKey === 'on_write' ? 'onWrite' : approvalKey}`),
  })
}

function ToolPermissionsRow({
  tool,
  workspace,
  configFileGranted,
  readOnly = false,
  onWorkspaceChange,
}: {
  tool: AgentDebugTool
  workspace?: ToolGrantWorkspace
  configFileGranted: boolean
  readOnly?: boolean
  onWorkspaceChange: (name: string, patch: Partial<ToolGrantWorkspace>) => void
}) {
  const { t } = useTranslation()
  const canAllow = !readOnly && tool.available && configFileGranted
  return (
    <AgentSettingsToolPermissionsRow
      name={tool.name}
      sourceLabel={tool.source}
      permissionLabel={tool.permission ?? t('agents.settings.toolPermissionsValues.none')}
      riskLabel={tool.risk ?? t('agents.settings.toolPermissionsValues.unknown')}
      approvalStatusLabel={tool.approval}
      available={tool.available}
      availableLabel={t('agents.settings.toolPermissionsStatus.available')}
      blockedLabel={t('agents.settings.toolPermissionsStatus.blocked')}
      configFileGranted={configFileGranted}
      configFileGrantedLabel={t('agents.settings.toolPermissionsStatus.configFileGranted')}
      requiresApproval={tool.requiresApproval}
      description={tool.description}
      workspace={workspace && !readOnly ? { mode: workspace.mode, approval: workspace.approval ?? 'never', canAllow } : undefined}
      modeLabel={t('agents.settings.toolPermissionsFields.mode')}
      approvalLabel={t('agents.settings.toolPermissionsFields.approval')}
      allowLabel={t('agents.settings.toolPermissionsModes.allow')}
      denyLabel={t('agents.settings.toolPermissionsModes.deny')}
      approvalNeverLabel={t('agents.settings.toolPermissionsApprovals.never')}
      approvalOnWriteLabel={t('agents.settings.toolPermissionsApprovals.onWrite')}
      approvalAlwaysLabel={t('agents.settings.toolPermissionsApprovals.always')}
      allowDisabledHelp={t('agents.settings.toolPermissionsAllowDisabled')}
      onModeChange={(mode) => onWorkspaceChange(tool.name, { mode })}
      onApprovalChange={(approval) => onWorkspaceChange(tool.name, { approval })}
      metaItems={toolPermissionsMetaItems(tool, t)}
    />
  )
}

function toolPermissionsMetaItems(
  tool: AgentDebugTool,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const execution = tool.runtime?.execution ?? tool.execution
  return [
    {
      id: 'registered',
      label: `${t('agents.settings.toolPermissionsFields.registered')}: ${tool.registered ? t('agents.settings.toolPermissionsValues.yes') : t('agents.settings.toolPermissionsValues.no')}`,
    },
    {
      id: 'granted',
      label: `${t('agents.settings.toolPermissionsFields.granted')}: ${tool.granted ? t('agents.settings.toolPermissionsValues.yes') : t('agents.settings.toolPermissionsValues.no')}`,
    },
    ...(tool.runtime ? [{
      id: 'grantMode',
      label: `${t('agents.settings.toolPermissionsFields.grantMode')}: ${t(`agents.settings.toolPermissionsModes.${tool.runtime.grantMode === 'none' ? 'none' : tool.runtime.grantMode}`)}`,
    }] : []),
    ...(tool.runtime ? [{
      id: 'approvalReason',
      label: `${t('agents.settings.toolPermissionsFields.approvalReason')}: ${t(`agents.settings.toolApprovalReasons.${tool.runtime.approvalReason}`)}`,
    }] : []),
    ...(tool.projectScoped ? [{ id: 'projectScoped', label: t('agents.settings.toolPermissionsFields.projectScoped') }] : []),
    ...(execution?.readOnly ? [{ id: 'readOnly', label: t('agents.settings.toolPermissionsFields.readOnly') }] : []),
    ...(execution?.concurrencySafe ? [{ id: 'concurrencySafe', label: t('agents.settings.toolPermissionsFields.concurrencySafe') }] : []),
    ...(execution?.destructive ? [{ id: 'destructive', label: t('agents.settings.toolPermissionsFields.destructive'), tone: 'warning' as const }] : []),
    ...(execution?.interruptBehavior ? [{
      id: 'interruptBehavior',
      label: `${t('agents.settings.toolPermissionsFields.interruptBehavior')}: ${t(`agents.settings.toolInterruptBehaviors.${execution.interruptBehavior}`)}`,
    }] : []),
    ...(execution?.resultRefStrategy ? [{
      id: 'resultRefStrategy',
      label: `${t('agents.settings.toolPermissionsFields.resultRefStrategy')}: ${t(`agents.settings.toolResultRefStrategies.${execution.resultRefStrategy}`)}`,
    }] : []),
    ...(tool.unavailableReason ? [{ id: 'unavailableReason', label: tool.unavailableReason, tone: 'warning' as const }] : []),
    ...(tool.runtime?.reason ? [{ id: 'runtimeReason', label: `${t('agents.settings.toolPermissionsFields.runtimeReason')}: ${tool.runtime.reason}` }] : []),
  ]
}

function skillSourceKind(skill: AgentCatalogSkill): SkillSourceKind {
  if (skill.loadMode === 'core') return 'core'
  const source = skill.source ?? (typeof skill.metadata?.source === 'string' ? skill.metadata.source : '')
  const pluginId = typeof skill.metadata?.pluginId === 'string' ? skill.metadata.pluginId : ''
  if (source === 'team') return 'team'
  if (source === 'mcp') return 'mcp'
  if (source === 'plugin' || pluginId) return 'plugin'
  if (skill.loadMode === 'manual' || source === 'local') return 'local'
  return 'catalog'
}

function skillSourceLabel(skill: AgentCatalogSkill, t: (key: string) => string): string {
  return t(`agents.settings.skillSources.${skillSourceKind(skill)}`)
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

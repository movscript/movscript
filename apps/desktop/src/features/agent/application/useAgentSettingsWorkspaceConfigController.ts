import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { redactAgentTraceDebugText, type SkillConfigWorkspace, type ToolGrantWorkspace } from '@movscript/core/agent'
import {
  buildSkillConfigFileSavePlan,
  buildToolPermissionsConfigFileSavePlan,
  buildToolPermissionsDiffItems,
  buildToolPermissionsWorkspaceIssues,
  toolGrantSignature,
  type ProviderConfigFileCommitPlan,
} from '@/features/agent/application/agentSettingsConfigFile'
import type {
  ToolPermissionsWorkspaceIssue,
} from '@/features/agent/application/agentSettingsReadiness'
import {
  buildConfigFileSkillIds,
  buildSkillConfigChanges,
  buildSkillConfigIssues,
  buildSkillConfigWorkspaces,
  buildSkillStats,
  filterSkills,
  stringListSignature,
  type SkillSourceFilter,
} from '@/features/agent/presentation/agentSettingsSkillModel'
import {
  applyToolPermissionsBulkAction,
  buildToolPermissionsFilterPresetUpdate,
  buildToolGrantWorkspaces,
  buildToolStats,
  currentToolGrantNames,
  filterToolPermissions,
  repairToolGrantWorkspaces,
  toolGrantWorkspaceMap,
  type ToolPermissionsBulkAction,
  type ToolPermissionsFilter,
} from '@/features/agent/presentation/agentSettingsToolPermissionsModel'
import { settingsErrorMessage, toolPermissionsAuditSummaryValues, type SettingsQuickFixAuditKind } from '@/features/agent/presentation/agentSettingsPageModel'
import type { AgentSettingsAuditEntry, AgentToolPermissionsFilterPreset } from '@/features/agent/state/agentStore'
import type {
  ProviderCatalogConfigFile,
  ProviderCatalogInspectResponse,
  ProviderSessionCapabilitiesResponse,
} from '@movscript/agent-protocol'

interface UseAgentSettingsWorkspaceConfigControllerInput {
  catalog?: ProviderCatalogInspectResponse
  capabilities?: ProviderSessionCapabilitiesResponse
  commitCatalogPlan: (
    plan: ProviderConfigFileCommitPlan,
    options?: { refetchCapabilities?: boolean; backupUpdate?: 'when-present' | 'always' },
  ) => Promise<unknown>
  currentConfigFile: ProviderCatalogConfigFile | null
  filterPresets: AgentToolPermissionsFilterPreset[]
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  recordSettingsQuickFix: (
    target: AgentSettingsAuditEntry['target'],
    quickFixLabelKey: string,
    kind: SettingsQuickFixAuditKind,
  ) => void
  refetchCatalog: () => Promise<unknown>
  selectedConfigFile: ProviderCatalogConfigFile | null
  selectedConfigFileEditable: boolean
  t: TFunction
  updateAgentSettings: (settings: { toolPermissionsFilterPresets: AgentToolPermissionsFilterPreset[] }) => void
}

export function useAgentSettingsWorkspaceConfigController({
  catalog,
  capabilities,
  commitCatalogPlan,
  currentConfigFile,
  filterPresets,
  recordSettingsAudit,
  recordSettingsQuickFix,
  refetchCatalog,
  selectedConfigFile,
  selectedConfigFileEditable,
  t,
  updateAgentSettings,
}: UseAgentSettingsWorkspaceConfigControllerInput) {
  const [skillWorkspaces, setSkillWorkspaces] = useState<SkillConfigWorkspace[]>([])
  const [skillConfigSaving, setSkillConfigSaving] = useState(false)
  const [skillConfigSaveError, setSkillConfigSaveError] = useState<string | null>(null)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillSourceFilter, setSkillSourceFilter] = useState<SkillSourceFilter>('all')
  const [toolGrantWorkspaces, setToolGrantWorkspaces] = useState<ToolGrantWorkspace[]>([])
  const [toolPermissionsSaving, setToolPermissionsSaving] = useState(false)
  const [toolPermissionsSaveError, setToolPermissionsSaveError] = useState<string | null>(null)
  const [toolPermissionsSearch, setToolPermissionsSearch] = useState('')
  const [toolPermissionsFilter, setToolPermissionsFilter] = useState<ToolPermissionsFilter>('all')

  const skills = catalog?.skills ?? []
  const resolvedTools = capabilities?.resolvedTools
  const skillStats = useMemo(() => buildSkillStats(skills), [skills])
  const filteredSkills = useMemo(() => filterSkills(skills, {
    search: skillSearch,
    source: skillSourceFilter,
  }), [skills, skillSearch, skillSourceFilter])
  const toolStats = useMemo(() => buildToolStats(resolvedTools), [resolvedTools])
  const skillConfigBaseline = useMemo(() => buildSkillConfigWorkspaces(skills, selectedConfigFile), [skills, selectedConfigFile])
  const skillWorkspaceById = useMemo(() => new Map(skillWorkspaces.map((workspace) => [workspace.id, workspace])), [skillWorkspaces])
  const currentToolGrants = useMemo(() => currentToolGrantNames(selectedConfigFile), [selectedConfigFile])
  const toolGrantBaseline = useMemo(() => buildToolGrantWorkspaces(selectedConfigFile), [selectedConfigFile])
  const toolGrantWorkspaceByName = useMemo(() => toolGrantWorkspaceMap(toolGrantWorkspaces), [toolGrantWorkspaces])
  const toolPermissionsDiffItems = useMemo(() => buildToolPermissionsDiffItems(toolGrantBaseline, toolGrantWorkspaces), [toolGrantBaseline, toolGrantWorkspaces])
  const toolPermissionsFilteredTools = useMemo(() => filterToolPermissions({
    tools: resolvedTools?.discovered,
    filter: toolPermissionsFilter,
    search: toolPermissionsSearch,
    currentToolGrants,
  }), [currentToolGrants, resolvedTools?.discovered, toolPermissionsFilter, toolPermissionsSearch])
  const skillConfigChanges = useMemo(() => buildSkillConfigChanges(skillWorkspaces, skillConfigBaseline), [skillWorkspaces, skillConfigBaseline])
  const workspaceSkillIds = useMemo(() => buildConfigFileSkillIds(skillWorkspaces), [skillWorkspaces])
  const hasSkillConfigSelectionChange = Boolean(selectedConfigFile && stringListSignature(workspaceSkillIds) !== stringListSignature(selectedConfigFile.skillIds))
  const hasSkillConfigChange = skillConfigChanges.length > 0
  const skillConfigIssues = useMemo(
    () => buildSkillConfigIssues(skills, skillWorkspaces, skillConfigBaseline),
    [skills, skillWorkspaces, skillConfigBaseline],
  )
  const hasToolPermissionsChange = toolGrantSignature(toolGrantWorkspaces) !== toolGrantSignature(toolGrantBaseline)
  const toolPermissionsWorkspaceIssues = useMemo(() => buildToolPermissionsWorkspaceIssues({
    workspaces: toolGrantWorkspaces,
    currentConfigFile: selectedConfigFile,
    tools: resolvedTools,
  }), [resolvedTools, selectedConfigFile, toolGrantWorkspaces])

  useEffect(() => {
    setSkillWorkspaces(skillConfigBaseline)
  }, [skillConfigBaseline])

  useEffect(() => {
    setToolGrantWorkspaces(toolGrantBaseline)
  }, [toolGrantBaseline])

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
    const savePlan = buildSkillConfigFileSavePlan({
      selectedConfigFile,
      currentConfigFile,
      skillIds: workspaceSkillIds,
      hasSelectionChange: hasSkillConfigSelectionChange,
    })
    try {
      if (savePlan) {
        await commitCatalogPlan({ operation: 'save', ...savePlan })
      } else {
        await refetchCatalog()
      }
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
    const savePlan = buildToolPermissionsConfigFileSavePlan({
      selectedConfigFile,
      currentConfigFile,
      toolGrants: toolGrantWorkspaces,
    })
    try {
      await commitCatalogPlan({ operation: 'save', ...savePlan }, { refetchCapabilities: true })
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
    setToolGrantWorkspaces((workspaces) => repairToolGrantWorkspaces(workspaces, toolPermissionsWorkspaceIssues))
    setToolPermissionsSaveError(null)
    if (options?.audit) recordSettingsQuickFix('tools', 'agents.settings.fixToolPermissionsWorkspaceIssues', 'workspace_repair')
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
    setToolGrantWorkspaces((workspaces) => applyToolPermissionsBulkAction({
      workspaces,
      action,
      visibleTools: toolPermissionsFilteredTools,
      currentToolGrants,
    }))
    setToolPermissionsSaveError(null)
  }

  function saveToolPermissionsFilterPreset() {
    const update = buildToolPermissionsFilterPresetUpdate({
      presets: filterPresets,
      filter: toolPermissionsFilter,
      search: toolPermissionsSearch,
      t,
    })
    updateAgentSettings({
      toolPermissionsFilterPresets: update.presets,
    })
    recordSettingsAudit({
      action: update.action,
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPermissionsFilterPresetSaved', { name: update.preset.name }),
    })
  }

  function applyToolPermissionsFilterPreset(preset: AgentToolPermissionsFilterPreset) {
    setToolPermissionsFilter(preset.filter)
    setToolPermissionsSearch(preset.search)
  }

  function deleteToolPermissionsFilterPreset(presetId: string) {
    const preset = filterPresets.find((item) => item.id === presetId)
    updateAgentSettings({
      toolPermissionsFilterPresets: filterPresets.filter((item) => item.id !== presetId),
    })
    recordSettingsAudit({
      action: 'tool_filter_preset_deleted',
      target: 'tools',
      summary: t('agents.settings.auditSummaries.toolPermissionsFilterPresetDeleted', { name: preset?.name ?? presetId }),
    })
  }

  return {
    applyToolPermissionsBulkEdit,
    applyToolPermissionsFilterPreset,
    currentToolGrants,
    deleteToolPermissionsFilterPreset,
    filteredSkills,
    fixToolPermissionsWorkspaceIssues,
    hasSkillConfigChange,
    hasSkillConfigSelectionChange,
    hasToolPermissionsChange,
    resetSkillWorkspaces: () => setSkillWorkspaces(skillConfigBaseline),
    resetToolGrantWorkspaces: () => setToolGrantWorkspaces(toolGrantBaseline),
    saveConfigFileSkillActivation,
    saveConfigFileToolPermissions,
    saveToolPermissionsFilterPreset,
    setSkillSearch,
    setSkillSourceFilter,
    setToolPermissionsFilter,
    setToolPermissionsSearch,
    skillConfigIssues,
    skillConfigSaveError,
    skillConfigSaving,
    skillSearch,
    skillSourceFilter,
    skillStats,
    skillWorkspaceById,
    skillWorkspaces,
    toolGrantWorkspaceByName,
    toolGrantWorkspaces,
    toolPermissionsDiffItems,
    toolPermissionsFilteredTools,
    toolPermissionsFilter,
    toolPermissionsSaveError,
    toolPermissionsSaving,
    toolPermissionsSearch,
    toolPermissionsWorkspaceIssues,
    toolStats,
    updateSkillWorkspace,
    updateToolGrantWorkspace,
    workspaceSkillIds,
  }
}

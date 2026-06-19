import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, XCircle } from 'lucide-react'
import {
  AgentSettingsIcon,
  AgentSettingsMain,
  AgentSettingsStateMessage,
} from '@/features/agent/components/AgentSettingsUi'
import {
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  SettingsSnapshotPanel,
} from '@/features/agent/components/AIAgentSettingsSnapshotPanel'
import { AIAgentSettingsConfigFilesPanel } from '@/features/agent/components/AIAgentSettingsConfigFilesPanel'
import { AIAgentSettingsHeaderSection } from '@/features/agent/components/AIAgentSettingsHeaderSection'
import { AIAgentSettingsOverviewPanels } from '@/features/agent/components/AIAgentSettingsOverviewPanels'
import { scrollElementIntoViewById } from '@/shared/ui/browserActions'
import { agentSettingsKeys } from '@/features/agent/application/agentQueryKeys'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import type { ProviderCatalogInspectResponse, ProviderSessionCapabilitiesResponse } from '@movscript/core/agent/protocol'
import {
  buildSdkAgentReadinessItems,
  buildSettingsActionItems,
  buildSettingsReadinessItems,
  type SettingsActionQuickFix,
} from '@/features/agent/application/agentSettingsReadiness'
import {
  settingsErrorMessage,
  settingsQuickFixAuditAction,
  settingsQuickFixDescriptor,
  type SettingsQuickFixAuditKind,
} from '@/features/agent/presentation/agentSettingsPageModel'
import {
  agentSettingsModelIdForProvider,
  agentSettingsModelSelectionPatch,
  useAgentStore,
  type AgentSettingsAuditEntry,
} from '@/features/agent/state/agentStore'
import { buildProviderProfileConfigOptions, normalizeProviderProfileConfigId } from '@/features/agent/application/agentSettingsProviderModel'
import { useAgentSettingsConfigFileController } from '@/features/agent/application/useAgentSettingsConfigFileController'
import { useAgentSettingsModelController } from '@/features/agent/application/useAgentSettingsModelController'
import { useAgentSettingsSnapshotController } from '@/features/agent/application/useAgentSettingsSnapshotController'
import { useAgentSettingsSummaryCopy } from '@/features/agent/application/useAgentSettingsSummaryCopy'
import { useAgentSettingsWorkspaceConfigController } from '@/features/agent/application/useAgentSettingsWorkspaceConfigController'
import {
  providerRuntimeProfile,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeModelAPIKinds } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'
import {
  agentProfilesFromProviderSettings,
} from '@/features/agent/application/agentProfileModel'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { agentSkillCatalogService } from '@/features/agent/application/agentSkillCatalogService'
import { createAgentSettingsCatalogCommitClient } from '@/features/agent/application/agentSettingsCatalogCommitService'

export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const agentSettings = useAgentStore((s) => s.settings)
  const updateAgentSettings = useAgentStore((s) => s.updateSettings)
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const recordSettingsAudit = useAgentStore((s) => s.recordSettingsAudit)
  const clearSettingsAudit = useAgentStore((s) => s.clearSettingsAudit)
  const providerProfileConfigs = useMemo(() => buildProviderProfileConfigOptions(providerSettings), [providerSettings])
  const agentProfiles = useMemo(() => agentProfilesFromProviderSettings(providerSettings), [providerSettings])
  const selectedProviderProfileConfigId = normalizeProviderProfileConfigId(agentSettings.activeProviderProfileConfigId)
  const selectedProviderProfileConfig = providerProfileConfigs.find((profile) => profile.id === selectedProviderProfileConfigId) ?? providerProfileConfigs[0]
  const selectedAgentProfile = agentProfiles.find((profile) => profile.id === selectedProviderProfileConfig.id)
    ?? agentProfiles.find((profile) => profile.routeKey === selectedProviderProfileConfig.providerProfileKey)
    ?? agentProfiles[0]
  const selectedProviderProfileLabel = selectedProviderProfileConfig.labelKey
    ? t(selectedProviderProfileConfig.labelKey)
    : selectedProviderProfileConfig.label
  const selectedProviderProfileDescription = selectedProviderProfileConfig.descriptionKey
    ? t(selectedProviderProfileConfig.descriptionKey)
    : undefined
  const usesWorkspaceCatalogSettings = Boolean(selectedProviderProfileConfig.supportsWorkspaceCatalogInspection)
  const settingsModelAPIKinds = selectedAgentProfile
    ? providerRuntimeModelAPIKinds(providerRuntimeProfile(selectedAgentProfile.provider).api)
    : []
  const agentModelsQuery = useQuery<PublicModel[]>({
    queryKey: agentModelKeys.backendCatalog(`agent-settings-${selectedProviderProfileConfig.id}`, settingsModelAPIKinds),
    queryFn: () => fetchAgentBackendModels({ apiKinds: settingsModelAPIKinds }),
    retry: false,
  })
  const settingsCatalogCommitClient = useMemo(
    () => createAgentSettingsCatalogCommitClient(selectedProviderProfileConfig),
    [selectedProviderProfileConfig],
  )
  const selectedSettingsModelId = agentSettingsModelIdForProvider(agentSettings, selectedProviderProfileConfig.id)
  const updateSelectedSettingsModelId = (modelId: string | null) => updateAgentSettings(agentSettingsModelSelectionPatch(agentSettings, selectedProviderProfileConfig.id, modelId))
  const model = useAgentSettingsModelController({
    providerProfileConfigId: selectedProviderProfileConfig.id,
    enabled: usesWorkspaceCatalogSettings,
    recordSettingsAudit,
    storedModelId: selectedSettingsModelId,
    updateSelectedModelId: updateSelectedSettingsModelId,
  })
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<string | null>(null)
  const catalogQuery = useQuery<ProviderCatalogInspectResponse>({
    queryKey: agentSettingsKeys.skillCatalog(selectedProviderProfileConfig.id),
    queryFn: async () => {
      if (!selectedAgentProfile) throw new Error('No Agent profile is selected.')
      return agentSkillCatalogService.inspect({ provider: selectedAgentProfile.provider })
    },
    enabled: usesWorkspaceCatalogSettings && Boolean(selectedAgentProfile),
    retry: false,
  })
  const capabilitiesQuery = useQuery<ProviderSessionCapabilitiesResponse>({
    queryKey: agentSettingsKeys.toolPermissions(selectedProviderProfileConfig.id),
    queryFn: async () => {
      if (!selectedAgentProfile) throw new Error('No Agent profile is selected.')
      return agentSkillCatalogService.capabilities({ provider: selectedAgentProfile.provider })
    },
    enabled: usesWorkspaceCatalogSettings && Boolean(selectedAgentProfile),
    retry: false,
  })
  const configFile = useAgentSettingsConfigFileController({
    backup: agentSettings.lastConfigFileBackup,
    catalog: catalogQuery.data,
    client: settingsCatalogCommitClient,
    recordSettingsAudit,
    refetchCapabilities: () => capabilitiesQuery.refetch(),
    refetchCatalog: () => catalogQuery.refetch(),
    updateAgentSettings,
  })
  const currentConfigFile = configFile.currentConfigFile
  const selectedConfigFile = configFile.selectedConfigFile
  const selectedConfigFileEditable = configFile.selectedConfigFileEditable
  const workspaceConfig = useAgentSettingsWorkspaceConfigController({
    catalog: catalogQuery.data,
    capabilities: capabilitiesQuery.data,
    commitCatalogPlan: configFile.commitCatalogPlan,
    currentConfigFile,
    filterPresets: agentSettings.toolPermissionsFilterPresets,
    recordSettingsAudit,
    recordSettingsQuickFix,
    refetchCatalog: () => catalogQuery.refetch(),
    selectedConfigFile,
    selectedConfigFileEditable,
    t,
    updateAgentSettings,
  })
  const settingsSnapshot = useAgentSettingsSnapshotController({
    catalog: catalogQuery.data,
    capabilities: capabilitiesQuery.data,
    client: settingsCatalogCommitClient,
    currentConfigFile,
    currentConfigFileId: configFile.currentConfigFileId,
    effectiveConfig: model.effectiveConfig,
    refetchCapabilities: () => capabilitiesQuery.refetch(),
    refetchCatalog: () => catalogQuery.refetch(),
    recordSettingsAudit,
    selectedConfigFileId: selectedConfigFile?.id,
    setSavedConfig: model.setSavedConfig,
    settingsImportBackup: agentSettings.lastImportBackup,
    skillWorkspaces: workspaceConfig.skillWorkspaces,
    textModels: model.modelsQuery.data,
    toolGrantWorkspaces: workspaceConfig.toolGrantWorkspaces,
    updateAgentSettings,
    updateSelectedModelId: updateSelectedSettingsModelId,
  })
  const readinessItems = useMemo(() => usesWorkspaceCatalogSettings
    ? buildSettingsReadinessItems({
      effectiveConfig: model.effectiveConfig,
      savedDirectModelIdHasSecret: model.savedDirectModelIdHasSecret,
      modelRoutes: model.modelRoutes,
      modelRouteIssues: model.modelRouteIssues,
      currentConfigFile,
      skillConfigIssues: workspaceConfig.skillConfigIssues,
      toolPermissionsWorkspaceIssues: workspaceConfig.toolPermissionsWorkspaceIssues,
      skillStats: workspaceConfig.skillStats,
      toolStats: workspaceConfig.toolStats,
      hasUnsavedChanges: model.hasUnsavedChanges,
      hasConfigFileChange: configFile.hasConfigFileChange,
      hasSkillConfigChange: workspaceConfig.hasSkillConfigChange,
      hasToolPermissionsChange: workspaceConfig.hasToolPermissionsChange,
    })
    : buildSdkAgentReadinessItems({
      agentLabel: selectedAgentProfile?.label ?? selectedProviderProfileLabel,
      agentEnabled: selectedAgentProfile?.enabled ?? false,
      runtimeLabel: selectedAgentProfile?.connectionLabel ?? t('agents.settings.statusCardRuntimeFallback'),
      runtimeAvailable: selectedAgentProfile ? selectedAgentProfile.connectionKind !== 'unavailable' : false,
      authEnv: selectedAgentProfile?.provider.kind === 'claude' ? 'ANTHROPIC_API_KEY' : undefined,
      pendingChanges: 0,
    }), [
    currentConfigFile,
    usesWorkspaceCatalogSettings,
    selectedAgentProfile?.connectionKind,
    selectedAgentProfile?.connectionLabel,
    selectedAgentProfile?.enabled,
    selectedAgentProfile?.label,
    selectedAgentProfile?.provider.kind,
    selectedProviderProfileLabel,
    t,
    model.effectiveConfig,
    model.savedDirectModelIdHasSecret,
    configFile.hasConfigFileChange,
    workspaceConfig.hasSkillConfigChange,
    workspaceConfig.hasToolPermissionsChange,
    model.hasUnsavedChanges,
    model.modelRouteIssues,
    model.modelRoutes,
    workspaceConfig.skillConfigIssues,
    workspaceConfig.toolPermissionsWorkspaceIssues,
    workspaceConfig.skillStats,
    workspaceConfig.toolStats,
  ])
  const settingsActionItems = useMemo(() => usesWorkspaceCatalogSettings ? buildSettingsActionItems({
      effectiveConfig: model.effectiveConfig,
      savedDirectModelIdHasSecret: model.savedDirectModelIdHasSecret,
      modelRoutes: model.modelRoutes,
      modelRouteIssues: model.modelRouteIssues,
      currentConfigFile,
      skillConfigIssues: workspaceConfig.skillConfigIssues,
      toolPermissionsWorkspaceIssues: workspaceConfig.toolPermissionsWorkspaceIssues,
      toolStats: workspaceConfig.toolStats,
      tools: capabilitiesQuery.data?.resolvedTools,
      hasUnsavedChanges: model.hasUnsavedChanges,
      hasConfigFileChange: configFile.hasConfigFileChange,
      hasSkillConfigChange: workspaceConfig.hasSkillConfigChange,
      hasToolPermissionsChange: workspaceConfig.hasToolPermissionsChange,
    }) : [], [
    currentConfigFile,
    usesWorkspaceCatalogSettings,
    model.effectiveConfig,
    model.savedDirectModelIdHasSecret,
    configFile.hasConfigFileChange,
    workspaceConfig.hasSkillConfigChange,
    workspaceConfig.hasToolPermissionsChange,
    model.hasUnsavedChanges,
    model.modelRouteIssues,
    model.modelRoutes,
    workspaceConfig.skillConfigIssues,
    workspaceConfig.toolPermissionsWorkspaceIssues,
    capabilitiesQuery.data?.resolvedTools,
    workspaceConfig.toolStats,
  ])
  const settingsSummaryCopy = useAgentSettingsSummaryCopy({
    t,
    readinessItems,
    actionItems: settingsActionItems,
    auditTrail: agentSettings.auditTrail,
  })
  const statusModelItems = useMemo(() => {
    const models = agentModelsQuery.data ?? []
    const defaultModel = models.find((item) => item.is_default) ?? models[0]
    const defaultModelId = defaultModel ? publicModelId(defaultModel) : null
    const selectedModelId = selectedSettingsModelId ?? defaultModelId
    return models.slice(0, 6).map((item) => {
      const modelId = publicModelId(item)
      return {
        id: modelId,
        label: publicModelLabel(item),
        detail: item.capabilities?.join(' / ') || '-',
        current: Boolean(selectedModelId && modelId === selectedModelId),
        default: Boolean(item.is_default),
      }
    })
  }, [agentModelsQuery.data, selectedSettingsModelId])
  const statusRefreshing = usesWorkspaceCatalogSettings && (
    model.configQuery.isFetching
    || model.modelsQuery.isFetching
    || catalogQuery.isFetching
    || capabilitiesQuery.isFetching
  )

  function scrollToSettingsSection(sectionId: string) {
    scrollElementIntoViewById(sectionId)
  }

  function refreshSettingsStatus() {
    if (!usesWorkspaceCatalogSettings) return
    void Promise.all([
      model.configQuery.refetch(),
      model.modelsQuery.refetch(),
      catalogQuery.refetch(),
      capabilitiesQuery.refetch(),
      agentModelsQuery.refetch(),
    ])
  }

  function applySettingsActionQuickFix(quickFix: SettingsActionQuickFix) {
    const descriptor = settingsQuickFixDescriptor(quickFix)
    const applyQuickFixResult = () => {
      if (descriptor.resetModelErrors) model.resetTransientState()
      setSettingsActionFeedback(t(descriptor.feedbackKey))
      recordSettingsQuickFix(descriptor.target, descriptor.labelKey, descriptor.auditKind)
    }

    if (quickFix === 'reset-model-workspace') {
      if (!model.resetWorkspaceFromEffectiveConfig()) return
      applyQuickFixResult()
      return
    }
    if (quickFix === 'confirm-clear-model-config') {
      if (descriptor.scrollTargetSectionId) scrollToSettingsSection(descriptor.scrollTargetSectionId)
      model.setModelConfigClearConfirming(true)
      applyQuickFixResult()
      return
    }
    if (quickFix === 'enable-chat-route') {
      model.setUseForChat(true)
      applyQuickFixResult()
      return
    }
    if (quickFix === 'reset-config-file-workspace') {
      if (currentConfigFile?.id) configFile.setSelectedConfigFileId(currentConfigFile.id)
      applyQuickFixResult()
      return
    }
    if (quickFix === 'reset-skill-config-workspace') {
      workspaceConfig.resetSkillWorkspaces()
      applyQuickFixResult()
      return
    }
    if (quickFix === 'fix-tool-permissions-workspace-issues') {
      workspaceConfig.fixToolPermissionsWorkspaceIssues()
      applyQuickFixResult()
      return
    }
    if (quickFix === 'reset-tool-permissions-workspace') {
      workspaceConfig.resetToolGrantWorkspaces()
      applyQuickFixResult()
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

  return (
    <AgentPageShell data-testid="agent-settings-page">
      <AgentPageShellHeader>
        <AIAgentSettingsHeaderSection />
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        {usesWorkspaceCatalogSettings && (model.configQuery.isLoading || model.modelsQuery.isLoading) ? (
          <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
        ) : usesWorkspaceCatalogSettings && model.configQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(model.configQuery.error)} />
        ) : usesWorkspaceCatalogSettings && model.modelsQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(model.modelsQuery.error)} />
        ) : (
          <AgentSettingsMain>
            <AIAgentSettingsOverviewPanels
              status={{
                configured: usesWorkspaceCatalogSettings ? Boolean(model.effectiveConfig?.configured) : Boolean(selectedAgentProfile?.enabled),
                agentLabel: selectedAgentProfile?.label ?? selectedProviderProfileLabel,
                agentDetail: selectedAgentProfile?.detail,
                providerProfileLabel: selectedProviderProfileLabel,
                providerProfileDescription: selectedProviderProfileDescription,
                runtimeLabel: selectedAgentProfile?.connectionLabel ?? t('agents.settings.statusCardRuntimeFallback'),
                capabilityLabel: usesWorkspaceCatalogSettings
                  ? t('agents.settings.statusCardCatalogCapability')
                  : t('agents.settings.statusCardSdkCapability'),
                capabilityDetail: usesWorkspaceCatalogSettings
                  ? t('agents.settings.statusCardCatalogCapabilityDetail')
                  : t('agents.settings.statusCardSdkCapabilityDetail'),
                copied: settingsSummaryCopy.statusCopied,
                refreshing: statusRefreshing || agentModelsQuery.isFetching,
                canRefresh: true,
                onCopy: () => void settingsSummaryCopy.copySettingsStatusSummary(),
                onRefresh: usesWorkspaceCatalogSettings
                  ? refreshSettingsStatus
                  : () => void agentModelsQuery.refetch(),
                models: {
                  items: statusModelItems,
                  total: agentModelsQuery.data?.length ?? 0,
                  loading: agentModelsQuery.isLoading,
                  error: agentModelsQuery.error ? settingsErrorMessage(agentModelsQuery.error) : null,
                },
              }}
              showConfigurationDetails={usesWorkspaceCatalogSettings}
              readinessItems={readinessItems}
              actionItems={settingsActionItems}
              actionFeedback={settingsActionFeedback}
              actionItemsCopied={settingsSummaryCopy.actionItemsCopied}
              auditTrail={agentSettings.auditTrail}
              onCopyActionItems={() => void settingsSummaryCopy.copyActionItemsSummary()}
              onClearAuditTrail={clearSettingsAudit}
              onJumpToSection={scrollToSettingsSection}
              onQuickFix={applySettingsActionQuickFix}
            />
            {usesWorkspaceCatalogSettings ? (
              <>
                <AIAgentSettingsConfigFilesPanel
                    catalogQuery={catalogQuery}
                    capabilitiesQuery={capabilitiesQuery}
                    configFile={configFile}
                    model={model}
                    lastConfigFileBackup={agentSettings.lastConfigFileBackup}
                    selectedConfigFileEditable={selectedConfigFileEditable}
                    workspaceSkillIds={workspaceConfig.workspaceSkillIds}
                    skillSearch={workspaceConfig.skillSearch}
                    setSkillSearch={workspaceConfig.setSkillSearch}
                    skillSourceFilter={workspaceConfig.skillSourceFilter}
                    setSkillSourceFilter={workspaceConfig.setSkillSourceFilter}
                    filteredSkills={workspaceConfig.filteredSkills}
                    skillConfigIssues={workspaceConfig.skillConfigIssues}
                    hasSkillConfigSelectionChange={workspaceConfig.hasSkillConfigSelectionChange}
                    skillConfigSaving={workspaceConfig.skillConfigSaving}
                    saveConfigFileSkillActivation={workspaceConfig.saveConfigFileSkillActivation}
                    resetSkillWorkspaces={workspaceConfig.resetSkillWorkspaces}
                    hasSkillConfigChange={workspaceConfig.hasSkillConfigChange}
                    skillConfigSaveError={workspaceConfig.skillConfigSaveError}
                    skillWorkspaceById={workspaceConfig.skillWorkspaceById}
                    updateSkillWorkspace={workspaceConfig.updateSkillWorkspace}
                    toolGrantWorkspaces={workspaceConfig.toolGrantWorkspaces}
                    toolPermissionsWorkspaceIssues={workspaceConfig.toolPermissionsWorkspaceIssues}
                    toolPermissionsSearch={workspaceConfig.toolPermissionsSearch}
                    setToolPermissionsSearch={workspaceConfig.setToolPermissionsSearch}
                    toolPermissionsFilter={workspaceConfig.toolPermissionsFilter}
                    setToolPermissionsFilter={workspaceConfig.setToolPermissionsFilter}
                    toolPermissionsFilteredTools={workspaceConfig.toolPermissionsFilteredTools}
                    applyToolPermissionsBulkEdit={workspaceConfig.applyToolPermissionsBulkEdit}
                    filterPresets={agentSettings.toolPermissionsFilterPresets}
                    applyToolPermissionsFilterPreset={workspaceConfig.applyToolPermissionsFilterPreset}
                    deleteToolPermissionsFilterPreset={workspaceConfig.deleteToolPermissionsFilterPreset}
                    saveToolPermissionsFilterPreset={workspaceConfig.saveToolPermissionsFilterPreset}
                    fixToolPermissionsWorkspaceIssues={() => workspaceConfig.fixToolPermissionsWorkspaceIssues({ audit: true })}
                    toolPermissionsDiffItems={workspaceConfig.toolPermissionsDiffItems}
                    hasToolPermissionsChange={workspaceConfig.hasToolPermissionsChange}
                    toolPermissionsSaving={workspaceConfig.toolPermissionsSaving}
                    saveConfigFileToolPermissions={workspaceConfig.saveConfigFileToolPermissions}
                    resetToolGrantWorkspaces={workspaceConfig.resetToolGrantWorkspaces}
                    toolPermissionsSaveError={workspaceConfig.toolPermissionsSaveError}
                    toolGrantWorkspaceByName={workspaceConfig.toolGrantWorkspaceByName}
                    currentToolGrants={workspaceConfig.currentToolGrants}
                    updateToolGrantWorkspace={workspaceConfig.updateToolGrantWorkspace}
                  />
                  <SettingsSnapshotPanel
                    fileInputRef={settingsSnapshot.fileInputRef}
                    settingsSnapshotText={settingsSnapshot.text}
                    settingsSnapshotValidation={settingsSnapshot.validation}
                    settingsSnapshotError={settingsSnapshot.error}
                    settingsSnapshotMessage={settingsSnapshot.message}
                    settingsSnapshotFileName={settingsSnapshot.fileName}
                    selectedScopes={settingsSnapshot.selectedScopes}
                    referenceIssues={settingsSnapshot.referenceIssues}
                    selectedSnapshotForImport={settingsSnapshot.selectedSnapshotForImport}
                    settingsImportBackup={settingsSnapshot.settingsImportBackup}
                    canImport={settingsSnapshot.canImport}
                    importing={settingsSnapshot.importing}
                    importPreflightError={settingsSnapshot.importPreflightError()}
                    onLoadFile={settingsSnapshot.loadFile}
                    onExport={settingsSnapshot.exportSnapshot}
                    onCopy={() => void settingsSnapshot.copySnapshot()}
                    onDownload={settingsSnapshot.downloadSnapshot}
                    onPreviewImport={settingsSnapshot.previewImport}
                    onImport={() => void settingsSnapshot.importSnapshot()}
                    onTextChange={settingsSnapshot.updateText}
                    onScopeChange={settingsSnapshot.toggleImportScope}
                    onPresetChange={settingsSnapshot.applyImportPreset}
                    onLoadImportBackup={settingsSnapshot.loadImportBackup}
                    onCopyImportBackup={() => void settingsSnapshot.copyImportBackup()}
                    onRestoreImportBackup={() => void settingsSnapshot.restoreImportBackup()}
                    onClearImportBackup={settingsSnapshot.clearImportBackup}
                  />
                </>
              ) : null}

          </AgentSettingsMain>
        )}
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

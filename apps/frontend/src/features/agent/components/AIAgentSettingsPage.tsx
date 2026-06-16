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
import { ProviderSessionClient, type ProviderSessionCapabilitiesResponse, type ProviderCatalogInspectResponse } from '@/shared/infrastructure/providerSessionClient'
import {
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
import { useAgentStore, type AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import { buildProviderProfileConfigOptions, normalizeProviderProfileConfigId } from '@/features/agent/application/agentSettingsProviderModel'
import { useAgentSettingsConfigFileController } from '@/features/agent/application/useAgentSettingsConfigFileController'
import { useAgentSettingsModelController } from '@/features/agent/application/useAgentSettingsModelController'
import { useAgentSettingsSnapshotController } from '@/features/agent/application/useAgentSettingsSnapshotController'
import { useAgentSettingsSummaryCopy } from '@/features/agent/application/useAgentSettingsSummaryCopy'
import { useAgentSettingsWorkspaceConfigController } from '@/features/agent/application/useAgentSettingsWorkspaceConfigController'
import { useProviderConfigStore } from '@/shared/infrastructure/providerConfigStore'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const agentSettings = useAgentStore((s) => s.settings)
  const updateAgentSettings = useAgentStore((s) => s.updateSettings)
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const recordSettingsAudit = useAgentStore((s) => s.recordSettingsAudit)
  const clearSettingsAudit = useAgentStore((s) => s.clearSettingsAudit)
  const providerProfileConfigs = useMemo(() => buildProviderProfileConfigOptions(providerSettings), [providerSettings])
  const selectedProviderProfileConfigId = normalizeProviderProfileConfigId(agentSettings.activeProviderProfileConfigId)
  const selectedProviderProfileConfig = providerProfileConfigs.find((profile) => profile.id === selectedProviderProfileConfigId) ?? providerProfileConfigs[0]
  const settingsProviderSessionClient = useMemo(() => new ProviderSessionClient(undefined, {
    providerProfileKey: selectedProviderProfileConfig.providerProfileKey,
  }), [selectedProviderProfileConfig.providerProfileKey])
  const model = useAgentSettingsModelController({
    client: settingsProviderSessionClient,
    providerProfileConfigId: selectedProviderProfileConfig.id,
    recordSettingsAudit,
    storedModelId: agentSettings.modelId,
    updateAgentSettings,
  })
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<string | null>(null)
  const catalogQuery = useQuery<ProviderCatalogInspectResponse>({
    queryKey: agentSettingsKeys.skillCatalog(selectedProviderProfileConfig.id, settingsProviderSessionClient.baseURL),
    queryFn: async () => {
      await settingsProviderSessionClient.ensureRunning()
      return settingsProviderSessionClient.inspect()
    },
    enabled: selectedProviderProfileConfig.supportsWorkspaceCatalogInspection,
    retry: false,
  })
  const capabilitiesQuery = useQuery<ProviderSessionCapabilitiesResponse>({
    queryKey: agentSettingsKeys.toolPermissions(selectedProviderProfileConfig.id, settingsProviderSessionClient.baseURL),
    queryFn: async () => {
      await settingsProviderSessionClient.ensureRunning()
      return settingsProviderSessionClient.getCapabilities()
    },
    enabled: selectedProviderProfileConfig.supportsWorkspaceCatalogInspection,
    retry: false,
  })
  const configFile = useAgentSettingsConfigFileController({
    backup: agentSettings.lastConfigFileBackup,
    catalog: catalogQuery.data,
    client: settingsProviderSessionClient,
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
    client: settingsProviderSessionClient,
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
    client: settingsProviderSessionClient,
    currentConfigFile,
    currentConfigFileId: configFile.currentConfigFileId,
    effectiveConfig: model.effectiveConfig,
    refetchCapabilities: () => capabilitiesQuery.refetch(),
    refetchCatalog: () => catalogQuery.refetch(),
    refetchProviderModelConfig: () => model.configQuery.refetch(),
    recordSettingsAudit,
    selectedConfigFileId: selectedConfigFile?.id,
    setSavedConfig: model.setSavedConfig,
    settingsImportBackup: agentSettings.lastImportBackup,
    skillWorkspaces: workspaceConfig.skillWorkspaces,
    textModels: model.modelsQuery.data,
    toolGrantWorkspaces: workspaceConfig.toolGrantWorkspaces,
    updateAgentSettings,
  })
  const readinessItems = useMemo(() => buildSettingsReadinessItems({
    effectiveConfig: model.effectiveConfig,
    selectedApiKind: model.selectedApiKind,
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
  }), [
    currentConfigFile,
    model.effectiveConfig,
    model.savedDirectModelIdHasSecret,
    model.selectedApiKind,
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
  const settingsActionItems = useMemo(() => buildSettingsActionItems({
    effectiveConfig: model.effectiveConfig,
    selectedApiKind: model.selectedApiKind,
    workspaceBaseURL: model.baseURL,
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
  }), [
    currentConfigFile,
    model.effectiveConfig,
    model.savedDirectModelIdHasSecret,
    model.selectedApiKind,
    configFile.hasConfigFileChange,
    workspaceConfig.hasSkillConfigChange,
    workspaceConfig.hasToolPermissionsChange,
    model.hasUnsavedChanges,
    model.baseURL,
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

  function scrollToSettingsSection(sectionId: string) {
    scrollElementIntoViewById(sectionId)
  }

  function stripModelBaseURLSecrets(options?: { audit?: boolean }) {
    model.stripBaseURLSecrets()
    if (options?.audit) recordSettingsQuickFix('model', 'agents.settings.quickFixes.stripSensitiveBaseURLQuery', 'sensitive_cleanup')
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
    if (quickFix === 'switch-openai-responses') {
      model.setSelectedApiKind('openai_responses')
      applyQuickFixResult()
      return
    }
    if (quickFix === 'strip-sensitive-base-url-query') {
      stripModelBaseURLSecrets()
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
        <AIAgentSettingsHeaderSection
          configured={Boolean(model.effectiveConfig?.configured)}
          providerProfileConfigs={providerProfileConfigs}
          selectedProviderProfileConfigId={selectedProviderProfileConfig.id}
          statusCopied={settingsSummaryCopy.statusCopied}
          refreshing={model.configQuery.isFetching}
          onProviderProfileConfigChange={(value) => {
            updateAgentSettings({ activeProviderProfileConfigId: normalizeProviderProfileConfigId(value) })
            model.resetTransientState()
          }}
          onCopyStatus={() => void settingsSummaryCopy.copySettingsStatusSummary()}
          onRefresh={() => void model.configQuery.refetch()}
        />
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        {model.configQuery.isLoading || model.modelsQuery.isLoading ? (
          <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
        ) : model.configQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(model.configQuery.error)} />
        ) : model.modelsQuery.error ? (
          <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(model.modelsQuery.error)} />
        ) : (
          <AgentSettingsMain>
              <AIAgentSettingsOverviewPanels
                readinessItems={readinessItems}
                actionItems={settingsActionItems}
                actionFeedback={settingsActionFeedback}
                statusCopied={settingsSummaryCopy.statusCopied}
                actionItemsCopied={settingsSummaryCopy.actionItemsCopied}
                auditTrail={agentSettings.auditTrail}
                onCopyStatus={() => void settingsSummaryCopy.copySettingsStatusSummary()}
                onCopyActionItems={() => void settingsSummaryCopy.copyActionItemsSummary()}
                onClearAuditTrail={clearSettingsAudit}
                onJumpToSection={scrollToSettingsSection}
                onQuickFix={applySettingsActionQuickFix}
              />
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
                stripModelBaseURLSecrets={() => stripModelBaseURLSecrets({ audit: true })}
                switchToOpenAIResponses={() => {
                  model.setSelectedApiKind('openai_responses')
                  recordSettingsQuickFix('model', 'agents.settings.quickFixes.switchOpenAIResponses', 'mode_migration')
                }}
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

          </AgentSettingsMain>
        )}
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

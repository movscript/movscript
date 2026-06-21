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
import { SettingsSnapshotPanel } from '@/features/agent/components/AIAgentSettingsSnapshotPanel'
import { AIAgentSettingsConfigFilesPanel } from '@/features/agent/components/AIAgentSettingsConfigFilesPanel'
import { AIAgentSettingsHeaderSection } from '@/features/agent/components/AIAgentSettingsHeaderSection'
import { AIAgentSettingsOverviewPanels } from '@/features/agent/components/AIAgentSettingsOverviewPanels'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { settingsErrorMessage } from '@/features/agent/presentation/agentSettingsPageModel'
import {
  runtimeCapabilityDetailKey,
  runtimeCapabilityDetailValues,
  runtimeCapabilityLabelKey,
  useAIAgentSettingsPageController,
} from '@/features/agent/application/useAIAgentSettingsPageController'

export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const {
    agentModelsQuery,
    agentSettings,
    applySettingsActionQuickFix,
    capabilitiesQuery,
    catalogQuery,
    clearSettingsAudit,
    configFile,
    model,
    readinessItems,
    refreshSettingsStatus,
    scrollToSettingsSection,
    selectedAgentProfile,
    selectedConfigFileEditable,
    selectedProviderProfileDescription,
    selectedProviderProfileLabel,
    settingsActionFeedback,
    settingsActionItems,
    settingsSnapshot,
    settingsSummaryCopy,
    statusModelItems,
    statusRefreshing,
    usesWorkspaceCatalogSettings,
    workspaceConfig,
  } = useAIAgentSettingsPageController()

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
                runtimeLabel: selectedAgentProfile?.runtimeBackend.label ?? t('agents.settings.statusCardRuntimeFallback'),
                capabilityLabel: t(runtimeCapabilityLabelKey(selectedAgentProfile?.runtimeBackend.capabilitySummary)),
                capabilityDetail: t(
                  runtimeCapabilityDetailKey(selectedAgentProfile?.runtimeBackend.capabilitySummary),
                  runtimeCapabilityDetailValues(selectedAgentProfile?.runtimeBackend.capabilitySummary),
                ),
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

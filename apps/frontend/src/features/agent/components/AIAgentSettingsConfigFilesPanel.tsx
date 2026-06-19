import type { Dispatch, SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, XCircle } from 'lucide-react'
import {
  AgentSettingsIcon,
  AgentSettingsPanel,
  AgentSettingsStateMessage,
} from '@/features/agent/components/AgentSettingsUi'
import type { SkillConfigWorkspace, ToolGrantWorkspace } from '@movscript/core/agent'
import {
  ConfigFileDiffPanel,
} from '@/features/agent/components/AIAgentSettingsPageParts'
import { AIAgentSettingsConfigFileEditorShell } from '@/features/agent/components/AIAgentSettingsConfigFileEditorShell'
import { AIAgentSettingsConfigFileEditorHeaderSection } from '@/features/agent/components/AIAgentSettingsConfigFileEditorHeaderSection'
import { AIAgentSettingsConfigFileRollbackBackupPanel } from '@/features/agent/components/AIAgentSettingsConfigFileRollbackBackupPanel'
import { AIAgentSettingsConfigFileDetailsSection } from '@/features/agent/components/AIAgentSettingsConfigFileDetailsSection'
import { AIAgentSettingsModelPanel } from '@/features/agent/components/AIAgentSettingsModelPanel'
import { AIAgentSettingsSkillSection } from '@/features/agent/components/AIAgentSettingsSkillSection'
import { AIAgentSettingsToolPermissionsSection } from '@/features/agent/components/AIAgentSettingsToolPermissionsSection'
import type { useAgentSettingsConfigFileController } from '@/features/agent/application/useAgentSettingsConfigFileController'
import type { useAgentSettingsModelController } from '@/features/agent/application/useAgentSettingsModelController'
import type { AgentSettingsConfigFileBackup, AgentToolPermissionsFilterPreset } from '@/features/agent/state/agentStore'
import type { SkillSourceFilter } from '@/features/agent/presentation/agentSettingsSkillModel'
import type { ToolPermissionsBulkAction, ToolPermissionsFilter } from '@/features/agent/presentation/agentSettingsToolPermissionsModel'
import { settingsErrorMessage } from '@/features/agent/presentation/agentSettingsPageModel'
import type { ProviderCatalogInspectResponse, ProviderSessionCapabilitiesResponse } from '@movscript/core/agent/protocol'
import type {
  ToolPermissionsDiffItem,
} from '@/features/agent/application/agentSettingsConfigFile'
import type {
  SkillConfigIssue,
  ToolPermissionsWorkspaceIssue,
} from '@/features/agent/application/agentSettingsReadiness'

type ConfigFileController = ReturnType<typeof useAgentSettingsConfigFileController>
type ModelController = ReturnType<typeof useAgentSettingsModelController>

export function AIAgentSettingsConfigFilesPanel({
  catalogQuery,
  capabilitiesQuery,
  configFile,
  model,
  lastConfigFileBackup,
  selectedConfigFileEditable,
  workspaceSkillIds,
  skillSearch,
  setSkillSearch,
  skillSourceFilter,
  setSkillSourceFilter,
  filteredSkills,
  skillConfigIssues,
  hasSkillConfigSelectionChange,
  skillConfigSaving,
  saveConfigFileSkillActivation,
  resetSkillWorkspaces,
  hasSkillConfigChange,
  skillConfigSaveError,
  skillWorkspaceById,
  updateSkillWorkspace,
  toolGrantWorkspaces,
  toolPermissionsWorkspaceIssues,
  toolPermissionsSearch,
  setToolPermissionsSearch,
  toolPermissionsFilter,
  setToolPermissionsFilter,
  toolPermissionsFilteredTools,
  applyToolPermissionsBulkEdit,
  filterPresets,
  applyToolPermissionsFilterPreset,
  deleteToolPermissionsFilterPreset,
  saveToolPermissionsFilterPreset,
  fixToolPermissionsWorkspaceIssues,
  toolPermissionsDiffItems,
  hasToolPermissionsChange,
  toolPermissionsSaving,
  saveConfigFileToolPermissions,
  resetToolGrantWorkspaces,
  toolPermissionsSaveError,
  toolGrantWorkspaceByName,
  currentToolGrants,
  updateToolGrantWorkspace,
}: {
  catalogQuery: UseQueryResult<ProviderCatalogInspectResponse>
  capabilitiesQuery: UseQueryResult<ProviderSessionCapabilitiesResponse>
  configFile: ConfigFileController
  model: ModelController
  lastConfigFileBackup: AgentSettingsConfigFileBackup | null
  selectedConfigFileEditable: boolean
  workspaceSkillIds: string[]
  skillSearch: string
  setSkillSearch: Dispatch<SetStateAction<string>>
  skillSourceFilter: SkillSourceFilter
  setSkillSourceFilter: Dispatch<SetStateAction<SkillSourceFilter>>
  filteredSkills: ProviderCatalogInspectResponse['skills']
  skillConfigIssues: SkillConfigIssue[]
  hasSkillConfigSelectionChange: boolean
  skillConfigSaving: boolean
  saveConfigFileSkillActivation: () => Promise<void>
  resetSkillWorkspaces: () => void
  hasSkillConfigChange: boolean
  skillConfigSaveError: string | null
  skillWorkspaceById: Map<string, SkillConfigWorkspace>
  updateSkillWorkspace: (id: string, enabled: boolean) => void
  toolGrantWorkspaces: ToolGrantWorkspace[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  toolPermissionsSearch: string
  setToolPermissionsSearch: Dispatch<SetStateAction<string>>
  toolPermissionsFilter: ToolPermissionsFilter
  setToolPermissionsFilter: Dispatch<SetStateAction<ToolPermissionsFilter>>
  toolPermissionsFilteredTools: ProviderSessionCapabilitiesResponse['resolvedTools']['discovered']
  applyToolPermissionsBulkEdit: (action: ToolPermissionsBulkAction) => void
  filterPresets: AgentToolPermissionsFilterPreset[]
  applyToolPermissionsFilterPreset: (preset: AgentToolPermissionsFilterPreset) => void
  deleteToolPermissionsFilterPreset: (presetId: string) => void
  saveToolPermissionsFilterPreset: () => void
  fixToolPermissionsWorkspaceIssues: () => void
  toolPermissionsDiffItems: ToolPermissionsDiffItem[]
  hasToolPermissionsChange: boolean
  toolPermissionsSaving: boolean
  saveConfigFileToolPermissions: () => Promise<void>
  resetToolGrantWorkspaces: () => void
  toolPermissionsSaveError: string | null
  toolGrantWorkspaceByName: Map<string, ToolGrantWorkspace>
  currentToolGrants: Set<string>
  updateToolGrantWorkspace: (name: string, patch: Partial<ToolGrantWorkspace>) => void
}) {
  const { t } = useTranslation()
  const currentConfigFile = configFile.currentConfigFile
  const selectedConfigFile = configFile.selectedConfigFile

  return (
    <AgentSettingsPanel icon={Bot} id="agent-settings-config-files" title={t('agents.settings.configFilesPanel')}>
      {catalogQuery.isLoading ? (
        <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
      ) : catalogQuery.error ? (
        <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={settingsErrorMessage(catalogQuery.error)} />
      ) : (
        <AIAgentSettingsConfigFileEditorShell
          inputRef={configFile.inputRef}
          configFiles={catalogQuery.data?.configFiles ?? []}
          currentConfigFile={currentConfigFile}
          selectedConfigFile={selectedConfigFile}
          managing={configFile.managing}
          onLoadFile={configFile.loadFile}
          onCreateConfigFile={configFile.createBlank}
          onSelectConfigFile={configFile.setSelectedConfigFileId}
        >
          {selectedConfigFile && (
            <>
              <AIAgentSettingsConfigFileEditorHeaderSection
                selectedConfigFile={selectedConfigFile}
                currentConfigFileId={currentConfigFile?.id}
                title={configFile.nameWorkspace || selectedConfigFile.name}
                hasChange={configFile.hasConfigFileChange}
                saving={configFile.saving}
                managing={configFile.managing}
                message={configFile.message}
                saveError={configFile.saveError}
                readonly={configFile.selectedConfigFileReadonly}
                onSave={configFile.saveActive}
                onCopy={() => void configFile.copySelected()}
                onDownload={configFile.downloadSelected}
                onDuplicate={configFile.duplicateSelected}
              />
              <AIAgentSettingsModelPanel
                effectiveConfig={model.effectiveConfig}
                selectedModelId={model.selectedModelId}
                setSelectedModelId={model.setSelectedModelId}
                textModels={model.textModels}
                modelValueMissing={model.modelValueMissing}
                useForChat={model.useForChat}
                setUseForChat={model.setUseForChat}
                useForPlanner={model.useForPlanner}
                setUseForPlanner={model.setUseForPlanner}
                modelRouteIssues={model.modelRouteIssues}
                selectedModel={model.selectedModel ?? undefined}
                legacyDirectModelConfig={model.legacyDirectModelConfig}
                canSaveModelConfig={model.canSaveModelConfig}
                saving={model.saving}
                hasUnsavedChanges={model.hasUnsavedChanges}
                onSave={model.saveSettings}
                testing={model.testing}
                onTest={model.testSettings}
                modelConfigClearConfirming={model.modelConfigClearConfirming}
                clearingModelConfig={model.clearingModelConfig}
                onClearModelConfig={model.clearModelConfig}
                saveError={model.saveError}
                testError={model.testError}
                testResult={model.testResult}
              />
              <AIAgentSettingsConfigFileDetailsSection
                name={configFile.nameWorkspace}
                setName={configFile.setNameWorkspace}
                description={configFile.descriptionWorkspace}
                setDescription={configFile.setDescriptionWorkspace}
                editable={selectedConfigFileEditable}
                hasDetailsChange={configFile.hasDetailsChange}
                managing={configFile.managing}
                onSaveDetails={configFile.saveDetails}
                onDuplicate={configFile.duplicateSelected}
                onDelete={configFile.deleteSelected}
                isCurrent={selectedConfigFile.id === currentConfigFile?.id}
                limitWorkspaces={configFile.limitWorkspaces}
                setLimitWorkspaces={configFile.setLimitWorkspaces}
                approvalDefaultWorkspaces={configFile.approvalDefaultWorkspaces}
                setApprovalDefaultWorkspaces={configFile.setApprovalDefaultWorkspaces}
                onWorkspaceDirty={() => configFile.setSaveError(null)}
              />
              <AIAgentSettingsSkillSection
                workspaceSkillIds={workspaceSkillIds}
                currentConfigFileName={selectedConfigFile.name}
                skillSearch={skillSearch}
                setSkillSearch={setSkillSearch}
                skillSourceFilter={skillSourceFilter}
                setSkillSourceFilter={setSkillSourceFilter}
                filteredSkills={filteredSkills}
                totalSkills={catalogQuery.data?.skills.length ?? 0}
                skillConfigIssues={skillConfigIssues}
                selectedConfigFileEditable={selectedConfigFileEditable}
                hasSkillConfigSelectionChange={hasSkillConfigSelectionChange}
                skillConfigSaving={skillConfigSaving}
                onSave={saveConfigFileSkillActivation}
                onReset={resetSkillWorkspaces}
                hasSkillConfigChange={hasSkillConfigChange}
                skillConfigSaveError={skillConfigSaveError}
                skillWorkspaceById={skillWorkspaceById}
                onWorkspaceChange={updateSkillWorkspace}
              />
              <AIAgentSettingsToolPermissionsSection
                isLoading={capabilitiesQuery.isLoading}
                error={capabilitiesQuery.error}
                errorMessage={capabilitiesQuery.error ? settingsErrorMessage(capabilitiesQuery.error) : null}
                selectedConfigFileToolGrantCount={selectedConfigFile.toolGrants.length}
                toolGrantWorkspaces={toolGrantWorkspaces}
                toolPermissionsWorkspaceIssues={toolPermissionsWorkspaceIssues}
                toolPermissionsSearch={toolPermissionsSearch}
                setToolPermissionsSearch={setToolPermissionsSearch}
                toolPermissionsFilter={toolPermissionsFilter}
                setToolPermissionsFilter={setToolPermissionsFilter}
                toolPermissionsFilteredTools={toolPermissionsFilteredTools}
                totalDiscoveredTools={capabilitiesQuery.data?.resolvedTools.discovered.length ?? 0}
                onBulkEdit={applyToolPermissionsBulkEdit}
                filterPresets={filterPresets}
                onApplyFilterPreset={applyToolPermissionsFilterPreset}
                onDeleteFilterPreset={deleteToolPermissionsFilterPreset}
                onSaveFilterPreset={saveToolPermissionsFilterPreset}
                onFixWorkspaceIssues={fixToolPermissionsWorkspaceIssues}
                toolPermissionsDiffItems={toolPermissionsDiffItems}
                selectedConfigFileEditable={selectedConfigFileEditable}
                hasToolPermissionsChange={hasToolPermissionsChange}
                toolPermissionsSaving={toolPermissionsSaving}
                onSave={saveConfigFileToolPermissions}
                onReset={resetToolGrantWorkspaces}
                toolPermissionsSaveError={toolPermissionsSaveError}
                toolGrantWorkspaceByName={toolGrantWorkspaceByName}
                currentToolGrants={currentToolGrants}
                onWorkspaceChange={updateToolGrantWorkspace}
              />
              {configFile.selectedConfigFileDiff && <ConfigFileDiffPanel diff={configFile.selectedConfigFileDiff} />}
              {lastConfigFileBackup && (
                <AIAgentSettingsConfigFileRollbackBackupPanel
                  backup={lastConfigFileBackup}
                  managing={configFile.managing}
                  onRestore={() => void configFile.restoreRollbackBackup()}
                />
              )}
            </>
          )}
        </AIAgentSettingsConfigFileEditorShell>
      )}
    </AgentSettingsPanel>
  )
}

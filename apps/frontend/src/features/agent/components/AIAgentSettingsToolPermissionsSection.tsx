import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save, XCircle } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsCallout,
  AgentSettingsFormGrid,
  AgentSettingsIcon,
  AgentSettingsIssueList,
  AgentSettingsKeyValue,
  AgentSettingsStack,
  AgentSettingsStateMessage,
  AgentSettingsToolPermissionsBulkActionPanel,
  AgentSettingsToolPermissionsFilterPanel,
  AgentSettingsToolPermissionsFilterPresetPanel,
} from '@/features/agent/components/AgentSettingsUi'
import { AppInlineError } from '@movscript/ui/business/app'
import type { ToolGrantWorkspace } from '@movscript/core/agent'
import { AgentSettingsConfigFileEditorSection } from '@/features/agent/components/AgentSettingsConfigFileUi'
import type { ProviderToolDescriptor } from '@/shared/infrastructure/providerSessionClient'
import type { AgentToolPermissionsFilterPreset } from '@/features/agent/state/agentStore'
import type { ToolPermissionsWorkspaceIssue } from '@/features/agent/application/agentSettingsReadiness'
import type { ToolPermissionsDiffItem } from '@/features/agent/application/agentSettingsConfigFile'
import {
  TOOL_PERMISSIONS_FILTER_OPTIONS,
  type ToolPermissionsBulkAction,
  type ToolPermissionsFilter,
} from '@/features/agent/presentation/agentSettingsToolPermissionsModel'
import { ToolPermissionsDiffPreview, ToolPermissionsRow } from '@/features/agent/components/AIAgentSettingsPageParts'

export function AIAgentSettingsToolPermissionsSection({
  isLoading,
  error,
  errorMessage,
  selectedConfigFileToolGrantCount,
  toolGrantWorkspaces,
  toolPermissionsWorkspaceIssues,
  toolPermissionsSearch,
  setToolPermissionsSearch,
  toolPermissionsFilter,
  setToolPermissionsFilter,
  toolPermissionsFilteredTools,
  totalDiscoveredTools,
  onBulkEdit,
  filterPresets,
  onApplyFilterPreset,
  onDeleteFilterPreset,
  onSaveFilterPreset,
  onFixWorkspaceIssues,
  toolPermissionsDiffItems,
  selectedConfigFileEditable,
  hasToolPermissionsChange,
  toolPermissionsSaving,
  onSave,
  onReset,
  toolPermissionsSaveError,
  toolGrantWorkspaceByName,
  currentToolGrants,
  onWorkspaceChange,
}: {
  isLoading: boolean
  error: unknown
  errorMessage: string | null
  selectedConfigFileToolGrantCount: number
  toolGrantWorkspaces: ToolGrantWorkspace[]
  toolPermissionsWorkspaceIssues: ToolPermissionsWorkspaceIssue[]
  toolPermissionsSearch: string
  setToolPermissionsSearch: Dispatch<SetStateAction<string>>
  toolPermissionsFilter: ToolPermissionsFilter
  setToolPermissionsFilter: Dispatch<SetStateAction<ToolPermissionsFilter>>
  toolPermissionsFilteredTools: ProviderToolDescriptor[]
  totalDiscoveredTools: number
  onBulkEdit: (action: ToolPermissionsBulkAction) => void
  filterPresets: AgentToolPermissionsFilterPreset[]
  onApplyFilterPreset: (preset: AgentToolPermissionsFilterPreset) => void
  onDeleteFilterPreset: (presetId: string) => void
  onSaveFilterPreset: () => void
  onFixWorkspaceIssues: () => void
  toolPermissionsDiffItems: ToolPermissionsDiffItem[]
  selectedConfigFileEditable: boolean
  hasToolPermissionsChange: boolean
  toolPermissionsSaving: boolean
  onSave: () => void | Promise<void>
  onReset: () => void
  toolPermissionsSaveError: string | null
  toolGrantWorkspaceByName: Map<string, ToolGrantWorkspace>
  currentToolGrants: Set<string>
  onWorkspaceChange: (name: string, patch: Partial<ToolGrantWorkspace>) => void
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsConfigFileEditorSection
      title={t('agents.settings.toolPermissionsPanel')}
      description={t('agents.settings.toolPermissionsEditHelp')}
      id="agent-settings-tools"
    >
      {isLoading ? (
        <AgentSettingsStateMessage icon={<AgentSettingsIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
      ) : error ? (
        <AgentSettingsStateMessage icon={<XCircle size={16} />} tone="danger" text={errorMessage ?? t('common.error')} />
      ) : (
        <AgentSettingsStack>
          <AgentSettingsFormGrid columns="four">
            <AgentSettingsKeyValue label={t('agents.settings.configFileFields.toolGrants')} value={selectedConfigFileToolGrantCount} />
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
              total: totalDiscoveredTools,
            })}
          />
          <AgentSettingsToolPermissionsBulkActionPanel
            title={t('agents.settings.toolPermissionsBulkActions')}
            help={t('agents.settings.toolPermissionsBulkHelp')}
            actions={[
              { id: 'allow_available', label: t('agents.settings.toolPermissionsBulkAllowAvailable'), onClick: () => onBulkEdit('allow_available') },
              { id: 'deny', label: t('agents.settings.toolPermissionsBulkDeny'), onClick: () => onBulkEdit('deny') },
              { id: 'approval_never', label: t('agents.settings.toolPermissionsBulkApprovalNever'), onClick: () => onBulkEdit('approval_never') },
              { id: 'approval_on_write', label: t('agents.settings.toolPermissionsBulkApprovalOnWrite'), onClick: () => onBulkEdit('approval_on_write') },
              { id: 'approval_always', label: t('agents.settings.toolPermissionsBulkApprovalAlways'), onClick: () => onBulkEdit('approval_always') },
            ]}
          />
          <AgentSettingsToolPermissionsFilterPresetPanel
            title={t('agents.settings.toolPermissionsFilterPresets')}
            saveLabel={t('agents.settings.saveToolPermissionsFilterPreset')}
            saveIcon={<Save size={14} />}
            help={t('agents.settings.toolPermissionsFilterPresetsHelp')}
            emptyLabel={t('agents.settings.toolPermissionsFilterPresetsEmpty')}
            presets={filterPresets.map((preset) => ({
              id: preset.id,
              name: preset.name,
              title: `${preset.name}: ${preset.search || t(`agents.settings.toolPermissionsFilters.${preset.filter}`)}`,
              onSelect: () => onApplyFilterPreset(preset),
              onDelete: () => onDeleteFilterPreset(preset.id),
            }))}
            deleteLabel={t('agents.settings.deleteToolPermissionsFilterPreset')}
            onSave={onSaveFilterPreset}
          />
          {toolPermissionsWorkspaceIssues.length > 0 && (
            <AgentSettingsCallout tone="warning" compact data-testid="agent-settings-tool-permissions-workspace-issues">
              <AgentSettingsIssueList
                items={toolPermissionsWorkspaceIssues.map((issue) => (
                  `${issue.toolName}: ${t(issue.reasonKey, issue.values)}`
                ))}
              />
              <AgentSettingsActionButton size="sm" variant="outline" onClick={onFixWorkspaceIssues}>
                {t('agents.settings.fixToolPermissionsWorkspaceIssues')}
              </AgentSettingsActionButton>
            </AgentSettingsCallout>
          )}
          <ToolPermissionsDiffPreview items={toolPermissionsDiffItems} />
          <AgentSettingsActionRow>
            <AgentSettingsActionButton
              onClick={onSave}
              disabled={!selectedConfigFileEditable || !hasToolPermissionsChange || toolPermissionsSaving || toolPermissionsWorkspaceIssues.length > 0}
              data-testid="agent-settings-save-tool-permissions"
            >
              {toolPermissionsSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
              {hasToolPermissionsChange ? t('agents.settings.saveToolPermissions') : t('agents.settings.toolPermissionsSaved')}
            </AgentSettingsActionButton>
            <AgentSettingsActionButton variant="outline" onClick={onReset} disabled={!selectedConfigFileEditable || !hasToolPermissionsChange || toolPermissionsSaving}>
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
                  onWorkspaceChange={onWorkspaceChange}
                />
              ))}
            </AgentSettingsStack>
          )}
        </AgentSettingsStack>
      )}
    </AgentSettingsConfigFileEditorSection>
  )
}

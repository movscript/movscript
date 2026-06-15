import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Loader2, Save, Trash2 } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsFieldLabel,
  AgentSettingsFormField,
  AgentSettingsFormGrid,
  AgentSettingsIcon,
  AgentSettingsInput,
  AgentSettingsSelectTrigger,
} from '@movscript/ui/business/agent'
import { Select, SelectContent, SelectItem, SelectValue } from '@movscript/ui/primitives'
import { AgentSettingsConfigFileEditorSection } from '@/features/agent/components/AgentSettingsConfigFileUi'
import {
  CONFIG_FILE_APPROVAL_DEFAULT_KEYS,
  CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS,
  CONFIG_FILE_LIMIT_KEYS,
  type ConfigFileApprovalDefaultKey,
  type ConfigFileApprovalDefaultWorkspaceValue,
  type ConfigFileLimitKey,
} from '@/features/agent/application/agentSettingsConfigFile'

export function AIAgentSettingsConfigFileDetailsSection({
  name,
  setName,
  description,
  setDescription,
  editable,
  hasDetailsChange,
  managing,
  onSaveDetails,
  onDuplicate,
  onDelete,
  isCurrent,
  limitWorkspaces,
  setLimitWorkspaces,
  approvalDefaultWorkspaces,
  setApprovalDefaultWorkspaces,
  onWorkspaceDirty,
}: {
  name: string
  setName: Dispatch<SetStateAction<string>>
  description: string
  setDescription: Dispatch<SetStateAction<string>>
  editable: boolean
  hasDetailsChange: boolean
  managing: boolean
  onSaveDetails: () => void | Promise<void>
  onDuplicate: () => void | Promise<void>
  onDelete: () => void | Promise<void>
  isCurrent: boolean
  limitWorkspaces: Record<ConfigFileLimitKey, string>
  setLimitWorkspaces: Dispatch<SetStateAction<Record<ConfigFileLimitKey, string>>>
  approvalDefaultWorkspaces: Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>
  setApprovalDefaultWorkspaces: Dispatch<SetStateAction<Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>>>
  onWorkspaceDirty: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <AgentSettingsConfigFileEditorSection title={t('agents.settings.configFileFields.current')}>
        <AgentSettingsFormGrid columns="two">
          <AgentSettingsFormField>
            <AgentSettingsFieldLabel>{t('agents.settings.configFileNameLabel')}</AgentSettingsFieldLabel>
            <AgentSettingsInput
              value={name}
              disabled={!editable}
              onChange={(event) => {
                setName(event.target.value)
                onWorkspaceDirty()
              }}
              data-testid="agent-settings-config-file-name"
            />
          </AgentSettingsFormField>
          <AgentSettingsFormField>
            <AgentSettingsFieldLabel>{t('agents.settings.configFileDescriptionLabel')}</AgentSettingsFieldLabel>
            <AgentSettingsInput
              value={description}
              disabled={!editable}
              onChange={(event) => {
                setDescription(event.target.value)
                onWorkspaceDirty()
              }}
              data-testid="agent-settings-config-file-description"
            />
          </AgentSettingsFormField>
        </AgentSettingsFormGrid>
        <AgentSettingsActionRow>
          <AgentSettingsActionButton variant="outline" onClick={onSaveDetails} disabled={!editable || !hasDetailsChange || managing} data-testid="agent-settings-save-config-file-details">
            {managing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
            {t('agents.settings.saveConfigFileDetails')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton variant="outline" onClick={onDuplicate} disabled={managing} data-testid="agent-settings-duplicate-config-file">
            {managing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Copy size={14} />}
            {t('agents.settings.duplicateConfigFile')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton variant="outline" onClick={onDelete} disabled={!editable || isCurrent || managing} data-testid="agent-settings-delete-config-file">
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
                value={limitWorkspaces[key]}
                disabled={!editable}
                onChange={(event) => {
                  setLimitWorkspaces((workspaces) => ({ ...workspaces, [key]: event.target.value }))
                  onWorkspaceDirty()
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
                value={approvalDefaultWorkspaces[key]}
                disabled={!editable}
                onValueChange={(value) => {
                  setApprovalDefaultWorkspaces((workspaces) => ({ ...workspaces, [key]: value as ConfigFileApprovalDefaultWorkspaceValue }))
                  onWorkspaceDirty()
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
    </>
  )
}

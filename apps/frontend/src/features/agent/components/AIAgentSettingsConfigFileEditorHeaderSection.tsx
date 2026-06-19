import { useTranslation } from 'react-i18next'
import { Clipboard, Copy, Download, Loader2, Save } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsBadge,
  AgentSettingsCallout,
  AgentSettingsIcon,
  AgentSettingsStatusBadge,
  agentSettingsStatusRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { AppInlineError } from '@movscript/ui/business/app'
import { AgentSettingsConfigFileEditorHeader } from '@/features/agent/components/AgentSettingsConfigFileUi'
import type { ProviderCatalogConfigFile } from '@movscript/core/agent/protocol'

export function AIAgentSettingsConfigFileEditorHeaderSection({
  selectedConfigFile,
  currentConfigFileId,
  title,
  hasChange,
  saving,
  managing,
  message,
  saveError,
  readonly,
  onSave,
  onCopy,
  onDownload,
  onDuplicate,
}: {
  selectedConfigFile: ProviderCatalogConfigFile
  currentConfigFileId?: string
  title: string
  hasChange: boolean
  saving: boolean
  managing: boolean
  message: string | null
  saveError: string | null
  readonly: boolean
  onSave: () => void | Promise<void>
  onCopy: () => void | Promise<void>
  onDownload: () => void | Promise<void>
  onDuplicate: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const isCurrent = selectedConfigFile.id === currentConfigFileId

  return (
    <>
      <AgentSettingsConfigFileEditorHeader
        title={title}
        description={selectedConfigFile.id}
        badges={(
          <>
            {isCurrent && (
              <AgentSettingsStatusBadge {...agentSettingsStatusRecipe('ready')}>
                {t('agents.settings.configFileStatus.current')}
              </AgentSettingsStatusBadge>
            )}
            {!isCurrent && (
              <AgentSettingsBadge>{t('agents.settings.configFileStatus.selected')}</AgentSettingsBadge>
            )}
            <AgentSettingsBadge variant="outline">v{selectedConfigFile.version}</AgentSettingsBadge>
          </>
        )}
        actions={(
          <>
            <AgentSettingsActionButton onClick={onSave} disabled={!hasChange || saving}>
              {saving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
              {hasChange ? t('agents.settings.saveConfigFile') : t('agents.settings.configFileSaved')}
            </AgentSettingsActionButton>
            <AgentSettingsActionButton variant="outline" onClick={onCopy} disabled={managing} data-testid="agent-settings-copy-config-file">
              <Clipboard size={14} />
              {t('agents.settings.copyConfigFile')}
            </AgentSettingsActionButton>
            <AgentSettingsActionButton variant="outline" onClick={onDownload} disabled={managing} data-testid="agent-settings-download-config-file">
              <Download size={14} />
              {t('agents.settings.downloadConfigFile')}
            </AgentSettingsActionButton>
          </>
        )}
      />
      {message && (
        <AgentSettingsCallout tone="success" compact data-testid="agent-settings-config-file-message">
          {message}
        </AgentSettingsCallout>
      )}
      {saveError && <AppInlineError>{saveError}</AppInlineError>}
      {!isCurrent && (
        <AgentSettingsCallout tone="warning" compact>
          {t('agents.settings.configFileSwitchResetsToolPermissions')}
        </AgentSettingsCallout>
      )}
      {readonly && (
        <AgentSettingsCallout tone="neutral" compact data-testid="agent-settings-config-file-readonly">
          {t('agents.settings.configFileReadonlyHelp')}
          <AgentSettingsActionButton size="sm" variant="outline" onClick={onDuplicate} disabled={managing}>
            <Copy size={14} />
            {t('agents.settings.duplicateConfigFile')}
          </AgentSettingsActionButton>
        </AgentSettingsCallout>
      )}
    </>
  )
}

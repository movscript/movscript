import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Upload } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsIcon,
  AgentSettingsStateMessage,
} from '@/features/agent/components/AgentSettingsUi'
import {
  AgentSettingsConfigFileBrowser,
  AgentSettingsConfigFileEditorSection,
  AgentSettingsConfigFileList,
  AgentSettingsConfigFileListButton,
} from '@/features/agent/components/AgentSettingsConfigFileUi'
import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import { configFileListSummary } from '@/features/agent/components/AIAgentSettingsPageParts'

export function AIAgentSettingsConfigFileBrowserSection({
  configFiles,
  currentConfigFileId,
  selectedConfigFileId,
  managing,
  onCreateConfigFile,
  onImportConfigFile,
  onSelectConfigFile,
}: {
  configFiles: ProviderCatalogConfigFile[]
  currentConfigFileId?: string
  selectedConfigFileId?: string
  managing: boolean
  onCreateConfigFile: () => void | Promise<void>
  onImportConfigFile: () => void
  onSelectConfigFile: (configFileId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsConfigFileBrowser>
      <AgentSettingsConfigFileEditorSection
        title={t('agents.settings.configFilesPanel')}
        description={t('agents.settings.activeConfigFileHelp')}
      >
        <AgentSettingsActionRow>
          <AgentSettingsActionButton variant="outline" onClick={onCreateConfigFile} disabled={managing} data-testid="agent-settings-create-config-file">
            {managing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Plus size={14} />}
            {t('agents.settings.createConfigFile')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton variant="outline" onClick={onImportConfigFile} disabled={managing} data-testid="agent-settings-import-config-file">
            {managing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Upload size={14} />}
            {t('agents.settings.importConfigFile')}
          </AgentSettingsActionButton>
        </AgentSettingsActionRow>
        {configFiles.length === 0 ? (
          <AgentSettingsStateMessage text={t('agents.settings.noConfigFiles')} />
        ) : (
          <AgentSettingsConfigFileList>
            {configFiles.map((configFile) => (
              <AgentSettingsConfigFileListButton
                key={configFile.id}
                name={configFile.name}
                idLabel={configFile.id}
                description={configFile.description}
                versionLabel={`v${configFile.version}`}
                current={configFile.id === currentConfigFileId}
                selected={configFile.id === selectedConfigFileId}
                currentLabel={t('agents.settings.configFileStatus.current')}
                selectedLabel={t('agents.settings.configFileStatus.selected')}
                summaryLabel={configFileListSummary(configFile, t)}
                onSelect={() => onSelectConfigFile(configFile.id)}
              />
            ))}
          </AgentSettingsConfigFileList>
        )}
      </AgentSettingsConfigFileEditorSection>
    </AgentSettingsConfigFileBrowser>
  )
}

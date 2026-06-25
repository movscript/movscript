import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AgentSettingsCallout,
  AgentSettingsFormGrid,
  AgentSettingsInput,
  AgentSettingsKeyValue,
  AgentSettingsStack,
  AgentSettingsStateMessage,
} from '@/features/agent/components/AgentSettingsUi'
import {
  AgentSettingsConfigFileEditor,
  AgentSettingsConfigFileEditorPane,
} from '@/features/agent/components/AgentSettingsConfigFileUi'
import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import { AIAgentSettingsConfigFileBrowserSection } from '@/features/agent/components/AIAgentSettingsConfigFileBrowserSection'

export function AIAgentSettingsConfigFileEditorShell({
  inputRef,
  configFiles,
  currentConfigFile,
  selectedConfigFile,
  managing,
  onLoadFile,
  onCreateConfigFile,
  onSelectConfigFile,
  children,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  configFiles: ProviderCatalogConfigFile[]
  currentConfigFile: ProviderCatalogConfigFile | null
  selectedConfigFile: ProviderCatalogConfigFile | null
  managing: boolean
  onLoadFile: (file?: File | null) => void | Promise<void>
  onCreateConfigFile: () => void | Promise<void>
  onSelectConfigFile: (configFileId: string) => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsStack>
      <AgentSettingsFormGrid columns="four">
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.total')} value={configFiles.length} />
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.current')} value={currentConfigFile?.name ?? '-'} />
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.packs')} value={currentConfigFile?.enabledPackIds.length ?? 0} />
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.toolGrants')} value={currentConfigFile?.toolGrants.length ?? 0} />
      </AgentSettingsFormGrid>
      <AgentSettingsCallout tone="neutral" compact>
        {t('agents.settings.configFileScopeHelp')}
      </AgentSettingsCallout>
      <AgentSettingsInput
        ref={inputRef as RefObject<HTMLInputElement>}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void onLoadFile(event.target.files?.[0])}
      />
      <AgentSettingsConfigFileEditor>
        <AIAgentSettingsConfigFileBrowserSection
          configFiles={configFiles}
          currentConfigFileId={currentConfigFile?.id}
          selectedConfigFileId={selectedConfigFile?.id}
          managing={managing}
          onCreateConfigFile={onCreateConfigFile}
          onImportConfigFile={() => inputRef.current?.click()}
          onSelectConfigFile={onSelectConfigFile}
        />

        <AgentSettingsConfigFileEditorPane>
          {selectedConfigFile ? children : <AgentSettingsStateMessage text={t('agents.settings.noConfigFiles')} />}
        </AgentSettingsConfigFileEditorPane>
      </AgentSettingsConfigFileEditor>
    </AgentSettingsStack>
  )
}

import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsCallout,
  AgentSettingsFieldHelp,
  AgentSettingsIcon,
  AgentSettingsStack,
} from '@/features/agent/components/AgentSettingsUi'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'

export function AIAgentSettingsConfigFileRollbackBackupPanel({
  backup,
  managing,
  onRestore,
}: {
  backup: AgentSettingsConfigFileBackup
  managing: boolean
  onRestore: () => void | Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsCallout data-testid="agent-settings-config-file-backup" tone="warning" compact>
      <AgentSettingsStack>
        <AgentSettingsFieldHelp>
          {t('agents.settings.configFileBackupHelp', {
            name: backup.configFile.name,
            time: new Date(backup.createdAt).toLocaleString(),
          })}
        </AgentSettingsFieldHelp>
        <AgentSettingsActionRow>
          <AgentSettingsActionButton
            type="button"
            size="sm"
            variant="outline"
            onClick={onRestore}
            disabled={managing}
            data-testid="agent-settings-restore-config-file-backup"
          >
            {managing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
            {t('agents.settings.restoreConfigFileBackup')}
          </AgentSettingsActionButton>
        </AgentSettingsActionRow>
      </AgentSettingsStack>
    </AgentSettingsCallout>
  )
}

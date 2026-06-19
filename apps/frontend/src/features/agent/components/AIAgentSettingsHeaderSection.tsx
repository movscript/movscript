import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import {
  AgentSettingsHeaderContent,
  AgentSettingsHeaderCopy,
  AgentSettingsHeaderDescription,
  AgentSettingsHeaderTitle,
  AgentSettingsHeaderTitleRow,
} from '@/features/agent/components/AgentSettingsUi'

export function AIAgentSettingsHeaderSection() {
  const { t } = useTranslation()

  return (
    <AgentSettingsHeaderContent>
      <AgentSettingsHeaderCopy>
        <AgentSettingsHeaderTitleRow>
          <Settings size={18} />
          <AgentSettingsHeaderTitle>{t('agents.settings.title')}</AgentSettingsHeaderTitle>
        </AgentSettingsHeaderTitleRow>
        <AgentSettingsHeaderDescription>{t('agents.settings.description')}</AgentSettingsHeaderDescription>
      </AgentSettingsHeaderCopy>
    </AgentSettingsHeaderContent>
  )
}

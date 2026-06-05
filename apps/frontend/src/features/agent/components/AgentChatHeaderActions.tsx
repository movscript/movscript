import { Activity, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppWindowIconButton } from '@movscript/ui'

export interface AgentChatHeaderActionsProps {
  historyOpen: boolean
  pinnedStatusExpanded: boolean
  showPinnedStatusControl: boolean
  onToggleHistory: () => void
  onTogglePinnedStatus: () => void
}

export function AgentChatHeaderActions({
  historyOpen,
  pinnedStatusExpanded,
  showPinnedStatusControl,
  onToggleHistory,
  onTogglePinnedStatus,
}: AgentChatHeaderActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="ai-agent-program-header-actions">
      {showPinnedStatusControl ? (
        <AppWindowIconButton
          type="button"
          onClick={onTogglePinnedStatus}
          aria-label={pinnedStatusExpanded ? t('agents.chat.pinnedStatus.collapse') : t('agents.chat.pinnedStatus.expand')}
          title={t('agents.chat.pinnedStatus.title')}
          className="ai-agent-program-header-actions__status"
          data-active={pinnedStatusExpanded ? 'true' : undefined}
        >
          <Activity size={12} />
        </AppWindowIconButton>
      ) : null}
      <AppWindowIconButton
        type="button"
        onClick={onToggleHistory}
        aria-label={t('agents.chat.conversationHistory')}
        title={t('agents.chat.conversationHistory')}
        data-active={historyOpen ? 'true' : undefined}
      >
        <History size={12} />
      </AppWindowIconButton>
    </div>
  )
}

import { History, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@movscript/ui/primitives'
import { cn } from '@/shared/ui/cn'

export interface ProviderControlsProps {
  className?: string
  historyOpen?: boolean
  onNewConversation?: () => void
  onToggleHistory?: () => void
  showHistory?: boolean
  showNewConversation?: boolean
}

export function ProviderControls({
  className,
  historyOpen,
  onNewConversation,
  onToggleHistory,
  showHistory = true,
  showNewConversation = false,
}: ProviderControlsProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('ai-provider-controls', className)}>
      {showNewConversation ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="ai-provider-controls__button"
          onClick={onNewConversation}
          aria-label={t('agents.chat.newConversation')}
          title={t('agents.chat.newConversation')}
        >
          <Plus size={14} />
        </Button>
      ) : null}
      {showHistory ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="ai-provider-controls__button"
          onClick={onToggleHistory}
          aria-label={t('agents.chat.conversationHistory')}
          title={t('agents.chat.conversationHistory')}
          data-active={historyOpen ? 'true' : undefined}
        >
          <History size={14} />
        </Button>
      ) : null}
    </div>
  )
}

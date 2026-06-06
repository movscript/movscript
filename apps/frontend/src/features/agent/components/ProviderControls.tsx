import { Bot, Check, Clapperboard, History, Plus, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@movscript/ui'
import {
  providerProtocol,
  enabledProviders,
  resolveNewConversationProvider,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
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
  showNewConversation = true,
}: ProviderControlsProps) {
  const { t } = useTranslation()
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const setNewConversationProviderId = useProviderConfigStore((s) => s.setNewConversationProviderId)
  const availableProviders = useMemo(() => enabledProviders(providerSettings), [providerSettings])
  const newConversationProvider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])
  const CurrentIcon = providerIcon(newConversationProvider)

  return (
    <div className={cn('ai-provider-controls', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ai-provider-controls__button"
            aria-label={t('agents.chat.selectNewConversationProvider')}
            title={newConversationProvider.label}
          >
            <CurrentIcon size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ai-provider-controls__menu">
          {availableProviders.map((provider) => {
            const ProviderIcon = providerIcon(provider)
            return (
              <DropdownMenuItem
                key={provider.id}
                onSelect={() => setNewConversationProviderId(provider.id)}
              >
                <ProviderIcon size={14} />
                <span>{provider.label}</span>
                {provider.id === newConversationProvider.id ? <Check size={13} className="ml-auto" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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

export interface ProviderMarkProps {
  className?: string
}

export function ProviderMark({ className }: ProviderMarkProps) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const newConversationProvider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])
  const CurrentIcon = providerIcon(newConversationProvider)

  return (
    <span
      className={cn('ai-provider-mark', className)}
      aria-label={newConversationProvider.label}
      title={newConversationProvider.label}
    >
      <CurrentIcon size={13} />
    </span>
  )
}

function providerIcon(provider: ProviderConfig): LucideIcon {
  return providerProtocol(provider) === 'app-server' ? Bot : Clapperboard
}

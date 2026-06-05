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
  enabledAgentProviders,
  resolveNewConversationAgentProvider,
  useAgentProviderConfigStore,
  type AgentProviderConfig,
} from '@/features/agent/state/agentProviderConfigStore'
import { cn } from '@/shared/ui/cn'

export interface AgentProviderControlsProps {
  className?: string
  historyOpen?: boolean
  onNewConversation?: () => void
  onToggleHistory?: () => void
  showHistory?: boolean
  showNewConversation?: boolean
}

export function AgentProviderControls({
  className,
  historyOpen,
  onNewConversation,
  onToggleHistory,
  showHistory = true,
  showNewConversation = true,
}: AgentProviderControlsProps) {
  const { t } = useTranslation()
  const agentProviderSettings = useAgentProviderConfigStore((s) => s.settings)
  const setNewConversationProviderId = useAgentProviderConfigStore((s) => s.setNewConversationProviderId)
  const availableAgentProviders = useMemo(() => enabledAgentProviders(agentProviderSettings), [agentProviderSettings])
  const newConversationProvider = useMemo(() => resolveNewConversationAgentProvider(agentProviderSettings), [agentProviderSettings])
  const CurrentIcon = agentProviderIcon(newConversationProvider)

  return (
    <div className={cn('ai-agent-provider-controls', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ai-agent-provider-controls__button"
            aria-label={t('agents.chat.selectNewConversationAgent')}
            title={newConversationProvider.label}
          >
            <CurrentIcon size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ai-agent-provider-controls__menu">
          {availableAgentProviders.map((provider) => {
            const ProviderIcon = agentProviderIcon(provider)
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
          className="ai-agent-provider-controls__button"
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
          className="ai-agent-provider-controls__button"
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

export interface AgentProviderMarkProps {
  className?: string
}

export function AgentProviderMark({ className }: AgentProviderMarkProps) {
  const agentProviderSettings = useAgentProviderConfigStore((s) => s.settings)
  const newConversationProvider = useMemo(() => resolveNewConversationAgentProvider(agentProviderSettings), [agentProviderSettings])
  const CurrentIcon = agentProviderIcon(newConversationProvider)

  return (
    <span
      className={cn('ai-agent-provider-mark', className)}
      aria-label={newConversationProvider.label}
      title={newConversationProvider.label}
    >
      <CurrentIcon size={13} />
    </span>
  )
}

function agentProviderIcon(provider: AgentProviderConfig): LucideIcon {
  return provider.kind === 'codex' ? Bot : Clapperboard
}

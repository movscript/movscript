import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@movscript/ui/primitives'
import { ROUTES } from '@/routes/projectRoutes'
import { useProviderConfigStore } from '@/shared/infrastructure/providerConfigStore'
import { hasEnabledAgentProvider } from '@/features/agent/application/agentAvailability'

export function useAgentAvailabilityGuard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const providerSettings = useProviderConfigStore((state) => state.settings)
  const [open, setOpen] = React.useState(false)
  const hasEnabledAgent = React.useMemo(() => hasEnabledAgentProvider(providerSettings), [providerSettings])

  const runOrPrompt = React.useCallback((action: () => void) => {
    if (hasEnabledAgent) {
      action()
      return true
    }
    setOpen(true)
    return false
  }, [hasEnabledAgent])

  const goToAgentConsole = React.useCallback(() => {
    setOpen(false)
    navigate(ROUTES.agentConsole)
  }, [navigate])

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('agents.availability.noEnabledAgentsTitle', { defaultValue: '没有开启任何 Agent' })}
          </DialogTitle>
          <DialogDescription>
            {t('agents.availability.noEnabledAgentsDescription', { defaultValue: '请先在 Agent 控制台开启至少一个 Agent，然后再进入 Agent 模式或展开 AI 会话。' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
          <Button type="button" onClick={goToAgentConsole}>
            {t('agents.availability.goToAgentConsole', { defaultValue: '前往 Agent 控制台' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    hasEnabledAgent,
    runOrPrompt,
    dialog,
  }
}

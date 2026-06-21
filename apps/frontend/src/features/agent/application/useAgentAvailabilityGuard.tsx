import React from 'react'
import { useQuery } from '@tanstack/react-query'
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
import {
  DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
  normalizeProviderSettingsWithRuntimeEnv,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { enabledAgentProfiles } from '@/features/agent/application/agentAvailability'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import {
  isClaudeAgentProfile,
  type AgentProfile,
} from '@/features/agent/application/agentProfileModel'

const HOST_RUNTIME_PACKAGE_NAME = '@movscript/mova-app-server'
const HOST_RUNTIME_PACKAGE_VERSION = '0.0.1-alpha.13'

export function useAgentAvailabilityGuard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const savedProviderSettings = useProviderConfigStore((state) => state.settings)
  const providerSettings = React.useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedProviderSettings), [savedProviderSettings])
  const [open, setOpen] = React.useState(false)
  const enabledProfiles = React.useMemo(() => enabledAgentProfiles(providerSettings), [providerSettings])
  const availabilityQuery = useQuery({
    queryKey: agentProviderKeys.runtimeStatus('agent-availability', enabledProfiles.map(runtimeQueryIdentity).join('|')),
    queryFn: () => hasInstalledRuntimeProfile(enabledProfiles),
    retry: false,
  })
  const hasEnabledAgent = availabilityQuery.data === true

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

function runtimeQueryIdentity(profile: AgentProfile): string {
  if (profile.runtimeBackend.transport === 'app-server') return `${profile.id}:host:${HOST_RUNTIME_PACKAGE_NAME}@${HOST_RUNTIME_PACKAGE_VERSION}`
  if (isClaudeAgentProfile(profile)) {
    return `${profile.id}:sdk:${profile.runtimeBackend.packageName ?? '@anthropic-ai/claude-agent-sdk'}@${profile.runtimeBackend.packageVersion ?? DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION}`
  }
  return `${profile.id}:${profile.runtimeBackend.transport}`
}

async function hasInstalledRuntimeProfile(profiles: AgentProfile[]): Promise<boolean> {
  if (profiles.length === 0) return false
  const results = await Promise.all(profiles.map(runtimeProfileInstalled))
  return results.some(Boolean)
}

async function runtimeProfileInstalled(profile: AgentProfile): Promise<boolean> {
  const electronApi = readElectronApi()
  if (!electronApi?.sdkRuntimePackageStatus) return false
  if (profile.runtimeBackend.transport === 'app-server') {
    const status = await electronApi.sdkRuntimePackageStatus({
      packageName: HOST_RUNTIME_PACKAGE_NAME,
      packageVersion: HOST_RUNTIME_PACKAGE_VERSION,
    })
    return status.installed === true
  }
  if (isClaudeAgentProfile(profile)) {
    const packageName = profile.runtimeBackend.packageName ?? '@anthropic-ai/claude-agent-sdk'
    const packageVersion = profile.runtimeBackend.packageVersion ?? DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION
    const status = await electronApi.sdkRuntimePackageStatus({
      packageName,
      ...(packageVersion !== 'latest' ? { packageVersion } : {}),
    })
    return status.installed === true
  }
  return false
}

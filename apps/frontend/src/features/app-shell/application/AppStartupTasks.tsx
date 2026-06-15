import { useEffect } from 'react'
import { hydrateAppWindowContext } from '@/shared/infrastructure/appWindowContext'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

export function AppStartupTasks({ settingsHydrated }: { settingsHydrated: boolean }) {
  useEffect(() => {
    if (!settingsHydrated) return
    void hydrateAppWindowContext().catch((error) => {
      console.warn('[window] failed to hydrate app window context', error)
    })
  }, [settingsHydrated])

  useEffect(() => {
    const unsubscribe = window.api?.onBackendAuthSessionExpired?.(() => {
      useUserStore.getState().setCurrentUser(null)
    })
    return unsubscribe ?? undefined
  }, [])

  useEffect(() => {
    return scheduleIdleTask(() => {
      void import('@/features/agent/state/agentTelemetryReporter').then((telemetry) => {
        telemetry.installAgentTelemetryReporter()
      }).catch((error) => {
        console.warn('[agent] failed to install telemetry reporter', error)
      })
    })
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    return scheduleIdleTask(() => {
      void import('@/features/plugins/application/builtinClientPlugins').then((module) => {
        return module.ensureBundledClientPluginsInstalled()
      }).catch((error) => {
        console.warn('[plugins] failed to install bundled client plugins', error)
      })
    })
  }, [settingsHydrated])

  return null
}

function scheduleIdleTask(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const idleCallback = window.requestIdleCallback
  if (idleCallback) {
    const id = idleCallback(callback, { timeout: 2000 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(callback, 250)
  return () => window.clearTimeout(id)
}

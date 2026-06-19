import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  attachCrossPageNotificationBroadcastBridge,
  publishCrossPageNotificationFromUnknown,
} from '@/shared/application/crossPageNotifications'
import { installAppEventQueryInvalidationBridge } from '@/shared/application/appEventQueryInvalidation'
import { projectAppEventScope, publishAppEvent } from '@/shared/application/appEvents'
import { hydrateAppWindowContext } from '@/shared/infrastructure/appWindowContext'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useAppWindowContextStore } from '@/shared/infrastructure/appWindowContext'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { authRealmKey } from '@/shared/infrastructure/session/authRealm'
import { useSystemStatusStore } from '@/shared/infrastructure/systemStatusStore'
import { refreshRuntimeConfigSnapshot } from '@/shared/infrastructure/config'
import { refreshProviderSettingsRuntimeEnv } from '@/shared/infrastructure/providerConfigStore'

export function AppStartupTasks({ settingsHydrated }: { settingsHydrated: boolean }) {
  const queryClient = useQueryClient()
  const settings = useAppSettingsStore((s) => s.settings)

  useEffect(() => {
    if (!settingsHydrated) return
    useUserStore.getState().setActiveRealm(authRealmKey(settings))
  }, [
    settingsHydrated,
    settings.apiBaseURL,
    settings.cloudAPIBaseURL,
    settings.launchMode,
    settings.localAPIBaseURL,
  ])

  useEffect(() => {
    const detachBroadcastBridge = attachCrossPageNotificationBroadcastBridge()
    const unsubscribeElectronBridge = readElectronApi()?.onCrossPageNotification?.((event) => {
      publishCrossPageNotificationFromUnknown(event)
    })
    return () => {
      detachBroadcastBridge()
      unsubscribeElectronBridge?.()
    }
  }, [])

  useEffect(() => {
    return installAppEventQueryInvalidationBridge(queryClient)
  }, [queryClient])

  useEffect(() => {
    const unsubscribe = readElectronApi()?.onMovScriptEngineWorkspaceUpdated?.((event) => {
      const projectId = positiveProjectId(event.projectId)
      useSystemStatusStore.getState().markWorkspaceUpdated(projectId)
      publishAppEvent({
        topic: 'project.workspace.updated',
        scope: projectAppEventScope(event.projectId),
        source: 'electron',
        delivery: 'cross-surface',
        payload: event,
        raw: event,
      })
    })
    return unsubscribe ?? undefined
  }, [queryClient])

  useEffect(() => {
    if (!settingsHydrated) return
    void refreshRuntimeConfigSnapshot()
      .then(() => refreshProviderSettingsRuntimeEnv())
      .catch((error) => {
        console.warn('[runtime-config] failed to refresh provider runtime env', error)
      })
  }, [settingsHydrated])

  useEffect(() => {
    if (!settingsHydrated) return
    void hydrateAppWindowContext().catch((error) => {
      console.warn('[window] failed to hydrate app window context', error)
      useAppWindowContextStore.getState().setContext(null)
    })
  }, [settingsHydrated])

  useEffect(() => {
    if (!settingsHydrated) return
    let uninstall: (() => void) | undefined
    let disposed = false
    const cancelInstall = scheduleIdleTask(() => {
      void import('@/shared/infrastructure/systemMessagesWebSocket').then((module) => {
        if (disposed) return
        uninstall = module.installSystemMessagesWebSocket()
      }).catch((error) => {
        console.warn('[system-messages] failed to install websocket transport', error)
      })
    })
    return () => {
      disposed = true
      cancelInstall()
      uninstall?.()
    }
  }, [settingsHydrated])

  useEffect(() => {
    const unsubscribe = readElectronApi()?.onBackendAuthSessionExpired?.(() => {
      useSystemStatusStore.getState().markAuthSessionExpired()
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

function positiveProjectId(value: unknown): number | undefined {
  const projectId = Number(value)
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
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

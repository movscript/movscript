import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { AppBackendBootActionButton, AppBackendBootOverlay as AppBackendBootOverlayFrame } from '@movscript/ui/business/app'
import { canManageLocalBackend, isBackendBootStatus, probeLocalBackendStatus, type BackendBootStatus } from '@/shared/infrastructure/backendBoot'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { ROUTES } from '@/routes/projectRoutes'
import i18n from '@/i18n'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useSystemStatusStore } from '@/shared/infrastructure/systemStatusStore'

export function BackendBootBoundary() {
  const { pathname } = useLocation()
  const settings = useAppSettingsStore((s) => s.settings)
  const [status, setStatus] = useState<BackendBootStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const setBackendStatus = useSystemStatusStore((state) => state.setBackendStatus)

  useEffect(() => {
    let disposed = false
    if (!canManageLocalBackend()) {
      updateBackendStatus({ state: 'starting', baseURL: settings.apiBaseURL })
      void probeLocalBackendStatus(settings.apiBaseURL).then((next) => {
        if (!disposed) updateBackendStatus(next)
      })
      return () => {
        disposed = true
      }
    }

    const off = readElectronApi()?.onBackendStatus?.((next) => {
      if (isBackendBootStatus(next)) updateBackendStatus(next)
    })
    void readElectronApi()?.getBackendStatus?.().then((next) => {
      if (!disposed && isBackendBootStatus(next)) updateBackendStatus(next)
    }).catch(() => {})
    return () => {
      disposed = true
      off?.()
    }
  }, [settings.apiBaseURL, setBackendStatus])

  const isRecoveryRoute = pathname === ROUTES.appSettings

  if (settings.launchMode !== 'local' || isRecoveryRoute) return null
  if (status?.state === 'ready') return null

  const displayStatus: BackendBootStatus = status ?? {
    state: 'starting',
    baseURL: settings.apiBaseURL,
  }
  const isError = displayStatus.state === 'error'
  async function retryLocalBackend() {
    setRetrying(true)
    updateBackendStatus({ state: 'starting', baseURL: settings.apiBaseURL })
    try {
      if (!canManageLocalBackend()) {
        updateBackendStatus(await probeLocalBackendStatus(settings.apiBaseURL))
        return
      }
      await readElectronApi()?.setAppSettings?.(settings)
      const next = await readElectronApi()?.getBackendStatus?.()
      if (isBackendBootStatus(next)) updateBackendStatus(next)
    } catch (error) {
      updateBackendStatus({
        state: 'error',
        baseURL: settings.apiBaseURL,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setRetrying(false)
    }
  }

  function updateBackendStatus(next: BackendBootStatus) {
    setStatus(next)
    setBackendStatus(next)
  }

  return (
    <AppBackendBootOverlayFrame
      tone={isError ? 'danger' : 'info'}
      icon={isError ? <AlertTriangle size={20} /> : <Loader2 size={20} className="animate-spin" />}
      title={isError ? i18n.t('backendBoot.errorTitle') : i18n.t('backendBoot.startingTitle')}
      description={isError ? (displayStatus.message || i18n.t('backendBoot.errorDescription')) : i18n.t('backendBoot.startingDescription')}
      baseURL={displayStatus.baseURL}
      actions={isError ? (
        <>
          <AppBackendBootActionButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void retryLocalBackend()}
            disabled={retrying}
            loading={retrying}
          >
            {retrying ? i18n.t('backendBoot.retrying') : i18n.t('backendBoot.retry')}
          </AppBackendBootActionButton>
          <AppBackendBootActionButton asChild variant="outline" size="sm">
            <Link to={ROUTES.appSettings}>{i18n.t('backendBoot.openSettings')}</Link>
          </AppBackendBootActionButton>
        </>
      ) : null}
    />
  )
}

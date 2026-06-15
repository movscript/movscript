import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { AppBackendBootActionButton, AppBackendBootOverlay as AppBackendBootOverlayFrame } from '@movscript/ui/business/app'
import { canManageLocalBackend, isBackendBootStatus, probeLocalBackendStatus, type BackendBootStatus } from '@/shared/infrastructure/backendBoot'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { ROUTES } from '@/routes/projectRoutes'
import i18n from '@/i18n'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function BackendBootBoundary() {
  const { pathname } = useLocation()
  const settings = useAppSettingsStore((s) => s.settings)
  const [status, setStatus] = useState<BackendBootStatus | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let disposed = false
    if (!canManageLocalBackend()) {
      setStatus({ state: 'starting', baseURL: settings.apiBaseURL })
      void probeLocalBackendStatus(settings.apiBaseURL).then((next) => {
        if (!disposed) setStatus(next)
      })
      return () => {
        disposed = true
      }
    }

    const off = readElectronApi()?.onBackendStatus?.((next) => {
      if (isBackendBootStatus(next)) setStatus(next)
    })
    void readElectronApi()?.getBackendStatus?.().then((next) => {
      if (!disposed && isBackendBootStatus(next)) setStatus(next)
    }).catch(() => {})
    return () => {
      disposed = true
      off?.()
    }
  }, [settings.apiBaseURL])

  const isRecoveryRoute = pathname === ROUTES.appSettings || pathname === '/onboarding'

  if (settings.launchMode !== 'local' || isRecoveryRoute) return null
  if (status?.state === 'ready') return null

  const displayStatus: BackendBootStatus = status ?? {
    state: 'starting',
    baseURL: settings.apiBaseURL,
  }
  const isError = displayStatus.state === 'error'
  async function retryLocalBackend() {
    setRetrying(true)
    setStatus({ state: 'starting', baseURL: settings.apiBaseURL })
    try {
      if (!canManageLocalBackend()) {
        setStatus(await probeLocalBackendStatus(settings.apiBaseURL))
        return
      }
      await readElectronApi()?.setAppSettings?.(settings)
      const next = await readElectronApi()?.getBackendStatus?.()
      if (isBackendBootStatus(next)) setStatus(next)
    } catch (error) {
      setStatus({
        state: 'error',
        baseURL: settings.apiBaseURL,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setRetrying(false)
    }
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

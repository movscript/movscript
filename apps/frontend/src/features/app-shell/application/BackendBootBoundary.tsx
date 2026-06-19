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
  const errorDescription = isError
    ? firstLine(displayStatus.message) || i18n.t('backendBoot.errorDescription')
    : i18n.t('backendBoot.startingDescription')
  const errorDetails = isError ? backendBootErrorDetails(displayStatus) : null
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
      description={errorDescription}
      baseURL={displayStatus.baseURL}
      details={errorDetails}
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

function firstLine(value: string | undefined): string {
  return value?.split(/\r?\n/, 1)[0]?.trim() ?? ''
}

function backendBootErrorDetails(status: BackendBootStatus): string {
  const details: string[] = []
  if (status.logPath) details.push(`${i18n.t('backendBoot.logFile')}: ${status.logPath}`)
  const messageRemainder = status.message
    ?.split(/\r?\n/)
    .slice(1)
    .filter((line) => !/^Log file:/i.test(line.trim()))
    .join('\n')
    .trim()
  if (messageRemainder) details.push(messageRemainder)
  if (status.recentOutput?.trim() && !/Recent backend output:/i.test(messageRemainder ?? '')) {
    details.push(`${i18n.t('backendBoot.recentOutput')}:\n${status.recentOutput.trim()}`)
  }
  return details.join('\n\n')
}

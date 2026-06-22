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

const BACKEND_BOOT_OVERLAY_TIMEOUT_MS = 35_000
type BackendBootProgressStage = 'launching' | 'database' | 'storage' | 'health'

export function BackendBootBoundary() {
  const { pathname } = useLocation()
  const settings = useAppSettingsStore((s) => s.settings)
  const [status, setStatus] = useState<BackendBootStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [progressTick, setProgressTick] = useState(0)
  const setBackendStatus = useSystemStatusStore((state) => state.setBackendStatus)

  useEffect(() => {
    let disposed = false
    let timeout: number | undefined
    const shouldStartLocalBackend = settings.launchMode === 'local' && settings.onboardingCompleted

    if (!shouldStartLocalBackend) {
      setStatus(null)
      setStartedAt(null)
      return () => {
        disposed = true
      }
    }

    setStartedAt(Date.now())
    setProgressTick(0)

    const updateIfLive = (next: BackendBootStatus) => {
      if (!disposed) updateBackendStatus(next)
    }

    const installTimeout = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(async () => {
        if (disposed) return
        const probed = await probeLocalBackendStatus(settings.apiBaseURL)
        if (probed.state === 'ready') {
          updateIfLive(probed)
          return
        }
        const next = await readElectronApi()?.getBackendStatus?.().catch(() => null)
        if (isBackendBootStatus(next)) {
          if (next.state === 'ready' || next.state === 'error') {
            updateIfLive(next)
            return
          }
        }
        updateIfLive({
          state: 'error',
          baseURL: settings.apiBaseURL,
          message: i18n.t('backendBoot.timeoutDescription', { url: settings.apiBaseURL }),
        })
      }, BACKEND_BOOT_OVERLAY_TIMEOUT_MS)
    }

    if (!canManageLocalBackend()) {
      updateBackendStatus({ state: 'starting', baseURL: settings.apiBaseURL })
      installTimeout()
      void probeLocalBackendStatus(settings.apiBaseURL).then((next) => {
        updateIfLive(next)
      })
      return () => {
        disposed = true
        window.clearTimeout(timeout)
      }
    }

    const off = readElectronApi()?.onBackendStatus?.((next) => {
      if (!isBackendBootStatus(next)) return
      updateIfLive(next)
      if (next.state === 'starting' || next.state === 'idle' || next.state === 'stopped') {
        void probeLocalBackendStatus(settings.apiBaseURL).then((probed) => {
          if (probed.state === 'ready') updateIfLive(probed)
        })
      }
    })
    void readElectronApi()?.getBackendStatus?.().then((next) => {
      if (!disposed && isBackendBootStatus(next)) updateBackendStatus(next)
      if (isBackendBootStatus(next) && (next.state === 'ready' || next.state === 'error')) return
      void probeLocalBackendStatus(settings.apiBaseURL).then((probed) => {
        if (probed.state === 'ready') updateIfLive(probed)
      })
      updateIfLive({ state: 'starting', baseURL: settings.apiBaseURL, message: i18n.t('backendBoot.startingDescription') })
      installTimeout()
      void readElectronApi()?.setAppSettings?.(settings)
        .then(async () => {
          const afterStart = await readElectronApi()?.getBackendStatus?.().catch(() => null)
          if (isBackendBootStatus(afterStart)) updateIfLive(afterStart)
        })
        .catch((error) => {
          updateIfLive({
            state: 'error',
            baseURL: settings.apiBaseURL,
            message: error instanceof Error ? error.message : String(error),
          })
        })
    }).catch(() => {})
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      off?.()
    }
  }, [settings, settings.apiBaseURL, settings.launchMode, settings.onboardingCompleted, setBackendStatus])

  useEffect(() => {
    if (!startedAt || status?.state === 'ready' || status?.state === 'error') return
    const timer = window.setInterval(() => setProgressTick((current) => current + 1), 500)
    return () => window.clearInterval(timer)
  }, [startedAt, status?.state])

  const isRecoveryRoute = pathname === ROUTES.appSettings

  if (!settings.onboardingCompleted) return null
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
  const elapsedMs = startedAt ? Date.now() - startedAt + progressTick * 0 : 0
  const progressPercent = backendBootProgress(elapsedMs)
  const progressStage = backendBootProgressStage(elapsedMs)
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
      progress={!isError ? (
        <BackendBootProgress
          percent={progressPercent}
          label={i18n.t('backendBoot.progressLabel')}
          stage={i18n.t(`backendBoot.progressStages.${progressStage}`)}
        />
      ) : undefined}
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

function BackendBootProgress({
  percent,
  label,
  stage,
}: {
  percent: number
  label: string
  stage: string
}) {
  return (
    <div className="app-backend-boot-progress" role="status" aria-live="polite">
      <div className="app-backend-boot-progress__header">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="app-backend-boot-progress__track">
        <div className="app-backend-boot-progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <p className="app-backend-boot-progress__stage">{stage}</p>
    </div>
  )
}

function backendBootProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) return 10
  return Math.min(94, 10 + (elapsedMs / BACKEND_BOOT_OVERLAY_TIMEOUT_MS) * 84)
}

function backendBootProgressStage(elapsedMs: number): BackendBootProgressStage {
  if (elapsedMs < 6_000) return 'launching'
  if (elapsedMs < 14_000) return 'database'
  if (elapsedMs < 24_000) return 'storage'
  return 'health'
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

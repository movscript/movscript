import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, FolderOpen, HardDrive, RefreshCw, Server } from 'lucide-react'
import {
  AppSettingsActionButton,
  AppSettingsActionRow,
  AppSettingsChoiceGrid,
  AppSettingsChoiceTile,
  AppSettingsContentStack,
  AppSettingsEndpointSurface,
  AppSettingsFeedbackText,
  AppSettingsField,
  AppSettingsInput,
  AppSettingsSection,
} from '@/features/settings/components/AppSettingsUi'
import {
  getDaemonGatewayBaseURL,
  getDefaultAPIBaseURL,
  getSettingsDataConnectionBaseURL,
  normalizeAPIBaseURL,
  type AppSettings,
} from '@/shared/infrastructure/config'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { saveElectronAppSettings, useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { authRealmKey } from '@/shared/infrastructure/session/authRealm'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ensureLocalWorkspaceAuthSession } from '@/shared/infrastructure/session/localWorkspaceAuth'
import { ROUTES } from '@/routes/projectRoutes'
import { normalizeAppSettings } from '@movscript/shared'
import './ModeSelectionPanel.css'

type ModeSelectionVariant = 'onboarding' | 'settings'
type PendingStage = 'idle' | 'saving' | 'starting' | 'database' | 'storage' | 'auth' | 'entering'

const LOCAL_PREPARATION_TIMEOUT_MS = 45_000

export function ModeSelectionPanel({ variant = 'onboarding' }: { variant?: ModeSelectionVariant }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useAppSettingsStore((s) => s.settings)
  const completeOnboarding = useAppSettingsStore((s) => s.completeOnboarding)
  const currentMode = modeFromDataConnection(settings)
  const [selectedMode, setSelectedMode] = useState<AppSettings['launchMode'] | null>(
    variant === 'settings' ? currentMode : null,
  )
  const [dataConnectionURL, setDataConnectionURL] = useState(
    currentMode === 'cloud'
      ? getSettingsDataConnectionBaseURL(settings)
      : settings.cloudAPIBaseURL ?? getDefaultAPIBaseURL(),
  )
  const [movScriptHomeDir, setMovScriptHomeDir] = useState(settings.movScriptWorkspaceDir ?? '')
  const [pendingMode, setPendingMode] = useState<AppSettings['launchMode'] | null>(null)
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null)
  const [progressTick, setProgressTick] = useState(0)
  const [savedMode, setSavedMode] = useState<AppSettings['launchMode'] | null>(null)
  const [error, setError] = useState('')

  const normalizedCloudAPIBaseURL = useMemo(() => {
    try {
      return normalizeAPIBaseURL(dataConnectionURL)
    } catch {
      return dataConnectionURL.trim()
    }
  }, [dataConnectionURL])
  const isValidCloudURL = /^https?:\/\/.+/i.test(normalizedCloudAPIBaseURL)
  const pending = pendingMode !== null
  const modeTitle = variant === 'settings' ? t('appSettings.switchModeTitle') : t('onboarding.title')
  const pendingElapsedMs = pendingStartedAt ? Date.now() - pendingStartedAt + progressTick * 0 : 0
  const pendingStage = pendingMode === 'local' ? localPreparationStage(pendingElapsedMs) : 'idle'
  const pendingProgress = pendingMode === 'local' ? localPreparationProgress(pendingElapsedMs) : 0

  useEffect(() => {
    if (pendingMode !== 'local') return
    const timer = window.setInterval(() => setProgressTick((current) => current + 1), 350)
    return () => window.clearInterval(timer)
  }, [pendingMode])

  async function applyMode(mode: AppSettings['launchMode']) {
    if (mode === 'cloud' && !isValidCloudURL) return
    setSelectedMode(mode)
    setPendingMode(mode)
    setPendingStartedAt(Date.now())
    setProgressTick(0)
    setSavedMode(null)
    setError('')
    try {
      const daemonGatewayBaseURL = getDaemonGatewayBaseURL()
      const cloudAPIBaseURL = mode === 'cloud'
        ? normalizedCloudAPIBaseURL
        : settings.cloudAPIBaseURL ?? getDefaultAPIBaseURL()
      const nextPartial: Partial<AppSettings> = {
        launchMode: mode,
        dataConnection: {
          kind: mode,
          url: mode === 'local' ? daemonGatewayBaseURL : cloudAPIBaseURL,
        },
        cloudAPIBaseURL,
        daemonGatewayBaseURL,
        movScriptWorkspaceDir: movScriptHomeDir,
      }
      const nextSettings: AppSettings = normalizeAppSettings(
        {
          ...settings,
          ...nextPartial,
          onboardingCompleted: true,
        },
        {
          defaultSettings: settings,
          daemonGatewayBaseURL,
        },
      )
      await Promise.all([
        withTimeout(
          saveElectronAppSettings(nextSettings),
          mode === 'local' ? LOCAL_PREPARATION_TIMEOUT_MS : 15_000,
          t(mode === 'local' ? 'onboarding.localTimeout' : 'onboarding.cloudTimeout'),
        ),
        mode === 'local' ? minimumDelay(900) : Promise.resolve(),
      ])
      if (mode === 'local') {
        await withTimeout(
          ensureLocalWorkspaceAuthSession({ requireActiveLocalMode: false }),
          15_000,
          t('onboarding.localAuthTimeout'),
        )
      }
      completeOnboarding(nextPartial)
      const userStore = useUserStore.getState()
      if (mode !== 'local') {
        userStore.setActiveRealm(authRealmKey(nextSettings))
      }
      setSavedMode(mode)
      navigate(ROUTES.root, { replace: true })
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t('onboarding.modeSwitchFailed'))
    } finally {
      setPendingMode(null)
      setPendingStartedAt(null)
    }
  }

  async function chooseMovScriptHomeDir() {
    const selected = await readElectronApi()?.openDirectory?.()
    if (!selected) return
    setMovScriptHomeDir(selected)
  }

  return (
    <AppSettingsContentStack className={`mode-selection-panel mode-selection-panel--${variant}`}>
      <div className="mode-selection-hero">
        {variant === 'onboarding' ? (
          <div className="mode-selection-brand" aria-label="MovScript">
            <span className="mode-selection-brand__mark">M</span>
            <span className="mode-selection-brand__name">MovScript</span>
          </div>
        ) : null}
        <h1>{modeTitle}</h1>
      </div>

      <AppSettingsChoiceGrid className="mode-selection-grid">
        <AppSettingsChoiceTile
          className="mode-selection-card mode-selection-card--local"
          type="button"
          disabled={pending}
          selected={selectedMode === 'local'}
          onClick={() => {
            setSelectedMode('local')
            setError('')
          }}
          icon={pendingMode === 'local' ? <RefreshCw className="animate-spin" /> : <HardDrive />}
          title={t('onboarding.local.title')}
          footer={(
            <ModeSelectionCardAction loading={pendingMode === 'local'} label={pendingMode === 'local' ? t('onboarding.localPreparing') : selectedMode === 'local' ? t('onboarding.local.selected') : t('onboarding.local.action')} />
          )}
        />
        <AppSettingsChoiceTile
          className="mode-selection-card mode-selection-card--cloud"
          type="button"
          disabled={pending}
          selected={selectedMode === 'cloud'}
          onClick={() => {
            setSelectedMode('cloud')
            setError('')
          }}
          icon={pendingMode === 'cloud' ? <RefreshCw className="animate-spin" /> : <Server />}
          title={t('onboarding.cloud.title')}
          footer={(
            <ModeSelectionCardAction loading={pendingMode === 'cloud'} label={selectedMode === 'cloud' ? t('onboarding.cloud.selected') : t('onboarding.cloud.configure')} />
          )}
        />
      </AppSettingsChoiceGrid>

      {selectedMode === 'local' ? (
        <AppSettingsActionRow className="mode-selection-confirm-row">
          <AppSettingsActionButton
            type="button"
            onClick={() => void applyMode('local')}
            disabled={pending}
          >
            {pendingMode === 'local' ? (
              <>
                <RefreshCw size={14} className="mr-2 animate-spin" />
                {t('onboarding.localPreparing')}
              </>
            ) : (
              <>
                {variant === 'settings' ? t('appSettings.switchToLocal') : t('onboarding.local.confirm')}
                <ArrowRight size={14} className="ml-2" />
              </>
            )}
          </AppSettingsActionButton>
        </AppSettingsActionRow>
      ) : null}

      {selectedMode === 'cloud' ? (
        <AppSettingsSection
          className="mode-selection-cloud-panel"
          icon={Server}
          title={t('onboarding.cloudConnect.title')}
        >
          <AppSettingsField
            label={t('appSettings.apiBaseURL')}
            htmlFor="modeSelectionApiBaseURL"
            error={!isValidCloudURL && dataConnectionURL.trim() ? t('appSettings.invalidURL') : undefined}
          >
            <AppSettingsInput
              id="modeSelectionApiBaseURL"
              value={dataConnectionURL}
              onChange={(event) => {
                setDataConnectionURL(event.target.value)
                setError('')
              }}
              placeholder="https://api.movscript.com"
              spellCheck={false}
            />
          </AppSettingsField>
          <AppSettingsActionRow>
            <AppSettingsActionButton
              type="button"
              onClick={() => void applyMode('cloud')}
              disabled={!isValidCloudURL || pending}
            >
              {pendingMode === 'cloud' ? (
                <>
                  <RefreshCw size={14} className="mr-2 animate-spin" />
                  {t('onboarding.cloudPreparing')}
                </>
              ) : variant === 'settings' ? t('appSettings.switchToCloud') : t('onboarding.cloud.confirm')}
            </AppSettingsActionButton>
          </AppSettingsActionRow>
        </AppSettingsSection>
      ) : null}

      <details className="app-settings-advanced">
        <summary>{t('onboarding.advanced')}</summary>
        <AppSettingsSection
          icon={HardDrive}
          title={t('appSettings.movScriptWorkspaceTitle')}
          description={t('appSettings.movScriptWorkspaceHint')}
        >
          <AppSettingsField
            label={t('appSettings.movScriptWorkspaceDir')}
            htmlFor="modeSelectionMovScriptWorkspaceDir"
            help={t('appSettings.movScriptWorkspaceDirHelp')}
          >
            <AppSettingsInput
              id="modeSelectionMovScriptWorkspaceDir"
              value={movScriptHomeDir}
              onChange={(event) => setMovScriptHomeDir(event.target.value)}
              placeholder={t('appSettings.movScriptWorkspaceDirPlaceholder')}
              spellCheck={false}
            />
          </AppSettingsField>
          <AppSettingsEndpointSurface
            label={t('appSettings.movScriptWorkspaceEffectiveRoot')}
            value={movScriptHomeDir.trim() || t('appSettings.movScriptWorkspaceDefaultRoot')}
          />
          <AppSettingsActionRow>
            <AppSettingsActionButton type="button" variant="outline" onClick={chooseMovScriptHomeDir} disabled={pending}>
              <FolderOpen size={14} className="mr-2" />
              {t('appSettings.movScriptWorkspaceChooseDirectory')}
            </AppSettingsActionButton>
            <AppSettingsActionButton type="button" variant="ghost" onClick={() => setMovScriptHomeDir('')} disabled={pending}>
              {t('appSettings.movScriptWorkspaceUseDefault')}
            </AppSettingsActionButton>
          </AppSettingsActionRow>
        </AppSettingsSection>
      </details>

      {pendingMode === 'local' ? (
        <LocalPreparationProgress
          percent={pendingProgress}
          title={t('onboarding.localPreparing')}
          stage={t(`onboarding.localPreparationStages.${pendingStage}`)}
        />
      ) : null}
      {savedMode ? (
        <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
          {savedMode === 'local' ? t('appSettings.switchedToLocal') : t('appSettings.switchedToCloud')}
        </AppSettingsFeedbackText>
      ) : null}
      {error ? (
        <AppSettingsFeedbackText tone="danger">
          {t('onboarding.modeSwitchFailed')}: {error}
        </AppSettingsFeedbackText>
      ) : null}
    </AppSettingsContentStack>
  )
}

function ModeSelectionCardAction({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <span className="mode-selection-card__action">
      <span>{label}</span>
      {loading ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
    </span>
  )
}

function LocalPreparationProgress({
  percent,
  title,
  stage,
}: {
  percent: number
  title: string
  stage: string
}) {
  return (
    <div className="mode-selection-progress" role="status" aria-live="polite">
      <div className="mode-selection-progress__header">
        <span>{title}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="mode-selection-progress__track">
        <div className="mode-selection-progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <p>{stage}</p>
    </div>
  )
}

function localPreparationStage(elapsedMs: number): PendingStage {
  if (elapsedMs < 1_500) return 'saving'
  if (elapsedMs < 7_000) return 'starting'
  if (elapsedMs < 16_000) return 'database'
  if (elapsedMs < 28_000) return 'storage'
  if (elapsedMs < 40_000) return 'auth'
  return 'entering'
}

function localPreparationProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) return 8
  return Math.min(92, 8 + (elapsedMs / LOCAL_PREPARATION_TIMEOUT_MS) * 84)
}

function modeFromDataConnection(settings: AppSettings): AppSettings['launchMode'] {
  return settings.dataConnection.kind === 'local' ? 'local' : 'cloud'
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: number | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    window.clearTimeout(timeout)
  }
}

function minimumDelay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

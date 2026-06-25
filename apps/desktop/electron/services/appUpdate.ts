import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { ElectronAppUpdateStatus } from '../../src/shared/contracts/electronApi'

const { autoUpdater } = electronUpdater

type UpdatePolicy = NonNullable<ElectronAppUpdateStatus['policy']>
type UpdateSeverity = NonNullable<ElectronAppUpdateStatus['severity']>
type UpdateInfoLike = {
  version?: string
  releaseName?: string | null
  releaseNotes?: unknown
  mandatory?: unknown
  force?: unknown
  forceUpdate?: unknown
  policy?: unknown
  severity?: unknown
  minSupportedVersion?: unknown
  minimumSupportedVersion?: unknown
  deadlineAt?: unknown
  policyTitle?: unknown
  policyMessage?: unknown
}

const RELEASES_URL = 'https://github.com/movscript/movscript/releases/latest'
const DEFAULT_UPDATE_CHANNEL = 'latest'
const INITIAL_CHECK_MIN_DELAY_MS = 30_000
const INITIAL_CHECK_JITTER_MS = 10 * 60_000
const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000
const UPDATE_CHECK_INTERVAL_JITTER_MS = 15 * 60_000

let status: ElectronAppUpdateStatus = idleStatus()
let inFlightCheck: Promise<ElectronAppUpdateStatus> | null = null
let inFlightDownload: Promise<ElectronAppUpdateStatus> | null = null
let schedulerInstalled = false
let schedulerTimer: NodeJS.Timeout | null = null
let updaterConfigured = false

export function getAppUpdateStatus(): ElectronAppUpdateStatus {
  return status
}

export async function checkForAppUpdate(): Promise<ElectronAppUpdateStatus> {
  configureUpdater()
  if (inFlightCheck) return inFlightCheck

  inFlightCheck = doCheckForAppUpdate().finally(() => {
    inFlightCheck = null
  })
  return inFlightCheck
}

export async function openAppUpdateDownload(): Promise<ElectronAppUpdateStatus> {
  return downloadAppUpdate()
}

export async function downloadAppUpdate(): Promise<ElectronAppUpdateStatus> {
  configureUpdater()
  const current = status.available ? status : await checkForAppUpdate()
  if (!current.available) return current
  if (inFlightDownload) return inFlightDownload

  inFlightDownload = doDownloadAppUpdate().finally(() => {
    inFlightDownload = null
  })
  return inFlightDownload
}

export async function installAppUpdate(): Promise<ElectronAppUpdateStatus> {
  configureUpdater()
  if (!status.downloaded) return status
  setStatus({ ...status, installing: true, error: undefined })
  autoUpdater.quitAndInstall(false, true)
  return status
}

export function installAppUpdateScheduler(): void {
  configureUpdater()
  if (schedulerInstalled) return
  schedulerInstalled = true
  scheduleNextUpdateCheck(randomDelay(INITIAL_CHECK_MIN_DELAY_MS, INITIAL_CHECK_JITTER_MS))
}

export function uninstallAppUpdateScheduler(): void {
  schedulerInstalled = false
  if (schedulerTimer) clearTimeout(schedulerTimer)
  schedulerTimer = null
}

async function doCheckForAppUpdate(): Promise<ElectronAppUpdateStatus> {
  setStatus({ ...status, checking: true, error: undefined })

  try {
    const result = await autoUpdater.checkForUpdates()
    const updateInfo = result?.updateInfo
    if (updateInfo) {
      setStatus(statusFromUpdateInfo(updateInfo, {
        available: compareVersions(updateInfo.version, app.getVersion()) > 0,
        checking: false,
      }))
    }
    return status
  } catch (error) {
    setStatus({
      ...idleStatus(),
      checkedAt: new Date().toISOString(),
      downloadUrl: RELEASES_URL,
      error: error instanceof Error ? error.message : String(error),
    })
    return status
  }
}

async function doDownloadAppUpdate(): Promise<ElectronAppUpdateStatus> {
  setStatus({ ...status, downloading: true, error: undefined })
  try {
    await autoUpdater.downloadUpdate()
    return status
  } catch (error) {
    setStatus({
      ...status,
      downloading: false,
      downloadUrl: status.downloadUrl ?? RELEASES_URL,
      error: error instanceof Error ? error.message : String(error),
    })
    void shell.openExternal(status.downloadUrl ?? RELEASES_URL)
    return status
  }
}

function configureUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.channel = updateChannel()
  autoUpdater.allowPrerelease = shouldAllowPrerelease(autoUpdater.channel)

  autoUpdater.on('checking-for-update', () => {
    setStatus({ ...status, checking: true, error: undefined })
  })
  autoUpdater.on('update-available', (info) => {
    setStatus(statusFromUpdateInfo(info, { available: true, checking: false }))
  })
  autoUpdater.on('update-not-available', (info) => {
    setStatus(statusFromUpdateInfo(info, { available: false, checking: false }))
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      ...status,
      downloading: true,
      downloadProgress: progress.percent,
      error: undefined,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus(statusFromUpdateInfo(info, {
      available: true,
      checking: false,
      downloaded: true,
      downloading: false,
      downloadProgress: 100,
    }))
  })
  autoUpdater.on('error', (error) => {
    setStatus({
      ...status,
      checking: false,
      downloading: false,
      downloadUrl: status.downloadUrl ?? RELEASES_URL,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

function scheduleNextUpdateCheck(delayMs: number): void {
  if (!schedulerInstalled) return
  if (schedulerTimer) clearTimeout(schedulerTimer)
  schedulerTimer = setTimeout(() => {
    void checkForAppUpdate().finally(() => {
      scheduleNextUpdateCheck(randomDelay(UPDATE_CHECK_INTERVAL_MS, UPDATE_CHECK_INTERVAL_JITTER_MS))
    })
  }, delayMs)
  schedulerTimer.unref?.()
}

function randomDelay(baseMs: number, jitterMs: number): number {
  return baseMs + Math.floor(Math.random() * jitterMs)
}

function updateChannel(): string {
  const baseChannel = (process.env.MOVSCRIPT_APP_UPDATE_CHANNEL || DEFAULT_UPDATE_CHANNEL).trim() || DEFAULT_UPDATE_CHANNEL
  if (baseChannel.includes(process.platform) && baseChannel.includes(process.arch)) return baseChannel
  return `${baseChannel}-${process.platform}-${process.arch}`
}

function shouldAllowPrerelease(channel: string | null): boolean {
  return /\b(?:alpha|beta|rc|test|next)\b/i.test(channel ?? '')
}

function statusFromUpdateInfo(info: UpdateInfoLike, patch: Partial<ElectronAppUpdateStatus>): ElectronAppUpdateStatus {
  const latestVersion = typeof info.version === 'string' && info.version.trim() ? info.version.trim() : undefined
  const releaseNotes = typeof info.releaseNotes === 'string' && info.releaseNotes.trim() ? info.releaseNotes.trim() : undefined
  const policy = updatePolicyFromInfo(info)
  return {
    ...status,
    available: patch.available ?? status.available,
    checking: patch.checking ?? false,
    currentVersion: app.getVersion(),
    latestVersion,
    downloadUrl: RELEASES_URL,
    releaseNotes,
    channel: autoUpdater.channel ?? updateChannel(),
    mandatory: policy.policy === 'required',
    policy: policy.policy,
    severity: policy.severity,
    minSupportedVersion: policy.minSupportedVersion,
    deadlineAt: policy.deadlineAt,
    policyTitle: policy.policyTitle,
    policyMessage: policy.policyMessage,
    checkedAt: new Date().toISOString(),
    error: undefined,
    downloading: patch.downloading ?? false,
    downloaded: patch.downloaded ?? status.downloaded,
    downloadProgress: patch.downloadProgress ?? status.downloadProgress,
    installing: patch.installing ?? status.installing,
  }
}

function updatePolicyFromInfo(info: UpdateInfoLike): {
  policy: UpdatePolicy
  severity: UpdateSeverity
  minSupportedVersion?: string
  deadlineAt?: string
  policyTitle?: string
  policyMessage?: string
} {
  const explicitPolicy = stringField(info.policy)
  const minSupportedVersion = stringField(info.minSupportedVersion) ?? stringField(info.minimumSupportedVersion)
  const deadlineAt = stringField(info.deadlineAt)
  const severity = updateSeverity(stringField(info.severity)) ?? 'normal'
  const belowMinimum = minSupportedVersion ? compareVersions(app.getVersion(), minSupportedVersion) < 0 : false
  const pastDeadline = deadlineAt ? Date.now() >= Date.parse(deadlineAt) : false
  const forced = booleanField(info.mandatory) || booleanField(info.force) || booleanField(info.forceUpdate)
  const required = explicitPolicy === 'required' || forced || belowMinimum || pastDeadline

  return {
    policy: required ? 'required' : 'optional',
    severity,
    minSupportedVersion,
    deadlineAt,
    policyTitle: stringField(info.policyTitle),
    policyMessage: stringField(info.policyMessage),
  }
}

function updateSeverity(value: string | undefined): UpdateSeverity | undefined {
  if (value === 'normal' || value === 'security' || value === 'data-loss' || value === 'startup-blocker') return value
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanField(value: unknown): boolean {
  return value === true
}

function idleStatus(): ElectronAppUpdateStatus {
  return {
    available: false,
    checking: false,
    currentVersion: app.getVersion(),
    channel: updateChannel(),
    policy: 'optional',
  }
}

function setStatus(next: ElectronAppUpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send('app-update:status', status)
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function versionParts(version: string): number[] {
  const normalized = version.trim().replace(/^v/i, '').split(/[+-]/)[0] ?? ''
  return normalized.split('.').map((part) => {
    const match = part.match(/^\d+/)
    return match ? Number(match[0]) : 0
  })
}

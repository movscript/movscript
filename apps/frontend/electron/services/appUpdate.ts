import { app, BrowserWindow, shell } from 'electron'
import os from 'node:os'
import type { ElectronAppUpdateStatus } from '../../src/shared/contracts/electronApi'

const DEFAULT_UPDATE_ENDPOINT = 'https://api.movscript.com/api/app-updates/desktop/latest'
const DEFAULT_UPDATE_CHANNEL = 'stable'
const UPDATE_CHECK_TIMEOUT_MS = 8000
const INITIAL_CHECK_MIN_DELAY_MS = 30_000
const INITIAL_CHECK_JITTER_MS = 10 * 60_000
const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000
const UPDATE_CHECK_INTERVAL_JITTER_MS = 15 * 60_000

let status: ElectronAppUpdateStatus = idleStatus()
let inFlightCheck: Promise<ElectronAppUpdateStatus> | null = null
let schedulerInstalled = false
let schedulerTimer: NodeJS.Timeout | null = null

export function getAppUpdateStatus(): ElectronAppUpdateStatus {
  return status
}

export async function checkForAppUpdate(): Promise<ElectronAppUpdateStatus> {
  if (inFlightCheck) return inFlightCheck

  inFlightCheck = doCheckForAppUpdate().finally(() => {
    inFlightCheck = null
  })
  return inFlightCheck
}

export async function openAppUpdateDownload(): Promise<ElectronAppUpdateStatus> {
  const current = status.available ? status : await checkForAppUpdate()
  if (!current.available || !current.downloadUrl) return current
  await shell.openExternal(current.downloadUrl)
  return current
}

export function installAppUpdateScheduler(): void {
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
    const endpoint = updateEndpoint()
    const response = await fetchWithTimeout(endpoint)
    if (!response.ok) {
      throw new Error(`Update check failed with HTTP ${response.status}`)
    }

    const raw = await response.json() as unknown
    const next = normalizeUpdateResponse(raw)
    setStatus(next)
    return next
  } catch (error) {
    const next: ElectronAppUpdateStatus = {
      ...idleStatus(),
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }
    setStatus(next)
    return next
  }
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

function updateEndpoint(): string {
  const raw = (process.env.MOVSCRIPT_APP_UPDATE_URL || DEFAULT_UPDATE_ENDPOINT).trim()
  const url = new URL(raw)
  url.searchParams.set('app', 'desktop')
  url.searchParams.set('platform', process.platform)
  url.searchParams.set('arch', process.arch)
  url.searchParams.set('os', os.release())
  url.searchParams.set('version', app.getVersion())
  url.searchParams.set('channel', (process.env.MOVSCRIPT_APP_UPDATE_CHANNEL || DEFAULT_UPDATE_CHANNEL).trim() || DEFAULT_UPDATE_CHANNEL)
  return url.toString()
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': `Movscript/${app.getVersion()} (${process.platform}; ${process.arch})`,
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeUpdateResponse(raw: unknown): ElectronAppUpdateStatus {
  const record = isRecord(raw) ? raw : {}
  const latestVersion = firstString(record, ['latestVersion', 'latest_version', 'version', 'name'])
  const downloadUrl = firstString(record, ['downloadUrl', 'download_url', 'url', 'installerUrl', 'installer_url'])
  const releaseNotesUrl = firstString(record, ['releaseNotesUrl', 'release_notes_url', 'notesUrl', 'notes_url'])
  const releaseNotes = firstString(record, ['releaseNotes', 'release_notes', 'notes', 'body'])
  const channel = firstString(record, ['channel'])
  const currentVersion = app.getVersion()
  const serverAvailable = firstBoolean(record, ['available', 'updateAvailable', 'update_available'])
  const available = serverAvailable ?? (latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false)

  return {
    available,
    checking: false,
    currentVersion,
    latestVersion,
    downloadUrl,
    releaseNotesUrl,
    releaseNotes,
    channel,
    mandatory: firstBoolean(record, ['mandatory', 'force', 'forceUpdate', 'force_update']) === true,
    checkedAt: new Date().toISOString(),
  }
}

function idleStatus(): ElectronAppUpdateStatus {
  return {
    available: false,
    checking: false,
    currentVersion: app.getVersion(),
  }
}

function setStatus(next: ElectronAppUpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send('app-update:status', status)
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function firstBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

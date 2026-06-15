import { useEffect, useState } from 'react'
import type { ElectronAppUpdateStatus } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent, publishWindowEvent } from '@/shared/infrastructure/windowEvents'

export const APP_UPDATE_STATUS_EVENT = 'movscript:app-update-status'

export interface AppUpdateStatus {
  available: boolean
  checking: boolean
  currentVersion?: string
  latestVersion?: string
  downloadUrl?: string
  releaseNotesUrl?: string
  releaseNotes?: string
  channel?: string
  mandatory?: boolean
  checkedAt?: string
  error?: string
}

declare global {
  interface WindowEventMap {
    [APP_UPDATE_STATUS_EVENT]: CustomEvent<AppUpdateStatus>
  }
}

const DEFAULT_APP_UPDATE_STATUS: AppUpdateStatus = { available: false, checking: false }

export function useAppUpdateStatus(): AppUpdateStatus {
  const [status, setStatus] = useState<AppUpdateStatus>(DEFAULT_APP_UPDATE_STATUS)

  useEffect(() => {
    function handleUpdateStatus(event: WindowEventMap[typeof APP_UPDATE_STATUS_EVENT]) {
      setStatus(normalizeAppUpdateStatus(event.detail))
    }

    const cleanupUpdateStatusListener = listenToWindowEvent(APP_UPDATE_STATUS_EVENT, handleUpdateStatus)
    const api = readElectronApi()
    const unsubscribe = api?.onAppUpdateStatus?.((nextStatus) => {
      setStatus(normalizeAppUpdateStatus(nextStatus))
    })
    void api?.getAppUpdateStatus?.().then((nextStatus) => {
      setStatus(normalizeAppUpdateStatus(nextStatus))
    }).catch(() => {})

    return () => {
      cleanupUpdateStatusListener()
      unsubscribe?.()
    }
  }, [])

  return status
}

export async function checkForAppUpdate(): Promise<AppUpdateStatus> {
  const api = readElectronApi()
  if (!api?.checkForAppUpdate) return DEFAULT_APP_UPDATE_STATUS
  return normalizeAppUpdateStatus(await api.checkForAppUpdate())
}

export async function openAppUpdateDownload(): Promise<AppUpdateStatus> {
  const api = readElectronApi()
  if (!api?.openAppUpdateDownload) return DEFAULT_APP_UPDATE_STATUS
  return normalizeAppUpdateStatus(await api.openAppUpdateDownload())
}

export function announceAppUpdateStatus(status: AppUpdateStatus): void {
  publishWindowEvent(new CustomEvent(APP_UPDATE_STATUS_EVENT, {
    detail: normalizeAppUpdateStatus(status),
  }))
}

function normalizeAppUpdateStatus(value: Partial<AppUpdateStatus> | Partial<ElectronAppUpdateStatus> | undefined): AppUpdateStatus {
  return {
    available: value?.available === true,
    checking: value?.checking === true,
    currentVersion: stringValue(value?.currentVersion),
    latestVersion: stringValue(value?.latestVersion),
    downloadUrl: stringValue(value?.downloadUrl),
    releaseNotesUrl: stringValue(value?.releaseNotesUrl),
    releaseNotes: stringValue(value?.releaseNotes),
    channel: stringValue(value?.channel),
    mandatory: value?.mandatory === true,
    checkedAt: stringValue(value?.checkedAt),
    error: stringValue(value?.error),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

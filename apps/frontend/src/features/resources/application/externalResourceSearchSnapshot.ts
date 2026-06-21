import type { ExternalResourceSearchResult } from '@/types'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent, publishWindowEvent } from '@/shared/infrastructure/windowEvents'
import {
  externalResourceSearchInitialData as coreExternalResourceSearchInitialData,
  normalizeExternalMediaTypes,
  normalizeExternalOrientation,
  normalizeExternalSnapshotPage,
  parseExternalResourceSearchSnapshot as coreParseExternalResourceSearchSnapshot,
  type ExternalMediaFilter,
  type ExternalOrientationFilter,
  type ExternalResourceSearchInitialDataInput,
  type ExternalResourceSearchSnapshot as CoreExternalResourceSearchSnapshot,
} from '@movscript/core/resources'

export {
  normalizeExternalMediaTypes,
  normalizeExternalOrientation,
  normalizeExternalSnapshotPage,
  type ExternalMediaFilter,
  type ExternalOrientationFilter,
  type ExternalResourceSearchInitialDataInput,
}

export interface ExternalResourceSearchSnapshot extends CoreExternalResourceSearchSnapshot<ExternalResourceSearchResult> {}

export const EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY = 'movscript.externalResourceSearch.last'
export const EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY = 'movscript-external-resource-search-last-v1'
const EXTERNAL_RESOURCE_SEARCH_CHANGED_EVENT = 'movscript:external-resource-search-snapshot-changed'

let externalResourceSearchSnapshotCache: ExternalResourceSearchSnapshot | null | undefined
let externalResourceSearchSnapshotHydrated = false
let externalResourceSearchSnapshotVersion = 0
let externalResourceSearchSnapshotWindow: Window | undefined

export function loadExternalResourceSearchSnapshot(): ExternalResourceSearchSnapshot | null {
  if (typeof window === 'undefined') return null
  syncExternalResourceSearchSnapshotWindow()
  const api = readElectronApi()
  if (!api?.getDesktopState) return readBrowserExternalResourceSearchSnapshot()
  hydrateExternalResourceSearchSnapshot()
  return externalResourceSearchSnapshotCache ?? null
}

export function subscribeExternalResourceSearchSnapshot(listener: (snapshot: ExternalResourceSearchSnapshot | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handleSnapshotChanged = () => listener(loadExternalResourceSearchSnapshot())
  return listenToWindowEvent(EXTERNAL_RESOURCE_SEARCH_CHANGED_EVENT, handleSnapshotChanged)
}

export function saveExternalResourceSearchSnapshot(snapshot: ExternalResourceSearchSnapshot): void {
  if (typeof window === 'undefined') return
  syncExternalResourceSearchSnapshotWindow()
  const serialized = JSON.stringify(snapshot)
  externalResourceSearchSnapshotCache = parseExternalResourceSearchSnapshot(serialized)
  externalResourceSearchSnapshotHydrated = true
  externalResourceSearchSnapshotVersion += 1
  dispatchExternalResourceSearchSnapshotChanged()

  const api = readElectronApi()
  if (!api?.getDesktopState || !api.setDesktopState) {
    writeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, serialized)
    return
  }
  void api.setDesktopState({ key: EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY, value: serialized })
    .then(() => removeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY))
    .catch(() => writeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, serialized))
}

export function externalResourceSearchInitialData(
  snapshot: ExternalResourceSearchSnapshot | null,
  current: ExternalResourceSearchInitialDataInput,
) {
  return coreExternalResourceSearchInitialData(snapshot, current)
}

export function parseExternalResourceSearchSnapshot(raw: string | null | undefined): ExternalResourceSearchSnapshot | null {
  return coreParseExternalResourceSearchSnapshot(raw) as ExternalResourceSearchSnapshot | null
}

function hydrateExternalResourceSearchSnapshot(): void {
  if (externalResourceSearchSnapshotHydrated) return
  externalResourceSearchSnapshotHydrated = true
  const legacy = readBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY)
  const hydrationVersion = externalResourceSearchSnapshotVersion
  const api = readElectronApi()
  if (!api?.getDesktopState) return
  void api.getDesktopState({ key: EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY }).then((result) => {
    if (externalResourceSearchSnapshotVersion !== hydrationVersion) return
    if (typeof result.value === 'string') {
      externalResourceSearchSnapshotCache = parseExternalResourceSearchSnapshot(result.value)
      removeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY)
      dispatchExternalResourceSearchSnapshotChanged()
      return
    }
    const legacySnapshot = parseExternalResourceSearchSnapshot(legacy)
    if (legacySnapshot) {
      externalResourceSearchSnapshotCache = legacySnapshot
      dispatchExternalResourceSearchSnapshotChanged()
      if (api.setDesktopState) {
        void api.setDesktopState({ key: EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY, value: legacy })
          .then(() => removeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY))
          .catch(() => undefined)
      }
      return
    }
    externalResourceSearchSnapshotCache = null
  }).catch(() => undefined)
}

function readBrowserExternalResourceSearchSnapshot(): ExternalResourceSearchSnapshot | null {
  return parseExternalResourceSearchSnapshot(readBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY))
}

function syncExternalResourceSearchSnapshotWindow(): void {
  if (typeof window === 'undefined') {
    if (externalResourceSearchSnapshotWindow !== undefined) {
      externalResourceSearchSnapshotCache = undefined
      externalResourceSearchSnapshotHydrated = false
      externalResourceSearchSnapshotVersion = 0
      externalResourceSearchSnapshotWindow = undefined
    }
    return
  }
  if (externalResourceSearchSnapshotWindow === window) return
  externalResourceSearchSnapshotCache = undefined
  externalResourceSearchSnapshotHydrated = false
  externalResourceSearchSnapshotVersion = 0
  externalResourceSearchSnapshotWindow = window
}

function dispatchExternalResourceSearchSnapshotChanged(): void {
  if (typeof window === 'undefined') return
  if (typeof Event === 'undefined') return
  publishWindowEvent(new Event(EXTERNAL_RESOURCE_SEARCH_CHANGED_EVENT))
}

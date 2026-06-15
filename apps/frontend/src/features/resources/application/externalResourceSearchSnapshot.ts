import type { ExternalResourceSearchResult } from '@/types'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
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

export function loadExternalResourceSearchSnapshot(): ExternalResourceSearchSnapshot | null {
  return parseExternalResourceSearchSnapshot(readBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY))
}

export function saveExternalResourceSearchSnapshot(snapshot: ExternalResourceSearchSnapshot) {
  try {
    writeBrowserStorageItem('local', EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Best-effort UI state persistence; search remains fully usable without storage.
  }
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

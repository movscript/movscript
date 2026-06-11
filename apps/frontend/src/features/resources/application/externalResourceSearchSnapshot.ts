import type { ExternalResourceSearchResult } from '@/types'
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
  if (typeof window === 'undefined') return null
  try {
    return parseExternalResourceSearchSnapshot(window.localStorage.getItem(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveExternalResourceSearchSnapshot(snapshot: ExternalResourceSearchSnapshot) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(snapshot))
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

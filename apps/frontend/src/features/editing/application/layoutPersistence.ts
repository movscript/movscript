import {
  EDITING_INSPECTOR_DEFAULT_WIDTH,
  EDITING_INSPECTOR_MAX_WIDTH,
  EDITING_INSPECTOR_MIN_WIDTH,
  EDITING_LAYOUT_STORAGE_KEY,
  EDITING_LIBRARY_DEFAULT_WIDTH,
  EDITING_LIBRARY_MAX_WIDTH,
  EDITING_LIBRARY_MIN_WIDTH,
  EDITING_TIMELINE_DEFAULT_HEIGHT,
  EDITING_TIMELINE_MAX_HEIGHT,
  EDITING_TIMELINE_MIN_HEIGHT,
} from '../domain/constants'
import type { EditingLayoutSizes } from '../domain/types'
import { clampNumber } from '../domain/utils'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

const EDITING_LAYOUT_DESKTOP_STATE_KEY = 'movscript-editing-workspace-layout-v1'
const EDITING_LAYOUT_CHANGED_EVENT = 'movscript:editing-layout-changed'

let editingLayoutCache: EditingLayoutSizes | undefined
let editingLayoutHydrated = false
let editingLayoutVersion = 0
let editingLayoutWindow: Window | undefined

export function readEditingLayoutSizes(): EditingLayoutSizes {
  if (typeof window === 'undefined') return defaultEditingLayoutSizes()
  syncEditingLayoutWindow()
  const api = readElectronApi()
  if (!api?.getDesktopState) return readBrowserEditingLayoutSizes()
  hydrateEditingLayoutSizes()
  return editingLayoutCache ?? defaultEditingLayoutSizes()
}

export function subscribeEditingLayoutSizes(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (typeof window.addEventListener !== 'function' || typeof window.removeEventListener !== 'function') {
    return () => undefined
  }
  window.addEventListener(EDITING_LAYOUT_CHANGED_EVENT, listener)
  return () => window.removeEventListener(EDITING_LAYOUT_CHANGED_EVENT, listener)
}

export function persistEditingLayoutSizes(sizes: EditingLayoutSizes): void {
  if (typeof window === 'undefined') return
  syncEditingLayoutWindow()
  const normalized = normalizeEditingLayoutSizes(sizes)
  const serialized = JSON.stringify(normalized)
  editingLayoutCache = normalized
  editingLayoutHydrated = true
  editingLayoutVersion += 1
  dispatchEditingLayoutChanged()

  const api = readElectronApi()
  if (!api?.getDesktopState || !api.setDesktopState) {
    writeBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY, serialized)
    return
  }
  void api.setDesktopState({ key: EDITING_LAYOUT_DESKTOP_STATE_KEY, value: serialized })
    .then(() => removeBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY))
    .catch(() => writeBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY, serialized))
}

function hydrateEditingLayoutSizes(): void {
  if (editingLayoutHydrated) return
  editingLayoutHydrated = true
  const legacy = readBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY)
  if (legacy !== null) {
    editingLayoutCache = parseEditingLayoutSizes(legacy)
  }
  const hydrationVersion = editingLayoutVersion
  const api = readElectronApi()
  if (!api?.getDesktopState) return
  void api.getDesktopState({ key: EDITING_LAYOUT_DESKTOP_STATE_KEY }).then((result) => {
    if (editingLayoutVersion !== hydrationVersion) return
    if (typeof result.value === 'string') {
      editingLayoutCache = parseEditingLayoutSizes(result.value)
      removeBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY)
      dispatchEditingLayoutChanged()
      return
    }
    if (legacy !== null && api.setDesktopState) {
      void api.setDesktopState({ key: EDITING_LAYOUT_DESKTOP_STATE_KEY, value: legacy })
        .then(() => removeBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY))
        .catch(() => undefined)
    }
  }).catch(() => undefined)
}

function readBrowserEditingLayoutSizes(): EditingLayoutSizes {
  try {
    return parseEditingLayoutSizes(readBrowserStorageItem('local', EDITING_LAYOUT_STORAGE_KEY))
  } catch {
    return defaultEditingLayoutSizes()
  }
}

function parseEditingLayoutSizes(raw: string | null | undefined): EditingLayoutSizes {
  if (!raw) return defaultEditingLayoutSizes()
  try {
    const parsed = JSON.parse(raw) as Partial<EditingLayoutSizes>
    return normalizeEditingLayoutSizes(parsed)
  } catch {
    return defaultEditingLayoutSizes()
  }
}

function syncEditingLayoutWindow(): void {
  if (typeof window === 'undefined') {
    if (editingLayoutWindow !== undefined) {
      editingLayoutCache = undefined
      editingLayoutHydrated = false
      editingLayoutVersion = 0
      editingLayoutWindow = undefined
    }
    return
  }
  if (editingLayoutWindow === window) return
  editingLayoutCache = undefined
  editingLayoutHydrated = false
  editingLayoutVersion = 0
  editingLayoutWindow = window
}

function dispatchEditingLayoutChanged(): void {
  if (typeof window === 'undefined') return
  if (typeof window.dispatchEvent !== 'function' || typeof Event === 'undefined') return
  window.dispatchEvent(new Event(EDITING_LAYOUT_CHANGED_EVENT))
}

export function defaultEditingLayoutSizes(): EditingLayoutSizes {
  return {
    libraryWidth: EDITING_LIBRARY_DEFAULT_WIDTH,
    inspectorWidth: EDITING_INSPECTOR_DEFAULT_WIDTH,
    timelineHeight: EDITING_TIMELINE_DEFAULT_HEIGHT,
  }
}

export function normalizeEditingLayoutSizes(sizes: Partial<EditingLayoutSizes>): EditingLayoutSizes {
  return {
    libraryWidth: clampNumber(sizes.libraryWidth, EDITING_LIBRARY_MIN_WIDTH, EDITING_LIBRARY_MAX_WIDTH, EDITING_LIBRARY_DEFAULT_WIDTH),
    inspectorWidth: clampNumber(sizes.inspectorWidth, EDITING_INSPECTOR_MIN_WIDTH, EDITING_INSPECTOR_MAX_WIDTH, EDITING_INSPECTOR_DEFAULT_WIDTH),
    timelineHeight: clampNumber(sizes.timelineHeight, EDITING_TIMELINE_MIN_HEIGHT, EDITING_TIMELINE_MAX_HEIGHT, EDITING_TIMELINE_DEFAULT_HEIGHT),
  }
}

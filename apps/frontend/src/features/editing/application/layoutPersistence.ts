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

export function readEditingLayoutSizes(): EditingLayoutSizes {
  if (typeof window === 'undefined') return defaultEditingLayoutSizes()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EDITING_LAYOUT_STORAGE_KEY) ?? '{}') as Partial<EditingLayoutSizes>
    return normalizeEditingLayoutSizes(parsed)
  } catch {
    return defaultEditingLayoutSizes()
  }
}

export function persistEditingLayoutSizes(sizes: EditingLayoutSizes) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(EDITING_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeEditingLayoutSizes(sizes)))
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

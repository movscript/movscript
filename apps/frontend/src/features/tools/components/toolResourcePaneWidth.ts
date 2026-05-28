import { useCallback, useState } from 'react'

const STORAGE_KEY = 'movscript:tools:resource-pane-width'
export const TOOL_RESOURCE_PANE_DEFAULT_WIDTH = 520
export const TOOL_RESOURCE_PANE_MIN_WIDTH = 360
export const TOOL_RESOURCE_PANE_MAX_WIDTH = 760
export const TOOL_RESOURCE_PANE_MAIN_MIN_WIDTH = 460

export function clampToolResourcePaneWidth(width: number, maxWidth = TOOL_RESOURCE_PANE_MAX_WIDTH): number {
  const upperBound = Math.max(TOOL_RESOURCE_PANE_MIN_WIDTH, Math.min(TOOL_RESOURCE_PANE_MAX_WIDTH, maxWidth))
  return Math.min(Math.max(Math.round(width), TOOL_RESOURCE_PANE_MIN_WIDTH), upperBound)
}

function readStoredToolResourcePaneWidth(): number {
  if (typeof window === 'undefined') return TOOL_RESOURCE_PANE_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed)
      ? clampToolResourcePaneWidth(parsed)
      : TOOL_RESOURCE_PANE_DEFAULT_WIDTH
  } catch {
    return TOOL_RESOURCE_PANE_DEFAULT_WIDTH
  }
}

function saveToolResourcePaneWidth(width: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampToolResourcePaneWidth(width)))
  } catch {
    // Ignore storage failures and keep the in-memory width for this session.
  }
}

export function usePersistentToolResourcePaneWidth() {
  const [width, setWidthState] = useState(readStoredToolResourcePaneWidth)

  const setWidth = useCallback((nextWidth: number, maxWidth?: number) => {
    const clamped = clampToolResourcePaneWidth(nextWidth, maxWidth)
    setWidthState(clamped)
    saveToolResourcePaneWidth(clamped)
    return clamped
  }, [])

  return [width, setWidth] as const
}

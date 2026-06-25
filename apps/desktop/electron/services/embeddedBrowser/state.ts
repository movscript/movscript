import type { Rectangle } from 'electron'

export interface EmbeddedBrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface EmbeddedBrowserState {
  tabId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

export const HIDDEN_BOUNDS: Rectangle = { x: -10000, y: -10000, width: 10, height: 10 }

export function normalizeEmbeddedBrowserBounds(input?: Partial<EmbeddedBrowserBounds> | null): EmbeddedBrowserBounds | null {
  if (!input) return null
  const x = Math.round(Number(input.x))
  const y = Math.round(Number(input.y))
  const width = Math.round(Number(input.width))
  const height = Math.round(Number(input.height))
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width < 16 || height < 16) return null
  return { x, y, width, height }
}

export function normalizeRendererEmbeddedBrowserBounds(
  input: Partial<EmbeddedBrowserBounds> | null | undefined,
  zoomFactor: number,
): EmbeddedBrowserBounds | null {
  const bounds = normalizeEmbeddedBrowserBounds(input)
  if (!bounds) return null

  const scale = Number(zoomFactor)
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return bounds

  return normalizeEmbeddedBrowserBounds({
    x: bounds.x * scale,
    y: bounds.y * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  })
}

export function normalizeTabId(tabId?: string | null): string {
  const trimmed = tabId?.trim()
  return trimmed || 'default'
}

export function emptyState(tabId = 'default'): EmbeddedBrowserState {
  return {
    tabId,
    visible: false,
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  }
}

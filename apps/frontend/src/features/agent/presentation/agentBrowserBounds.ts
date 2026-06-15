import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

export interface AgentBrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export const AGENT_BROWSER_MIN_BOUND_SIZE = 16

export function agentBrowserBoundsFromViewportRect(
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>,
): AgentBrowserBounds | null {
  const bounds = {
    x: Math.round(Number(rect.left)),
    y: Math.round(Number(rect.top)),
    width: Math.round(Number(rect.width)),
    height: Math.round(Number(rect.height)),
  }
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null
  if (bounds.width < AGENT_BROWSER_MIN_BOUND_SIZE || bounds.height < AGENT_BROWSER_MIN_BOUND_SIZE) return null
  return bounds
}

export function agentBrowserBoundsFromViewportElement(
  viewport: Pick<HTMLElement, 'getBoundingClientRect'> | null | undefined,
): AgentBrowserBounds | null {
  return viewport ? agentBrowserBoundsFromViewportRect(viewport.getBoundingClientRect()) : null
}

export function subscribeAgentBrowserBoundsSync(
  viewport: HTMLElement | null | undefined,
  syncBounds: () => void,
) {
  if (!viewport) return () => {}

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncBounds)
  observer?.observe(viewport)
  const cleanupResize = listenToWindowEvent('resize', syncBounds)
  const cleanupScroll = listenToWindowEvent('scroll', syncBounds, true)

  return () => {
    observer?.disconnect()
    cleanupResize()
    cleanupScroll()
  }
}

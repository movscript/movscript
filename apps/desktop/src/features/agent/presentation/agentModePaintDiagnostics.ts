export interface AgentModePaintDiagnosticViewport {
  width: number
  height: number
}

export interface AgentModePaintDiagnosticRect {
  bottom: number
  right: number
  top: number
  left: number
  width: number
  height: number
}

interface PaintDiagnosticRow {
  selector: string
  rect: string
  scroll: string
  area: number
  scrollArea: number
  position: string
  overflow: string
  transform: string
  filter: string
  backdrop: string
  shadow: string
  willChange: string
}

export function agentModeRenderDiagnosticsEnabled() {
  return Boolean(import.meta.env?.DEV) && import.meta.env?.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS === '1'
}

export function compactAgentModePaintStyleValue(value: string, maxLength = 72) {
  if (!value || value === 'none' || value === 'auto' || value === 'normal') return value
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

export function agentModePaintDiagnosticSelector(element: Element) {
  const className = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((name) => `.${name}`).join('')
    : ''
  const id = element.id ? `#${element.id}` : ''
  return `${element.tagName.toLowerCase()}${id}${className}`
}

export function agentModePaintDiagnosticRectOutsideViewport(
  rect: Pick<AgentModePaintDiagnosticRect, 'bottom' | 'right' | 'top' | 'left'>,
  viewport: AgentModePaintDiagnosticViewport,
  margin = 240,
) {
  const viewportWidth = Math.max(0, Number(viewport.width) || 0)
  const viewportHeight = Math.max(0, Number(viewport.height) || 0)
  return (
    rect.bottom < -margin ||
    rect.right < -margin ||
    rect.top > viewportHeight + margin ||
    rect.left > viewportWidth + margin
  )
}

export function compactAgentModePaintDiagnosticRect(
  rect: Pick<AgentModePaintDiagnosticRect, 'width' | 'height' | 'left' | 'top'>,
) {
  return `${Math.max(0, Math.round(rect.width))}x${Math.max(0, Math.round(rect.height))}+${Math.round(rect.left)}+${Math.round(rect.top)}`
}

function collectPaintDiagnosticElements(root: HTMLElement, viewport: AgentModePaintDiagnosticViewport) {
  const elements: HTMLElement[] = []
  const visit = (element: HTMLElement) => {
    elements.push(element)
    const style = window.getComputedStyle(element)
    if (
      style.contentVisibility === 'auto'
      && agentModePaintDiagnosticRectOutsideViewport(element.getBoundingClientRect(), viewport)
    ) {
      return
    }
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) visit(child)
    }
  }
  visit(root)
  return elements
}

export function logAgentModePaintDiagnostics(root: HTMLElement) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const viewport = { width: viewportWidth, height: viewportHeight }
  const viewportArea = Math.max(1, viewportWidth * viewportHeight)
  const visualScale = window.visualViewport?.scale ?? 1
  const rootRect = root.getBoundingClientRect()
  const rows: PaintDiagnosticRow[] = []
  const elements = collectPaintDiagnosticElements(root, viewport)

  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    const width = Math.max(0, Math.round(rect.width))
    const height = Math.max(0, Math.round(rect.height))
    if (width === 0 || height === 0) continue

    const style = window.getComputedStyle(element)
    const area = width * height
    const scrollWidth = Math.max(width, element.scrollWidth)
    const scrollHeight = Math.max(height, element.scrollHeight)
    const scrollArea = scrollWidth * scrollHeight
    const hasPaintEffect = (
      style.transform !== 'none' ||
      style.filter !== 'none' ||
      style.backdropFilter !== 'none' ||
      style.boxShadow !== 'none' ||
      style.willChange !== 'auto' ||
      style.position === 'fixed' ||
      style.position === 'sticky'
    )
    const hasLargeScrollSurface = scrollArea > viewportArea * 1.5
    const isLargeVisibleSurface = area > viewportArea * 0.35
    if (!hasLargeScrollSurface && !isLargeVisibleSurface && !hasPaintEffect) continue

    rows.push({
      selector: agentModePaintDiagnosticSelector(element),
      rect: compactAgentModePaintDiagnosticRect(rect),
      scroll: `${scrollWidth}x${scrollHeight}`,
      area,
      scrollArea,
      position: style.position,
      overflow: `${style.overflowX}/${style.overflowY}`,
      transform: compactAgentModePaintStyleValue(style.transform),
      filter: compactAgentModePaintStyleValue(style.filter),
      backdrop: compactAgentModePaintStyleValue(style.backdropFilter),
      shadow: compactAgentModePaintStyleValue(style.boxShadow),
      willChange: compactAgentModePaintStyleValue(style.willChange),
    })
  }

  rows.sort((a, b) => Math.max(b.area, b.scrollArea) - Math.max(a.area, a.scrollArea))
  console.info(
    `[agent-mode:paint] viewport=${viewportWidth}x${viewportHeight} dpr=${window.devicePixelRatio.toFixed(2)} visualScale=${visualScale.toFixed(3)} root=${Math.round(rootRect.width)}x${Math.round(rootRect.height)} candidates=${rows.length}`,
  )
  for (const [index, row] of rows.slice(0, 24).entries()) {
    console.info(
      [
        `[agent-mode:paint] #${index + 1}`,
        row.selector,
        `rect=${row.rect}`,
        `scroll=${row.scroll}`,
        `position=${row.position}`,
        `overflow=${row.overflow}`,
        `transform=${row.transform}`,
        `filter=${row.filter}`,
        `backdrop=${row.backdrop}`,
        `shadow=${row.shadow}`,
        `willChange=${row.willChange}`,
      ].join(' '),
    )
  }
}

export function logAgentModePaintDiagnosticsForSelector(selector = '.project-agent-mode') {
  if (typeof document === 'undefined') return
  const root = document.querySelector<HTMLElement>(selector)
  if (root) logAgentModePaintDiagnostics(root)
}

export function scheduleAgentModePaintDiagnostics(selector = '.project-agent-mode') {
  if (typeof window === 'undefined') return () => {}

  const log = () => logAgentModePaintDiagnosticsForSelector(selector)
  const animationFrame = window.requestAnimationFrame(log)
  const timeout = window.setTimeout(log, 350)

  return () => {
    window.cancelAnimationFrame(animationFrame)
    window.clearTimeout(timeout)
  }
}

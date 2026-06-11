export interface AgentConversationTabMenuPoint {
  x: number
  y: number
}

export interface AgentConversationTabMenuPointerEvent {
  clientX: number
  clientY: number
}

export interface AgentConversationTabMenuAnchorStyle {
  left: number
  top: number
}

export interface AgentConversationTabMenuRect {
  left: number
  bottom: number
}

export interface AgentConversationTabMenuViewport {
  width: number
  height: number
}

export interface AgentConversationTabMenuSize {
  width: number
  height: number
}

export const AGENT_CONVERSATION_TAB_MENU_SIZE: AgentConversationTabMenuSize = {
  width: 208,
  height: 158,
}

const AGENT_CONVERSATION_TAB_MENU_VIEWPORT_PADDING = 8
const AGENT_CONVERSATION_TAB_KEYBOARD_MENU_INLINE_OFFSET = 16
const AGENT_CONVERSATION_TAB_KEYBOARD_MENU_BLOCK_OFFSET = 4

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function agentConversationTabMenuViewportFromWindow(): AgentConversationTabMenuViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function agentConversationTabMenuPositionFromClientPoint(
  point: AgentConversationTabMenuPoint,
  viewport: AgentConversationTabMenuViewport,
  menuSize: AgentConversationTabMenuSize = AGENT_CONVERSATION_TAB_MENU_SIZE,
): AgentConversationTabMenuPoint {
  const padding = AGENT_CONVERSATION_TAB_MENU_VIEWPORT_PADDING
  const viewportWidth = Math.max(0, finiteNumber(viewport.width))
  const viewportHeight = Math.max(0, finiteNumber(viewport.height))
  const width = Math.max(0, finiteNumber(menuSize.width))
  const height = Math.max(0, finiteNumber(menuSize.height))

  return {
    x: clampNumber(finiteNumber(point.x), padding, Math.max(padding, viewportWidth - width - padding)),
    y: clampNumber(finiteNumber(point.y), padding, Math.max(padding, viewportHeight - height - padding)),
  }
}

export function agentConversationTabMenuPositionFromTriggerRect(
  rect: AgentConversationTabMenuRect,
  viewport: AgentConversationTabMenuViewport,
  menuSize: AgentConversationTabMenuSize = AGENT_CONVERSATION_TAB_MENU_SIZE,
): AgentConversationTabMenuPoint {
  return agentConversationTabMenuPositionFromClientPoint(
    {
      x: finiteNumber(rect.left) + AGENT_CONVERSATION_TAB_KEYBOARD_MENU_INLINE_OFFSET,
      y: finiteNumber(rect.bottom) + AGENT_CONVERSATION_TAB_KEYBOARD_MENU_BLOCK_OFFSET,
    },
    viewport,
    menuSize,
  )
}

export function agentConversationTabMenuPositionFromClientPointInWindow(
  point: AgentConversationTabMenuPoint,
  menuSize: AgentConversationTabMenuSize = AGENT_CONVERSATION_TAB_MENU_SIZE,
) {
  return agentConversationTabMenuPositionFromClientPoint(
    point,
    agentConversationTabMenuViewportFromWindow(),
    menuSize,
  )
}

export function agentConversationTabMenuPositionFromPointerEvent(
  event: AgentConversationTabMenuPointerEvent,
  menuSize: AgentConversationTabMenuSize = AGENT_CONVERSATION_TAB_MENU_SIZE,
) {
  return agentConversationTabMenuPositionFromClientPointInWindow(
    { x: event.clientX, y: event.clientY },
    menuSize,
  )
}

export function agentConversationTabMenuPositionFromTriggerElement(
  element: Pick<HTMLElement, 'getBoundingClientRect'>,
  menuSize: AgentConversationTabMenuSize = AGENT_CONVERSATION_TAB_MENU_SIZE,
) {
  return agentConversationTabMenuPositionFromTriggerRect(
    element.getBoundingClientRect(),
    agentConversationTabMenuViewportFromWindow(),
    menuSize,
  )
}

export function agentConversationTabMenuAnchorStyleFromPosition(
  position: AgentConversationTabMenuPoint,
): AgentConversationTabMenuAnchorStyle {
  return {
    left: finiteNumber(position.x),
    top: finiteNumber(position.y),
  }
}

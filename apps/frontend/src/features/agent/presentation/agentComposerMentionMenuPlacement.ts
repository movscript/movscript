import type { CSSProperties } from 'react'

export interface AgentComposerMentionMenuRect {
  top: number
  left: number
  width: number
}

export interface AgentComposerMentionMenuViewport {
  width: number
  height: number
}

export interface AgentComposerMentionMenuPosition {
  bottom: number
  left: number
  maxHeight: number
  width: number
}

export interface AgentComposerMentionMenuElement {
  getBoundingClientRect(): AgentComposerMentionMenuRect
}

const MENTION_MENU_VIEWPORT_PADDING = 8
const MENTION_MENU_GAP = 6
const MENTION_MENU_MIN_WIDTH = 360
const MENTION_MENU_MAX_HEIGHT = 360
const MENTION_MENU_MIN_HEIGHT = 120

function finiteNonNegativeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

export function agentComposerMentionMenuPositionFromEditorRect(
  editorRect: AgentComposerMentionMenuRect,
  viewport: AgentComposerMentionMenuViewport,
): AgentComposerMentionMenuPosition {
  const viewportPadding = MENTION_MENU_VIEWPORT_PADDING
  const gap = MENTION_MENU_GAP
  const viewportWidth = Math.max(0, Number(viewport.width) || 0)
  const viewportHeight = Math.max(0, Number(viewport.height) || 0)
  const editorTop = Number(editorRect.top) || 0
  const editorLeft = Number(editorRect.left) || 0
  const editorWidth = Math.max(0, Number(editorRect.width) || 0)
  const availableAbove = Math.max(MENTION_MENU_MIN_HEIGHT, editorTop - viewportPadding - gap)
  const width = Math.min(Math.max(editorWidth, MENTION_MENU_MIN_WIDTH), Math.max(0, viewportWidth - viewportPadding * 2))
  const left = Math.min(Math.max(editorLeft, viewportPadding), Math.max(viewportPadding, viewportWidth - width - viewportPadding))

  return {
    bottom: Math.max(viewportPadding, viewportHeight - editorTop + gap),
    left,
    maxHeight: Math.min(MENTION_MENU_MAX_HEIGHT, availableAbove),
    width,
  }
}

export function agentComposerMentionMenuPositionEqual(
  left: AgentComposerMentionMenuPosition | null,
  right: AgentComposerMentionMenuPosition,
) {
  return Boolean(
    left
    && left.bottom === right.bottom
    && left.left === right.left
    && left.maxHeight === right.maxHeight
    && left.width === right.width,
  )
}

export function agentComposerMentionMenuStyleFromPosition(
  position: AgentComposerMentionMenuPosition,
): CSSProperties {
  return {
    '--ai-agent-resource-mention-menu-max-height': `${finiteNonNegativeNumber(position.maxHeight)}px`,
    bottom: finiteNonNegativeNumber(position.bottom),
    left: finiteNonNegativeNumber(position.left),
    width: finiteNonNegativeNumber(position.width),
  } as CSSProperties
}

export function agentComposerMentionMenuViewportFromWindow(): AgentComposerMentionMenuViewport | null {
  if (typeof window === 'undefined') return null
  return { width: window.innerWidth, height: window.innerHeight }
}

export function agentComposerMentionMenuPositionFromEditorElement(
  editor: AgentComposerMentionMenuElement,
  viewport: AgentComposerMentionMenuViewport | null = agentComposerMentionMenuViewportFromWindow(),
): AgentComposerMentionMenuPosition | null {
  if (!viewport) return null
  return agentComposerMentionMenuPositionFromEditorRect(editor.getBoundingClientRect(), viewport)
}

export function subscribeAgentComposerMentionMenuPlacement(update: () => void) {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('resize', update)
  window.addEventListener('scroll', update, true)

  return () => {
    window.removeEventListener('resize', update)
    window.removeEventListener('scroll', update, true)
  }
}

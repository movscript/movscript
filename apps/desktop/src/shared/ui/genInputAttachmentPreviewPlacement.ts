export interface GenInputAttachmentPreviewAnchorRect {
  left: number
  top: number
}

export interface GenInputAttachmentPreviewViewport {
  width: number
  height: number
}

export interface GenInputAttachmentPreviewSize {
  width: number
  height: number
}

export interface GenInputAttachmentPreviewPosition {
  left: number
  top: number
}

export interface GenInputAttachmentPreviewStyle {
  left: number
  top: number
}

export interface GenInputResourceRoleMenuPosition {
  left: number
  top: number
}

const GEN_INPUT_ATTACHMENT_PREVIEW_PADDING = 8
const GEN_INPUT_ATTACHMENT_PREVIEW_GAP = 8
const GEN_INPUT_ATTACHMENT_PREVIEW_SIZE: GenInputAttachmentPreviewSize = {
  width: 216,
  height: 224,
}
const GEN_INPUT_ROLE_MENU_PADDING = 4
const GEN_INPUT_ROLE_MENU_WIDTH = 184
const GEN_INPUT_ROLE_MENU_GAP = 6

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function genInputAttachmentPreviewViewportFromWindow(): GenInputAttachmentPreviewViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function genInputAttachmentPreviewPositionFromAnchorRect(
  rect: GenInputAttachmentPreviewAnchorRect,
  viewport: GenInputAttachmentPreviewViewport,
  size: GenInputAttachmentPreviewSize = GEN_INPUT_ATTACHMENT_PREVIEW_SIZE,
): GenInputAttachmentPreviewPosition {
  const padding = GEN_INPUT_ATTACHMENT_PREVIEW_PADDING
  const viewportWidth = Math.max(0, finiteNumber(viewport.width))
  const previewWidth = Math.max(0, finiteNumber(size.width))
  const previewHeight = Math.max(0, finiteNumber(size.height))
  return {
    left: clampNumber(
      finiteNumber(rect.left),
      padding,
      Math.max(padding, viewportWidth - previewWidth - padding),
    ),
    top: Math.max(
      padding,
      finiteNumber(rect.top) - previewHeight - GEN_INPUT_ATTACHMENT_PREVIEW_GAP,
    ),
  }
}

export function genInputAttachmentPreviewPositionFromElement(
  element: Pick<HTMLElement, 'getBoundingClientRect'>,
): GenInputAttachmentPreviewPosition {
  return genInputAttachmentPreviewPositionFromAnchorRect(
    element.getBoundingClientRect(),
    genInputAttachmentPreviewViewportFromWindow(),
  )
}

export function genInputAttachmentPreviewStyleFromPosition(
  position: GenInputAttachmentPreviewPosition,
): GenInputAttachmentPreviewStyle {
  return {
    left: finiteNumber(position.left),
    top: finiteNumber(position.top),
  }
}

export function genInputResourceRoleMenuPositionFromElements(
  chip: Pick<HTMLElement, 'getBoundingClientRect'>,
  shell?: Pick<HTMLElement, 'getBoundingClientRect'> | null,
): GenInputResourceRoleMenuPosition {
  const shellRect = shell?.getBoundingClientRect()
  if (!shellRect) return { left: 0, top: 0 }
  const chipRect = chip.getBoundingClientRect()
  return {
    left: clampNumber(
      finiteNumber(chipRect.left) - finiteNumber(shellRect.left),
      GEN_INPUT_ROLE_MENU_PADDING,
      Math.max(GEN_INPUT_ROLE_MENU_PADDING, finiteNumber(shellRect.width) - GEN_INPUT_ROLE_MENU_WIDTH),
    ),
    top: finiteNumber(chipRect.bottom) - finiteNumber(shellRect.top) + GEN_INPUT_ROLE_MENU_GAP,
  }
}

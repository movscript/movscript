export interface ShotLibraryMeasuredBox {
  width: number
  height: number
}

export interface ShotWorkspaceGridMetrics {
  columns: number
  pageSize: number
}

export function shotLibraryMeasuredBoxFromRect(
  rect: Pick<DOMRectReadOnly, 'width' | 'height'>,
): ShotLibraryMeasuredBox {
  return {
    width: Math.max(0, Math.round(Number(rect.width) || 0)),
    height: Math.max(0, Math.round(Number(rect.height) || 0)),
  }
}

export function calculateShotWorkspaceGridMetrics(
  box: ShotLibraryMeasuredBox,
  workspaceCount: number,
): ShotWorkspaceGridMetrics {
  if (workspaceCount <= 0) return { columns: 1, pageSize: 1 }
  if (box.width <= 0) return { columns: Math.min(workspaceCount, 2), pageSize: Math.min(workspaceCount, 2) }
  const gap = 10
  const minimumCardWidth = box.width < 520 ? 190 : 220
  const preferredCardWidth = box.width >= 920 ? 300 : box.width >= 680 ? 260 : 230
  let columns = Math.max(1, Math.floor((box.width + gap) / (preferredCardWidth + gap)))
  columns = Math.min(columns, workspaceCount)
  while (columns > 1 && (box.width - gap * (columns - 1)) / columns < minimumCardWidth) {
    columns -= 1
  }
  while (
    columns < workspaceCount
    && columns < 4
    && (box.width - gap * columns) / (columns + 1) >= minimumCardWidth
    && (box.width - gap * (columns - 1)) / columns > 360
  ) {
    columns += 1
  }
  columns = Math.max(1, columns)
  const cardWidth = (box.width - gap * (columns - 1)) / columns
  const estimatedCardHeight = (cardWidth * 9 / 16) + 54
  const rows = box.height > 0 ? Math.max(1, Math.floor((box.height + gap) / (estimatedCardHeight + gap))) : 1
  return {
    columns,
    pageSize: Math.max(1, columns * Math.min(rows, 2)),
  }
}

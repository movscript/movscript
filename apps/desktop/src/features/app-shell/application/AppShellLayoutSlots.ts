import type { CSSProperties } from 'react'

export function appShellHiddenSlotStyle(hidden: boolean, size: number): CSSProperties {
  const width = hidden ? 0 : size
  return appShellFixedSlotStyle(width)
}

export function appShellCollapsedSlotStyle(input: {
  collapsed: boolean
  size: number
  collapsedSize?: number
}): CSSProperties {
  return appShellFixedSlotStyle(input.collapsed ? input.collapsedSize ?? 0 : input.size)
}

function appShellFixedSlotStyle(width: number): CSSProperties {
  return {
    width,
    minWidth: width,
    flexBasis: width,
  }
}

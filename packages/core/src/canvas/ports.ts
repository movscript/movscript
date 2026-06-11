export type CanvasPortSide = 'source' | 'target'

export interface CanvasEdgeConnectionLike {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export function normalizeCanvasHandle(handle: string | null | undefined): string {
  if (!handle) return ''
  if (handle.startsWith('in:')) return handle.slice(3).replace(/^:+/, '')
  if (handle.startsWith('out:')) return handle.slice(4).replace(/^:+/, '')
  return handle.replace(/^:+/, '')
}

export function semanticHandlePrefix(side: CanvasPortSide): string {
  return side === 'source' ? 'out:' : 'in:'
}

export function toUiHandleId(handle: string | null | undefined, side: CanvasPortSide): string | null | undefined {
  if (!handle) return handle
  if (handle.startsWith('in:') || handle.startsWith('out:')) {
    const portId = normalizeCanvasHandle(handle)
    return portId ? `${semanticHandlePrefix(side)}${portId}` : handle
  }
  return `${semanticHandlePrefix(side)}${handle.replace(/^:+/, '')}`
}

export const fromUiHandleId = normalizeCanvasHandle

export function arePortTypesCompatible(sourceType?: string, targetType?: string): boolean {
  if (!sourceType || !targetType) return true
  if (sourceType === targetType) return true
  if (sourceType === 'resource' || targetType === 'resource') return true
  return false
}

export function edgeConnectionKey(edge: CanvasEdgeConnectionLike): string {
  return [
    edge.source,
    normalizeCanvasHandle(edge.sourceHandle) ?? '',
    edge.target,
    normalizeCanvasHandle(edge.targetHandle) ?? '',
  ].join('::')
}

export function uniqueEdgesByConnection<T extends CanvasEdgeConnectionLike>(edgeList: T[]): T[] {
  const seen = new Set<string>()
  return edgeList.filter((edge) => {
    const key = edgeConnectionKey(edge)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

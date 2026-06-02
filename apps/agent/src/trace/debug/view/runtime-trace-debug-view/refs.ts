import type { AgentTraceRefView } from './types.js'
import { arrayValue, recordValue, stringValue } from './values.js'

export function contextBundleRefView(data: Record<string, unknown> | undefined): AgentTraceRefView | undefined {
  const ref = recordValue(data?.contextBundleRef)
  const id = stringValue(ref?.id) ?? stringValue(data?.contextBundleId)
  if (!id) return undefined
  return {
    kind: 'context_bundle',
    label: `Context bundle ${id}`,
    id,
    ...(stringValue(ref?.promptHash) ? { hash: stringValue(ref?.promptHash) } : {}),
  }
}

export function contextRefsFromData(data: Record<string, unknown> | undefined): AgentTraceRefView[] {
  return contextRefsFromRefs(data?.contextRefs)
}

export function contextRefsFromRefs(value: unknown): AgentTraceRefView[] {
  const refs = arrayValue(value) ?? []
  return refs.flatMap((item): AgentTraceRefView[] => {
    const record = recordValue(item)
    const ref = recordValue(record?.ref) ?? record
    const type = stringValue(ref?.type)
    const id = stringValue(ref?.id)
    const key = stringValue(record?.key)
    if (!type || !id) return []
    return [{
      kind: 'context',
      label: `${type}:${id}`,
      ...(key ? { key } : {}),
      id,
      type,
      ...(stringValue(ref?.hash) ? { hash: stringValue(ref?.hash) } : {}),
      ...(stringValue(ref?.version) && !stringValue(ref?.hash) ? { hash: stringValue(ref?.version) } : {}),
    }]
  })
}

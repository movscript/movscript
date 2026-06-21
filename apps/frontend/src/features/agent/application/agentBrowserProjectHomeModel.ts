import { isActiveSemanticEntityRecord } from '@/shared/domain/semanticEntityVisibility'
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'

export function visibleAgentBrowserProjectRecords(records?: SemanticEntityRecord[]) {
  return (records ?? [])
    .filter(isActiveSemanticEntityRecord)
    .slice()
    .sort(compareAgentBrowserProjectRecordOrder)
}

export function compareAgentBrowserProjectRecordOrder(a: SemanticEntityRecord, b: SemanticEntityRecord) {
  const orderDelta = (agentBrowserProjectNumberField(a.order) ?? agentBrowserProjectRecordNumericId(a) ?? 0)
    - (agentBrowserProjectNumberField(b.order) ?? agentBrowserProjectRecordNumericId(b) ?? 0)
  if (orderDelta !== 0) return orderDelta
  return agentBrowserProjectRecordSortKey(a).localeCompare(agentBrowserProjectRecordSortKey(b))
}

export function agentBrowserProjectRecordTitle(record: SemanticEntityRecord, fallback: string) {
  return agentBrowserProjectFirstText(record.title, record.name, record.label, `${fallback} #${agentBrowserProjectRecordDisplayId(record)}`)
}

export function agentBrowserProjectRecordRouteId(record: SemanticEntityRecord) {
  return agentBrowserProjectNumberField(record.ID)
    ?? agentBrowserProjectNumberField(record.id)
    ?? agentBrowserProjectStringField(record.id)
}

export function agentBrowserProjectRecordDisplayId(record: SemanticEntityRecord) {
  return agentBrowserProjectFirstText(record.ID, record.id, record.title, record.name, record.label, '未编号')
}

export function agentBrowserProjectRecordStableId(record: SemanticEntityRecord, fallback: string, index: number) {
  return agentBrowserProjectFirstText(record.ID, record.id, record.uuid, record.key, record.path, `${fallback}-${index}`)
}

export function agentBrowserProjectRecordSortKey(record: SemanticEntityRecord) {
  return agentBrowserProjectFirstText(record.ID, record.id, record.title, record.name, record.label)
}

export function agentBrowserProjectFirstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function agentBrowserProjectStringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function agentBrowserProjectNumberField(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

export function agentBrowserProjectRecordField(record: unknown, key: string) {
  if (!record || typeof record !== 'object') return undefined
  return (record as Record<string, unknown>)[key]
}

function agentBrowserProjectRecordNumericId(record: SemanticEntityRecord) {
  return agentBrowserProjectNumberField(record.ID) ?? agentBrowserProjectNumberField(record.id)
}

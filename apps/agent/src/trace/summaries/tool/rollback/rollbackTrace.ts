import { createHash } from 'node:crypto'
import type { ToolRollbackRecord } from '../../../../tools/calls/rollback/toolRollbackRecords.js'
import type { JSONValue } from '../../../../state/shared/types.js'

export function summarizeRollbackRecordsTrace(records: ToolRollbackRecord[]): Record<string, JSONValue> {
  const policies = records.map((record) => record.rollback.policy)
  return {
    schema: 'movscript.rollback-trace-summary.v1',
    total: records.length,
    manualCompensationCount: policies.filter((policy) => policy === 'manual_compensation').length,
    reversibleCount: policies.filter((policy) => policy === 'reversible').length,
    notApplicableCount: policies.filter((policy) => policy === 'not_applicable').length,
    policies: Array.from(new Set(policies)),
    records: records.map((record) => summarizeRollbackRecord(record)),
  }
}

function summarizeRollbackRecord(record: ToolRollbackRecord): Record<string, JSONValue> {
  return omitUndefinedJSON({
    callId: record.call.id,
    toolName: record.call.name,
    ...(record.call.args !== undefined ? summarizePayload('args', record.call.args as JSONValue) : {}),
    policy: record.rollback.policy,
    reason: record.rollback.reason,
    artifactType: record.rollback.artifactType,
    artifactUri: record.rollback.artifactUri,
    ...(record.rollback.metadata !== undefined ? summarizePayload('metadata', record.rollback.metadata as unknown as JSONValue) : {}),
  })
}

function summarizePayload(prefix: string, value: JSONValue): Record<string, JSONValue> {
  const json = stableStringify(value)
  return {
    [`${prefix}Hash`]: hashString(json),
    [`${prefix}Chars`]: json.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function omitUndefinedJSON(input: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    output[key] = toJSONValue(value)
  }
  return output
}

function toJSONValue(value: unknown): JSONValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (value && typeof value === 'object') return omitUndefinedJSON(value as Record<string, unknown>)
  return null
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJSON(value))
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

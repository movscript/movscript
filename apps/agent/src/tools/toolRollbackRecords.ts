import type { JSONValue } from '../types.js'
import type { ToolCallOutcome } from '../state/types.js'

export interface ToolRollbackRecord {
  call: ToolCallOutcome['call']
  rollback: NonNullable<ToolCallOutcome['rollback']>
}

export function buildToolRollbackRecords(outcomes: ToolCallOutcome[]): ToolRollbackRecord[] {
  const seen = new Set<string>()
  return outcomes.flatMap((outcome) => {
    if (!outcome.rollback) return []
    const key = rollbackRecordKey(outcome)
    if (seen.has(key)) return []
    seen.add(key)
    return [{ call: outcome.call, rollback: outcome.rollback }]
  })
}

export function buildRollbackMetadata(outcomes: ToolCallOutcome[]): { rollbackRecords?: JSONValue } {
  const rollbackRecords = buildToolRollbackRecords(outcomes)
  return rollbackRecords.length > 0 ? { rollbackRecords: rollbackRecords as unknown as JSONValue } : {}
}

function rollbackRecordKey(outcome: ToolCallOutcome): string {
  return [
    outcome.call.id ?? '',
    outcome.call.name,
    JSON.stringify(outcome.call.args ?? {}),
    JSON.stringify(outcome.rollback ?? {}),
  ].join('\0')
}

import type { JSONValue } from '../types.js'
import type { ToolCallOutcome } from '../state/types.js'

export interface ToolRollbackRecord {
  call: ToolCallOutcome['call']
  rollback: NonNullable<ToolCallOutcome['rollback']>
}

export function buildToolRollbackRecords(outcomes: ToolCallOutcome[]): ToolRollbackRecord[] {
  return outcomes.flatMap((outcome) => outcome.rollback ? [{ call: outcome.call, rollback: outcome.rollback }] : [])
}

export function buildRollbackMetadata(outcomes: ToolCallOutcome[]): { rollbackRecords?: JSONValue } {
  const rollbackRecords = buildToolRollbackRecords(outcomes)
  return rollbackRecords.length > 0 ? { rollbackRecords: rollbackRecords as unknown as JSONValue } : {}
}

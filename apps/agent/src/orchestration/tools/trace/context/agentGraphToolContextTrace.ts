import { modelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'
import type { JSONValue, ToolCall } from '../../../../state/shared/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'

export function recordToolResultContext(input: Pick<AgentGraphInput, 'run' | 'skills' | 'capabilities' | 'onTrace'>, options: {
  call: ToolCall
  result: JSONValue | undefined
  source: ToolSource
  trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>
}): ReturnType<typeof modelTurnContext.recordToolResult> {
  const ledgerAudit = updateRunContextLedger(input, options.call, options.result, options.source)
  const { ledger } = ledgerAudit
  const ledgerUpdatedTrace = modelTurnContext.buildLedgerUpdatedTrace(ledger)
  input.onTrace({
    kind: 'context',
    title: ledgerUpdatedTrace.title,
    summary: ledgerUpdatedTrace.summary,
    status: 'completed',
    ...options.trace,
    toolName: options.call.name,
    data: ledgerUpdatedTrace.data,
  })
  const dedupedTrace = modelTurnContext.buildLedgerDedupedTrace(options.call.name, ledgerAudit)
  if (dedupedTrace) {
    input.onTrace({
      kind: 'context',
      title: dedupedTrace.title,
      summary: dedupedTrace.summary,
      status: 'completed',
      ...options.trace,
      toolName: options.call.name,
      data: dedupedTrace.data,
    })
  }
  const referenceTrace = modelTurnContext.buildReferenceTrace({ call: options.call, result: options.result, ledger })
  if (referenceTrace) {
    input.onTrace({
      kind: 'context',
      title: referenceTrace.title,
      summary: referenceTrace.summary,
      status: 'completed',
      ...options.trace,
      toolName: options.call.name,
      data: referenceTrace.data,
    })
  }
  return ledgerAudit
}

function updateRunContextLedger(
  input: Pick<AgentGraphInput, 'run' | 'skills' | 'capabilities'>,
  call: ToolCall,
  result: JSONValue | undefined,
  source: ToolSource,
): ReturnType<typeof modelTurnContext.recordToolResult> {
  const catalogSnapshotValue = input.run.metadata?.catalogSnapshot
  const catalogSnapshot = isJSONRecord(catalogSnapshotValue)
    ? catalogSnapshotValue
    : undefined
  const catalogSnapshotId = typeof catalogSnapshot?.id === 'string' ? catalogSnapshot.id : 'unknown'
  const catalogSnapshotVersion = typeof catalogSnapshot?.version === 'string' ? catalogSnapshot.version : undefined
  const audit = modelTurnContext.recordToolResult({
    ledger: input.run.metadata?.contextLedger,
    runId: input.run.id,
    threadId: input.run.threadId,
    catalogSnapshotId,
    catalogSnapshotVersion,
    activeSkillIds: input.skills.map((skill) => skill.id),
    visibleToolNames: input.capabilities.available.map((tool) => tool.name),
    call,
    result,
    source,
  })
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    contextLedger: audit.ledger as unknown as JSONValue,
  }
  return audit
}

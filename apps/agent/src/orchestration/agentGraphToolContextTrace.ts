import { contextManager } from '../contextManager/contextManager.js'
import { isJSONRecord } from '../jsonValue.js'
import type { ToolSource } from '../ports/tools/toolExecutionSource.js'
import type { JSONValue, ToolCall } from '../state/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from './agentGraphTypes.js'

export function recordToolResultContext(input: Pick<AgentGraphInput, 'run' | 'skills' | 'capabilities' | 'onTrace'>, options: {
  call: ToolCall
  result: JSONValue | undefined
  source: ToolSource
  trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>
}): ReturnType<typeof contextManager.recordToolResult> {
  const ledgerAudit = updateRunContextLedger(input, options.call, options.result, options.source)
  const { ledger } = ledgerAudit
  const ledgerUpdatedTrace = contextManager.buildLedgerUpdatedTrace(ledger)
  input.onTrace({
    kind: 'context',
    title: ledgerUpdatedTrace.title,
    summary: ledgerUpdatedTrace.summary,
    status: 'completed',
    ...options.trace,
    toolName: options.call.name,
    data: ledgerUpdatedTrace.data,
  })
  const dedupedTrace = contextManager.buildLedgerDedupedTrace(options.call.name, ledgerAudit)
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
  const knowledgeTrace = contextManager.buildKnowledgeTrace({ call: options.call, result: options.result, ledger })
  if (knowledgeTrace) {
    input.onTrace({
      kind: 'context',
      title: knowledgeTrace.title,
      summary: knowledgeTrace.summary,
      status: 'completed',
      ...options.trace,
      toolName: options.call.name,
      data: knowledgeTrace.data,
    })
  }
  return ledgerAudit
}

function updateRunContextLedger(
  input: Pick<AgentGraphInput, 'run' | 'skills' | 'capabilities'>,
  call: ToolCall,
  result: JSONValue | undefined,
  source: ToolSource,
): ReturnType<typeof contextManager.recordToolResult> {
  const catalogSnapshotValue = input.run.metadata?.catalogSnapshot
  const catalogSnapshot = isJSONRecord(catalogSnapshotValue)
    ? catalogSnapshotValue
    : undefined
  const catalogSnapshotId = typeof catalogSnapshot?.id === 'string' ? catalogSnapshot.id : 'unknown'
  const catalogSnapshotVersion = typeof catalogSnapshot?.version === 'string' ? catalogSnapshot.version : undefined
  const audit = contextManager.recordToolResult({
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

import type { ContextBundle } from '../../../../context/ledger/shared/contextLedgerTypes.js'
import type { JSONValue } from '../../../../state/shared/types.js'

export function contextBundleTraceRef(bundle: ContextBundle): Record<string, JSONValue> {
  return {
    schema: bundle.schema,
    id: bundle.id,
    ...(bundle.runId ? { runId: bundle.runId } : {}),
    ...(bundle.threadId ? { threadId: bundle.threadId } : {}),
    ...(bundle.roundId ? { roundId: bundle.roundId } : {}),
    ...(bundle.roundIndex !== undefined ? { roundIndex: bundle.roundIndex } : {}),
    ...(bundle.roundLabel ? { roundLabel: bundle.roundLabel } : {}),
    promptHash: bundle.promptHash,
    messageCount: bundle.messageCount,
    toolCount: bundle.toolCount,
    systemMessageCount: bundle.systemMessageCount,
    promptChars: bundle.promptChars,
    promptPartCount: bundle.promptParts.length,
    contextRefCount: bundle.contextRefs.length,
    activeContextCount: bundle.activeContextKeys.length,
    amendedContextCount: bundle.amendedContextKeys.length,
    deletedContextCount: bundle.deletedContextKeys.length,
  }
}

export function contextBundleTraceData(bundle: ContextBundle): Record<string, JSONValue> {
  return {
    contextBundleId: bundle.id,
    contextBundleRef: contextBundleTraceRef(bundle),
  }
}

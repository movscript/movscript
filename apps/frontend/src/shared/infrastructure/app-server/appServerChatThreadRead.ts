import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'
import type { AppServerThread, AppServerTurn } from '@/shared/infrastructure/app-server/appServerProtocol'

export function appServerThreadReadShouldUseTurnPages(input: AgentChatThreadReadInput): boolean {
  return input.includeTurns !== false
}

export function appServerThreadReadIsOlderPage(input: AgentChatThreadReadInput): boolean {
  return (input.direction ?? 'newer') === 'older'
}

export function appServerThreadTurnsListParams(threadId: string, input: AgentChatThreadReadInput) {
  const direction = input.direction ?? 'newer'
  const beforeTurnId = input.beforeTurnId?.trim()
  const afterTurnId = input.afterTurnId?.trim()
  const older = direction === 'older'
  return {
    threadId,
    ...(older && beforeTurnId ? { cursor: appServerThreadTurnsCursor(beforeTurnId) } : {}),
    ...(!older && afterTurnId ? { cursor: appServerThreadTurnsCursor(afterTurnId) } : {}),
    ...(input.limit !== undefined && input.limit !== null ? { limit: input.limit } : {}),
    sortDirection: older || !afterTurnId ? 'desc' as const : 'asc' as const,
    itemsView: 'full' as const,
  }
}

function appServerThreadTurnsCursor(turnId: string): string {
  return JSON.stringify({ turnId, includeAnchor: false })
}

export function appServerThreadTurnsListPageTurns(turns: AppServerTurn[], input: AgentChatThreadReadInput): AppServerTurn[] {
  const direction = input.direction ?? 'newer'
  const afterTurnId = input.afterTurnId?.trim()
  return direction === 'older' || !afterTurnId ? [...turns].reverse() : turns
}

export function appServerThreadTurnsListPageThread(
  threadId: string,
  turns: AppServerTurn[],
  input: AgentChatThreadReadInput,
): AppServerThread {
  return {
    id: threadId,
    sessionId: '',
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    modelProvider: '',
    createdAt: 0,
    updatedAt: 0,
    status: { type: 'idle' },
    path: null,
    cwd: '',
    cliVersion: '',
    source: 'unknown',
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: appServerThreadTurnsListPageTurns(turns, input),
  }
}

export function appServerUnmaterializedThread(threadId: string): AppServerThread {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: threadId,
    sessionId: '',
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    modelProvider: '',
    createdAt: now,
    updatedAt: now,
    status: { type: 'idle' },
    path: null,
    cwd: '',
    cliVersion: '',
    source: 'unknown',
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
  }
}

export function appServerThreadTurnsListCanFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (appServerThreadReadIsBeforeFirstUserMessage(error)) return false
  return /method not found|not supported|unknown method/i.test(message)
}

export function appServerThreadReadIsBeforeFirstUserMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\bnot materialized yet\b/i.test(message)
    || /\bbefore first user message\b/i.test(message)
}

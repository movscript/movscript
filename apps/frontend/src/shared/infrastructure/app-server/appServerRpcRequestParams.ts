import {
  appServerTextInput,
  type AppServerThreadSourceKind,
  type AppServerTurnStartParams,
} from '@/shared/infrastructure/app-server/appServerProtocol'
import { compactRecord } from '@/shared/infrastructure/app-server/appServerRpcProtocolUtils'
import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'

const APP_SERVER_THREAD_LIST_SOURCE_KINDS: AppServerThreadSourceKind[] = [
  'cli',
  'vscode',
  'exec',
  'appServer',
  'subAgent',
  'unknown',
]

export function appServerInitializeParams() {
  return {
    clientInfo: {
      name: 'movscript-frontend',
      title: 'MovScript Frontend',
      version: '0.1.0',
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
    },
  }
}

export function appServerThreadListParams(input: { limit?: number; cursor?: string | null } = {}) {
  return compactRecord({
    limit: input.limit ?? 50,
    cursor: input.cursor ?? undefined,
    sortKey: 'updated_at',
    sortDirection: 'desc',
    archived: false,
    modelProviders: [],
    sourceKinds: APP_SERVER_THREAD_LIST_SOURCE_KINDS,
  })
}

export function appServerThreadReadParams(threadId: string, input: AgentChatThreadReadInput = {}) {
  return compactRecord({
    threadId,
    includeTurns: input.includeTurns ?? true,
    afterTurnId: input.afterTurnId ?? undefined,
    beforeTurnId: input.beforeTurnId ?? undefined,
    afterItemId: input.afterItemId ?? undefined,
    beforeItemId: input.beforeItemId ?? undefined,
    limit: input.limit ?? undefined,
    direction: input.direction ?? undefined,
  })
}

export function appServerTextTurnParams(input: Omit<AppServerTurnStartParams, 'input'> & { text: string }): AppServerTurnStartParams {
  const { text, ...params } = input
  return {
    ...params,
    threadId: input.threadId,
    clientUserMessageId: input.clientUserMessageId ?? undefined,
    input: [appServerTextInput(text)],
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
  }
}

export type * from './app-server-protocol'

export type { ClientRequest as CodexClientRequest } from './app-server-protocol/ClientRequest'
export type { ServerNotification as CodexServerNotification } from './app-server-protocol/ServerNotification'
export type { ServerRequest as CodexServerRequest } from './app-server-protocol/ServerRequest'

export type { RequestId as CodexJsonRpcId } from './app-server-protocol/RequestId'
export type { Thread as CodexThread } from './app-server-protocol/v2/Thread'
export type { ThreadItem as CodexThreadItem } from './app-server-protocol/v2/ThreadItem'
export type { ThreadListResponse as CodexThreadListResponse } from './app-server-protocol/v2/ThreadListResponse'
export type { ThreadReadResponse as CodexThreadReadResponse } from './app-server-protocol/v2/ThreadReadResponse'
export type { ThreadStartParams as CodexThreadStartParams } from './app-server-protocol/v2/ThreadStartParams'
export type { ThreadStartResponse as CodexThreadStartResponse } from './app-server-protocol/v2/ThreadStartResponse'
export type { Turn as CodexTurn } from './app-server-protocol/v2/Turn'
export type { TurnInterruptParams as CodexTurnInterruptParams } from './app-server-protocol/v2/TurnInterruptParams'
export type { TurnInterruptResponse as CodexTurnInterruptResponse } from './app-server-protocol/v2/TurnInterruptResponse'
export type { TurnStartParams as CodexTurnStartParams } from './app-server-protocol/v2/TurnStartParams'
export type { TurnStartResponse as CodexTurnStartResponse } from './app-server-protocol/v2/TurnStartResponse'
export type { TurnSteerParams as CodexTurnSteerParams } from './app-server-protocol/v2/TurnSteerParams'
export type { TurnSteerResponse as CodexTurnSteerResponse } from './app-server-protocol/v2/TurnSteerResponse'
export type { UserInput as CodexUserInput } from './app-server-protocol/v2/UserInput'

export type CodexJsonValue =
  | null
  | boolean
  | number
  | string
  | CodexJsonValue[]
  | { [key: string]: CodexJsonValue | undefined }

export type CodexJsonRpcResponse<T = unknown> = {
  id: string | number
  result?: T
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export type CodexJsonRpcNotification = {
  method: string
  params?: unknown
}

export type CodexJsonRpcRequest = {
  id: string | number
  method: string
  params?: unknown
}

export type CodexJsonRpcServerRequest = CodexJsonRpcRequest
export type CodexServerRequestHandler = (request: CodexJsonRpcServerRequest) => Promise<unknown> | unknown
export type CodexNotificationHandler = (notification: CodexJsonRpcNotification) => void

export function codexTextInput(text: string): import('./app-server-protocol/v2/UserInput').UserInput {
  return { type: 'text', text, text_elements: [] }
}

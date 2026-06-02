import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentFeedMessageStreamEvent } from '@movscript/protocol'
import type { AgentRuntimeRouter } from '../../application/router/runtimeRouter.js'
import {
  buildRuntimeFeedMessages,
  feedMessageFromRuntimeSignal,
} from '../protocol/messageFeed.js'

export async function streamThreadMessageEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, threadId: string): Promise<void> {
  const thread = runtime.getThread(threadId)
  if (!thread) {
    writeJSON(res, 404, { error: 'thread not found' })
    return
  }
  const initialMessages = buildRuntimeFeedMessages({
    threads: [thread],
    runs: runtime.listRunsByThread(thread.id),
  })
  streamMessageEvents(req, res, {
    initialMessageIds: new Set(initialMessages.map((message) => message.id)),
    subscribe: (listener) => runtime.subscribeThreadStream(thread.id, listener),
    resolveEvent: (event) => feedMessageFromRuntimeSignal(event, {
      thread: runtime.getThread(event.threadId || thread.id),
      run: 'runId' in event ? runtime.getRun(event.runId) : undefined,
    }),
  })
}

export async function streamSessionMessageEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, sessionId: string, threadId?: string): Promise<void> {
  const snapshot = await runtime.getSessionRuntimeSnapshot(sessionId)
  if (!snapshot) {
    writeJSON(res, 404, { error: 'session not found' })
    return
  }
  const initialMessages = buildRuntimeFeedMessages({
    threads: snapshot.threads,
    runs: snapshot.runs,
    ...(threadId ? { threadId } : {}),
  })
  streamMessageEvents(req, res, {
    initialMessageIds: new Set(initialMessages.map((message) => message.id)),
    subscribe: (listener) => runtime.subscribeSessionStream(sessionId, listener),
    resolveEvent: (event) => {
      if (threadId && event.threadId !== threadId && ('run' in event ? event.run?.threadId !== threadId : true)) return undefined
      return feedMessageFromRuntimeSignal(event, {
        session: snapshot.session,
        thread: runtime.getThread(event.threadId),
        run: 'runId' in event ? runtime.getRun(event.runId) : undefined,
      })
    },
  })
}

function streamMessageEvents(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    initialMessageIds: Set<string>
    subscribe: (listener: Parameters<AgentRuntimeRouter['subscribeThreadStream']>[1]) => () => void
    resolveEvent: (event: Parameters<AgentRuntimeRouter['subscribeThreadStream']>[1] extends (event: infer Event) => void ? Event : never) => AgentFeedMessageStreamEvent['message'] | undefined
  },
): void {
  writeSSEHeaders(res)
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  const knownMessageIds = new Set(input.initialMessageIds)
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  const cleanup = (end: boolean) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    if (end && !res.writableEnded) res.end()
  }

  unsubscribe = input.subscribe((event) => {
    if (closed || res.writableEnded) return
    const message = input.resolveEvent(event)
    if (!message) return
    const type = knownMessageIds.has(message.id) ? 'message.updated' : 'message.created'
    knownMessageIds.add(message.id)
    writeSSE(res, type, {
      type,
      revision: message.revision,
      message,
    } satisfies AgentFeedMessageStreamEvent, `${message.revision}:${message.id}`)
  })

  req.on('close', () => cleanup(false))
}

function writeSSEHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

function writeSSE(res: ServerResponse, eventName: string, value: unknown, id?: string): void {
  if (id) res.write(`id: ${id}\n`)
  res.write(`event: ${eventName}\n`)
  const data = JSON.stringify(value)
  for (const line of data.split(/\r?\n/)) {
    res.write(`data: ${line}\n`)
  }
  res.write('\n')
}

function writeJSON(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

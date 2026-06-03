import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentTimelineItem, AgentTimelineStreamEvent } from '@movscript/protocol'
import type { AgentRuntimeRouter } from '../../application/router/runtimeRouter.js'
import {
  buildRuntimeTimelineItems,
  timelineItemFromRuntimeSignal,
} from '../protocol/timelineProjection.js'

export interface TimelineStreamLifecycleHooks {
  onSubscribe?: () => void
  onUnsubscribe?: () => void
}

export async function streamThreadTimelineEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, threadId: string, hooks: TimelineStreamLifecycleHooks = {}): Promise<void> {
  const thread = runtime.getThread(threadId)
  if (!thread) {
    writeJSON(res, 404, { error: 'thread not found' })
    return
  }
  const initialItems = buildRuntimeTimelineItems({
    threads: [thread],
    runs: runtime.listRunsByThread(thread.id),
  })
  streamTimelineEvents(req, res, {
    initialItemIds: new Set(initialItems.map((item) => item.id)),
    snapshotRevision: initialItems.reduce((max, item) => Math.max(max, item.revision), 0),
    subscribe: (listener) => runtime.subscribeThreadStream(thread.id, listener),
    hooks,
    resolveEvent: (event) => timelineItemFromRuntimeSignal(event, {
      thread: runtime.getThread(threadIdFromRuntimeStreamEvent(event) ?? thread.id),
      run: runIdFromRuntimeStreamEvent(event) ? runtime.getRun(runIdFromRuntimeStreamEvent(event)!) : undefined,
      traceEvents: runIdFromRuntimeStreamEvent(event) ? runtime.getRunTraceEvents(runIdFromRuntimeStreamEvent(event)!, { limit: Number.MAX_SAFE_INTEGER }) : undefined,
    }),
  })
}

export async function streamSessionTimelineEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, sessionId: string, threadId?: string, hooks: TimelineStreamLifecycleHooks = {}): Promise<void> {
  const snapshot = await runtime.getSessionRuntimeSnapshot(sessionId)
  if (!snapshot) {
    writeJSON(res, 404, { error: 'session not found' })
    return
  }
  const initialItems = buildRuntimeTimelineItems({
    threads: snapshot.threads,
    runs: snapshot.runs,
    ...(threadId ? { threadId } : {}),
  })
  streamTimelineEvents(req, res, {
    initialItemIds: new Set(initialItems.map((item) => item.id)),
    snapshotRevision: initialItems.reduce((max, item) => Math.max(max, item.revision), 0),
    subscribe: (listener) => runtime.subscribeSessionStream(sessionId, listener),
    hooks,
    resolveEvent: (event) => {
      const eventThreadId = threadIdFromRuntimeStreamEvent(event)
      const eventRunId = runIdFromRuntimeStreamEvent(event)
      if (threadId && eventThreadId !== threadId && ('run' in event ? event.run?.threadId !== threadId : true)) return undefined
      return timelineItemFromRuntimeSignal(event, {
        session: snapshot.session,
        thread: eventThreadId ? runtime.getThread(eventThreadId) : undefined,
        run: eventRunId ? runtime.getRun(eventRunId) : undefined,
        traceEvents: eventRunId ? runtime.getRunTraceEvents(eventRunId, { limit: Number.MAX_SAFE_INTEGER }) : undefined,
      })
    },
  })
}

type RuntimeStreamEvent = Parameters<AgentRuntimeRouter['subscribeThreadStream']>[1] extends (event: infer Event) => void ? Event : never

function threadIdFromRuntimeStreamEvent(event: RuntimeStreamEvent): string | undefined {
  return event.threadId ?? ('status' in event ? event.status.threadId : undefined) ?? ('run' in event ? event.run?.threadId : undefined)
}

function runIdFromRuntimeStreamEvent(event: RuntimeStreamEvent): string | undefined {
  return 'runId' in event ? event.runId : undefined
}

function streamTimelineEvents(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    initialItemIds: Set<string>
    snapshotRevision: number
    subscribe: (listener: Parameters<AgentRuntimeRouter['subscribeThreadStream']>[1]) => () => void
    hooks?: TimelineStreamLifecycleHooks
    resolveEvent: (event: RuntimeStreamEvent) => AgentTimelineItem | undefined
  },
): void {
  writeSSEHeaders(res)
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  const knownItemIds = new Set(input.initialItemIds)
  const lastEventRevision = parseTimelineStreamEventRevision(req.headers['last-event-id'])
  if (lastEventRevision !== undefined && input.snapshotRevision > lastEventRevision) {
    writeSSE(res, 'timeline.reset_required', {
      type: 'timeline.reset_required',
      revision: input.snapshotRevision,
      reason: 'missed_events',
    } satisfies AgentTimelineStreamEvent, `${input.snapshotRevision}:reset`)
  }
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  const cleanup = (end: boolean) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    input.hooks?.onUnsubscribe?.()
    if (end && !res.writableEnded) res.end()
  }

  input.hooks?.onSubscribe?.()
  unsubscribe = input.subscribe((event) => {
    if (closed || res.writableEnded) return
    const item = input.resolveEvent(event)
    if (!item) return
    const type = knownItemIds.has(item.id) ? 'timeline.item.updated' : 'timeline.item.created'
    knownItemIds.add(item.id)
    writeSSE(res, type, {
      type,
      revision: item.revision,
      item,
    } satisfies AgentTimelineStreamEvent, `${item.revision}:${item.id}`)
  })

  req.on('close', () => cleanup(false))
}

function parseTimelineStreamEventRevision(value: string | string[] | undefined): number | undefined {
  const text = Array.isArray(value) ? value[0] : value
  if (!text) return undefined
  const [revision] = text.split(':')
  const parsed = Number(revision)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
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

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentRuntimeRouter } from './application/runtimeRouter.js'
import type { RuntimeTelemetryRegistry } from './telemetry/runtimeTelemetry.js'
import {
  runtimeEventFromPlanStream,
  runtimeEventFromRunStream,
  runtimeEventFromSessionStream,
  runtimeEventFromThreadStream,
} from './serverRuntimeProtocol.js'

export function streamRunEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, runId: string, telemetry?: RuntimeTelemetryRegistry): void {
  if (!runtime.getRun(runId)) {
    writeJSON(res, 404, { error: 'run not found' })
    return
  }
  const operationId = telemetry?.beginOperation({ kind: 'run_stream', runId })

  writeSSEHeaders(res)
  telemetry?.markPhase(operationId, 'stream_subscribed')
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  let subscribed = false
  let closeAfterSubscribe = false
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  const cleanup = (end: boolean) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    telemetry?.markPhase(operationId, 'stream_closed', { end })
    telemetry?.finishOperation(operationId, 'success', { end })
    if (end && !res.writableEnded) res.end()
  }

  let ordinal = 0
  unsubscribe = runtime.subscribeRunStream(runId, (event) => {
    if (closed || res.writableEnded) return
    const runtimeEvent = runtimeEventFromRunStream({ runtime, scope: { type: 'run', id: runId }, ordinal: ++ordinal, event })
    writeSSE(res, 'runtime_event', runtimeEvent, runtimeEvent.cursor)
    if (runtimeEvent.kind === 'scope.done') {
      if (subscribed) cleanup(true)
      else closeAfterSubscribe = true
    }
  })
  subscribed = true
  if (closeAfterSubscribe) cleanup(true)

  req.on('close', () => cleanup(false))
}

export function streamThreadEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, threadId: string): void {
  if (!runtime.getThread(threadId)) {
    writeJSON(res, 404, { error: 'thread not found' })
    return
  }

  writeSSEHeaders(res)
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
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

  let ordinal = 0
  unsubscribe = runtime.subscribeThreadStream(threadId, (event) => {
    if (closed || res.writableEnded) return
    const runtimeEvent = runtimeEventFromThreadStream({ runtime, scope: { type: 'thread', id: threadId }, ordinal: ++ordinal, event })
    writeSSE(res, 'runtime_event', runtimeEvent, runtimeEvent.cursor)
  })

  req.on('close', () => cleanup(false))
}

export function streamSessionEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, sessionId: string): void {
  if (!runtime.getSession(sessionId)) {
    writeJSON(res, 404, { error: 'session not found' })
    return
  }

  writeSSEHeaders(res)
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
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

  let ordinal = 0
  unsubscribe = runtime.subscribeSessionStream(sessionId, (event) => {
    if (closed || res.writableEnded) return
    const runtimeEvent = runtimeEventFromSessionStream({ runtime, scope: { type: 'session', id: sessionId }, ordinal: ++ordinal, event })
    writeSSE(res, 'runtime_event', runtimeEvent, runtimeEvent.cursor)
  })

  req.on('close', () => cleanup(false))
}

export function streamPlanEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntimeRouter, taskGraphId: string): void {
  if (!runtime.getTaskGraph(taskGraphId)) {
    writeJSON(res, 404, { error: 'taskGraph not found' })
    return
  }

  writeSSEHeaders(res)
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  let subscribed = false
  let closeAfterSubscribe = false
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

  let ordinal = 0
  unsubscribe = runtime.subscribePlanStream(taskGraphId, (event) => {
    if (closed || res.writableEnded) return
    const runtimeEvent = runtimeEventFromPlanStream({ scope: { type: 'plan', id: taskGraphId }, ordinal: ++ordinal, event })
    writeSSE(res, 'runtime_event', runtimeEvent, runtimeEvent.cursor)
    if (runtimeEvent.kind === 'scope.done') {
      if (subscribed) cleanup(true)
      else closeAfterSubscribe = true
    }
  })
  subscribed = true
  if (closeAfterSubscribe) cleanup(true)

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

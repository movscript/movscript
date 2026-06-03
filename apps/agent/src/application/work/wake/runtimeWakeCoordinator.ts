import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import { isTerminalRuntimeWorkStatus } from '../../../runtime-work/core/runtimeWork.js'
import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentRun, RuntimeWakeEvent } from '../../../state/shared/types.js'
import type { RuntimeScheduler } from '../scheduler/runtimeScheduler.js'

export interface RuntimeWakeResult {
  observedWorks: RuntimeWork[]
  advancedRuns: AgentRun[]
}

export type RuntimeWakeSignal =
  | { type: 'work.started'; work: RuntimeWork }
  | { type: 'work.observed'; work: RuntimeWork }
  | { type: 'run.settled'; runId: string }
  | { type: 'thread.opened'; threadId: string }

export class RuntimeWakeCoordinator {
  private readonly drains = new Map<string, Promise<RuntimeWakeResult>>()
  private readonly observationTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private eventSequence = 0

  constructor(private readonly input: {
    store: Pick<AgentStore,
      | 'getRun'
      | 'listRuntimeWorks'
      | 'createRuntimeWakeEvent'
      | 'updateRuntimeWakeEvent'
      | 'listRuntimeWakeEvents'
    >
    scheduler: Pick<RuntimeScheduler, 'dispatch' | 'advanceThread'>
    observeWork?: (work: RuntimeWork) => Promise<RuntimeWork | undefined>
    now?: () => string
  }) {}

  workStarted(work: RuntimeWork): void {
    this.enqueue({ type: 'work.started', work })
    void this.drain(work.threadId)
  }

  workObserved(work: RuntimeWork): void {
    this.enqueue({ type: 'work.observed', work })
    void this.drain(work.threadId)
  }

  async runSettled(runId: string): Promise<RuntimeWakeResult> {
    const run = this.input.store.getRun(runId)
    if (!run) return { observedWorks: [], advancedRuns: [] }
    this.enqueue({ type: 'run.settled', runId })
    return await this.drain(run.threadId)
  }

  async threadOpened(threadId: string): Promise<RuntimeWork[]> {
    this.enqueue({ type: 'thread.opened', threadId })
    const result = await this.drain(threadId)
    return result.observedWorks
  }

  async drainQueued(): Promise<RuntimeWakeResult> {
    const total: RuntimeWakeResult = { observedWorks: [], advancedRuns: [] }
    const events = this.input.store.listRuntimeWakeEvents()
      .filter((event) => event.status === 'queued' || event.status === 'processing')
    const threadIds = new Set<string>()
    for (const event of events) {
      threadIds.add(event.threadId)
      if (event.status === 'processing') {
        this.input.store.updateRuntimeWakeEvent({
          ...event,
          status: 'queued',
          updatedAt: this.now(),
        })
      }
    }
    for (const threadId of threadIds) {
      mergeWakeResult(total, await this.drain(threadId))
    }
    return total
  }

  private enqueue(signal: RuntimeWakeSignal): void {
    const threadId = this.scopeIdForSignal(signal)
    if (!threadId) return
    const dedupeKey = this.dedupeKeyForSignal(signal)
    const existing = this.input.store.listRuntimeWakeEvents({ threadId })
      .find((event) => event.dedupeKey === dedupeKey && (event.status === 'queued' || event.status === 'processing'))
    if (existing) return
    const now = this.now()
    this.input.store.createRuntimeWakeEvent({
      id: this.nextWakeEventId(dedupeKey),
      threadId,
      ...wakeEntityRefs(signal),
      kind: signal.type,
      status: 'queued',
      payload: wakePayload(signal),
      dedupeKey,
      createdAt: now,
      updatedAt: now,
    })
  }

  private async drain(scopeId: string): Promise<RuntimeWakeResult> {
    const total: RuntimeWakeResult = { observedWorks: [], advancedRuns: [] }
    while (true) {
      const current = this.drains.get(scopeId)
      if (current) {
        mergeWakeResult(total, await current)
      } else if (this.hasQueuedEvent(scopeId)) {
        const next = this.drainNow(scopeId).finally(() => {
          if (this.drains.get(scopeId) === next) this.drains.delete(scopeId)
        })
        this.drains.set(scopeId, next)
        mergeWakeResult(total, await next)
      } else {
        return total
      }
    }
  }

  private async drainNow(scopeId: string): Promise<RuntimeWakeResult> {
    const observedWorks: RuntimeWork[] = []
    const advancedRuns: AgentRun[] = []
    while (true) {
      const event = this.nextQueuedEvent(scopeId)
      if (!event) break
      const processing = { ...event, status: 'processing' as const, updatedAt: this.now() }
      this.input.store.updateRuntimeWakeEvent(processing)
      if (event.kind === 'work.started') {
        const work = workFromWakeEvent(event)
        if (work) advancedRuns.push(...this.handleWorkStarted(work))
        this.consumeWakeEvent(processing)
        continue
      }
      if (event.kind === 'work.observed') {
        const work = workFromWakeEvent(event)
        if (work) mergeWakeResult({ observedWorks, advancedRuns }, await this.handleWorkObserved(work))
        this.consumeWakeEvent(processing)
        continue
      }
      if (event.kind === 'thread.opened') {
        const observed = await this.handleThreadOpened(event.threadId)
        observedWorks.push(...observed)
        for (const work of observed) {
          if (isTerminalRuntimeWorkStatus(work.status)) {
            this.enqueue({ type: 'work.observed', work })
          } else {
            this.scheduleWorkObservation(work)
          }
        }
        this.consumeWakeEvent(processing)
        continue
      }
      const runId = typeof event.runId === 'string' ? event.runId : undefined
      const run = runId ? this.input.store.getRun(runId) : undefined
      if (!run) {
        this.consumeWakeEvent(processing)
        continue
      }
      for (const work of this.runtimeWorksStartedBySettledRun(run)) {
        this.scheduleWorkObservation(work)
      }
      const touchedThreadIds = new Set<string>()
      for (const work of this.subagentWorksTouchedBySettledRun(run)) {
        const observed = await this.observeWork(work)
        if (!observed) continue
        observedWorks.push(observed)
        touchedThreadIds.add(observed.threadId)
        this.enqueue({ type: 'work.observed', work: observed })
      }
      advancedRuns.push(...this.input.scheduler.advanceThread(run.threadId))
      this.consumeWakeEvent(processing)
      for (const threadId of touchedThreadIds) {
        if (threadId !== scopeId) mergeWakeResult({ observedWorks, advancedRuns }, await this.drain(threadId))
      }
    }
    return { observedWorks, advancedRuns }
  }

  private handleWorkStarted(work: RuntimeWork): AgentRun[] {
    this.input.scheduler.dispatch({ type: 'work.started', work })
    if (isTerminalRuntimeWorkStatus(work.status)) {
      this.enqueue({ type: 'work.observed', work })
    }
    return []
  }

  private async handleWorkObserved(work: RuntimeWork): Promise<RuntimeWakeResult> {
    const shouldObserve = !isTerminalRuntimeWorkStatus(work.status)
    const observed = shouldObserve ? await this.observeWork(work) : work
    if (!observed) return { observedWorks: [], advancedRuns: [] }
    if (isTerminalRuntimeWorkStatus(observed.status)) {
      this.clearWorkObservation(observed.id)
    } else {
      this.scheduleWorkObservation(observed)
    }
    this.input.scheduler.dispatch({ type: 'work.observed', work: observed })
    return {
      observedWorks: shouldObserve ? [observed] : [],
      advancedRuns: this.input.scheduler.advanceThread(observed.threadId),
    }
  }

  private async handleThreadOpened(threadId: string): Promise<RuntimeWork[]> {
    const observedWorks: RuntimeWork[] = []
    for (const work of this.input.store.listRuntimeWorks({ threadId })) {
      const observed = await this.observeWork(work)
      if (observed) observedWorks.push(observed)
    }
    return observedWorks
  }

  private runtimeWorksStartedBySettledRun(run: AgentRun): RuntimeWork[] {
    return this.input.store.listRuntimeWorks({ runId: run.id })
      .filter((work) => !isTerminalRuntimeWorkStatus(work.status))
  }

  private subagentWorksTouchedBySettledRun(run: AgentRun): RuntimeWork[] {
    return this.input.store.listRuntimeWorks()
      .filter((work) => subagentWorkRunId(work) === run.id)
  }

  private async observeWork(work: RuntimeWork): Promise<RuntimeWork | undefined> {
    if (isTerminalRuntimeWorkStatus(work.status)) return work
    return await this.input.observeWork?.(work)
  }

  private scheduleWorkObservation(work: RuntimeWork): void {
    if (!shouldAutoObserveWork(work) || this.observationTimers.has(work.id)) return
    const timer = setTimeout(() => {
      this.observationTimers.delete(work.id)
      this.workObserved(work)
    }, workObservationDelayMs(work))
    timer.unref?.()
    this.observationTimers.set(work.id, timer)
  }

  private clearWorkObservation(workId: string): void {
    const timer = this.observationTimers.get(workId)
    if (!timer) return
    clearTimeout(timer)
    this.observationTimers.delete(workId)
  }

  private nextQueuedEvent(threadId: string): RuntimeWakeEvent | undefined {
    return this.input.store.listRuntimeWakeEvents({ threadId, status: 'queued' })[0]
  }

  private hasQueuedEvent(threadId: string): boolean {
    return this.input.store.listRuntimeWakeEvents({ threadId, status: 'queued' }).length > 0
  }

  private consumeWakeEvent(event: RuntimeWakeEvent): void {
    const now = this.now()
    this.input.store.updateRuntimeWakeEvent({
      ...event,
      status: 'consumed',
      payload: consumedWakePayload(event),
      consumedAt: now,
      updatedAt: now,
    })
  }

  private nextWakeEventId(dedupeKey: string): string {
    this.eventSequence += 1
    return `wake_${hashWakeDedupeKey(dedupeKey)}_${this.eventSequence.toString(36)}`
  }

  private now(): string {
    return this.input.now?.() ?? new Date().toISOString()
  }

  private scopeIdForSignal(event: RuntimeWakeSignal): string | undefined {
    if (event.type === 'work.started' || event.type === 'work.observed') return event.work.threadId
    if (event.type === 'thread.opened') return event.threadId
    return this.input.store.getRun(event.runId)?.threadId
  }

  private dedupeKeyForSignal(event: RuntimeWakeSignal): string {
    if (event.type === 'work.started' || event.type === 'work.observed') {
      return `${event.type}:${event.work.id}:${event.work.status}:${event.work.updatedAt}`
    }
    if (event.type === 'thread.opened') return `${event.type}:${event.threadId}`
    return `${event.type}:${event.runId}`
  }
}

function subagentWorkRunId(work: RuntimeWork): string | undefined {
  if (work.kind !== 'subagent_run') return undefined
  return typeof work.externalHandle?.id === 'string' ? work.externalHandle.id : undefined
}

function mergeWakeResult(target: RuntimeWakeResult, next: RuntimeWakeResult): void {
  target.observedWorks.push(...next.observedWorks)
  target.advancedRuns.push(...next.advancedRuns)
}

function wakeEntityRefs(signal: RuntimeWakeSignal): Pick<RuntimeWakeEvent, 'runId' | 'workId'> {
  if (signal.type === 'work.started' || signal.type === 'work.observed') {
    return { runId: signal.work.runId, workId: signal.work.id }
  }
  if (signal.type === 'run.settled') return { runId: signal.runId }
  return {}
}

function wakePayload(signal: RuntimeWakeSignal): unknown {
  if (signal.type === 'work.started' || signal.type === 'work.observed') return { work: signal.work }
  if (signal.type === 'run.settled') return { runId: signal.runId }
  return { threadId: signal.threadId }
}

function consumedWakePayload(event: RuntimeWakeEvent): unknown {
  const summary: Record<string, unknown> = {
    consumed: true,
    kind: event.kind,
  }
  if (event.runId) summary.runId = event.runId
  if (event.workId) summary.workId = event.workId
  return summary
}

function workFromWakeEvent(event: RuntimeWakeEvent): RuntimeWork | undefined {
  const payload = event.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const work = (payload as { work?: unknown }).work
  return work && typeof work === 'object' && !Array.isArray(work) ? work as RuntimeWork : undefined
}

function shouldAutoObserveWork(work: RuntimeWork): boolean {
  return work.mode === 'async'
    && !isTerminalRuntimeWorkStatus(work.status)
    && !!work.externalHandle
    && work.continuationPolicy?.mode !== undefined
    && work.continuationPolicy.mode !== 'none'
}

function workObservationDelayMs(work: RuntimeWork): number {
  const raw = typeof work.pollIntervalMs === 'number' ? work.pollIntervalMs : 2_500
  return Math.max(500, Math.min(30_000, raw))
}

function hashWakeDedupeKey(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}

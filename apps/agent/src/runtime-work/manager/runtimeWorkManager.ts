import type { RuntimeWorkProvider } from '../core/runtimeWorkProvider.js'
import {
  isTerminalRuntimeWorkStatus,
  type RuntimeWork,
  type RuntimeWorkKind,
  type RuntimeWorkStartInput,
  type RuntimeWorkWaitInput,
  type RuntimeWorkWaitResult,
} from '../core/runtimeWork.js'
import { InMemoryRuntimeWorkStore, type RuntimeWorkStore } from '../store/runtimeWorkStore.js'

export class RuntimeWorkManager {
  private readonly providers = new Map<RuntimeWorkKind, RuntimeWorkProvider>()
  readonly store: RuntimeWorkStore

  constructor(input: { store?: RuntimeWorkStore; providers?: RuntimeWorkProvider[] } = {}) {
    this.store = input.store ?? new InMemoryRuntimeWorkStore()
    for (const provider of input.providers ?? []) this.register(provider)
  }

  register(provider: RuntimeWorkProvider): void {
    this.providers.set(provider.kind, provider)
  }

  async start(input: RuntimeWorkStartInput): Promise<RuntimeWork> {
    const provider = this.requireProvider(input.kind)
    const work = await provider.start(input)
    return this.store.create(work)
  }

  get(id: string): RuntimeWork {
    const work = this.store.get(id)
    if (!work) throw new Error(`runtime work not found: ${id}`)
    return work
  }

  list(query: { runId?: string; status?: RuntimeWork['status'] } = {}): RuntimeWork[] {
    return this.store.list(query)
  }

  async observe(id: string, options: { signal?: AbortSignal } = {}): Promise<RuntimeWork> {
    const current = this.get(id)
    if (isTerminalRuntimeWorkStatus(current.status)) return current
    const observed = await this.requireProvider(current.kind).observe(current, options)
    return this.store.update(observed)
  }

  async wait(input: RuntimeWorkWaitInput): Promise<RuntimeWorkWaitResult> {
    if (input.workIds.length === 0) throw new Error('core_work_wait requires workIds')
    const mode = input.mode === 'any' ? 'any' : 'all'
    const timeoutMs = clampNumber(input.timeoutMs ?? 0, 0, 30 * 60_000)
    const pollIntervalMs = clampNumber(input.pollIntervalMs ?? 2_500, 250, 30_000)
    const deadline = Date.now() + timeoutMs
    let works = await this.observeMany(input.workIds, input)
    for (const work of works) input.onWork?.(work)

    while (!waitDone(works, mode) && Date.now() < deadline) {
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), input.signal)
      works = await this.observeMany(input.workIds, input)
      for (const work of works) input.onWork?.(work)
    }

    return buildWaitResult({
      workIds: input.workIds,
      works,
      mode,
      timeoutMs,
      timedOut: !waitDone(works, mode),
    })
  }

  async cancel(id: string, options: { signal?: AbortSignal } = {}): Promise<RuntimeWork> {
    const current = this.get(id)
    const provider = this.requireProvider(current.kind)
    if (!provider.cancel) throw new Error(`runtime work provider does not support cancel: ${current.kind}`)
    const cancelled = await provider.cancel(current, options)
    return this.store.update(cancelled)
  }

  private async observeMany(workIds: string[], options: { signal?: AbortSignal }): Promise<RuntimeWork[]> {
    return Promise.all(workIds.map((id) => this.observe(id, options)))
  }

  private requireProvider(kind: RuntimeWorkKind): RuntimeWorkProvider {
    const provider = this.providers.get(kind)
    if (!provider) throw new Error(`runtime work provider not found: ${kind}`)
    return provider
  }
}

function waitDone(works: RuntimeWork[], mode: 'all' | 'any'): boolean {
  if (works.length === 0) return false
  return mode === 'any'
    ? works.some((work) => isTerminalRuntimeWorkStatus(work.status))
    : works.every((work) => isTerminalRuntimeWorkStatus(work.status))
}

function buildWaitResult(input: {
  workIds: string[]
  works: RuntimeWork[]
  mode: 'all' | 'any'
  timeoutMs: number
  timedOut: boolean
}): RuntimeWorkWaitResult {
  const completed = input.works.filter((work) => work.status === 'completed')
  const failed = input.works.filter((work) => work.status === 'failed')
  const cancelled = input.works.filter((work) => work.status === 'cancelled')
  const pending = input.works.filter((work) => !isTerminalRuntimeWorkStatus(work.status))
  const done = !input.timedOut && waitDone(input.works, input.mode)
  const status = input.timedOut
    ? 'timeout'
    : pending.length > 0
      ? 'partial'
      : failed.length > 0
        ? 'failed'
        : cancelled.length > 0 && completed.length === 0
          ? 'cancelled'
          : 'completed'
  return {
    status,
    done,
    mode: input.mode,
    workIds: input.workIds,
    works: input.works,
    completed,
    pending,
    failed,
    cancelled,
    timeoutMs: input.timeoutMs,
    message: waitMessage(status, completed.length, pending.length, failed.length, cancelled.length),
  }
}

function waitMessage(status: string, completed: number, pending: number, failed: number, cancelled: number): string {
  if (status === 'timeout') return `等待 runtime work 超时，仍有 ${pending} 个 work 在后台运行。`
  if (status === 'failed') return `Runtime work 等待完成，其中 ${failed} 个失败。`
  if (status === 'cancelled') return `Runtime work 等待完成，其中 ${cancelled} 个已取消。`
  if (status === 'partial') return `Runtime work 部分完成，成功 ${completed} 个，仍有 ${pending} 个运行中。`
  return `Runtime work 完成，成功 ${completed} 个。`
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Run was cancelled.'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, Math.max(0, ms))
    timer.unref?.()
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Run was cancelled.'))
    }, { once: true })
  })
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

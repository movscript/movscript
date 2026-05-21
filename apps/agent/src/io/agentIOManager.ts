import type { AgentIOProvider } from './agentIOProvider.js'
import {
  isTerminalAgentIOStatus,
  type AgentIOOperation,
  type AgentIOOperationKind,
  type AgentIOStartInput,
  type AgentIOWaitInput,
  type AgentIOWaitResult,
} from './agentIOOperation.js'
import { InMemoryAgentIOStore, type AgentIOStore } from './agentIOStore.js'

export class AgentIOManager {
  private readonly providers = new Map<AgentIOOperationKind, AgentIOProvider>()
  readonly store: AgentIOStore

  constructor(input: { store?: AgentIOStore; providers?: AgentIOProvider[] } = {}) {
    this.store = input.store ?? new InMemoryAgentIOStore()
    for (const provider of input.providers ?? []) this.register(provider)
  }

  register(provider: AgentIOProvider): void {
    this.providers.set(provider.kind, provider)
  }

  async start(input: AgentIOStartInput): Promise<AgentIOOperation> {
    const provider = this.requireProvider(input.kind)
    const operation = await provider.start(input)
    return this.store.create(operation)
  }

  get(id: string): AgentIOOperation {
    const operation = this.store.get(id)
    if (!operation) throw new Error(`runtime operation not found: ${id}`)
    return operation
  }

  list(query: { runId?: string; status?: AgentIOOperation['status'] } = {}): AgentIOOperation[] {
    return this.store.list(query)
  }

  async observe(id: string, options: { signal?: AbortSignal } = {}): Promise<AgentIOOperation> {
    const current = this.get(id)
    if (isTerminalAgentIOStatus(current.status)) return current
    const observed = await this.requireProvider(current.kind).observe(current, options)
    return this.store.update(observed)
  }

  async wait(input: AgentIOWaitInput): Promise<AgentIOWaitResult> {
    if (input.operationIds.length === 0) throw new Error('agent_io_wait requires operationIds')
    const mode = input.mode === 'any' ? 'any' : 'all'
    const timeoutMs = clampNumber(input.timeoutMs ?? 180_000, 0, 30 * 60_000)
    const pollIntervalMs = clampNumber(input.pollIntervalMs ?? 2_500, 250, 30_000)
    const deadline = Date.now() + timeoutMs
    let operations = await this.observeMany(input.operationIds, input)
    for (const operation of operations) input.onOperation?.(operation)

    while (!waitDone(operations, mode) && Date.now() < deadline) {
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), input.signal)
      operations = await this.observeMany(input.operationIds, input)
      for (const operation of operations) input.onOperation?.(operation)
    }

    return buildWaitResult({
      operationIds: input.operationIds,
      operations,
      mode,
      timeoutMs,
      timedOut: !waitDone(operations, mode),
    })
  }

  async cancel(id: string, options: { signal?: AbortSignal } = {}): Promise<AgentIOOperation> {
    const current = this.get(id)
    const provider = this.requireProvider(current.kind)
    if (!provider.cancel) throw new Error(`runtime operation provider does not support cancel: ${current.kind}`)
    const cancelled = await provider.cancel(current, options)
    return this.store.update(cancelled)
  }

  private async observeMany(operationIds: string[], options: { signal?: AbortSignal }): Promise<AgentIOOperation[]> {
    return Promise.all(operationIds.map((id) => this.observe(id, options)))
  }

  private requireProvider(kind: AgentIOOperationKind): AgentIOProvider {
    const provider = this.providers.get(kind)
    if (!provider) throw new Error(`runtime operation provider not found: ${kind}`)
    return provider
  }
}

function waitDone(operations: AgentIOOperation[], mode: 'all' | 'any'): boolean {
  if (operations.length === 0) return false
  return mode === 'any'
    ? operations.some((operation) => isTerminalAgentIOStatus(operation.status))
    : operations.every((operation) => isTerminalAgentIOStatus(operation.status))
}

function buildWaitResult(input: {
  operationIds: string[]
  operations: AgentIOOperation[]
  mode: 'all' | 'any'
  timeoutMs: number
  timedOut: boolean
}): AgentIOWaitResult {
  const completed = input.operations.filter((operation) => operation.status === 'completed')
  const failed = input.operations.filter((operation) => operation.status === 'failed')
  const cancelled = input.operations.filter((operation) => operation.status === 'cancelled')
  const pending = input.operations.filter((operation) => !isTerminalAgentIOStatus(operation.status))
  const done = !input.timedOut && waitDone(input.operations, input.mode)
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
    operationIds: input.operationIds,
    operations: input.operations,
    completed,
    pending,
    failed,
    cancelled,
    timeoutMs: input.timeoutMs,
    message: waitMessage(status, completed.length, pending.length, failed.length, cancelled.length),
  }
}

function waitMessage(status: string, completed: number, pending: number, failed: number, cancelled: number): string {
  if (status === 'timeout') return `等待 runtime operation 超时，仍有 ${pending} 个操作在后台运行。`
  if (status === 'failed') return `Runtime operation 等待完成，其中 ${failed} 个失败。`
  if (status === 'cancelled') return `Runtime operation 等待完成，其中 ${cancelled} 个已取消。`
  if (status === 'partial') return `Runtime operation 部分完成，成功 ${completed} 个，仍有 ${pending} 个运行中。`
  return `Runtime operation 完成，成功 ${completed} 个。`
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

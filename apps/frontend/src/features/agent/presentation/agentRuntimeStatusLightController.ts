import { create } from 'zustand'
import {
  STOPPED_RUNTIME_STATUS_LIGHT,
  runtimeStatusLightFromThreadRuntimeSnapshot,
  type AgentRuntimeStatusLight,
} from '@/features/agent/domain/agentRuntimeStatusLight'
import { localAgentClient, type AgentRuntimeEventV2, type AgentRuntimeSnapshotV2 } from '@/shared/infrastructure/localAgentClient'
import { runtimeThreadProjectionShouldRefresh } from '@movscript/event-state'

export interface AgentRuntimeStatusLightWatchTarget {
  conversationId: string
  sessionId?: string
  threadId?: string
}

export interface AgentRuntimeStatusLightStoreState {
  runtimeStatusLightsByTarget: Record<string, AgentRuntimeStatusLight>
  setRuntimeStatusLightForTarget: (targetKey: string, statusLight: AgentRuntimeStatusLight) => void
  clearRuntimeStatusLightForTarget: (targetKey: string) => void
}

export const useAgentRuntimeStatusLightStore = create<AgentRuntimeStatusLightStoreState>((set) => ({
  runtimeStatusLightsByTarget: {},
  setRuntimeStatusLightForTarget: (targetKey, statusLight) => set((state) => {
    const existing = state.runtimeStatusLightsByTarget[targetKey]
    if (runtimeStatusLightsEqual(existing, statusLight)) return state
    return {
      runtimeStatusLightsByTarget: {
        ...state.runtimeStatusLightsByTarget,
        [targetKey]: statusLight,
      },
    }
  }),
  clearRuntimeStatusLightForTarget: (targetKey) => set((state) => {
    if (!state.runtimeStatusLightsByTarget[targetKey]) return state
    const next = { ...state.runtimeStatusLightsByTarget }
    delete next[targetKey]
    return { runtimeStatusLightsByTarget: next }
  }),
}))

export interface AgentRuntimeStatusLightClient {
  getSessionRuntime: (sessionId: string, signal?: AbortSignal) => Promise<AgentRuntimeSnapshotV2>
  getThreadRuntime: (threadId: string, signal?: AbortSignal) => Promise<AgentRuntimeSnapshotV2>
  streamSession: (sessionId: string, options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal }) => Promise<void>
  streamThread: (threadId: string, options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal }) => Promise<void>
}

interface AgentRuntimeStatusLightSink {
  setTargetStatusLight: (targetKey: string, statusLight: AgentRuntimeStatusLight) => void
  clearTargetStatusLight: (targetKey: string) => void
}

interface AgentRuntimeStatusLightControllerOptions {
  client: AgentRuntimeStatusLightClient
  sink: AgentRuntimeStatusLightSink
  refreshDebounceMs?: number
  shouldRefresh?: (event: AgentRuntimeEventV2) => boolean
}

interface RuntimeWatchRef {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
}

interface RuntimeConnection {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
  controller: AbortController
  refreshTimer: ReturnType<typeof setTimeout> | undefined
  refreshing: boolean
  refreshQueued: boolean
}

export class AgentRuntimeStatusLightController {
  private readonly client: AgentRuntimeStatusLightClient
  private readonly sink: AgentRuntimeStatusLightSink
  private readonly refreshDebounceMs: number
  private readonly shouldRefresh: (event: AgentRuntimeEventV2) => boolean
  private readonly ownerTargets = new Map<string, RuntimeWatchRef[]>()
  private readonly connections = new Map<string, RuntimeConnection>()

  constructor(options: AgentRuntimeStatusLightControllerOptions) {
    this.client = options.client
    this.sink = options.sink
    this.refreshDebounceMs = options.refreshDebounceMs ?? 300
    this.shouldRefresh = options.shouldRefresh ?? runtimeThreadProjectionShouldRefresh
  }

  setOwnerTargets(ownerId: string, targets: AgentRuntimeStatusLightWatchTarget[]): void {
    this.ownerTargets.set(ownerId, targets.flatMap(runtimeWatchRefFromTarget))
    this.reconcileConnections()
  }

  clearOwnerTargets(ownerId: string): void {
    this.ownerTargets.delete(ownerId)
    this.reconcileConnections()
  }

  stopAll(): void {
    this.ownerTargets.clear()
    for (const targetKey of Array.from(this.connections.keys())) this.stopConnection(targetKey)
  }

  private reconcileConnections(): void {
    const desired = new Map<string, RuntimeWatchRef>()
    for (const refs of this.ownerTargets.values()) {
      for (const ref of refs) {
        if (!desired.has(ref.targetKey)) desired.set(ref.targetKey, ref)
      }
    }

    for (const targetKey of Array.from(this.connections.keys())) {
      if (!desired.has(targetKey)) this.stopConnection(targetKey)
    }

    for (const ref of desired.values()) {
      if (!this.connections.has(ref.targetKey)) this.startConnection(ref)
    }
  }

  private startConnection(ref: RuntimeWatchRef): void {
    const controller = new AbortController()
    const connection: RuntimeConnection = {
      ...ref,
      controller,
      refreshTimer: undefined,
      refreshing: false,
      refreshQueued: false,
    }
    this.connections.set(ref.targetKey, connection)
    this.refreshNow(connection)

    const stream = ref.kind === 'session'
      ? this.client.streamSession(ref.id, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          if (this.shouldRefresh(event)) this.scheduleRefresh(connection)
        },
      })
      : this.client.streamThread(ref.id, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          if (this.shouldRefresh(event)) this.scheduleRefresh(connection)
        },
      })

    void stream.catch(() => {
      if (!controller.signal.aborted) this.sink.setTargetStatusLight(ref.targetKey, STOPPED_RUNTIME_STATUS_LIGHT)
    })
  }

  private stopConnection(targetKey: string): void {
    const connection = this.connections.get(targetKey)
    if (!connection) return
    this.connections.delete(targetKey)
    if (connection.refreshTimer) clearTimeout(connection.refreshTimer)
    connection.controller.abort()
    this.sink.clearTargetStatusLight(targetKey)
  }

  private scheduleRefresh(connection: RuntimeConnection): void {
    if (!this.connections.has(connection.targetKey) || connection.controller.signal.aborted) return
    if (connection.refreshTimer) return
    connection.refreshTimer = setTimeout(() => {
      connection.refreshTimer = undefined
      this.refreshNow(connection)
    }, this.refreshDebounceMs)
  }

  private refreshNow(connection: RuntimeConnection): void {
    if (!this.connections.has(connection.targetKey) || connection.controller.signal.aborted) return
    if (connection.refreshing) {
      connection.refreshQueued = true
      return
    }

    connection.refreshing = true
    const snapshot = connection.kind === 'session'
      ? this.client.getSessionRuntime(connection.id, connection.controller.signal)
      : this.client.getThreadRuntime(connection.id, connection.controller.signal)

    void snapshot
      .then((snapshot) => {
        if (!connection.controller.signal.aborted && this.connections.get(connection.targetKey) === connection) {
          this.sink.setTargetStatusLight(connection.targetKey, runtimeStatusLightFromThreadRuntimeSnapshot(snapshot))
        }
      })
      .catch(() => {
        if (!connection.controller.signal.aborted && this.connections.get(connection.targetKey) === connection) {
          this.sink.setTargetStatusLight(connection.targetKey, STOPPED_RUNTIME_STATUS_LIGHT)
        }
      })
      .finally(() => {
        connection.refreshing = false
        if (connection.refreshQueued) {
          connection.refreshQueued = false
          this.scheduleRefresh(connection)
        }
      })
  }
}

export function createAgentRuntimeStatusLightController(
  options: AgentRuntimeStatusLightControllerOptions,
): AgentRuntimeStatusLightController {
  return new AgentRuntimeStatusLightController(options)
}

export function runtimeStatusLightTargetKey(target: AgentRuntimeStatusLightWatchTarget): string | undefined {
  const sessionId = target.sessionId?.trim()
  if (sessionId) return `session:${sessionId}`
  const threadId = target.threadId?.trim()
  if (threadId) return `thread:${threadId}`
  return undefined
}

export function runtimeStatusLightTargetsSignature(targets: AgentRuntimeStatusLightWatchTarget[]): string {
  return targets
    .map((target) => `${target.conversationId}:${runtimeStatusLightTargetKey(target) ?? 'none'}`)
    .join('|')
}

function runtimeWatchRefFromTarget(target: AgentRuntimeStatusLightWatchTarget): RuntimeWatchRef[] {
  const sessionId = target.sessionId?.trim()
  if (sessionId) return [{ targetKey: `session:${sessionId}`, kind: 'session', id: sessionId }]
  const threadId = target.threadId?.trim()
  if (threadId) return [{ targetKey: `thread:${threadId}`, kind: 'thread', id: threadId }]
  return []
}

function runtimeStatusLightsEqual(
  a: AgentRuntimeStatusLight | undefined,
  b: AgentRuntimeStatusLight | undefined,
): boolean {
  return a?.state === b?.state && a?.label === b?.label && a?.detail === b?.detail
}

export const agentRuntimeStatusLightController = createAgentRuntimeStatusLightController({
  client: localAgentClient,
  sink: {
    setTargetStatusLight: (targetKey, statusLight) => {
      useAgentRuntimeStatusLightStore.getState().setRuntimeStatusLightForTarget(targetKey, statusLight)
    },
    clearTargetStatusLight: (targetKey) => {
      useAgentRuntimeStatusLightStore.getState().clearRuntimeStatusLightForTarget(targetKey)
    },
  },
})

import { create } from 'zustand'
import {
  STOPPED_RUNTIME_STATUS_LIGHT,
  runtimeStatusLightFromRuntimeStatusRecord,
  type AgentRuntimeStatusLight,
} from '@/features/agent/domain/agentRuntimeStatusLight'
import { localAgentClient, type AgentRuntimeEventV2 } from '@/shared/infrastructure/localAgentClient'

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
  forSession?: (input: { sessionId: string; workspaceDir?: string }) => AgentRuntimeStatusLightClient
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
}

interface RuntimeWatchRef {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
  sessionId?: string
}

interface RuntimeConnection {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
  sessionId?: string
  controller: AbortController
}

export class AgentRuntimeStatusLightController {
  private readonly client: AgentRuntimeStatusLightClient
  private readonly sink: AgentRuntimeStatusLightSink
  private readonly ownerTargets = new Map<string, RuntimeWatchRef[]>()
  private readonly connections = new Map<string, RuntimeConnection>()

  constructor(options: AgentRuntimeStatusLightControllerOptions) {
    this.client = options.client
    this.sink = options.sink
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
    const connection: RuntimeConnection = { ...ref, controller }
    this.connections.set(ref.targetKey, connection)
    const client = this.clientForConnection(connection)

    const stream = ref.kind === 'session'
      ? client.streamSession(ref.id, {
        signal: controller.signal,
        onRuntimeEvent: (event) => this.applyRuntimeStatusEvent(connection, event),
      })
      : client.streamThread(ref.id, {
        signal: controller.signal,
        onRuntimeEvent: (event) => this.applyRuntimeStatusEvent(connection, event),
      })

    void stream.catch((error) => {
      if (controller.signal.aborted) return
      logRuntimeStatusLightDiagnostic('stream_error', connection, { error: error instanceof Error ? error.message : String(error) })
      this.sink.setTargetStatusLight(ref.targetKey, STOPPED_RUNTIME_STATUS_LIGHT)
    })
  }

  private clientForConnection(connection: RuntimeConnection): AgentRuntimeStatusLightClient {
    const sessionId = connection.sessionId?.trim()
    if (!sessionId || !this.client.forSession) return this.client
    return this.client.forSession({ sessionId })
  }

  private applyRuntimeStatusEvent(connection: RuntimeConnection, event: AgentRuntimeEventV2): void {
    if (!this.connections.has(connection.targetKey) || connection.controller.signal.aborted) return
    if (event.kind !== 'runtime_status.upserted' || event.entity?.type !== 'runtime_status') return
    const statusLight = runtimeStatusLightFromRuntimeStatusRecord(event.entity.value)
    if (!statusLight) return
    logRuntimeStatusLightDiagnostic('status_light', connection, {
      state: statusLight.state,
      runId: event.causality?.runId,
      threadId: event.causality?.threadId,
    })
    this.sink.setTargetStatusLight(connection.targetKey, statusLight)
  }

  private stopConnection(targetKey: string): void {
    const connection = this.connections.get(targetKey)
    if (!connection) return
    this.connections.delete(targetKey)
    connection.controller.abort()
    this.sink.clearTargetStatusLight(targetKey)
  }
}

export function createAgentRuntimeStatusLightController(
  options: AgentRuntimeStatusLightControllerOptions,
): AgentRuntimeStatusLightController {
  return new AgentRuntimeStatusLightController(options)
}

export function runtimeStatusLightTargetKey(target: AgentRuntimeStatusLightWatchTarget): string | undefined {
  return runtimeStatusLightTargetKeys(target)[0]
}

export function runtimeStatusLightTargetKeys(target: AgentRuntimeStatusLightWatchTarget): string[] {
  const keys: string[] = []
  const sessionId = target.sessionId?.trim()
  if (sessionId) keys.push(`session:${sessionId}`)
  const threadId = target.threadId?.trim()
  if (threadId) keys.push(`thread:${threadId}`)
  return keys
}

export function runtimeStatusLightTargetsSignature(targets: AgentRuntimeStatusLightWatchTarget[]): string {
  return targets
    .map((target) => `${target.conversationId}:${runtimeStatusLightTargetKeys(target).join(',') || 'none'}`)
    .join('|')
}

function runtimeWatchRefFromTarget(target: AgentRuntimeStatusLightWatchTarget): RuntimeWatchRef[] {
  const refs: RuntimeWatchRef[] = []
  const sessionId = target.sessionId?.trim()
  if (sessionId) refs.push({ targetKey: `session:${sessionId}`, kind: 'session', id: sessionId, sessionId })
  const threadId = target.threadId?.trim()
  if (threadId) refs.push({ targetKey: `thread:${threadId}`, kind: 'thread', id: threadId, ...(sessionId ? { sessionId } : {}) })
  return refs
}

function runtimeStatusLightsEqual(
  a: AgentRuntimeStatusLight | undefined,
  b: AgentRuntimeStatusLight | undefined,
): boolean {
  return a?.state === b?.state && a?.label === b?.label && a?.detail === b?.detail
}

function logRuntimeStatusLightDiagnostic(event: string, connection: RuntimeConnection, details: Record<string, unknown>): void {
  if (typeof console === 'undefined') return
  console.debug('[agent-status-light]', event, {
    targetKey: connection.targetKey,
    kind: connection.kind,
    id: connection.id,
    sessionId: connection.sessionId,
    ...details,
  })
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

import { create } from 'zustand'
import {
  providerSessionStatusLightFromStatusRecord,
  type ProviderSessionStatusLight,
} from '@movscript/core/agent'
import {
  createAgentProviderSessionStatusLightStreamClient,
  type AgentProviderSessionStatusLightEvent,
  type AgentProviderSessionStatusLightStreamClient,
} from '@/features/agent/application/agentProviderSessionStatusLightStreamService'
import { STOPPED_PROVIDER_SESSION_STATUS_LIGHT } from '@/features/agent/presentation/providerSessionStatusLightFallback'

export interface ProviderSessionStatusLightWatchTarget {
  conversationId: string
  providerSessionTreeId?: string
  threadId?: string
}

export interface ProviderSessionStatusLightStoreState {
  providerSessionStatusLightsByTarget: Record<string, ProviderSessionStatusLight>
  setProviderSessionStatusLightForTarget: (targetKey: string, statusLight: ProviderSessionStatusLight) => void
  clearProviderSessionStatusLightForTarget: (targetKey: string) => void
}

export const useProviderSessionStatusLightStore = create<ProviderSessionStatusLightStoreState>((set) => ({
  providerSessionStatusLightsByTarget: {},
  setProviderSessionStatusLightForTarget: (targetKey, statusLight) => set((state) => {
    const existing = state.providerSessionStatusLightsByTarget[targetKey]
    if (providerSessionStatusLightsEqual(existing, statusLight)) return state
    return {
      providerSessionStatusLightsByTarget: {
        ...state.providerSessionStatusLightsByTarget,
        [targetKey]: statusLight,
      },
    }
  }),
  clearProviderSessionStatusLightForTarget: (targetKey) => set((state) => {
    if (!state.providerSessionStatusLightsByTarget[targetKey]) return state
    const next = { ...state.providerSessionStatusLightsByTarget }
    delete next[targetKey]
    return { providerSessionStatusLightsByTarget: next }
  }),
}))

export type ProviderSessionStatusLightClient = AgentProviderSessionStatusLightStreamClient

interface ProviderSessionStatusLightSink {
  setTargetStatusLight: (targetKey: string, statusLight: ProviderSessionStatusLight) => void
  clearTargetStatusLight: (targetKey: string) => void
}

interface ProviderSessionStatusLightControllerOptions {
  client: ProviderSessionStatusLightClient
  sink: ProviderSessionStatusLightSink
}

interface ProviderSessionStatusWatchRef {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
  providerSessionTreeId?: string
}

interface ProviderSessionStatusConnection {
  targetKey: string
  kind: 'session' | 'thread'
  id: string
  providerSessionTreeId?: string
  controller: AbortController
}

export class ProviderSessionStatusLightController {
  private readonly client: ProviderSessionStatusLightClient
  private readonly sink: ProviderSessionStatusLightSink
  private readonly ownerTargets = new Map<string, ProviderSessionStatusWatchRef[]>()
  private readonly connections = new Map<string, ProviderSessionStatusConnection>()

  constructor(options: ProviderSessionStatusLightControllerOptions) {
    this.client = options.client
    this.sink = options.sink
  }

  setOwnerTargets(ownerId: string, targets: ProviderSessionStatusLightWatchTarget[]): void {
    this.ownerTargets.set(ownerId, targets.flatMap(providerSessionStatusWatchRefFromTarget))
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
    const desired = new Map<string, ProviderSessionStatusWatchRef>()
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

  private startConnection(ref: ProviderSessionStatusWatchRef): void {
    const controller = new AbortController()
    const connection: ProviderSessionStatusConnection = { ...ref, controller }
    this.connections.set(ref.targetKey, connection)
    const client = this.clientForConnection(connection)

    const stream = ref.kind === 'session'
      ? client.streamSession(ref.id, {
        signal: controller.signal,
        onProviderEvent: (event) => this.applyStatusEvent(connection, event),
      })
      : client.streamThread(ref.id, {
        signal: controller.signal,
        onProviderEvent: (event) => this.applyStatusEvent(connection, event),
      })

    void stream.catch((error) => {
      if (controller.signal.aborted) return
      logProviderSessionStatusLightDiagnostic('stream_error', connection, { error: error instanceof Error ? error.message : String(error) })
      this.sink.setTargetStatusLight(ref.targetKey, STOPPED_PROVIDER_SESSION_STATUS_LIGHT)
    })
  }

  private clientForConnection(connection: ProviderSessionStatusConnection): ProviderSessionStatusLightClient {
    const providerSessionTreeId = connection.providerSessionTreeId?.trim()
    if (!providerSessionTreeId || !this.client.forSession) return this.client
    return this.client.forSession({ sessionId: providerSessionTreeId })
  }

  private applyStatusEvent(connection: ProviderSessionStatusConnection, event: AgentProviderSessionStatusLightEvent): void {
    if (!this.connections.has(connection.targetKey) || connection.controller.signal.aborted) return
    if (event.kind !== 'runtime_status.upserted' || event.entity?.type !== 'runtime_status') return
    const statusLight = providerSessionStatusLightFromStatusRecord(event.entity.value)
    if (!statusLight) return
    logProviderSessionStatusLightDiagnostic('status_light', connection, {
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

export function createProviderSessionStatusLightController(
  options: ProviderSessionStatusLightControllerOptions,
): ProviderSessionStatusLightController {
  return new ProviderSessionStatusLightController(options)
}

export function providerSessionStatusLightTargetKey(target: ProviderSessionStatusLightWatchTarget): string | undefined {
  return providerSessionStatusLightTargetKeys(target)[0]
}

export function providerSessionStatusLightTargetKeys(target: ProviderSessionStatusLightWatchTarget): string[] {
  const keys: string[] = []
  const providerSessionTreeId = target.providerSessionTreeId?.trim()
  if (providerSessionTreeId) keys.push(`session:${providerSessionTreeId}`)
  const threadId = target.threadId?.trim()
  if (threadId) keys.push(`thread:${threadId}`)
  return keys
}

export function providerSessionStatusLightTargetsSignature(targets: ProviderSessionStatusLightWatchTarget[]): string {
  return targets
    .map((target) => `${target.conversationId}:${providerSessionStatusLightTargetKeys(target).join(',') || 'none'}`)
    .join('|')
}

function providerSessionStatusWatchRefFromTarget(target: ProviderSessionStatusLightWatchTarget): ProviderSessionStatusWatchRef[] {
  const refs: ProviderSessionStatusWatchRef[] = []
  const providerSessionTreeId = target.providerSessionTreeId?.trim()
  if (providerSessionTreeId) {
    refs.push({
      targetKey: `session:${providerSessionTreeId}`,
      kind: 'session',
      id: providerSessionTreeId,
      providerSessionTreeId,
    })
  }
  const threadId = target.threadId?.trim()
  if (threadId) {
    refs.push({
      targetKey: `thread:${threadId}`,
      kind: 'thread',
      id: threadId,
      ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
    })
  }
  return refs
}

function providerSessionStatusLightsEqual(
  a: ProviderSessionStatusLight | undefined,
  b: ProviderSessionStatusLight | undefined,
): boolean {
  return a?.state === b?.state && a?.label === b?.label && a?.detail === b?.detail
}

function logProviderSessionStatusLightDiagnostic(event: string, connection: ProviderSessionStatusConnection, details: Record<string, unknown>): void {
  if (typeof console === 'undefined') return
  console.debug('[agent-status-light]', event, {
    targetKey: connection.targetKey,
    kind: connection.kind,
    id: connection.id,
    providerSessionTreeId: connection.providerSessionTreeId,
    ...details,
  })
}

export const providerSessionStatusLightController = createProviderSessionStatusLightController({
  client: createAgentProviderSessionStatusLightStreamClient(),
  sink: {
    setTargetStatusLight: (targetKey, statusLight) => {
      useProviderSessionStatusLightStore.getState().setProviderSessionStatusLightForTarget(targetKey, statusLight)
    },
    clearTargetStatusLight: (targetKey) => {
      useProviderSessionStatusLightStore.getState().clearProviderSessionStatusLightForTarget(targetKey)
    },
  },
})

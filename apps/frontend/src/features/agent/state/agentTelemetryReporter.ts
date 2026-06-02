import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import {
  useAgentPerformanceStore,
  type AgentPerformanceLongTask,
  type AgentPerformanceOperation,
  type AgentPerformanceStorageSnapshot,
} from '@/features/agent/state/agentPerformanceStore'

const REPORT_SCHEMA = 'movscript.agent.client-telemetry.v1'
const REPORT_DEBOUNCE_MS = 2_000
const MAX_BATCH_ITEMS = 40

let reporterInstalled = false
let flushTimer: ReturnType<typeof setTimeout> | undefined

const sentOperationIds = new Set<string>()
const sentLongTaskIds = new Set<string>()
const sentStorageIds = new Set<string>()
const pendingOperations: AgentPerformanceOperation[] = []
const pendingLongTasks: AgentPerformanceLongTask[] = []
const pendingStorageSnapshots: AgentPerformanceStorageSnapshot[] = []

export function installAgentTelemetryReporter(): void {
  if (reporterInstalled || typeof window === 'undefined') return
  reporterInstalled = true
  useAgentPerformanceStore.subscribe((state) => {
    queueOperations(state.operations)
    queueLongTasks(state.longTasks)
    queueStorageSnapshots(state.storageSnapshots)
  })
  useUserStore.subscribe((state) => {
    if (state.token) scheduleFlush()
  })
}

function queueOperations(operations: AgentPerformanceOperation[]): void {
  for (const operation of operations) {
    if (operation.status === 'running' || sentOperationIds.has(operation.id)) continue
    sentOperationIds.add(operation.id)
    pendingOperations.push(operation)
  }
  scheduleFlush()
}

function queueLongTasks(longTasks: AgentPerformanceLongTask[]): void {
  for (const task of longTasks) {
    if (sentLongTaskIds.has(task.id)) continue
    sentLongTaskIds.add(task.id)
    pendingLongTasks.push(task)
  }
  scheduleFlush()
}

function queueStorageSnapshots(snapshots: AgentPerformanceStorageSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (sentStorageIds.has(snapshot.id)) continue
    sentStorageIds.add(snapshot.id)
    pendingStorageSnapshots.push(snapshot)
  }
  scheduleFlush()
}

function scheduleFlush(): void {
  if (pendingOperations.length + pendingLongTasks.length + pendingStorageSnapshots.length === 0) return
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flushAgentTelemetry()
  }, REPORT_DEBOUNCE_MS)
}

async function flushAgentTelemetry(): Promise<void> {
  const token = useUserStore.getState().token
  if (!token) return

  const operations = pendingOperations.splice(0, MAX_BATCH_ITEMS)
  const longTasks = pendingLongTasks.splice(0, Math.max(0, MAX_BATCH_ITEMS - operations.length))
  const storageSnapshots = pendingStorageSnapshots.splice(0, Math.max(0, MAX_BATCH_ITEMS - operations.length - longTasks.length))
  if (operations.length + longTasks.length + storageSnapshots.length === 0) return

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }
    const currentOrgID = useUserStore.getState().currentOrgID
    if (currentOrgID) headers['X-Org-ID'] = String(currentOrgID)
    const response = await fetch(`${getAPIV1BaseURL()}/agent/telemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        schema: REPORT_SCHEMA,
        operations: operations.map(operationPayload),
        longTasks: longTasks.map((task) => ({ durationMs: finiteNumber(task.durationMs) })),
        storageSnapshots: storageSnapshots.map((snapshot) => ({ totalBytes: finiteNumber(snapshot.totalBytes) })),
      }),
      keepalive: operations.length + longTasks.length + storageSnapshots.length <= 8,
    })
    if (!response.ok) {
      throw new Error(`agent telemetry report failed: ${response.status}`)
    }
  } catch {
    // Telemetry reporting must never affect the Agent UX.
  } finally {
    if (pendingOperations.length + pendingLongTasks.length + pendingStorageSnapshots.length > 0) {
      scheduleFlush()
    }
  }
}

function operationPayload(operation: AgentPerformanceOperation) {
  return {
    kind: operation.kind,
    status: operation.status,
    durationMs: finiteNumber(operation.durationMs ?? 0),
    slow: operation.status === 'error' || operation.status === 'cancelled' || slowOperation(operation),
    phases: operation.phases
      .filter((phase) => phase.name !== 'operation_start')
      .map((phase) => ({
        name: phase.name,
        durationFromPreviousMs: finiteNumber(phase.durationFromPreviousMs),
      })),
  }
}

function slowOperation(operation: AgentPerformanceOperation): boolean {
  const duration = operation.durationMs ?? 0
  if (operation.kind === 'send' || operation.kind === 'external_task') return duration >= 1_000
  return duration >= 600
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

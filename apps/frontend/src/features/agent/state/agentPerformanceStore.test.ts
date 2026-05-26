import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  recordAgentPerformanceMetric,
  resetAgentTelemetrySink,
  setAgentTelemetrySink,
  summarizeAgentPerformanceMetrics,
  useAgentPerformanceStore,
  type AgentTelemetrySink,
} from './agentPerformanceStore'

test('agent performance store records operation timeline and duration metric', () => {
  resetAgentTelemetrySink()
  useAgentPerformanceStore.getState().clear()

  const operationId = beginAgentPerformanceOperation({ kind: 'send', meta: { inputLength: 12 } })
  markAgentPerformancePhase(operationId, 'build_draft_start')
  markAgentPerformancePhase(operationId, 'build_draft_done', { details: { warningCount: 0 } })
  finishAgentPerformanceOperation(operationId, 'success')

  const state = useAgentPerformanceStore.getState()
  assert.equal(state.operations.length, 1)
  assert.equal(state.operations[0]?.kind, 'send')
  assert.equal(state.operations[0]?.status, 'success')
  assert.equal(state.operations[0]?.phases.some((phase) => phase.name === 'build_draft_done'), true)
  assert.equal(state.metrics.some((sample) => sample.name === 'agent_operation_duration_ms'), true)
})

test('agent performance metrics summarize p95 and max by metric name', () => {
  const summary = summarizeAgentPerformanceMetrics([
    { id: 'a', name: 'frontend_send_click_to_visible_ms', value: 10, unit: 'ms', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', name: 'frontend_send_click_to_visible_ms', value: 50, unit: 'ms', createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'c', name: 'frontend_send_click_to_visible_ms', value: 100, unit: 'ms', createdAt: '2026-01-01T00:00:02.000Z' },
    { id: 'd', name: 'frontend_store_persist_bytes', value: 2048, unit: 'bytes', createdAt: '2026-01-01T00:00:03.000Z' },
  ])

  const sendMetric = summary.find((item) => item.name === 'frontend_send_click_to_visible_ms')
  assert.equal(sendMetric?.count, 3)
  assert.equal(sendMetric?.p95, 100)
  assert.equal(sendMetric?.max, 100)
})

test('agent telemetry sink can be replaced without changing instrumentation call sites', () => {
  const calls: string[] = []
  const sink: AgentTelemetrySink = {
    beginOperation: (input) => {
      calls.push(`begin:${input.kind}`)
      return 'custom-operation'
    },
    markPhase: (operationId, name) => {
      calls.push(`phase:${operationId}:${name}`)
    },
    finishOperation: (operationId, status) => {
      calls.push(`finish:${operationId}:${status}`)
    },
    recordMetric: (sample) => {
      calls.push(`metric:${sample.name}`)
    },
    recordLog: (entry) => {
      calls.push(`log:${entry.level}`)
    },
    recordLongTask: (task) => {
      calls.push(`longtask:${task.durationMs}`)
    },
    recordStorageSnapshot: (snapshot) => {
      calls.push(`storage:${snapshot.totalBytes}`)
    },
  }

  setAgentTelemetrySink(sink)
  const operationId = beginAgentPerformanceOperation({ kind: 'approval' })
  markAgentPerformancePhase(operationId, 'optimistic_update')
  finishAgentPerformanceOperation(operationId, 'success')
  recordAgentPerformanceMetric({ name: 'custom_metric', value: 1, unit: 'count' })
  resetAgentTelemetrySink()

  assert.deepEqual(calls, [
    'begin:approval',
    'phase:custom-operation:optimistic_update',
    'finish:custom-operation:success',
    'metric:custom_metric',
  ])
})

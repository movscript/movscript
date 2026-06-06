import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginAgentPerformanceOperation,
  createInstrumentedAgentStateStorage,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  operationKindLabel,
  phaseLabel,
  recordAgentPerformanceMetric,
  resetAgentTelemetrySink,
  setAgentTelemetrySink,
  summarizeAgentPerformanceMetrics,
  type AgentPerformanceMetricSample,
  type AgentPerformanceOperation,
  type AgentTelemetrySink,
} from './agentPerformanceStore'
import { isAgentTelemetryReportableMetricName } from '@/features/agent/domain/agentProtocol'

test('agent performance instrumentation forwards completed operation without storing local history', () => {
  resetAgentTelemetrySink()
  const operations: AgentPerformanceOperation[] = []
  const metrics: AgentPerformanceMetricSample[] = []
  setAgentTelemetrySink({
    ...emptySink(),
    beginOperation: (input) => {
      const id = `op_${operations.length + 1}`
      operations.push({
        id,
        kind: input.kind,
        status: 'running',
        startedAt: new Date().toISOString(),
        startedMs: 0,
        updatedAt: new Date().toISOString(),
        phases: [{ id: 'phase_start', name: 'operation_start', label: 'start', at: 0, offsetMs: 0, durationFromPreviousMs: 0 }],
      })
      return id
    },
    markPhase: (operationId, name) => {
      const operation = operations.find((item) => item.id === operationId)
      operation?.phases.push({ id: `phase_${name}`, name, label: name, at: 1, offsetMs: 1, durationFromPreviousMs: 1 })
    },
    finishOperation: (operationId, status) => {
      const operation = operations.find((item) => item.id === operationId)
      if (operation) operation.status = status
    },
    recordMetric: (sample) => {
      metrics.push({ ...sample, id: `metric_${metrics.length + 1}`, createdAt: new Date().toISOString() })
    },
  })

  const operationId = beginAgentPerformanceOperation({ kind: 'send', meta: { inputLength: 12 } })
  markAgentPerformancePhase(operationId, 'build_workspace_start')
  markAgentPerformancePhase(operationId, 'build_workspace_done', { details: { warningCount: 0 } })
  finishAgentPerformanceOperation(operationId, 'success')
  recordAgentPerformanceMetric({ name: 'frontend_agent_network_request_duration_ms', value: 10, unit: 'ms' })

  assert.equal(operations.length, 1)
  assert.equal(operations[0]?.kind, 'send')
  assert.equal(operations[0]?.status, 'success')
  assert.equal(operations[0]?.phases.some((phase) => phase.name === 'build_workspace_done'), true)
  assert.equal(metrics.some((sample) => sample.name === 'frontend_agent_network_request_duration_ms'), true)
  resetAgentTelemetrySink()
})

test('agent performance metrics summarize p95 and max by metric name', () => {
  const summary = summarizeAgentPerformanceMetrics([
    { id: 'a', name: 'frontend_send_click_to_visible_ms', value: 10, unit: 'ms', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', name: 'frontend_send_click_to_visible_ms', value: 50, unit: 'ms', createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'c', name: 'frontend_send_click_to_visible_ms', value: 100, unit: 'ms', createdAt: '2026-01-01T00:00:02.000Z' },
    { id: 'd', name: 'frontend_agent_network_request_duration_ms', value: 20, unit: 'ms', createdAt: '2026-01-01T00:00:03.000Z' },
  ])

  const sendMetric = summary.find((item) => item.name === 'frontend_send_click_to_visible_ms')
  assert.equal(sendMetric?.count, 3)
  assert.equal(sendMetric?.p95, 100)
  assert.equal(sendMetric?.max, 100)
})

test('agent performance labels use provider-session and active-run vocabulary', () => {
  assert.equal(operationKindLabel('active_run_input'), '活动 Run 输入')
  assert.equal(phaseLabel('provider_session_input_final_thread_start'), 'Provider Session 输入最终 Thread 开始')
  assert.equal(phaseLabel('provider_session_input_final_thread_done'), 'Provider Session 输入最终 Thread 完成')
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

test('instrumented agent state storage records low-cardinality storage metrics', () => {
  const metrics: AgentPerformanceMetricSample[] = []
  const backing = new Map<string, string>()
  const storage = createInstrumentedAgentStateStorage('agent_store', {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: (key) => {
      backing.delete(key)
    },
  } as Storage)
  setAgentTelemetrySink({
    ...emptySink(),
    recordMetric: (sample) => {
      metrics.push({ ...sample, id: `metric_${metrics.length + 1}`, createdAt: new Date().toISOString() })
    },
  })

  storage.setItem('agent-store-v4', '{"state":{"settings":{}}}')
  assert.equal(storage.getItem('agent-store-v4'), '{"state":{"settings":{}}}')
  storage.flush?.()
  storage.removeItem('agent-store-v4')
  storage.flush?.()
  resetAgentTelemetrySink()

  assert.equal(isAgentTelemetryReportableMetricName('frontend_storage_operation_duration_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_storage_payload_bytes'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_send_stage_latency_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_stream_update_total'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_timeline_page_duration_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_timeline_page_items'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_timeline_page_payload_bytes'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_thread_restore_duration_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_thread_restore_message_count'), true)
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_thread_restore_payload_bytes'), true)
  assert.equal(metrics.some((sample) => sample.name === 'frontend_storage_operation_duration_ms' && sample.labels?.kind === 'agent_store' && sample.labels?.stage === 'set'), true)
  assert.equal(metrics.some((sample) => sample.name === 'frontend_storage_payload_bytes' && sample.unit === 'bytes'), true)
})

test('instrumented agent state storage coalesces duplicate pending writes', () => {
  const metrics: AgentPerformanceMetricSample[] = []
  const writes: string[] = []
  const backing = new Map<string, string>()
  const storage = createInstrumentedAgentStateStorage('agent_store', {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(`${key}:${value}`)
      backing.set(key, value)
    },
    removeItem: (key) => {
      backing.delete(key)
    },
  } as Storage)
  setAgentTelemetrySink({
    ...emptySink(),
    recordMetric: (sample) => {
      metrics.push({ ...sample, id: `metric_${metrics.length + 1}`, createdAt: new Date().toISOString() })
    },
  })

  storage.setItem('agent-store-v4', 'first')
  storage.setItem('agent-store-v4', 'second')
  storage.setItem('agent-store-v4', 'second')

  assert.equal(storage.getItem('agent-store-v4'), 'second')
  assert.deepEqual(writes, [])

  storage.flush?.()
  storage.setItem('agent-store-v4', 'second')
  storage.flush?.()
  resetAgentTelemetrySink()

  assert.deepEqual(writes, ['agent-store-v4:second'])
  assert.equal(backing.get('agent-store-v4'), 'second')
  assert.equal(metrics.filter((sample) => sample.name === 'frontend_storage_operation_duration_ms' && sample.labels?.stage === 'set').length, 1)
  assert.equal(metrics.some((sample) => sample.labels?.stage === 'set_skip'), true)
})

function emptySink(): AgentTelemetrySink {
  return {
    beginOperation: () => 'noop',
    markPhase: () => {},
    finishOperation: () => {},
    recordMetric: () => {},
    recordLog: () => {},
    recordLongTask: () => {},
  }
}

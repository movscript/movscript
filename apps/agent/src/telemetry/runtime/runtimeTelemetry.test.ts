import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeTelemetryRegistry } from './runtimeTelemetry.js'

test('RuntimeTelemetryRegistry records operations, metrics, logs, and prometheus output', () => {
  const telemetry = new RuntimeTelemetryRegistry()
  const operationId = telemetry.beginOperation({
    kind: 'run_create',
    threadId: 'thread_1',
  })

  telemetry.markPhase(operationId, 'message_created', { messageId: 'msg_1' })
  telemetry.markPhase(operationId, 'run_created', { runId: 'run_1', status: 'running' })
  telemetry.finishOperation(operationId, 'success', { runId: 'run_1' })
  telemetry.recordSpan({
    traceEventId: 'trace_1',
    runId: 'run_1',
    threadId: 'thread_1',
    kind: 'model_call',
    name: 'Model request',
    status: 'completed',
    durationMs: 120,
  })

  const snapshot = telemetry.snapshot()
  assert.equal(snapshot.schema, 'movscript.agent.runtime-telemetry.v1')
  assert.equal(snapshot.service.metricsEndpoint, '/metrics')
  assert.equal(snapshot.retention.spans, 600)
  assert.equal(snapshot.operations.length, 1)
  assert.equal(snapshot.spans.length, 1)
  assert.equal(snapshot.summary.spanCount, 1)
  assert.equal(snapshot.operations[0]?.kind, 'run_create')
  assert.equal(snapshot.operations[0]?.status, 'success')
  assert.equal(snapshot.operations[0]?.phases.some((phase) => phase.name === 'run_created'), true)
  assert.equal(snapshot.metrics.some((sample) => sample.name === 'movscript_agent_operation_duration_ms'), true)
  assert.equal(snapshot.metrics.some((sample) => sample.name === 'movscript_agent_trace_span_duration_ms'), true)

  const prometheus = telemetry.prometheusText()
  assert.match(prometheus, /movscript_agent_telemetry_info\{service="movscript-agent",storage="memory",metrics_endpoint="\/metrics",snapshot_endpoint="\/runtime\/telemetry"\} 1/)
  assert.match(prometheus, /movscript_agent_operation_duration_ms_count\{kind="run_create",status="success"\} 1/)
  assert.match(prometheus, /movscript_agent_trace_span_duration_ms_count\{kind="model_call",status="completed"\} 1/)
  assert.match(prometheus, /movscript_agent_operation_active 0/)
})

test('RuntimeTelemetryRegistry renders prometheus output through prom-client', async () => {
  const telemetry = new RuntimeTelemetryRegistry()
  const text = await telemetry.prometheusTextAsync()

  assert.match(text, /movscript_agent_telemetry_info/)
  assert.match(text, /movscript_agent_telemetry_retention_limit\{kind="spans"\} 600/)
})

test('RuntimeTelemetryRegistry forwards spans and logs to external telemetry exporter', async () => {
  const spans: unknown[] = []
  const logs: unknown[] = []
  let flushed = false
  const telemetry = new RuntimeTelemetryRegistry({
    externalExporter: {
      recordSpan: (span) => spans.push(span),
      recordLog: (log) => logs.push(log),
      flush: async () => {
        flushed = true
      },
    },
  })

  telemetry.recordSpan({
    traceEventId: 'trace_1',
    runId: 'run_1',
    kind: 'tool_call',
    name: 'Tool call',
    status: 'failed',
    durationMs: 10,
  })
  telemetry.recordLog({ level: 'error', message: 'Tool failed' })
  await telemetry.flushExternalTelemetry()

  assert.equal(spans.length, 1)
  assert.equal(logs.length, 2)
  assert.equal(flushed, true)
})

test('RuntimeTelemetryRegistry marks slow operations with diagnostic logs', async () => {
  const telemetry = new RuntimeTelemetryRegistry()
  const operationId = telemetry.beginOperation({ kind: 'interaction_approve' })

  await new Promise((resolve) => setTimeout(resolve, 700))
  telemetry.finishOperation(operationId, 'success')

  const snapshot = telemetry.snapshot()
  assert.equal(snapshot.summary.slowOperationCount, 1)
  assert.equal(snapshot.logs.some((log) => log.level === 'warning' && /slow/.test(log.message)), true)
})

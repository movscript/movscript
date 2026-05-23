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

  const snapshot = telemetry.snapshot()
  assert.equal(snapshot.operations.length, 1)
  assert.equal(snapshot.operations[0]?.kind, 'run_create')
  assert.equal(snapshot.operations[0]?.status, 'success')
  assert.equal(snapshot.operations[0]?.phases.some((phase) => phase.name === 'run_created'), true)
  assert.equal(snapshot.metrics.some((sample) => sample.name === 'movscript_agent_operation_duration_ms'), true)

  const prometheus = telemetry.prometheusText()
  assert.match(prometheus, /movscript_agent_operation_duration_ms_count\{kind="run_create",status="success"\} 1/)
  assert.match(prometheus, /movscript_agent_operation_active 0/)
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

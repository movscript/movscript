import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeOtlpHttpExporter, createRuntimeOtlpExporterFromEnv } from './runtimeOtlpExporter.js'

test('RuntimeOtlpHttpExporter posts standard OTLP trace and log payloads', async () => {
  const requests: Array<{ url: string; body: any }> = []
  const exporter = new RuntimeOtlpHttpExporter({
    endpoint: 'http://collector:4318/',
    batchSize: 10,
    flushIntervalMs: 60_000,
    fetchImpl: (async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return { ok: true, status: 200 } as Response
    }) as typeof fetch,
  })

  exporter.recordSpan({
    id: 'span_1',
    traceEventId: 'trace_1',
    runId: 'run_1',
    threadId: 'thread_1',
    kind: 'model_call',
    name: 'Model call',
    status: 'completed',
    startedAt: '2026-05-23T00:00:00.000Z',
    durationMs: 25,
  })
  exporter.recordLog({
    level: 'warning',
    message: 'Slow model call',
    createdAt: '2026-05-23T00:00:00.025Z',
    spanId: 'span_1',
    details: { runId: 'run_1' },
  })
  await exporter.flush()

  assert.equal(requests.length, 2)
  assert.equal(requests[0]?.url, 'http://collector:4318/v1/traces')
  assert.equal(requests[1]?.url, 'http://collector:4318/v1/logs')
  assert.equal(requests[0]?.body.resourceSpans[0].scopeSpans[0].spans[0].name, 'Model call')
  assert.equal(requests[1]?.body.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue, 'Slow model call')
})

test('createRuntimeOtlpExporterFromEnv returns exporter only when endpoint is configured', () => {
  assert.equal(createRuntimeOtlpExporterFromEnv({ MOVSCRIPT_AGENT_OTLP_ENDPOINT: '' }), undefined)
  assert.ok(createRuntimeOtlpExporterFromEnv({ MOVSCRIPT_AGENT_OTLP_ENDPOINT: 'http://127.0.0.1:4318' }))
})

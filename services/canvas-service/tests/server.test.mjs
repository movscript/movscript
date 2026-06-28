import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeRuntimeEndpointRecord } from '@movscript/runtime-contracts'

import {
  CANVAS_SERVICE_CANVASES_ENDPOINT,
  CANVAS_SERVICE_CAPABILITIES,
  CANVAS_SERVICE_CAPABILITIES_ENDPOINT,
  CANVAS_SERVICE_NAME,
  CANVAS_SERVICE_RUNTIME_JOBS_ENDPOINT,
  CANVAS_SERVICE_RUNTIME_MEDIA_ENDPOINT,
  CANVAS_SERVICE_RUNTIME_MODELS_ENDPOINT,
  CANVAS_SERVICE_RUNTIME_TEXT_ENDPOINT,
  CANVAS_SERVICE_RUNTIME_TEXT_RESOURCE_ENDPOINT,
  startCanvasService,
} from '../src/server.mjs'

test('canvas-service exposes health and capability endpoints', async () => {
  const runtime = await startCanvasService()
  tAfterClose(runtime)

  const health = await fetchJSON(`${runtime.url}/health`)
  assert.equal(health.status, 'ok')
  assert.equal(health.serviceName, CANVAS_SERVICE_NAME)
  assert.deepEqual(health.capabilities, CANVAS_SERVICE_CAPABILITIES)

  const capabilities = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CAPABILITIES_ENDPOINT}`)
  assert.equal(capabilities.serviceName, CANVAS_SERVICE_NAME)
  assert.deepEqual(capabilities.capabilities, CANVAS_SERVICE_CAPABILITIES)
})

test('canvas-service rejects unknown routes', async () => {
  const runtime = await startCanvasService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}/missing`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('canvas-service proxies workflow canvas create list open save and delete storage APIs to data-service', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    const call = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      org: request.headers['x-org-id'],
      body: '',
    }
    upstreamCalls.push(call)
    request.on('data', (chunk) => {
      call.body += chunk.toString('utf8')
    })
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ok: true, url: request.url, method: request.method }))
    })
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const headers = {
    authorization: 'Bearer user-token',
    'x-org-id': '42',
  }
  const list = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}?project_id=7`, { headers })
  assert.equal(list.url, '/api/v1/canvases?project_id=7')
  assert.equal(list.method, 'GET')

  const created = await postJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}`, {
    name: 'Launch workflow',
    canvas_type: 'workflow',
    project_id: 7,
  }, headers)
  assert.equal(created.url, '/api/v1/canvases')
  assert.equal(created.method, 'POST')

  const opened = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}/88`, { headers })
  assert.equal(opened.url, '/api/v1/canvases/88')
  assert.equal(opened.method, 'GET')

  const saved = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}/88`, {
    method: 'PUT',
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Launch workflow v2',
      canvas_type: 'workflow',
      nodes: [
        { id: 'input-1', type: 'input' },
        {
          id: 'resource-1',
          type: 'resource',
          ref: { kind: 'raw-resource', resourceId: 'res_123' },
        },
      ],
      edges: [{ id: 'edge-1', source: 'input-1', target: 'resource-1' }],
      metadata: { canvasKind: 'workflow' },
    }),
  })
  assert.equal(saved.url, '/api/v1/canvases/88')
  assert.equal(saved.method, 'PUT')

  const deleted = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}/88`, {
    method: 'DELETE',
    headers,
  })
  assert.equal(deleted.url, '/api/v1/canvases/88')
  assert.equal(deleted.method, 'DELETE')

  assert.deepEqual(upstreamCalls.map((call) => [call.method, call.url]), [
    ['GET', '/api/v1/canvases?project_id=7'],
    ['POST', '/api/v1/canvases'],
    ['GET', '/api/v1/canvases/88'],
    ['PUT', '/api/v1/canvases/88'],
    ['DELETE', '/api/v1/canvases/88'],
  ])
  assert.equal(upstreamCalls[0].authorization, 'Bearer user-token')
  assert.equal(upstreamCalls[0].org, '42')
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    name: 'Launch workflow',
    canvas_type: 'workflow',
    project_id: 7,
  })
  assert.deepEqual(JSON.parse(upstreamCalls[3].body), {
    name: 'Launch workflow v2',
    canvas_type: 'workflow',
    nodes: [
      { id: 'input-1', type: 'input' },
      {
        id: 'resource-1',
        type: 'resource',
        ref: { kind: 'raw-resource', resourceId: 'res_123' },
      },
    ],
    edges: [{ id: 'edge-1', source: 'input-1', target: 'resource-1' }],
    metadata: { canvasKind: 'workflow' },
  })
})

test('canvas-service proxies canvas storage APIs to data-service', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      org: request.headers['x-org-id'],
    })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true, url: request.url }))
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const list = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}?project_id=7`, {
    headers: {
      authorization: 'Bearer user-token',
      'x-org-id': '42',
    },
  })
  assert.equal(list.url, '/api/v1/canvases?project_id=7')

  assert.deepEqual(upstreamCalls.map((call) => [call.method, call.url]), [
    ['GET', '/api/v1/canvases?project_id=7'],
  ])
  assert.equal(upstreamCalls[0].authorization, 'Bearer user-token')
  assert.equal(upstreamCalls[0].org, '42')
})

test('canvas-service prefers runtime home Data Service endpoint over stale environment URL', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-canvas-service-home-'))
  test.after(() => {
    rmSync(homeDir, { recursive: true, force: true })
  })
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push(request.url)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true, url: request.url }))
  })
  tAfterClose(upstream)
  writeRuntimeEndpointRecord(homeDir, {
    serviceName: 'movscript.data.service',
    protocol: 'http',
    url: upstream.url,
    status: 'ready',
    ready: true,
  })

  const runtime = await startCanvasService({
    env: {
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_DATA_SERVICE_URL: 'http://127.0.0.1:9',
    },
  })
  tAfterClose(runtime)

  const health = await fetchJSON(`${runtime.url}/health`)
  assert.equal(health.upstream, upstream.url)
  const list = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}?project_id=7`)
  assert.equal(list.url, '/api/v1/canvases?project_id=7')
  assert.deepEqual(upstreamCalls, ['/api/v1/canvases?project_id=7'])
})

test('canvas-service does not proxy non-storage canvas subroutes', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push(request.url)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true }))
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const diagnostic = await fetch(`${runtime.url}${CANVAS_SERVICE_CANVASES_ENDPOINT}/7/nodes/a/model-diagnostics`)
  assert.equal(diagnostic.status, 404)
  assert.deepEqual(await diagnostic.json(), { error: 'not_found' })
  assert.deepEqual(upstreamCalls, [])
})

test('canvas-service handles runtime text through local model gateway adapter', async () => {
  const upstreamCalls = []
  const modelGateway = await startUpstream((request, response) => {
    upstreamCalls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
      body: '',
    })
    request.on('data', (chunk) => {
      upstreamCalls[upstreamCalls.length - 1].body += chunk.toString('utf8')
    })
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        model: 'text-model',
        choices: [{ message: { content: '雨夜回声' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }))
    })
  })
  tAfterClose(modelGateway)

  const runtime = await startCanvasService({
    dataServiceBaseURL: 'http://127.0.0.1:9',
    modelGatewayBaseURL: modelGateway.url,
  })
  tAfterClose(runtime)

  const result = await postJSON(`${runtime.url}${CANVAS_SERVICE_RUNTIME_TEXT_ENDPOINT}`, {
    model_id: 'text-model',
    prompt: ' rain ',
    params: { max_tokens: 128, temperature: 0.2, json_mode: true },
    project_id: 7,
  }, {
    authorization: 'Bearer user-token',
  })

  assert.deepEqual(result, {
    type: 'text',
    text: '雨夜回声',
    model_id: 'text-model',
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  })
  assert.deepEqual(upstreamCalls.map((call) => [call.method, call.url]), [
    ['POST', '/v1/chat/completions'],
  ])
  assert.equal(upstreamCalls[0].authorization, 'Bearer user-token')
  assert.equal(upstreamCalls[0].contentType, 'application/json')
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: 'text-model',
    messages: [{ role: 'user', content: 'rain' }],
    max_tokens: 128,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    project_id: 7,
  })
})

test('canvas-service does not fall back to data-service for runtime text generation', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push([request.method, request.url])
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true }))
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}${CANVAS_SERVICE_RUNTIME_TEXT_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model_id: 'text-model',
      prompt: 'rain',
    }),
  })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    error: 'model_gateway_not_configured',
    message: 'MOVSCRIPT_MODEL_GATEWAY_URL is required for Canvas runtime text generation',
  })
  assert.deepEqual(upstreamCalls, [])
})

test('canvas-service proxies runtime model catalog through local adapter', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify([{ id: 1, public_model_id: 'image-default' }]))
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const result = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_RUNTIME_MODELS_ENDPOINT}?capability=image`, {
    headers: { authorization: 'Bearer user-token' },
  })
  assert.deepEqual(result, [{ id: 1, public_model_id: 'image-default' }])
  assert.deepEqual(upstreamCalls, [{
    method: 'GET',
    url: '/api/v1/models?capability=image',
    authorization: 'Bearer user-token',
  }])
})

test('canvas-service proxies runtime media jobs through local adapter', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push({
      method: request.method,
      url: request.url,
      contentType: request.headers['content-type'],
      body: '',
    })
    request.on('data', (chunk) => {
      upstreamCalls[upstreamCalls.length - 1].body += chunk.toString('utf8')
    })
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ID: 55, status: 'queued' }))
    })
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const result = await postJSON(`${runtime.url}${CANVAS_SERVICE_RUNTIME_MEDIA_ENDPOINT}`, {
    job_type: 'image',
    model_id: 'image-default',
    prompt: 'rain',
    project_id: 7,
  })
  assert.deepEqual(result, { ID: 55, status: 'queued' })
  assert.deepEqual(upstreamCalls.map((call) => [call.method, call.url]), [
    ['POST', '/api/v1/jobs'],
  ])
  assert.equal(upstreamCalls[0].contentType, 'application/json')
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    job_type: 'image',
    model_id: 'image-default',
    prompt: 'rain',
    project_id: 7,
  })
})

test('canvas-service proxies runtime job polling through local adapter', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    upstreamCalls.push([request.method, request.url])
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ID: 55, status: 'succeeded' }))
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const result = await fetchJSON(`${runtime.url}${CANVAS_SERVICE_RUNTIME_JOBS_ENDPOINT}/55`)
  assert.deepEqual(result, { ID: 55, status: 'succeeded' })
  assert.deepEqual(upstreamCalls, [['GET', '/api/v1/jobs/55']])
})

test('canvas-service uploads runtime text resources through local adapter', async () => {
  const upstreamCalls = []
  const upstream = await startUpstream((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      upstreamCalls.push({
        method: request.method,
        url: request.url,
        contentType: request.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ID: 77, type: 'text' }))
    })
  })
  tAfterClose(upstream)

  const runtime = await startCanvasService({ dataServiceBaseURL: upstream.url })
  tAfterClose(runtime)

  const result = await postJSON(`${runtime.url}${CANVAS_SERVICE_RUNTIME_TEXT_RESOURCE_ENDPOINT}`, {
    name: 'note',
    text: 'hello canvas',
  })
  assert.deepEqual(result, { ID: 77, type: 'text' })
  assert.equal(upstreamCalls[0].method, 'POST')
  assert.equal(upstreamCalls[0].url, '/api/v1/resources/upload')
  assert.match(upstreamCalls[0].contentType, /multipart\/form-data/)
  assert.match(upstreamCalls[0].body, /filename="note\.txt"/)
  assert.match(upstreamCalls[0].body, /hello canvas/)
})

async function startUpstream(handler) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

async function fetchJSON(url, init) {
  const response = await fetch(url, init)
  const text = await response.text()
  assert.equal(response.status, 200, text)
  return JSON.parse(text)
}

async function postJSON(url, body, headers = {}) {
  return fetchJSON(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function tAfterClose(runtime) {
  test.after(async () => {
    await runtime.close()
  })
}

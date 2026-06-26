import { createServer } from 'node:http'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
} from '@movscript/runtime-contracts'

export const CANVAS_SERVICE_NAME = 'movscript.canvas.service'
export const CANVAS_SERVICE_CAPABILITIES_ENDPOINT = '/v1/canvas/capabilities'
export const CANVAS_SERVICE_CANVASES_ENDPOINT = '/v1/canvas/canvases'
export const CANVAS_SERVICE_RUNTIME_MODELS_ENDPOINT = '/v1/canvas/runtime/models'
export const CANVAS_SERVICE_RUNTIME_TEXT_ENDPOINT = '/v1/canvas/runtime/text'
export const CANVAS_SERVICE_RUNTIME_MEDIA_ENDPOINT = '/v1/canvas/runtime/media'
export const CANVAS_SERVICE_RUNTIME_TEXT_RESOURCE_ENDPOINT = '/v1/canvas/runtime/text-resource'
export const CANVAS_SERVICE_RUNTIME_JOBS_ENDPOINT = '/v1/canvas/runtime/jobs'

export const CANVAS_SERVICE_CAPABILITIES = Object.freeze([
  'canvas-api',
  'canvas-storage',
  'canvas-runtime',
])

export function createCanvasServiceHandler(options = {}) {
  const serviceName = options.serviceName ?? CANVAS_SERVICE_NAME
  const capabilities = options.capabilities ?? CANVAS_SERVICE_CAPABILITIES
  const fetchImpl = options.fetch ?? fetch
  const configuredDataServiceBaseURL = () => resolveDataServiceBaseURL(options)
  const modelGatewayBaseURL = normalizeOptionalBaseURL(
    options.modelGatewayBaseURL
      ?? options.env?.MOVSCRIPT_MODEL_GATEWAY_URL
      ?? options.env?.MOVSCRIPT_MODEL_GATEWAY_BASE_URL
      ?? process.env.MOVSCRIPT_MODEL_GATEWAY_URL
      ?? process.env.MOVSCRIPT_MODEL_GATEWAY_BASE_URL,
    'model gateway base URL',
  )

  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        writeJSON(response, 200, {
          status: 'ok',
          serviceName,
          capabilities,
          upstream: configuredDataServiceBaseURL(),
        })
        return
      }
      if (request.method === 'GET' && url.pathname === CANVAS_SERVICE_CAPABILITIES_ENDPOINT) {
        writeJSON(response, 200, {
          serviceName,
          capabilities,
          upstream: configuredDataServiceBaseURL(),
          modelGateway: modelGatewayBaseURL,
        })
        return
      }

      if (url.pathname === CANVAS_SERVICE_RUNTIME_TEXT_ENDPOINT) {
        await handleRuntimeTextRequest({
          fetchImpl,
          modelGatewayBaseURL,
          request,
          response,
        })
        return
      }
      if (url.pathname === CANVAS_SERVICE_RUNTIME_MODELS_ENDPOINT) {
        await proxyDataServiceRequest({
          dataServiceBaseURL: configuredDataServiceBaseURL(),
          fetchImpl,
          request,
          response,
          search: url.search,
          upstreamPath: '/api/v1/models',
        })
        return
      }
      if (url.pathname === CANVAS_SERVICE_RUNTIME_MEDIA_ENDPOINT) {
        await handleRuntimeMediaRequest({
          dataServiceBaseURL: configuredDataServiceBaseURL(),
          fetchImpl,
          request,
          response,
        })
        return
      }
      if (url.pathname === CANVAS_SERVICE_RUNTIME_TEXT_RESOURCE_ENDPOINT) {
        await handleRuntimeTextResourceRequest({
          dataServiceBaseURL: configuredDataServiceBaseURL(),
          fetchImpl,
          request,
          response,
        })
        return
      }
      const runtimeJobPath = runtimeJobUpstreamPath(url.pathname)
      if (runtimeJobPath) {
        await proxyDataServiceRequest({
          dataServiceBaseURL: configuredDataServiceBaseURL(),
          fetchImpl,
          request,
          response,
          search: url.search,
          upstreamPath: runtimeJobPath,
        })
        return
      }

      const upstreamPath = canvasUpstreamPath(url.pathname)
      if (upstreamPath) {
        await proxyDataServiceRequest({
          dataServiceBaseURL: configuredDataServiceBaseURL(),
          fetchImpl,
          request,
          response,
          search: url.search,
          upstreamPath,
        })
        return
      }

      writeJSON(response, 404, { error: 'not_found' })
    } catch (error) {
      writeCanvasServiceError(response, error)
    }
  }
}

function canvasUpstreamPath(pathname) {
  if (pathname === CANVAS_SERVICE_CANVASES_ENDPOINT) return '/api/v1/canvases'
  if (pathname.startsWith(`${CANVAS_SERVICE_CANVASES_ENDPOINT}/`)) {
    const id = pathname.slice(CANVAS_SERVICE_CANVASES_ENDPOINT.length + 1)
    if (!id || id.includes('/')) return ''
    return `/api/v1/canvases/${id}`
  }
  return ''
}

function runtimeJobUpstreamPath(pathname) {
  if (!pathname.startsWith(`${CANVAS_SERVICE_RUNTIME_JOBS_ENDPOINT}/`)) return ''
  const id = pathname.slice(CANVAS_SERVICE_RUNTIME_JOBS_ENDPOINT.length + 1)
  if (!id || id.includes('/')) return ''
  return `/api/v1/jobs/${id}`
}

async function handleRuntimeTextRequest({ fetchImpl, modelGatewayBaseURL, request, response }) {
  if (request.method !== 'POST') {
    writeJSON(response, 405, { error: 'method_not_allowed' })
    return
  }
  if (!modelGatewayBaseURL) {
    writeJSON(response, 503, {
      error: 'model_gateway_not_configured',
      message: 'MOVSCRIPT_MODEL_GATEWAY_URL is required for Canvas runtime text generation',
    })
    return
  }
  const input = await readJSONBody(request)
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  const model = typeof input.model_id === 'string' ? input.model_id.trim() : ''
  if (!prompt) {
    writeJSON(response, 400, { error: 'prompt is required' })
    return
  }
  if (!model) {
    writeJSON(response, 400, { error: 'model_id is required' })
    return
  }

  const params = isRecord(input.params) ? input.params : {}
  const upstream = await fetchImpl(`${modelGatewayBaseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      ...proxyRequestHeaders(request),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(Number.isFinite(params.max_tokens) ? { max_tokens: params.max_tokens } : {}),
      ...(Number.isFinite(params.temperature) ? { temperature: params.temperature } : {}),
      ...(params.json_mode === true ? { response_format: { type: 'json_object' } } : {}),
      ...(Number.isInteger(input.project_id) ? { project_id: input.project_id } : {}),
    }),
  })
  const body = await upstream.text()
  if (!upstream.ok) {
    response.statusCode = upstream.status
    response.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
    response.end(body)
    return
  }
  const parsed = JSON.parse(body)
  const text = parsed?.choices?.[0]?.message?.content
  writeJSON(response, 200, {
    type: 'text',
    text: typeof text === 'string' ? text : '',
    model_id: parsed?.model ?? model,
    usage: parsed?.usage,
  })
}

async function handleRuntimeMediaRequest({ dataServiceBaseURL, fetchImpl, request, response }) {
  if (request.method !== 'POST') {
    writeJSON(response, 405, { error: 'method_not_allowed' })
    return
  }
  const input = await readJSONBody(request)
  await proxyDataServiceJSON({
    dataServiceBaseURL,
    fetchImpl,
    request,
    response,
    upstreamPath: '/api/v1/jobs',
    body: input,
  })
}

async function handleRuntimeTextResourceRequest({ dataServiceBaseURL, fetchImpl, request, response }) {
  if (request.method !== 'POST') {
    writeJSON(response, 405, { error: 'method_not_allowed' })
    return
  }
  const input = await readJSONBody(request)
  const text = typeof input.text === 'string' ? input.text : ''
  const name = typeof input.name === 'string' && input.name.trim()
    ? input.name.trim()
    : 'canvas-output.txt'
  const filename = name.endsWith('.txt') ? name : `${name}.txt`
  const form = new FormData()
  form.append('file', new Blob([text], { type: 'text/plain' }), filename)

  const upstream = await fetchImpl(`${dataServiceBaseURL}/api/v1/resources/upload`, {
    method: 'POST',
    headers: proxyRequestHeaders(request, { omitContentType: true }),
    body: form,
  })
  await writeUpstreamResponse(response, upstream)
}

async function proxyDataServiceJSON({ dataServiceBaseURL, fetchImpl, request, response, upstreamPath, body }) {
  const upstream = await fetchImpl(`${dataServiceBaseURL}${upstreamPath}`, {
    method: request.method,
    headers: {
      ...proxyRequestHeaders(request),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  await writeUpstreamResponse(response, upstream)
}

async function proxyDataServiceRequest({ dataServiceBaseURL, fetchImpl, request, response, search, upstreamPath }) {
  const upstreamURL = `${dataServiceBaseURL}${upstreamPath}${search}`
  const headers = proxyRequestHeaders(request)
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await readBody(request)
  const upstream = await fetchImpl(upstreamURL, {
    method: request.method,
    headers,
    body,
  })

  await writeUpstreamResponse(response, upstream)
}

async function writeUpstreamResponse(response, upstream) {
  response.statusCode = upstream.status
  for (const [key, value] of upstream.headers.entries()) {
    if (key.toLowerCase() === 'content-encoding') continue
    response.setHeader(key, value)
  }
  const buffer = Buffer.from(await upstream.arrayBuffer())
  response.end(buffer)
}

function proxyRequestHeaders(request, options = {}) {
  const headers = {}
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (['host', 'connection', 'content-length'].includes(lower)) continue
    if (options.omitContentType && lower === 'content-type') continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function readJSONBody(request) {
  const body = await readBody(request)
  if (body.length === 0) return {}
  return JSON.parse(body.toString('utf8'))
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalBaseURL(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }
  return normalizeBaseURL(value, label)
}

function normalizeBaseURL(value, label = 'base URL') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }
  const url = new URL(value.trim().replace(/\/+$/, ''))
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`)
  }
  return url.toString().replace(/\/+$/, '')
}

function resolveDataServiceBaseURL(options) {
  const runtimeEndpoint = resolveRuntimeDataServiceBaseURL(options)
  if (runtimeEndpoint) return runtimeEndpoint
  return normalizeBaseURL(
    options.dataServiceBaseURL
      ?? options.env?.MOVSCRIPT_DATA_SERVICE_URL
      ?? options.env?.MOVSCRIPT_DATA_SERVICE_BASE_URL
      ?? options.env?.MOVSCRIPT_API_BASE_URL
      ?? process.env.MOVSCRIPT_DATA_SERVICE_URL
      ?? process.env.MOVSCRIPT_DATA_SERVICE_BASE_URL
      ?? process.env.MOVSCRIPT_API_BASE_URL
      ?? 'http://127.0.0.1:8766',
    'data service base URL',
  )
}

function resolveRuntimeDataServiceBaseURL(options) {
  const explicitHomeDir = options.homeDir
    ?? options.env?.MOVSCRIPT_HOME
    ?? process.env.MOVSCRIPT_HOME
  const homeDir = explicitHomeDir?.trim()
    ? explicitHomeDir
    : resolveMovScriptHomeDir({ env: options.env ?? process.env })
  try {
    const snapshot = readRuntimeHomeSnapshot(homeDir)
    const endpoint = findRuntimeEndpoint(snapshot, 'movscript.data.service')
      ?? findRuntimeService(snapshot, 'movscript.data.service')?.endpoint
    return normalizeOptionalBaseURL(endpointURL(endpoint), 'runtime data service base URL')
  } catch {
    return ''
  }
}

function endpointURL(endpoint) {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function writeJSON(response, statusCode, body) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function writeCanvasServiceError(response, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  writeJSON(response, statusCode, {
    error: error?.code ?? 'canvas_service_error',
    message: error?.message ?? 'canvas service error',
  })
}

export async function startCanvasService(options = {}) {
  const handler = createCanvasServiceHandler(options)
  const server = createServer(handler)
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 0
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  return {
    server,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

export async function runCanvasServiceCLI(args = [], env = process.env) {
  const [command = 'serve'] = args
  if (command !== 'serve') {
    throw new Error(`unsupported canvas-service command: ${command}`)
  }
  const host = env.MOVSCRIPT_CANVAS_SERVICE_HOST || '127.0.0.1'
  const port = Number(env.MOVSCRIPT_CANVAS_SERVICE_PORT || env.PORT || 0)
  const runtime = await startCanvasService({
    env,
    host,
    port,
  })
  console.log(`[canvas-service] listening on ${runtime.url}`)
  await waitForShutdown(runtime)
}

function waitForShutdown(runtime) {
  return new Promise(resolve => {
    let closing = false
    const close = async () => {
      if (closing) return
      closing = true
      await runtime.close()
      resolve()
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })
}

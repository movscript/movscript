import { createServer } from 'node:http'
import {
  MEDIA_PIPELINE_CAPABILITIES_ENDPOINT,
  MEDIA_PIPELINE_PROBE_ENDPOINT,
  MEDIA_PIPELINE_SERVICE_NAME,
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  MEDIA_PIPELINE_TASK_CREATE_ENDPOINT,
} from '@movscript/editing'
import { createHeadlessMediaPipelineRuntimePort } from './headlessRuntime.mjs'

export {
  MEDIA_PIPELINE_CAPABILITIES_ENDPOINT,
  MEDIA_PIPELINE_PROBE_ENDPOINT,
  MEDIA_PIPELINE_SERVICE_NAME,
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  MEDIA_PIPELINE_TASK_CREATE_ENDPOINT,
} from '@movscript/editing'

export const MEDIA_PIPELINE_SERVICE_CAPABILITIES = Object.freeze([
  'probe',
  'thumbnail',
  'waveform',
  'transcode',
  'render',
  'timeline-materialization',
])

export const MEDIA_PIPELINE_SUPPORTED_TASK_TYPES = Object.freeze([
  'timeline_render',
  'timeline_hls',
  'media_transcode',
  'media_reframe',
])

export const MEDIA_PIPELINE_SUPPORTED_OUTPUTS = Object.freeze(['mp4', 'hls'])

export function createMediaPipelineServiceHandler(options = {}) {
  const serviceName = options.serviceName ?? MEDIA_PIPELINE_SERVICE_NAME
  const capabilities = options.capabilities ?? MEDIA_PIPELINE_SERVICE_CAPABILITIES
  const supportedTaskTypes = options.supportedTaskTypes ?? MEDIA_PIPELINE_SUPPORTED_TASK_TYPES
  const supportedOutputs = options.supportedOutputs ?? MEDIA_PIPELINE_SUPPORTED_OUTPUTS
  const probe = options.probe ?? defaultProbe
  const runtimePort = options.runtimePort
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      writeCORSHeaders(response, request.headers.origin)
      if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        writeJSON(response, 200, {
          status: 'ok',
          serviceName,
          capabilities,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === MEDIA_PIPELINE_CAPABILITIES_ENDPOINT) {
        writeJSON(response, 200, mediaPipelineCapabilities({
          serviceName,
          capabilities,
          supportedTaskTypes,
          supportedOutputs,
        }))
        return
      }
      if (request.method === 'POST' && url.pathname === MEDIA_PIPELINE_PROBE_ENDPOINT) {
        const body = await readJSONBody(request)
        const taskType = stringValue(body.taskType ?? body.task_type)
        if (taskType && !supportedTaskTypes.includes(taskType)) {
          throw httpError(400, 'media_pipeline_task_type_unsupported', `unsupported media pipeline task type: ${taskType}`)
        }
        const result = await probe({
          input: body,
          taskType,
          feature: stringValue(body.feature),
          serviceName,
          capabilities,
          supportedTaskTypes,
          supportedOutputs,
          runtimePort,
        })
        writeJSON(response, 200, normalizeProbeResult(result, {
          serviceName,
          capabilities,
          supportedTaskTypes,
          supportedOutputs,
          taskType,
          feature: stringValue(body.feature),
        }))
        return
      }
      if (request.method === 'POST' && url.pathname === MEDIA_PIPELINE_TASK_CREATE_ENDPOINT) {
        const body = await readJSONBody(request)
        const taskRequest = recordValue(body.request)
        if (!taskRequest) {
          throw httpError(400, 'media_pipeline_task_request_required', 'media pipeline task create requires request')
        }
        const taskType = stringValue(taskRequest.taskType)
        if (!taskType) {
          throw httpError(400, 'media_pipeline_task_type_required', 'media pipeline task request requires taskType')
        }
        if (!supportedTaskTypes.includes(taskType)) {
          throw httpError(400, 'media_pipeline_task_type_unsupported', `unsupported media pipeline task type: ${taskType}`)
        }
        assertRuntimeMethod(runtimePort, 'createTask')
        const task = await runtimePort.createTask(taskRequest)
        writeJSON(response, 200, {
          schema: 'movscript.media-pipeline-task-create.v1',
          task,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === MEDIA_PIPELINE_TASK_ACTION_ENDPOINT) {
        const body = await readJSONBody(request)
        const action = stringValue(body.action)
        if (!action) {
          throw httpError(400, 'media_pipeline_task_action_required', 'media pipeline task action requires action')
        }
        const taskId = stringValue(body.taskId)
        if (!taskId) {
          throw httpError(400, 'media_pipeline_task_id_required', 'media pipeline task action requires taskId')
        }
        const runtimeOptions = mediaPipelineTaskOptions(body.options)
        if (action === 'getTask') {
          assertRuntimeMethod(runtimePort, 'getTask')
          writeJSON(response, 200, {
            schema: 'movscript.media-pipeline-task-action.v1',
            action,
            task: await runtimePort.getTask(taskId, runtimeOptions) ?? null,
          })
          return
        }
        if (action === 'cancelTask') {
          assertRuntimeMethod(runtimePort, 'cancelTask')
          writeJSON(response, 200, {
            schema: 'movscript.media-pipeline-task-action.v1',
            action,
            task: await runtimePort.cancelTask(taskId, runtimeOptions),
          })
          return
        }
        if (action === 'getTaskLogs') {
          assertRuntimeMethod(runtimePort, 'getTaskLogs')
          writeJSON(response, 200, {
            schema: 'movscript.media-pipeline-task-action.v1',
            action,
            logs: await runtimePort.getTaskLogs(taskId, runtimeOptions),
          })
          return
        }
        throw httpError(400, 'media_pipeline_task_action_unsupported', `unsupported media pipeline task action: ${action}`)
      }
      writeJSON(response, 404, {
        error: 'not_found',
      })
    } catch (error) {
      writeMediaPipelineServiceError(response, error)
    }
  }
}

function mediaPipelineCapabilities({ serviceName, capabilities, supportedTaskTypes, supportedOutputs }) {
  return {
    serviceName,
    capabilities,
    runtimeContract: 'EditingRuntimePort',
    supportedTaskTypes,
    supportedOutputs,
  }
}

async function defaultProbe(context = {}) {
  const runtimePort = context.runtimePort
  if (runtimePort?.getCapabilities) {
    try {
      const runtimeCapabilities = await runtimePort.getCapabilities()
      return {
        status: runtimeCapabilities.available ? 'available' : 'unavailable',
        available: runtimeCapabilities.available,
        ffmpeg: runtimeCapabilities.ffmpeg,
      }
    } catch (error) {
      return {
        status: 'unavailable',
        available: false,
        reason: 'media_pipeline_probe_failed',
        ffmpeg: {
          available: false,
          code: 'FFMPEG_RUNTIME_PROBE_FAILED',
          error: stringValue(error?.message),
        },
      }
    }
  }
  return {
    status: 'unavailable',
    available: false,
    reason: 'media_pipeline_execution_not_configured',
    ffmpeg: {
      available: false,
      code: 'FFMPEG_RUNTIME_NOT_CONFIGURED',
    },
  }
}

function normalizeProbeResult(result, context) {
  const available = result?.available === true || result?.status === 'available'
  return {
    schema: 'movscript.media-pipeline-probe.v1',
    serviceName: context.serviceName,
    status: available ? 'available' : 'unavailable',
    available,
    runtimeContract: 'EditingRuntimePort',
    capabilities: context.capabilities,
    supportedTaskTypes: context.supportedTaskTypes,
    supportedOutputs: context.supportedOutputs,
    ...(context.taskType ? { requestedTaskType: context.taskType } : {}),
    ...(context.feature ? { requestedFeature: context.feature } : {}),
    ...(stringValue(result?.reason) ? { reason: stringValue(result.reason) } : {}),
    ...(recordValue(result?.ffmpeg) ? { ffmpeg: result.ffmpeg } : {}),
  }
}

export function startMediaPipelineService(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const port = Number(options.port ?? 0)
  const server = createServer(createMediaPipelineServiceHandler(options))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        server,
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve())
        }),
      })
    })
  })
}

export async function runMediaPipelineServiceCLI(argv = [], env = process.env) {
  const command = argv[0] ?? 'serve'
  if (command !== 'serve') {
    throw new Error(`unsupported media-pipeline command: ${command}`)
  }
  const host = env.MOVSCRIPT_MEDIA_PIPELINE_HOST || '127.0.0.1'
  const port = Number(env.MOVSCRIPT_MEDIA_PIPELINE_PORT || env.PORT || 0)
  const runtimePort = env.MOVSCRIPT_MEDIA_PIPELINE_RUNTIME === 'none'
    ? undefined
    : createHeadlessMediaPipelineRuntimePort({ env })
  const runtime = await startMediaPipelineService({ host, port, runtimePort })
  process.stdout.write(JSON.stringify({
    serviceName: MEDIA_PIPELINE_SERVICE_NAME,
    url: runtime.url,
  }) + '\n')
  await waitForShutdown(runtime)
}

function writeJSON(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function writeCORSHeaders(response, origin) {
  response.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' && origin ? origin : '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Credentials', 'false')
  response.setHeader('Vary', 'Origin')
}

async function readJSONBody(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw httpError(400, 'invalid_json', 'request body must be valid JSON')
  }
}

function writeMediaPipelineServiceError(response, error) {
  const statusCode = Number(error?.statusCode ?? 500)
  writeJSON(response, statusCode, {
    error: stringValue(error?.code) ?? 'media_pipeline_service_error',
    message: stringValue(error?.message) ?? 'media pipeline service error',
  })
}

function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function mediaPipelineTaskOptions(value) {
  const options = recordValue(value)
  const projectId = stringValue(options?.projectId)
  return projectId ? { projectId } : undefined
}

function assertRuntimeMethod(runtimePort, method) {
  if (!runtimePort || typeof runtimePort[method] !== 'function') {
    throw httpError(503, 'media_pipeline_runtime_unavailable', `media pipeline runtime method is unavailable: ${method}`)
  }
}

async function waitForShutdown(runtime) {
  await new Promise((resolve) => {
    const stop = async () => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      await runtime.close()
      resolve()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })
}

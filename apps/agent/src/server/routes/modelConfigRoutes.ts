import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentServerContext } from '../../bootstrap/server/agentServerContext.js'
import { describeRuntimeModelCapabilities } from '../../model/router/modelRouter.js'
import type { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'
import {
  isCrossSiteBrowserRequest,
  isLoopbackRequest,
  logSlowRequest,
  readOptionalJSONObject,
  requestAuth,
  writeJSON,
} from '../core/http.js'

export async function handleModelConfigRoutes(input: {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  context: AgentServerContext
  telemetry: RuntimeTelemetryRegistry
  requestOperationId: string
  requestStartedAt: number
}): Promise<boolean> {
  const { req, res, url, context, telemetry, requestOperationId, requestStartedAt } = input

  if (req.method === 'GET' && url.pathname === '/model-config') {
    const modelConfigStartedAt = Date.now()
    telemetry.markPhase(requestOperationId, 'model_config_read_start')
    writeJSON(res, 200, {
      ...context.modelConfigStore.getPublicConfig(),
      capabilities: describeRuntimeModelCapabilities(context.modelConfigStore.getEffectiveConfig()),
    })
    telemetry.markPhase(requestOperationId, 'model_config_read_done')
    logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigStartedAt)
    return true
  }

  if (req.method === 'POST' && url.pathname === '/model-config') {
    telemetry.markPhase(requestOperationId, 'model_config_body_read_start')
    const body = await readOptionalJSONObject(req, 'model config body')
    telemetry.markPhase(requestOperationId, 'model_config_body_read_done')
    const modelConfigStartedAt = Date.now()
    telemetry.markPhase(requestOperationId, 'model_config_save_start')
    const saved = context.modelConfigStore.save(body)
    telemetry.markPhase(requestOperationId, 'model_config_save_done')
    telemetry.markPhase(requestOperationId, 'response_write_start', { status: 200, requestPath: url.pathname })
    writeJSON(res, 200, {
      ...saved,
      capabilities: describeRuntimeModelCapabilities(context.modelConfigStore.getEffectiveConfig()),
    })
    telemetry.markPhase(requestOperationId, 'response_write_done', { status: 200, requestPath: url.pathname })
    logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigStartedAt)
    return true
  }

  if (req.method === 'DELETE' && url.pathname === '/model-config') {
    if (!isLoopbackRequest(req)) {
      writeJSON(res, 403, { error: 'model config clear is only available from loopback clients' })
      return true
    }
    if (isCrossSiteBrowserRequest(req)) {
      writeJSON(res, 403, { error: 'model config clear rejects cross-site browser requests' })
      return true
    }
    const modelConfigStartedAt = Date.now()
    const cleared = context.modelConfigStore.clear()
    writeJSON(res, 200, {
      ...cleared,
      capabilities: describeRuntimeModelCapabilities(context.modelConfigStore.getEffectiveConfig()),
    })
    logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigStartedAt)
    return true
  }

  if (req.method === 'POST' && url.pathname === '/model-config/test') {
    const body = await readOptionalJSONObject(req, 'model config test body')
    const modelConfigTestStartedAt = Date.now()
    writeJSON(res, 200, await context.modelConfigStore.test(body, requestAuth(req)))
    logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigTestStartedAt)
    return true
  }

  return false
}

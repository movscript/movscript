import { resolveAgentRuntimeControlTransportInput, type AgentRuntimeControlEventStream } from '../../services/agentRuntime/transport'
import { resolveAgentRuntimeTransportInputForSession } from '../../services/agentRuntime/sessionTransport'
import type {
  ElectronAgentRuntimeResponse,
  ElectronAgentRuntimeStreamInput,
} from '../../../src/shared/contracts/electronApi'
import { ensureAgentRuntimeAvailable, normalizeRuntimeRequest } from './request'
import {
  registerAgentRuntimeEventStreamController,
  unregisterAgentRuntimeEventStreamController,
} from './streamPump'

export { closeAgentRuntimeEventStream, pumpAgentRuntimeStream } from './streamPump'

export interface AgentRuntimeEventStreamOpenResult {
  response: ElectronAgentRuntimeResponse
  stream: AgentRuntimeControlEventStream
  status: number
}

export async function agentRuntimeOpenEventStream(input: ElectronAgentRuntimeStreamInput): Promise<AgentRuntimeEventStreamOpenResult> {
  const request = normalizeRuntimeRequest(input)
  await ensureAgentRuntimeAvailable(input)
  const transportInput = resolveAgentRuntimeTransportInputForSession(input)
  const { transport } = resolveAgentRuntimeControlTransportInput(transportInput)
  const controller = new AbortController()
  registerAgentRuntimeEventStreamController(input.streamId, controller)
  try {
    const stream = await transport.openEventStream(request.path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
    console.info(`[agent] runtime stream open stream=${input.streamId} path=${request.path} session=${input.sessionId ?? '-'} workspace=${input.workspaceDir ?? '-'} endpoint=${transport.endpointLabel} status=${stream.status} source=${input.source ?? '-'}`)
    const response = {
      status: stream.status,
      statusText: stream.statusText,
      headers: stream.headers,
      body: stream.ok ? '' : await stream.responseText(),
    }
    if (!stream.ok) unregisterAgentRuntimeEventStreamController(input.streamId)
    return { response, stream, status: stream.status }
  } catch (error) {
    unregisterAgentRuntimeEventStreamController(input.streamId)
    console.info(`[agent] runtime stream open failed stream=${input.streamId} path=${request.path} session=${input.sessionId ?? '-'} workspace=${input.workspaceDir ?? '-'} endpoint=${transport.endpointLabel} source=${input.source ?? '-'} error=${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

import { resolveAgentRuntimeControlTransportInput, type AgentRuntimeControlEventStream } from '../../services/agentRuntime/transport'
import { resolveAgentRuntimeTransportInputForSession } from '../../services/agentRuntime/sessionTransport'
import type {
  ElectronAgentRuntimeResponse,
  ElectronAgentRuntimeStreamCloseInput,
  ElectronAgentRuntimeStreamInput,
  ElectronAgentRuntimeStreamMessage,
} from '../../../src/shared/contracts/electronApi'
import { ensureAgentRuntimeAvailable, normalizeRuntimeRequest } from './request'

const runtimeStreamControllers = new Map<string, AbortController>()

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
  runtimeStreamControllers.set(input.streamId, controller)
  try {
    const stream = await transport.openEventStream(request.path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
    console.info(`[agent] runtime stream open stream=${input.streamId} path=${request.path} session=${input.sessionId ?? '-'} workspace=${input.workspaceDir ?? '-'} endpoint=${transport.endpointLabel} status=${stream.status}`)
    const response = {
      status: stream.status,
      statusText: stream.statusText,
      headers: stream.headers,
      body: stream.ok ? '' : await stream.responseText(),
    }
    if (!stream.ok) runtimeStreamControllers.delete(input.streamId)
    return { response, stream, status: stream.status }
  } catch (error) {
    runtimeStreamControllers.delete(input.streamId)
    console.info(`[agent] runtime stream open failed stream=${input.streamId} path=${request.path} session=${input.sessionId ?? '-'} workspace=${input.workspaceDir ?? '-'} endpoint=${transport.endpointLabel} error=${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export function closeAgentRuntimeEventStream(input?: ElectronAgentRuntimeStreamCloseInput): void {
  if (!input?.streamId) return
  runtimeStreamControllers.get(input.streamId)?.abort(new Error(`Agent runtime stream closed by renderer: ${input.streamId}`))
  runtimeStreamControllers.delete(input.streamId)
}

export async function pumpAgentRuntimeStream(
  streamId: string,
  stream: AgentRuntimeControlEventStream,
  send: (message: ElectronAgentRuntimeStreamMessage) => void,
): Promise<void> {
  let messageCount = 0
  try {
    for await (const data of stream.messages()) {
      messageCount += 1
      send({ streamId, kind: 'message', data })
    }
    console.info(`[agent] runtime stream end stream=${streamId} messages=${messageCount}`)
    send({ streamId, kind: 'end' })
  } catch (error) {
    console.info(`[agent] runtime stream error stream=${streamId} messages=${messageCount} error=${error instanceof Error ? error.message : String(error)}`)
    send({ streamId, kind: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    runtimeStreamControllers.delete(streamId)
  }
}

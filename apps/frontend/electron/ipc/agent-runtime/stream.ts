import { resolveAgentRuntimeControlTransportInput, type AgentRuntimeControlEventStream } from '../../services/agentRuntime/transport'
import type {
  ElectronAgentRuntimeResponse,
  ElectronAgentRuntimeStreamCloseInput,
  ElectronAgentRuntimeStreamInput,
  ElectronAgentRuntimeStreamMessage,
} from '../../../src/shared/contracts/electronApi'
import { normalizeRuntimeRequest } from './request'

const runtimeStreamControllers = new Map<string, AbortController>()

export interface AgentRuntimeEventStreamOpenResult {
  response: ElectronAgentRuntimeResponse
  stream: AgentRuntimeControlEventStream
  status: number
}

export async function agentRuntimeOpenEventStream(input: ElectronAgentRuntimeStreamInput): Promise<AgentRuntimeEventStreamOpenResult> {
  const request = normalizeRuntimeRequest(input)
  const { transport } = resolveAgentRuntimeControlTransportInput(input)
  const controller = new AbortController()
  runtimeStreamControllers.set(input.streamId, controller)
  try {
    const stream = await transport.openEventStream(request.path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
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
  try {
    for await (const data of stream.messages()) {
      send({ streamId, kind: 'message', data })
    }
    send({ streamId, kind: 'end' })
  } catch (error) {
    send({ streamId, kind: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    runtimeStreamControllers.delete(streamId)
  }
}

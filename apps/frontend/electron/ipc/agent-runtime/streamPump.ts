import type {
  ElectronAgentRuntimeStreamCloseInput,
  ElectronAgentRuntimeStreamMessage,
} from '../../../src/shared/contracts/electronApi'
import type { AgentRuntimeControlEventStream } from '../../services/agentRuntime/control-transport'

const runtimeStreamControllers = new Map<string, AbortController>()

export function registerAgentRuntimeEventStreamController(streamId: string, controller: AbortController): void {
  runtimeStreamControllers.set(streamId, controller)
}

export function unregisterAgentRuntimeEventStreamController(streamId: string): void {
  runtimeStreamControllers.delete(streamId)
}

export function closeAgentRuntimeEventStream(input?: ElectronAgentRuntimeStreamCloseInput): void {
  if (!input?.streamId) return
  runtimeStreamControllers.get(input.streamId)?.abort(new Error(`Agent runtime stream closed by renderer: ${input.streamId}`))
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
    const controller = runtimeStreamControllers.get(streamId)
    if (controller?.signal.aborted) {
      console.info(`[agent] runtime stream closed stream=${streamId} messages=${messageCount}`)
      send({ streamId, kind: 'end' })
      return
    }
    console.info(`[agent] runtime stream error stream=${streamId} messages=${messageCount} error=${error instanceof Error ? error.message : String(error)}`)
    send({ streamId, kind: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    runtimeStreamControllers.delete(streamId)
  }
}

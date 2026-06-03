import { ensureAgentRuntimeRunning } from '../../services/agentRuntime'
import { resolveAgentRuntimeControlTransportInput } from '../../services/agentRuntime/transport'
import { resolveAgentRuntimeTransportInputForSession } from '../../services/agentRuntime/sessionTransport'
import type {
  ElectronAgentRuntimeEnsureInput,
  ElectronAgentRuntimeRequestInput,
  ElectronAgentRuntimeResponse,
} from '../../../src/shared/contracts/electronApi'

export async function agentRuntimeRequest(input?: ElectronAgentRuntimeRequestInput): Promise<ElectronAgentRuntimeResponse> {
  const request = normalizeRuntimeRequest(input)
  await ensureAgentRuntimeAvailable(input)
  const { transport } = resolveAgentRuntimeControlTransportInput(resolveAgentRuntimeTransportInputForSession(input))
  const response = await transport.request(request.path, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
}

export async function ensureAgentRuntimeAvailable(input?: ElectronAgentRuntimeEnsureInput): Promise<void> {
  const status = await ensureAgentRuntimeRunning(input)
  if (status.ok) return
  throw new Error(status.error || `Agent runtime is not available at ${status.endpoint || status.baseURL}`)
}

export function normalizeRuntimeRequest(input?: ElectronAgentRuntimeRequestInput): Required<Pick<ElectronAgentRuntimeRequestInput, 'path' | 'method' | 'headers'>> & Pick<ElectronAgentRuntimeRequestInput, 'body'> {
  if (!input?.path || !input.path.startsWith('/')) throw new Error('agent runtime request path must start with /')
  return {
    path: input.path,
    method: input.method ?? 'GET',
    headers: input.headers ?? {},
    ...(input.body !== undefined ? { body: input.body } : {}),
  }
}

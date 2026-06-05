import type { AgentThreadStatus } from '@movscript/protocol'
import type { AgentChatThreadStatus } from '@/features/agent/domain/agentChatProtocol'

export const AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE: Record<AgentThreadStatus, {
  neutralThreadStatus: AgentChatThreadStatus
  streamMethod: 'thread/metadata/updated'
  active: boolean
  note: string
}> = {
  idle: {
    neutralThreadStatus: 'idle',
    streamMethod: 'thread/metadata/updated',
    active: false,
    note: 'Idle runtime threads are loaded but not currently executing.',
  },
  running: {
    neutralThreadStatus: 'running',
    streamMethod: 'thread/metadata/updated',
    active: true,
    note: 'Running runtime threads remain active in the neutral thread list.',
  },
  requires_action: {
    neutralThreadStatus: 'running',
    streamMethod: 'thread/metadata/updated',
    active: true,
    note: 'Requires-action runtime threads stay active while pending server request cards own the user decision surface.',
  },
  completed: {
    neutralThreadStatus: 'completed',
    streamMethod: 'thread/metadata/updated',
    active: false,
    note: 'Completed runtime threads are settled successfully.',
  },
  failed: {
    neutralThreadStatus: 'failed',
    streamMethod: 'thread/metadata/updated',
    active: false,
    note: 'Failed runtime threads are settled with a diagnostic state.',
  },
  cancelled: {
    neutralThreadStatus: 'cancelled',
    streamMethod: 'thread/metadata/updated',
    active: false,
    note: 'Cancelled runtime threads are settled as neutral cancelled threads.',
  },
}

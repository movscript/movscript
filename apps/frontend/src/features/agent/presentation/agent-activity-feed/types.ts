import type { RunActivityTokenUsage } from '@/features/agent/domain/agentRunActivitySnapshot'
import type { AgentRunActivityRound as ConversationRunActivityRound } from '@movscript/conversation'
import type { ChatRunActivity, ChatRunActivityApproval, ChatRunActivityInputRequest } from '@/features/agent/state/agentStore'

export type AgentActivityKind = 'read' | 'workspace' | 'write' | 'task' | 'system' | 'error'

export type AgentActivityItem =
  | AgentActivityDecisionItem
  | AgentActivityLineItem
  | AgentActivityBlockItem
  | AgentActivityInputRequestItem
  | AgentActivityApprovalRequestItem

export interface AgentActivityDecisionItem {
  id: string
  type: 'decision'
  kind: 'system'
  title: string
  lines: string[]
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
}

export interface AgentActivityLineItem {
  id: string
  type: 'line'
  kind: AgentActivityKind
  text: string
  detail?: AgentActivityDebugDetail
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  toolName?: string
}

export interface AgentActivityBlockItem {
  id: string
  type: 'block'
  kind: AgentActivityKind
  title: string
  lines: string[]
  detail?: AgentActivityDebugDetail
  code?: {
    label: string
    text: string
  }
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  toolName?: string
}

export interface AgentActivityInputRequestItem {
  id: string
  type: 'input_request'
  kind: 'system'
  request: ChatRunActivityInputRequest
  status: string
  createdAt: string
  roundIndex?: number
  roundLabel?: string
}

export interface AgentActivityApprovalRequestItem {
  id: string
  type: 'approval_request'
  kind: 'system'
  approval: ChatRunActivityApproval
  status: string
  createdAt: string
  roundIndex?: number
  roundLabel?: string
}

export interface AgentActivityDebugDetail {
  args?: unknown
  result?: unknown
  error?: string
}

export interface AgentActivityFeed {
  runId?: string
  status: string
  statusText?: string
  rounds: AgentActivityRound[]
  items: AgentActivityItem[]
  totals: AgentActivityTotals
  activity?: ChatRunActivity
}

export interface AgentActivityTotals {
  modelCallCount: number
  toolCallCount: number
  durationMs?: number
  usage?: AgentActivityTokenUsage
}

export interface AgentActivityRound {
  id: string
  index?: number
  source?: ConversationRunActivityRound['source']
  label: string
  status: 'thinking' | 'tool_calls' | 'final' | 'failed'
  items: AgentActivityItem[]
  durationMs?: number
  usage?: AgentActivityTokenUsage
}

export type AgentActivityTokenUsage = RunActivityTokenUsage

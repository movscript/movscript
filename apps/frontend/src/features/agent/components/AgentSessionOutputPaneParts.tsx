import { CheckCircle2, CircleDot } from 'lucide-react'
import { Badge, Button } from '@movscript/ui/primitives'
import type { AgentSessionGenerationRecord } from '@/features/agent/domain/agentSessionGenerationProjection'
import type { AgentActivityAppEvent } from '@/features/agent/application/agentActivityEvents'
import type { SelectionState } from '@/features/content/integrations/sourceWorkspaceTypes'
import type {
  SessionCandidateView,
  SessionContentUnitView,
} from './AgentSessionOutputModel'

export function AgentActivityRow({ event }: { event: AgentActivityAppEvent }) {
  return (
    <article className="agent-session-output__activity" data-status={event.payload.status}>
      <div className="agent-session-output__activity-main">
        <p className="agent-session-output__activity-title">{event.payload.title}</p>
        {event.payload.summary ? <p className="agent-session-output__activity-summary">{event.payload.summary}</p> : null}
        <p className="agent-session-output__activity-meta">
          {[
            agentActivityTopicLabel(event.topic),
            agentActivityOriginLabel(event.payload.origin),
            event.payload.toolName,
            event.payload.runId ? `run ${event.payload.runId}` : undefined,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Badge variant={event.payload.status === 'completed' ? 'outline' : 'soft'}>
        {agentActivityStatusLabel(event.payload.status)}
      </Badge>
    </article>
  )
}

export function GenerationRecordRow({ record }: { record: AgentSessionGenerationRecord }) {
  return (
    <article className="agent-session-output__record">
      <div className="agent-session-output__record-main">
        <p className="agent-session-output__record-title">{record.title}</p>
        {record.description ? <p className="agent-session-output__record-description">{record.description}</p> : null}
        <p className="agent-session-output__record-meta">
          {[
            record.contentUnitId ? `content unit ${record.contentUnitId}` : undefined,
            record.candidateId ? `candidate ${record.candidateId}` : undefined,
            record.resourceId !== undefined ? `resource #${record.resourceId}` : undefined,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Badge variant="outline">{record.status ?? record.kind}</Badge>
    </article>
  )
}

export function ContentUnitDecisionCard({
  unit,
  selectingCandidateKey,
  onSelect,
}: {
  unit: SessionContentUnitView
  selectingCandidateKey: string | null
  onSelect: (unit: SessionContentUnitView, candidate: SessionCandidateView) => void
}) {
  return (
    <article className="agent-session-output__unit">
      <header className="agent-session-output__unit-header">
        <div>
          <p className="agent-session-output__unit-title">{unit.title}</p>
          <p className="agent-session-output__unit-meta">{unit.id} · {unit.type} · {unit.outputKind}</p>
        </div>
        <Badge variant={unit.selectionState === 'selected' ? 'outline' : 'soft'}>{selectionStateText(unit.selectionState)}</Badge>
      </header>
      {unit.editPrompt ? <p className="agent-session-output__unit-prompt">{unit.editPrompt}</p> : null}
      {unit.candidates.length === 0 ? (
        <p className="agent-session-output__candidate-empty">还没有候选。</p>
      ) : (
        <div className="agent-session-output__candidate-list">
          {unit.candidates.map((candidate) => {
            const key = `${unit.id}:${candidate.id}`
            const selecting = selectingCandidateKey === key
            return (
              <div key={candidate.id} className="agent-session-output__candidate" data-selected={candidate.selected ? 'true' : undefined}>
                <div className="agent-session-output__candidate-copy">
                  <p className="agent-session-output__candidate-title">
                    {candidate.selected ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                    {candidate.title}
                  </p>
                  <p className="agent-session-output__candidate-meta">
                    {[candidate.id, candidate.model, candidate.resourceId !== undefined ? `resource #${candidate.resourceId}` : undefined].filter(Boolean).join(' · ')}
                  </p>
                  {candidate.note ? <p className="agent-session-output__candidate-note">{candidate.note}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant={candidate.selected ? 'outline' : 'solid'}
                  disabled={candidate.selected || selecting}
                  onClick={() => onSelect(unit, candidate)}
                >
                  {selecting ? '选择中' : candidate.selected ? '已选择' : '选择'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

export function EmptySessionOutput({ message }: { message: string }) {
  return (
    <div className="agent-session-output__empty">
      {message}
    </div>
  )
}

function selectionStateText(status: SelectionState) {
  if (status === 'selected') return '已选择'
  if (status === 'stale') return '需复核'
  if (status === 'needs_candidate') return '缺候选'
  return '待选择'
}

function agentActivityStatusLabel(status: AgentActivityAppEvent['payload']['status']) {
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  if (status === 'requires_action') return '待确认'
  if (status === 'pending') return '等待'
  return '进行中'
}

function agentActivityTopicLabel(topic: AgentActivityAppEvent['topic']) {
  if (topic.startsWith('agent.tool.')) return '工具'
  if (topic.startsWith('agent.output.')) return '产出'
  if (topic === 'agent.plan.updated') return '计划'
  if (topic === 'agent.approval.requested') return '确认'
  if (topic === 'agent.user-input.requested') return '补充输入'
  return '动作'
}

function agentActivityOriginLabel(origin: AgentActivityAppEvent['payload']['origin']) {
  if (origin === 'user') return '用户'
  if (origin === 'agent-mcp') return 'Agent MCP'
  if (origin === 'agent') return 'Agent'
  return '系统'
}

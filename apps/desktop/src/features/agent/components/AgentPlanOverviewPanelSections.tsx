import { CircleStop, FileText, Loader2, PlayIcon, RefreshCw, Route } from 'lucide-react'
import {
  AgentPlanOverviewActionBar,
  AgentPlanOverviewActionButton,
  AgentPlanOverviewBadge,
  AgentPlanOverviewCodeDisclosure,
  AgentPlanOverviewDisclosure,
  AgentPlanOverviewDisclosureBody,
  AgentPlanOverviewDisclosureSummary,
  AgentPlanOverviewFilterRow,
  AgentPlanOverviewItemActions,
  AgentPlanOverviewItemCard,
  AgentPlanOverviewItemHeader,
  AgentPlanOverviewItemTitle,
  AgentPlanOverviewMetaRow,
  AgentPlanOverviewMetaText,
  AgentPlanOverviewNotice,
  AgentPlanOverviewNoticeTitle,
  AgentPlanOverviewSettingsGrid,
} from '@movscript/ui/business/agent'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentPlanArtifactSummary, AgentPlanNameConflictView } from '@/features/agent/domain/agentPlanUi'
import { agentTaskStatusLabel } from '@/features/agent/domain/agentPlanUi'
import { runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { safeAgentPlanJSONStringify } from '@/features/agent/presentation/AgentPlanOverviewPanelModel'

export const DEFAULT_TASK_GRAPH_DISPATCH_SETTINGS: PlanDispatchSettings = {
  maxWorkers: 2,
  maxTaskAttempts: 2,
  workerTimeoutMs: 15 * 60_000,
}

const TASK_GRAPH_MAX_WORKER_OPTIONS = [1, 2, 3, 4]
const TASK_GRAPH_MAX_TASK_ATTEMPT_OPTIONS = [1, 2, 3]
const TASK_GRAPH_WORKER_TIMEOUT_OPTIONS = [
  { label: '5m', value: 5 * 60_000 },
  { label: '15m', value: 15 * 60_000 },
  { label: '30m', value: 30 * 60_000 },
  { label: '1h', value: 60 * 60_000 },
]

export function AgentPlanNameConflictsNotice({
  nameConflicts,
  onOpenRun,
  onScrollToTask,
}: {
  nameConflicts: AgentPlanNameConflictView[]
  onOpenRun: (runId: string | undefined) => void
  onScrollToTask: (taskId: string | undefined) => void
}) {
  if (nameConflicts.length === 0) return null
  return (
    <AgentPlanOverviewNotice data-testid="agent-taskGraph-name-conflicts">
      {nameConflicts.map((conflict) => (
        <div key={conflict.subagentName} className="min-w-0">
          <AgentPlanOverviewNoticeTitle>子 agent 重名 · {conflict.subagentName}</AgentPlanOverviewNoticeTitle>
          <div className="mt-1 space-y-0.5">
            {conflict.entries.map((entry) => (
              <AgentPlanOverviewItemCard key={entry.taskId}>
                <AgentPlanOverviewItemHeader>
                  <div className="min-w-0">
                    <AgentPlanOverviewItemTitle>{entry.taskTitle}</AgentPlanOverviewItemTitle>
                    <AgentPlanOverviewMetaRow>
                      <AgentPlanOverviewMetaText data-truncate="true">任务 {entry.taskId}</AgentPlanOverviewMetaText>
                      {entry.taskStatus && <AgentPlanOverviewMetaText>{agentTaskStatusLabel(entry.taskStatus)}</AgentPlanOverviewMetaText>}
                      {entry.ownerRunId && <AgentPlanOverviewMetaText data-truncate="true">run {entry.ownerRunId}</AgentPlanOverviewMetaText>}
                      {entry.ownerRunStatus && <AgentPlanOverviewMetaText>{runStatusLabel(entry.ownerRunStatus)}</AgentPlanOverviewMetaText>}
                    </AgentPlanOverviewMetaRow>
                  </div>
                  <AgentPlanOverviewItemActions>
                    <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => onScrollToTask(entry.taskId)}>
                      任务
                    </AgentPlanOverviewActionButton>
                    {entry.ownerRunId && (
                      <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => onOpenRun(entry.ownerRunId)}>
                        <Route size={10} />
                        运行
                      </AgentPlanOverviewActionButton>
                    )}
                  </AgentPlanOverviewItemActions>
                </AgentPlanOverviewItemHeader>
              </AgentPlanOverviewItemCard>
            ))}
          </div>
        </div>
      ))}
    </AgentPlanOverviewNotice>
  )
}

export function AgentPlanGraphActions({
  busy,
  canCancel,
  canDispatch,
  canRetaskGraph,
  onCancelTree,
  onDispatch,
  onRetaskGraph,
}: {
  busy?: boolean
  canCancel: boolean
  canDispatch: boolean
  canRetaskGraph: boolean
  onCancelTree?: () => void
  onDispatch?: () => void
  onRetaskGraph?: () => void
}) {
  if (!onDispatch && !onRetaskGraph && !onCancelTree) return null
  return (
    <AgentPlanOverviewActionBar>
      {onDispatch && (
        <AgentPlanOverviewActionButton type="button" variant="outline" disabled={busy || !canDispatch} onClick={onDispatch}>
          {busy ? <Loader2 size={10} className="animate-spin" /> : <PlayIcon size={10} />}
          分派
        </AgentPlanOverviewActionButton>
      )}
      {onRetaskGraph && (
        <AgentPlanOverviewActionButton type="button" variant="outline" disabled={busy || !canRetaskGraph} onClick={onRetaskGraph}>
          {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          重新规划
        </AgentPlanOverviewActionButton>
      )}
      {onCancelTree && (
        <AgentPlanOverviewActionButton type="button" variant="ghost" tone="danger" disabled={busy || !canCancel} onClick={onCancelTree}>
          {busy ? <Loader2 size={10} className="animate-spin" /> : <CircleStop size={10} />}
          取消树
        </AgentPlanOverviewActionButton>
      )}
    </AgentPlanOverviewActionBar>
  )
}

export function AgentPlanDispatchSettingsGrid({
  busy,
  onSettingsChange,
  settings,
}: {
  busy?: boolean
  onSettingsChange?: (settings: PlanDispatchSettings) => void
  settings: PlanDispatchSettings
}) {
  if (!onSettingsChange) return null
  const updateSettings = (patch: Partial<PlanDispatchSettings>) => {
    onSettingsChange({ ...settings, ...patch })
  }
  return (
    <AgentPlanOverviewSettingsGrid>
      <Select value={String(settings.maxWorkers)} onValueChange={(next) => updateSettings({ maxWorkers: Number(next) })}>
        <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_GRAPH_MAX_WORKER_OPTIONS.map((value) => (
            <SelectItem key={value} value={String(value)}>{value} 个 worker</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(settings.maxTaskAttempts)} onValueChange={(next) => updateSettings({ maxTaskAttempts: Number(next) })}>
        <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_GRAPH_MAX_TASK_ATTEMPT_OPTIONS.map((value) => (
            <SelectItem key={value} value={String(value)}>{value} attempt{value === 1 ? '' : 's'}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(settings.workerTimeoutMs)} onValueChange={(next) => updateSettings({ workerTimeoutMs: Number(next) })}>
        <SelectTrigger size="sm" className="h-6 min-w-0 type-tiny" disabled={busy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_GRAPH_WORKER_TIMEOUT_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={String(item.value)}>{item.label} timeout</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AgentPlanOverviewSettingsGrid>
  )
}

export function AgentPlanArtifactSummarySection({
  activeArtifactTypeFilter,
  artifactSummary,
  onArtifactTypeFilterChange,
  onOpenRun,
  onScrollToTask,
  visiblePlanArtifacts,
}: {
  activeArtifactTypeFilter: string
  artifactSummary: AgentPlanArtifactSummary
  onArtifactTypeFilterChange: (filter: string) => void
  onOpenRun: (runId: string | undefined) => void
  onScrollToTask: (taskId: string | undefined) => void
  visiblePlanArtifacts: AgentPlanArtifactSummary['artifacts']
}) {
  if (artifactSummary.totalCount === 0) return null
  return (
    <AgentPlanOverviewDisclosure data-testid="agent-taskGraph-artifact-summary">
      <AgentPlanOverviewDisclosureSummary>
        <FileText size={10} />
        <span>{artifactSummary.totalCount} 个计划产物</span>
        {artifactSummary.byType.slice(0, 3).map((item) => (
          <AgentPlanOverviewBadge key={item.type}>
            {item.type} {item.count}
          </AgentPlanOverviewBadge>
        ))}
      </AgentPlanOverviewDisclosureSummary>
      <AgentPlanOverviewDisclosureBody>
        <AgentPlanOverviewFilterRow>
          <AgentPlanOverviewMetaText>
            显示 {Math.min(visiblePlanArtifacts.length, 6)}/{visiblePlanArtifacts.length}
          </AgentPlanOverviewMetaText>
          <Select value={activeArtifactTypeFilter} onValueChange={onArtifactTypeFilterChange}>
            <SelectTrigger size="sm" className="h-6 w-32 max-w-full type-tiny">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {artifactSummary.byType.map((item) => (
                <SelectItem key={item.type} value={item.type}>{item.type} ({item.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AgentPlanOverviewFilterRow>
        {visiblePlanArtifacts.slice(0, 6).map((artifact) => (
          <AgentPlanOverviewItemCard key={artifact.id}>
            <AgentPlanOverviewItemHeader>
              <AgentPlanOverviewItemTitle>{artifact.label}</AgentPlanOverviewItemTitle>
              <AgentPlanOverviewItemActions>
                {artifact.taskId && (
                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => onScrollToTask(artifact.taskId)}>
                    定位
                  </AgentPlanOverviewActionButton>
                )}
                {artifact.sourceRunId && (
                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => onOpenRun(artifact.sourceRunId)}>
                    <Route size={10} />
                    运行
                  </AgentPlanOverviewActionButton>
                )}
                {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                  <AgentPlanOverviewActionButton type="button" variant="ghost" onClick={() => onOpenRun(artifact.sourceTaskOwnerRunId)}>
                    来源
                  </AgentPlanOverviewActionButton>
                )}
                <AgentPlanOverviewMetaText>{artifact.type}</AgentPlanOverviewMetaText>
              </AgentPlanOverviewItemActions>
            </AgentPlanOverviewItemHeader>
            <AgentPlanOverviewMetaRow>
              {artifact.uri && <AgentPlanOverviewMetaText data-truncate="true">URI {artifact.uri}</AgentPlanOverviewMetaText>}
              {artifact.taskTitle && <AgentPlanOverviewMetaText data-truncate="true">任务 {artifact.taskTitle}</AgentPlanOverviewMetaText>}
              {artifact.sourceRunId && <AgentPlanOverviewMetaText data-truncate="true">运行 {artifact.sourceRunId}</AgentPlanOverviewMetaText>}
              {artifact.sourceTaskId && <AgentPlanOverviewMetaText data-truncate="true">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</AgentPlanOverviewMetaText>}
              {artifact.sourceTaskStatus && <AgentPlanOverviewMetaText>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</AgentPlanOverviewMetaText>}
              {artifact.subagentName && <AgentPlanOverviewMetaText data-truncate="true">子 agent {artifact.subagentName}</AgentPlanOverviewMetaText>}
              {artifact.toolName && <AgentPlanOverviewMetaText data-truncate="true">工具 {artifact.toolName}</AgentPlanOverviewMetaText>}
              {artifact.policy && <AgentPlanOverviewMetaText data-truncate="true">回滚规则 {artifact.policy}</AgentPlanOverviewMetaText>}
            </AgentPlanOverviewMetaRow>
          </AgentPlanOverviewItemCard>
        ))}
      </AgentPlanOverviewDisclosureBody>
    </AgentPlanOverviewDisclosure>
  )
}

export function AgentPlanActivityJSONBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <AgentPlanOverviewCodeDisclosure title={label}>
      {safeAgentPlanJSONStringify(value)}
    </AgentPlanOverviewCodeDisclosure>
  )
}

import { useTranslation } from 'react-i18next'
import {
  AgentDebugWorkspaceDiffCodeBlock,
  AgentDebugWorkspaceDiffColumns,
  AgentDebugWorkspaceDiffHeader,
  AgentDebugWorkspaceDiffLine,
  AgentDebugWorkspaceDiffRows,
  AgentDebugWorkspaceDiffShell,
} from '@/features/agent/components/AgentDebugPreviewUi'
import type { WorkspaceArtifactApplyPreview } from '@/shared/infrastructure/providerSessionClient'

function emptyLabel(t: ReturnType<typeof useTranslation>['t']) {
  return t('agents.chat.panel.providerSession.empty')
}

function asString(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function diffRows(currentValue: unknown, proposedValue: unknown) {
  const before = asString(currentValue)
  const after = asString(proposedValue)
  if (before === after) {
    return [{ type: 'same' as const, text: after }]
  }
  return [
    ...(before ? before.split('\n').map((text) => ({ type: 'removed' as const, text })) : [{ type: 'removed' as const, text: '' }]),
    ...(after ? after.split('\n').map((text) => ({ type: 'added' as const, text })) : [{ type: 'added' as const, text: '' }]),
  ]
}

export function WorkspaceDiff({ preview }: { preview: WorkspaceArtifactApplyPreview }) {
  const { t } = useTranslation()
  const rows = diffRows(preview.review.currentValue, preview.review.proposedValue)
  return (
    <AgentDebugWorkspaceDiffShell>
      <AgentDebugWorkspaceDiffHeader
        currentLabel={t('agents.chat.panel.workspaces.current')}
        proposedLabel={t('agents.chat.panel.workspaces.proposed')}
      />
      <AgentDebugWorkspaceDiffColumns>
        <AgentDebugWorkspaceDiffCodeBlock side="current">
          {asString(preview.review.currentValue) || t('common.emptyTitle')}
        </AgentDebugWorkspaceDiffCodeBlock>
        <AgentDebugWorkspaceDiffCodeBlock side="proposed">
          {asString(preview.review.proposedValue) || t('common.emptyTitle')}
        </AgentDebugWorkspaceDiffCodeBlock>
      </AgentDebugWorkspaceDiffColumns>
      <AgentDebugWorkspaceDiffRows>
        {rows.map((row, index) => (
          <AgentDebugWorkspaceDiffLine
            key={`${row.type}-${index}`}
            change={row.type}
          >
            {row.type === 'removed' ? '- ' : row.type === 'added' ? '+ ' : '  '}
            {row.text || emptyLabel(t)}
          </AgentDebugWorkspaceDiffLine>
        ))}
      </AgentDebugWorkspaceDiffRows>
    </AgentDebugWorkspaceDiffShell>
  )
}

export function isWorkspaceApplyPreview(value: unknown): value is WorkspaceArtifactApplyPreview {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<WorkspaceArtifactApplyPreview>
  return !!record.review
    && typeof record.review === 'object'
    && typeof record.review.workspaceId === 'string'
    && !!record.workspace
}

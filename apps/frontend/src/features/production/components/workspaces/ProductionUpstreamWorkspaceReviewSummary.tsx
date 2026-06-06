import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck, Sparkles } from 'lucide-react'
import {
  ReviewWorkspaceUpstreamActionButton,
  ReviewWorkspaceUpstreamEntryPreview,
  ReviewWorkspaceUpstreamMetricGrid,
  ReviewWorkspaceUpstreamPreviewGrid,
  ReviewWorkspaceUpstreamSection,
  ReviewWorkspaceUpstreamSummary,
  type ReviewWorkspaceUpstreamEntry,
} from '@movscript/ui'

import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

interface WorkspaceEntityRecord {
  ID: number
  title?: string
  name?: string
  label?: string
  status?: string
  description?: string
  kind?: string
}

interface InlinePreProductionWorkspaceEntry {
  key: string
  title: string
  detail: string
  target: string
  changeType: 'added' | 'modified' | 'deleted'
  kind: 'settings' | 'asset_slots'
  raw: Record<string, unknown>
}

interface InlinePreProductionWorkspaceView {
  mode: 'patch' | 'snapshot'
  summary: string
  settings: InlinePreProductionWorkspaceEntry[]
  assetSlots: InlinePreProductionWorkspaceEntry[]
  impactNotes: string[]
}

export function ProductionUpstreamWorkspaceReviewSummary({
  settingWorkspace,
  assetWorkspaceArtifact,
  projectName,
  productionName,
  settings,
  assetSlots,
}: {
  settingWorkspace: WorkspaceArtifact | null | undefined
  assetWorkspaceArtifact: WorkspaceArtifact | null | undefined
  projectName: string
  productionName: string
  settings: WorkspaceEntityRecord[]
  assetSlots: WorkspaceEntityRecord[]
}) {
  const settingView = useMemo(() => parseInlinePreProductionWorkspaceArtifact(settingWorkspace, settings, []), [settings, settingWorkspace])
  const assetWorkspaceView = useMemo(() => parseInlinePreProductionWorkspaceArtifact(assetWorkspaceArtifact, [], assetSlots), [assetWorkspaceArtifact, assetSlots])
  const deletedCount = (settingView?.settings ?? []).filter((entry) => entry.changeType === 'deleted').length
    + (assetWorkspaceView?.assetSlots ?? []).filter((entry) => entry.changeType === 'deleted').length
  const hasWorkspace = Boolean(settingWorkspace || assetWorkspaceArtifact)

  return (
    <ReviewWorkspaceUpstreamSection
      icon={Sparkles}
      title="设定与素材需求草案"
      description={`${projectName} · ${productionName}`}
      loaded={hasWorkspace}
      actions={
        <>
          {settingWorkspace ? (
            <ReviewWorkspaceUpstreamActionButton>
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', workspaceId: settingWorkspace.id })}>
                <Sparkles size={12} />
                打开设定审阅
              </Link>
            </ReviewWorkspaceUpstreamActionButton>
          ) : null}
          {assetWorkspaceArtifact ? (
            <ReviewWorkspaceUpstreamActionButton>
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', workspaceId: assetWorkspaceArtifact.id })}>
                <PackageCheck size={12} />
                打开素材需求审阅
              </Link>
            </ReviewWorkspaceUpstreamActionButton>
          ) : null}
        </>
      }
      empty="还没有上游草案。生成制作工作区时，如果 agent 发现必须补齐项目级设定或素材需求，这里会显示对应草案。"
    >
      <ReviewWorkspaceUpstreamMetricGrid
        metrics={[
          { label: '设定资料', value: `${settingView?.settings.length ?? 0} 项` },
          { label: '素材需求', value: `${assetWorkspaceView?.assetSlots.length ?? 0} 项` },
          { label: '影响说明', value: `${(settingView?.impactNotes.length ?? 0) + (assetWorkspaceView?.impactNotes.length ?? 0)} 项` },
          { label: '删除候选', value: `${deletedCount} 项`, impact: 'destructive' },
        ]}
      />
      <ReviewWorkspaceUpstreamSummary>
        {[settingView?.summary, assetWorkspaceView?.summary].filter(Boolean).join(' / ')}
      </ReviewWorkspaceUpstreamSummary>
      <ReviewWorkspaceUpstreamPreviewGrid>
        <ReviewWorkspaceUpstreamEntryPreview title="设定资料" empty="没有设定草案。" entries={reviewWorkspaceUpstreamEntries(settingView?.settings ?? [])} />
        <ReviewWorkspaceUpstreamEntryPreview title="素材需求" empty="没有素材需求草案。" entries={reviewWorkspaceUpstreamEntries(assetWorkspaceView?.assetSlots ?? [])} />
      </ReviewWorkspaceUpstreamPreviewGrid>
    </ReviewWorkspaceUpstreamSection>
  )
}

function reviewWorkspaceUpstreamEntries(entries: InlinePreProductionWorkspaceEntry[]): ReviewWorkspaceUpstreamEntry[] {
  return entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    detail: entry.detail,
    target: entry.target,
    impact: entry.changeType === 'deleted' ? 'destructive' : undefined,
  }))
}

function parseInlinePreProductionWorkspaceArtifact(
  workspace: WorkspaceArtifact | null | undefined,
  settingRecords: WorkspaceEntityRecord[] = [],
  assetSlotRecords: WorkspaceEntityRecord[] = [],
): InlinePreProductionWorkspaceView | null {
  if (!workspace) return null
  try {
    const content = JSON.parse(workspace.content) as Record<string, unknown>
    const workspacePayload = isRecord(content.workspace) ? content.workspace : {}
    const mode = content.mode === 'snapshot' ? 'snapshot' as const : 'patch' as const
    const settings = asRecordArray(workspacePayload.settings).map((item, index) => {
      const id = preProductionWorkspaceItemId(item)
      const changeType = inlinePreProductionWorkspaceChangeType(item)
      return {
        key: `${workspace.id}:settings:${index}`,
        kind: 'settings' as const,
        title: asString(workspaceField(item, ['name', 'title', 'label', 'kind']), `设定建议 #${index + 1}`),
        detail: asString(workspaceField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
        changeType,
        target: changeType === 'deleted' ? `移出 #${id}` : id > 0 ? `合并到 #${id}` : '新增候选',
        raw: item,
      }
    })
    const assetSlots = asRecordArray(workspacePayload.asset_slots).map((item, index) => {
      const id = preProductionWorkspaceItemId(item)
      const changeType = inlinePreProductionWorkspaceChangeType(item)
      return {
        key: `${workspace.id}:asset_slots:${index}`,
        kind: 'asset_slots' as const,
        title: asString(workspaceField(item, ['name', 'title', 'label', 'kind']), `素材建议 #${index + 1}`),
        detail: asString(workspaceField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
        changeType,
        target: changeType === 'deleted' ? `移出 #${id}` : id > 0 ? `调整 #${id}` : '新增候选',
        raw: item,
      }
    })
    const snapshotDeleted = mode === 'snapshot'
      ? inferInlinePreProductionWorkspaceSnapshotDeletes(workspace, workspacePayload, settingRecords, assetSlotRecords)
      : { settings: [], assetSlots: [] }
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)
    return {
      mode,
      summary: asString(content.summary, '暂无摘要'),
      settings: [...settings, ...snapshotDeleted.settings],
      assetSlots: [...assetSlots, ...snapshotDeleted.assetSlots],
      impactNotes,
    }
  } catch {
    return null
  }
}

function inferInlinePreProductionWorkspaceSnapshotDeletes(
  workspace: WorkspaceArtifact,
  workspacePayload: Record<string, unknown>,
  settingRecords: WorkspaceEntityRecord[],
  assetSlotRecords: WorkspaceEntityRecord[],
) {
  const proposedReferenceIds = new Set(asRecordArray(workspacePayload.settings).map(preProductionWorkspaceItemId).filter((id) => id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(workspacePayload.asset_slots).map(preProductionWorkspaceItemId).filter((id) => id > 0))
  const settings = settingRecords
    .filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
    .flatMap((record) => {
      if (proposedReferenceIds.has(record.ID)) return []
      return [{
        key: `${workspace.id}:settings:delete:${record.ID}`,
        kind: 'settings' as const,
        title: titleOfRecord(record),
        detail: String(record.description ?? '新工作区未包含此设定，按 snapshot 语义视为删除候选。'),
        target: `移出 #${record.ID}`,
        changeType: 'deleted' as const,
        raw: { id: record.ID, fields: { name: titleOfRecord(record), status: 'ignored' } },
      }]
    })
  const assetSlots = assetSlotRecords
    .filter((record) => !['ignored', 'waived', 'merged'].includes(String(record.status ?? '')))
    .flatMap((record) => {
      if (proposedAssetSlotIds.has(record.ID)) return []
      return [{
        key: `${workspace.id}:asset_slots:delete:${record.ID}`,
        kind: 'asset_slots' as const,
        title: titleOfRecord(record),
        detail: String(record.description ?? '新工作区未包含此素材需求，按 snapshot 语义视为删除候选。'),
        target: `移出 #${record.ID}`,
        changeType: 'deleted' as const,
        raw: { id: record.ID, fields: { name: titleOfRecord(record), status: 'waived', kind: String(record.kind ?? 'image') } },
      }]
    })
  return { settings, assetSlots }
}

function inlinePreProductionWorkspaceChangeType(item: Record<string, unknown>): InlinePreProductionWorkspaceEntry['changeType'] {
  const status = asString(workspaceField(item, ['status']))
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  return preProductionWorkspaceItemId(item) > 0 ? 'modified' : 'added'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function workspaceField(item: Record<string, unknown>, keys: string[]): unknown {
  const fields = isRecord(item.fields) ? item.fields : {}
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function preProductionWorkspaceItemId(item: Record<string, unknown>) {
  const parsed = Number(item.id ?? item.ID)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleOfRecord(record: WorkspaceEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

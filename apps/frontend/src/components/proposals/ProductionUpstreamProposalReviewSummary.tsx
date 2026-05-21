import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck, Sparkles } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'

import type { AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

interface ProposalEntityRecord {
  ID: number
  title?: string
  name?: string
  label?: string
  status?: string
  description?: string
  kind?: string
}

interface InlineProjectLayerProposalEntry {
  key: string
  title: string
  detail: string
  target: string
  changeType: 'added' | 'modified' | 'deleted'
  kind: 'creative_references' | 'asset_slots'
  raw: Record<string, unknown>
}

interface InlineProjectLayerProposalView {
  mode: 'patch' | 'snapshot'
  summary: string
  creativeReferences: InlineProjectLayerProposalEntry[]
  assetSlots: InlineProjectLayerProposalEntry[]
  impactNotes: string[]
}

export function ProductionUpstreamProposalReviewSummary({
  settingDraft,
  assetProposalDraft,
  projectName,
  productionName,
  creativeReferences,
  assetSlots,
}: {
  settingDraft: AgentDraft | null | undefined
  assetProposalDraft: AgentDraft | null | undefined
  projectName: string
  productionName: string
  creativeReferences: ProposalEntityRecord[]
  assetSlots: ProposalEntityRecord[]
}) {
  const settingView = useMemo(() => parseInlineProjectLayerProposalDraft(settingDraft, creativeReferences, []), [creativeReferences, settingDraft])
  const assetProposalView = useMemo(() => parseInlineProjectLayerProposalDraft(assetProposalDraft, [], assetSlots), [assetProposalDraft, assetSlots])
  const deletedCount = (settingView?.creativeReferences ?? []).filter((entry) => entry.changeType === 'deleted').length
    + (assetProposalView?.assetSlots ?? []).filter((entry) => entry.changeType === 'deleted').length
  const hasDraft = Boolean(settingDraft || assetProposalDraft)

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <Sparkles size={12} />
            上游提案审阅
          </div>
          <h2 className="mt-1 type-body font-semibold text-foreground">设定与素材需求草稿</h2>
          <p className="mt-1 type-label leading-5 text-muted-foreground">
            {projectName} · {productionName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={hasDraft ? 'secondary' : 'outline'} className="h-6 rounded-full px-2 type-tiny">
            {hasDraft ? '已加载' : '未加载'}
          </Badge>
          {settingDraft ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5 type-label">
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: settingDraft.id })}>
                <Sparkles size={12} />
                打开设定审阅
              </Link>
            </Button>
          ) : null}
          {assetProposalDraft ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5 type-label">
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: assetProposalDraft.id })}>
                <PackageCheck size={12} />
                打开素材需求审阅
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {settingView || assetProposalView ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <SummaryCount label="设定资料" value={settingView?.creativeReferences.length ?? 0} />
            <SummaryCount label="素材需求" value={assetProposalView?.assetSlots.length ?? 0} />
            <SummaryCount label="影响说明" value={(settingView?.impactNotes.length ?? 0) + (assetProposalView?.impactNotes.length ?? 0)} />
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <p className="type-tiny text-rose-700 dark:text-rose-300">删除候选</p>
              <p className="mt-1 type-label font-medium text-rose-700 dark:text-rose-300">{deletedCount} 项</p>
            </div>
          </div>
          <p className="type-caption leading-5 text-muted-foreground">{[settingView?.summary, assetProposalView?.summary].filter(Boolean).join(' / ')}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <EntryPreview title="设定资料" empty="没有设定提案草稿。" entries={settingView?.creativeReferences ?? []} />
            <EntryPreview title="素材需求" empty="没有素材需求提案草稿。" entries={assetProposalView?.assetSlots ?? []} />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label text-muted-foreground">
          还没有上游提案草稿。生成制作提案时，如果 agent 发现必须补齐项目级设定或素材需求，这里会显示对应草稿。
        </div>
      )}
    </section>
  )
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <p className="type-tiny text-muted-foreground">{label}</p>
      <p className="mt-1 type-label font-medium text-foreground">{value} 项</p>
    </div>
  )
}

function EntryPreview({
  title,
  empty,
  entries,
}: {
  title: string
  empty: string
  entries: InlineProjectLayerProposalEntry[]
}) {
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <p className="type-tiny font-medium text-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {entries.slice(0, 4).map((entry) => (
          <div key={entry.key} className={cn('rounded border px-2 py-1.5 type-tiny', entry.changeType === 'deleted' ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-background')}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-foreground">{entry.title}</span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 type-micro text-muted-foreground">{entry.target}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-muted-foreground">{entry.detail}</p>
          </div>
        ))}
        {!entries.length ? <p className="type-tiny text-muted-foreground">{empty}</p> : null}
      </div>
    </div>
  )
}

function parseInlineProjectLayerProposalDraft(
  draft: AgentDraft | null | undefined,
  creativeReferenceRecords: ProposalEntityRecord[] = [],
  assetSlotRecords: ProposalEntityRecord[] = [],
): InlineProjectLayerProposalView | null {
  if (!draft) return null
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : {}
    const mode = content.mode === 'snapshot' ? 'snapshot' as const : 'patch' as const
    const creativeReferences = asRecordArray(proposal.creative_references).map((item, index) => ({
      key: `${draft.id}:creative_references:${index}`,
      kind: 'creative_references' as const,
      title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `设定建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
      changeType: inlineProjectLayerProposalChangeType(item),
      target: inlineProjectLayerProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `合并到 #${item.id}` : '新增候选',
      raw: item,
    }))
    const assetSlots = asRecordArray(proposal.asset_slots).map((item, index) => ({
      key: `${draft.id}:asset_slots:${index}`,
      kind: 'asset_slots' as const,
      title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `素材建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
      changeType: inlineProjectLayerProposalChangeType(item),
      target: inlineProjectLayerProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `调整 #${item.id}` : '新增候选',
      raw: item,
    }))
    const snapshotDeleted = mode === 'snapshot'
      ? inferInlineProjectLayerProposalSnapshotDeletes(draft, proposal, creativeReferenceRecords, assetSlotRecords)
      : { creativeReferences: [], assetSlots: [] }
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)
    return {
      mode,
      summary: asString(content.summary, '暂无摘要'),
      creativeReferences: [...creativeReferences, ...snapshotDeleted.creativeReferences],
      assetSlots: [...assetSlots, ...snapshotDeleted.assetSlots],
      impactNotes,
    }
  } catch {
    return null
  }
}

function inferInlineProjectLayerProposalSnapshotDeletes(
  draft: AgentDraft,
  proposal: Record<string, unknown>,
  creativeReferenceRecords: ProposalEntityRecord[],
  assetSlotRecords: ProposalEntityRecord[],
) {
  const proposedReferenceIds = new Set(asRecordArray(proposal.creative_references).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(proposal.asset_slots).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0))
  const creativeReferences = creativeReferenceRecords
    .filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
    .flatMap((record) => {
      if (proposedReferenceIds.has(record.ID)) return []
      return [{
        key: `${draft.id}:creative_references:delete:${record.ID}`,
        kind: 'creative_references' as const,
        title: titleOfRecord(record),
        detail: String(record.description ?? '新提案未包含此设定，按 snapshot 语义视为删除候选。'),
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
        key: `${draft.id}:asset_slots:delete:${record.ID}`,
        kind: 'asset_slots' as const,
        title: titleOfRecord(record),
        detail: String(record.description ?? '新提案未包含此素材需求，按 snapshot 语义视为删除候选。'),
        target: `移出 #${record.ID}`,
        changeType: 'deleted' as const,
        raw: { id: record.ID, fields: { name: titleOfRecord(record), status: 'waived', kind: String(record.kind ?? 'image') } },
      }]
    })
  return { creativeReferences, assetSlots }
}

function inlineProjectLayerProposalChangeType(item: Record<string, unknown>): InlineProjectLayerProposalEntry['changeType'] {
  const status = asString(proposalField(item, ['status']))
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  return typeof item.id === 'number' ? 'modified' : 'added'
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

function proposalField(item: Record<string, unknown>, keys: string[]): unknown {
  const fields = isRecord(item.fields) ? item.fields : {}
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function titleOfRecord(record: ProposalEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

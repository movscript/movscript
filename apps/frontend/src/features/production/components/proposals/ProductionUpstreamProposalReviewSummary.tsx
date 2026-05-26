import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck, Sparkles } from 'lucide-react'
import {
  ReviewProposalUpstreamActionButton,
  ReviewProposalUpstreamEntryPreview,
  ReviewProposalUpstreamMetricGrid,
  ReviewProposalUpstreamPreviewGrid,
  ReviewProposalUpstreamSection,
  ReviewProposalUpstreamSummary,
  type ReviewProposalUpstreamEntry,
} from '@movscript/ui'

import type { AgentDraft } from '@/shared/infrastructure/localAgentClient'
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

interface InlinePreProductionProposalEntry {
  key: string
  title: string
  detail: string
  target: string
  changeType: 'added' | 'modified' | 'deleted'
  kind: 'creative_references' | 'asset_slots'
  raw: Record<string, unknown>
}

interface InlinePreProductionProposalView {
  mode: 'patch' | 'snapshot'
  summary: string
  creativeReferences: InlinePreProductionProposalEntry[]
  assetSlots: InlinePreProductionProposalEntry[]
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
  const settingView = useMemo(() => parseInlinePreProductionProposalDraft(settingDraft, creativeReferences, []), [creativeReferences, settingDraft])
  const assetProposalView = useMemo(() => parseInlinePreProductionProposalDraft(assetProposalDraft, [], assetSlots), [assetProposalDraft, assetSlots])
  const deletedCount = (settingView?.creativeReferences ?? []).filter((entry) => entry.changeType === 'deleted').length
    + (assetProposalView?.assetSlots ?? []).filter((entry) => entry.changeType === 'deleted').length
  const hasDraft = Boolean(settingDraft || assetProposalDraft)

  return (
    <ReviewProposalUpstreamSection
      icon={Sparkles}
      title="设定与素材需求草稿"
      description={`${projectName} · ${productionName}`}
      loaded={hasDraft}
      actions={
        <>
          {settingDraft ? (
            <ReviewProposalUpstreamActionButton>
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: settingDraft.id })}>
                <Sparkles size={12} />
                打开设定审阅
              </Link>
            </ReviewProposalUpstreamActionButton>
          ) : null}
          {assetProposalDraft ? (
            <ReviewProposalUpstreamActionButton>
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: assetProposalDraft.id })}>
                <PackageCheck size={12} />
                打开素材需求审阅
              </Link>
            </ReviewProposalUpstreamActionButton>
          ) : null}
        </>
      }
      empty="还没有上游提案草稿。生成制作提案时，如果 agent 发现必须补齐项目级设定或素材需求，这里会显示对应草稿。"
    >
      <ReviewProposalUpstreamMetricGrid
        metrics={[
          { label: '设定资料', value: `${settingView?.creativeReferences.length ?? 0} 项` },
          { label: '素材需求', value: `${assetProposalView?.assetSlots.length ?? 0} 项` },
          { label: '影响说明', value: `${(settingView?.impactNotes.length ?? 0) + (assetProposalView?.impactNotes.length ?? 0)} 项` },
          { label: '删除候选', value: `${deletedCount} 项`, impact: 'destructive' },
        ]}
      />
      <ReviewProposalUpstreamSummary>
        {[settingView?.summary, assetProposalView?.summary].filter(Boolean).join(' / ')}
      </ReviewProposalUpstreamSummary>
      <ReviewProposalUpstreamPreviewGrid>
        <ReviewProposalUpstreamEntryPreview title="设定资料" empty="没有设定提案草稿。" entries={reviewProposalUpstreamEntries(settingView?.creativeReferences ?? [])} />
        <ReviewProposalUpstreamEntryPreview title="素材需求" empty="没有素材需求提案草稿。" entries={reviewProposalUpstreamEntries(assetProposalView?.assetSlots ?? [])} />
      </ReviewProposalUpstreamPreviewGrid>
    </ReviewProposalUpstreamSection>
  )
}

function reviewProposalUpstreamEntries(entries: InlinePreProductionProposalEntry[]): ReviewProposalUpstreamEntry[] {
  return entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    detail: entry.detail,
    target: entry.target,
    impact: entry.changeType === 'deleted' ? 'destructive' : undefined,
  }))
}

function parseInlinePreProductionProposalDraft(
  draft: AgentDraft | null | undefined,
  creativeReferenceRecords: ProposalEntityRecord[] = [],
  assetSlotRecords: ProposalEntityRecord[] = [],
): InlinePreProductionProposalView | null {
  if (!draft) return null
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : {}
    const mode = content.mode === 'snapshot' ? 'snapshot' as const : 'patch' as const
    const creativeReferences = asRecordArray(proposal.creative_references).map((item, index) => {
      const id = preProductionProposalItemId(item)
      const changeType = inlinePreProductionProposalChangeType(item)
      return {
        key: `${draft.id}:creative_references:${index}`,
        kind: 'creative_references' as const,
        title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `设定建议 #${index + 1}`),
        detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
        changeType,
        target: changeType === 'deleted' ? `移出 #${id}` : id > 0 ? `合并到 #${id}` : '新增候选',
        raw: item,
      }
    })
    const assetSlots = asRecordArray(proposal.asset_slots).map((item, index) => {
      const id = preProductionProposalItemId(item)
      const changeType = inlinePreProductionProposalChangeType(item)
      return {
        key: `${draft.id}:asset_slots:${index}`,
        kind: 'asset_slots' as const,
        title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `素材建议 #${index + 1}`),
        detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
        changeType,
        target: changeType === 'deleted' ? `移出 #${id}` : id > 0 ? `调整 #${id}` : '新增候选',
        raw: item,
      }
    })
    const snapshotDeleted = mode === 'snapshot'
      ? inferInlinePreProductionProposalSnapshotDeletes(draft, proposal, creativeReferenceRecords, assetSlotRecords)
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

function inferInlinePreProductionProposalSnapshotDeletes(
  draft: AgentDraft,
  proposal: Record<string, unknown>,
  creativeReferenceRecords: ProposalEntityRecord[],
  assetSlotRecords: ProposalEntityRecord[],
) {
  const proposedReferenceIds = new Set(asRecordArray(proposal.creative_references).map(preProductionProposalItemId).filter((id) => id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(proposal.asset_slots).map(preProductionProposalItemId).filter((id) => id > 0))
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

function inlinePreProductionProposalChangeType(item: Record<string, unknown>): InlinePreProductionProposalEntry['changeType'] {
  const status = asString(proposalField(item, ['status']))
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  return preProductionProposalItemId(item) > 0 ? 'modified' : 'added'
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

function preProductionProposalItemId(item: Record<string, unknown>) {
  const parsed = Number(item.id ?? item.ID)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleOfRecord(record: ProposalEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

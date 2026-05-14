import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCw,
  Route,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card } from '@movscript/ui'

import {
  applyProjectProposal,
  getProject,
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { buildDefaultProjectStylePatch, buildEmptyProjectProposalDraftContent } from '@/lib/projectProposalDraft'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'

type WorkspaceRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  content?: string
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  total_episodes?: number
  priority?: string
  production_id?: number | null
  creative_reference_id?: number | null
  owner_type?: string
  owner_id?: number | null
  source_type?: string
  kind?: string
  role?: string
}

interface WorkspaceData {
  project: WorkspaceRecord | null
  productions: WorkspaceRecord[]
  creativeReferences: WorkspaceRecord[]
  creativeRelationships: WorkspaceRecord[]
  creativeReferenceUsages: WorkspaceRecord[]
  assetSlots: WorkspaceRecord[]
  assetSlotCandidates: WorkspaceRecord[]
  segments: WorkspaceRecord[]
  sceneMoments: WorkspaceRecord[]
  contentUnits: WorkspaceRecord[]
}

interface ProjectProposalDraftEntry {
  key: string
  kind: 'creative_references' | 'asset_slots'
  index: number
  changeType: 'added' | 'modified' | 'deleted' | 'unchanged'
  inferred?: boolean
  applied: boolean
  label: string
  detail: string
  target?: string
  ownerKey?: string
  raw: Record<string, unknown>
}

interface ProjectProposalAssetGroup {
  ownerKey: string
  ownerLabel: string
  items: ProjectProposalDraftEntry[]
}

interface ProjectProposalDraftView {
  mode: 'patch' | 'snapshot'
  summary: string
  creativeReferences: ProjectProposalDraftEntry[]
  assetSlots: ProjectProposalDraftEntry[]
  assetSlotGroups: ProjectProposalAssetGroup[]
  impactNotes: string[]
  debug: {
    scope?: string
    pageKey?: string
    draftId?: string
    draftUpdatedAt?: string
    draftStatus?: string
    sourceRunId?: string
    sourceThreadId?: string
  }
}

type ProjectProposalEntryDecision = 'rejected'
type ProjectProposalEntryDecisions = Record<string, ProjectProposalEntryDecision>

interface ProjectProposalDiffRow {
  label: string
  before?: string
  after: string
  tone: 'added' | 'modified' | 'deleted' | 'unchanged'
}

interface ProjectStyleDraftRow {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
}

interface StatCardProps {
  title: string
  value: string | number
  detail: string
  icon: LucideIcon
}

const emptyData: WorkspaceData = {
  project: null,
  productions: [],
  creativeReferences: [],
  creativeRelationships: [],
  creativeReferenceUsages: [],
  assetSlots: [],
  assetSlotCandidates: [],
  segments: [],
  sceneMoments: [],
  contentUnits: [],
}

function textOf(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleOf(record: WorkspaceRecord, fallback: string) {
  return textOf(record.title, textOf(record.name, textOf(record.label, fallback)))
}

function bodyOf(record: WorkspaceRecord, fallback = '暂无说明') {
  return textOf(record.description, textOf(record.summary, textOf(record.content, fallback)))
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

function asKey(value: unknown, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return asString(value, fallback)
}

function nestedFields(item: Record<string, unknown>): Record<string, unknown> {
  return isRecord(item.fields) ? item.fields : {}
}

function proposalField(item: Record<string, unknown>, keys: string[]): unknown {
  const fields = nestedFields(item)
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function draftAppliedEntryKeySet(draft: AgentDraft) {
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  const appliedEntryKeys = Array.isArray(metadata.appliedEntryKeys) ? metadata.appliedEntryKeys : []
  return new Set(appliedEntryKeys.map((value) => asKey(value, '')).filter(Boolean))
}

function isProjectProposalHelperDraft(draft: AgentDraft) {
  if (draft.kind !== 'project_proposal') return false
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  return typeof metadata.sourceDraftId === 'string' && metadata.sourceDraftId.trim().length > 0
}

function parseProjectProposalDraft(draft: AgentDraft, pageKey?: string, data?: WorkspaceData): ProjectProposalDraftView | null {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : undefined
    const appliedEntryKeys = draftAppliedEntryKeySet(draft)
    const mode = content.mode === 'snapshot' ? 'snapshot' as const : 'patch' as const
    const creativeReferences = asRecordArray(proposal?.creative_references).map((item, index) => ({
      key: `${draft.id}:creative_references:${index}`,
      kind: 'creative_references' as const,
      index,
      changeType: inferProjectProposalEntryChangeType('creative_references', item, data),
      applied: appliedEntryKeys.has(`${draft.id}:creative_references:${index}`),
      label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `设定建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
      target: (() => {
        const value = item.id
        return typeof value === 'number' ? `合并到 #${value}` : '新增候选'
      })(),
      raw: item,
    }))
    const creativeReferenceLabelByKey = new Map<string, string>()
    asRecordArray(proposal?.creative_references).forEach((item, index) => {
      const key = asKey(item.client_id ?? item.id, '')
      if (!key) return
      creativeReferenceLabelByKey.set(key, asString(proposalField(item, ['title', 'name', 'label', 'kind']), `设定建议 #${index + 1}`))
    })

    const assetSlots = asRecordArray(proposal?.asset_slots).map((item, index) => ({
      key: `${draft.id}:asset_slots:${index}`,
      kind: 'asset_slots' as const,
      index,
      changeType: inferProjectProposalEntryChangeType('asset_slots', item, data),
      applied: appliedEntryKeys.has(`${draft.id}:asset_slots:${index}`),
      label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `素材建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
      target: (() => {
        const value = item.id
        return typeof value === 'number' ? `调整 #${value}` : '新增候选'
      })(),
      ownerKey: asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), ''),
      raw: item,
    }))
    const assetSlotGroupsMap = new Map<string, ProjectProposalAssetGroup>()
    asRecordArray(proposal?.asset_slots).forEach((item, index) => {
      const ownerKey = asKey(
        isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']),
        '',
      )
      const groupKey = ownerKey || 'ungrouped'
      const ownerLabel = ownerKey
        ? creativeReferenceLabelByKey.get(ownerKey)
        ?? asString(proposalField(item, ['owner_name', 'source_label', 'name', 'label']), `关联设定 ${ownerKey}`)
        : '未绑定设定'
      const entry = assetSlots[index]
      if (!entry) return
      const existing = assetSlotGroupsMap.get(groupKey)
      if (existing) {
        existing.items.push(entry)
      } else {
        assetSlotGroupsMap.set(groupKey, {
          ownerKey: groupKey,
          ownerLabel,
          items: [entry],
        })
      }
    })
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...asRecordArray(content.impactNotes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
      ...(Array.isArray(content.impactNotes) ? content.impactNotes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)
    const snapshotDeleteEntries = mode === 'snapshot' && data
      ? inferSnapshotDeletionEntries(draft, proposal, data, appliedEntryKeys)
      : { creativeReferences: [], assetSlots: [] }
    const nextCreativeReferences = [...creativeReferences, ...snapshotDeleteEntries.creativeReferences]
    const nextAssetSlots = [...assetSlots, ...snapshotDeleteEntries.assetSlots]

    return {
      mode,
      summary: asString(content.summary, '暂无摘要'),
      creativeReferences: nextCreativeReferences,
      assetSlots: nextAssetSlots,
      assetSlotGroups: Array.from(assetSlotGroupsMap.values()),
      impactNotes,
      debug: {
        scope: asString(content.scope, ''),
        pageKey,
        draftId: draft.id,
        draftUpdatedAt: draft.updatedAt,
        draftStatus: draft.status,
        sourceRunId: asString(draft.createdByRunId, asString(content.sourceRunId, '')),
        sourceThreadId: asString(draft.createdByThreadId, asString(content.sourceThreadId, '')),
      },
    }
  } catch {
    return null
  }
}

function inferProjectProposalEntryChangeType(
  kind: 'creative_references' | 'asset_slots',
  item: Record<string, unknown>,
  data?: WorkspaceData,
): ProjectProposalDraftEntry['changeType'] {
  const status = asString(proposalField(item, ['status']), '')
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  const id = numberOf(item.id)
  if (id <= 0) return 'added'
  if (!data) return 'modified'
  const current = kind === 'creative_references'
    ? data.creativeReferences.find((record) => record.ID === id)
    : data.assetSlots.find((record) => record.ID === id)
  if (!current) return 'modified'
  return projectProposalRecordHasFieldDiff(kind, item, current) ? 'modified' : 'unchanged'
}

function projectProposalRecordHasFieldDiff(kind: 'creative_references' | 'asset_slots', item: Record<string, unknown>, current: WorkspaceRecord): boolean {
  const currentField = (keys: string[]) => {
    for (const key of keys) {
      if ((current as Record<string, unknown>)[key] !== undefined) return (current as Record<string, unknown>)[key]
    }
    return undefined
  }
  const proposedField = (keys: string[]) => proposalField(item, keys)
  const differs = (keys: string[]) => {
    const proposed = proposedField(keys)
    if (proposed === undefined || proposed === null || proposed === '') return false
    return draftEntryFieldText(proposed) !== draftEntryFieldText(currentField(keys))
  }
  if (kind === 'creative_references') {
    return [
      ['name', 'title', 'label'],
      ['kind'],
      ['description', 'summary', 'content', 'rationale'],
      ['alias'],
      ['importance'],
      ['status'],
      ['profile_json'],
      ['tags_json'],
    ].some(differs) || (Array.isArray(item.merge_candidates) && item.merge_candidates.length > 0)
  }
  const proposedOwnerId = asKey(isRecord(item.owner) ? item.owner.id : proposalField(item, ['owner_id', 'creative_reference_id', 'reference_id']), '')
  const currentOwnerId = asKey(current.creative_reference_id ?? current.owner_id, '')
  return [
    ['name', 'title', 'label'],
    ['kind'],
    ['description', 'summary', 'content', 'rationale'],
    ['usage', 'prompt_hint'],
    ['priority'],
    ['status'],
    ['resource_id'],
    ['locked_asset_slot_id'],
    ['metadata_json'],
  ].some(differs) || (proposedOwnerId !== '' && proposedOwnerId !== currentOwnerId)
}

function inferSnapshotDeletionEntries(
  draft: AgentDraft,
  proposal: Record<string, unknown> | undefined,
  data: WorkspaceData,
  appliedEntryKeys: Set<string>,
): { creativeReferences: ProjectProposalDraftEntry[]; assetSlots: ProjectProposalDraftEntry[] } {
  const proposedReferenceIds = new Set(asRecordArray(proposal?.creative_references).map((item) => numberOf(item.id)).filter((id) => id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(proposal?.asset_slots).map((item) => numberOf(item.id)).filter((id) => id > 0))
  const activeReferences = data.creativeReferences.filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
  const activeAssetSlots = data.assetSlots.filter((record) => !['ignored', 'waived', 'merged'].includes(String(record.status ?? '')))

  const creativeReferences = activeReferences.flatMap((record, index) => {
    if (proposedReferenceIds.has(record.ID)) return []
    const key = `${draft.id}:creative_references:delete:${record.ID}`
    return [{
      key,
      kind: 'creative_references' as const,
      index,
      changeType: 'deleted' as const,
      inferred: true,
      applied: appliedEntryKeys.has(key),
      label: titleOf(record, `设定 #${record.ID}`),
      detail: bodyOf(record, '新提案未包含此设定，按 snapshot 语义视为删除候选。'),
      target: `移出 #${record.ID}`,
      raw: {
        id: record.ID,
        fields: {
          name: titleOf(record, `设定 #${record.ID}`),
          status: 'ignored',
          description: bodyOf(record, ''),
        },
      },
    }]
  })

  const assetSlots = activeAssetSlots.flatMap((record, index) => {
    if (proposedAssetSlotIds.has(record.ID)) return []
    const key = `${draft.id}:asset_slots:delete:${record.ID}`
    return [{
      key,
      kind: 'asset_slots' as const,
      index,
      changeType: 'deleted' as const,
      inferred: true,
      applied: appliedEntryKeys.has(key),
      label: titleOf(record, `素材需求 #${record.ID}`),
      detail: bodyOf(record, '新提案未包含此素材需求，按 snapshot 语义视为删除候选。'),
      target: `移出 #${record.ID}`,
      ownerKey: asKey(record.creative_reference_id ?? record.owner_id, ''),
      raw: {
        id: record.ID,
        owner: record.creative_reference_id ? { type: 'creative_reference', id: record.creative_reference_id } : undefined,
        fields: {
          name: titleOf(record, `素材需求 #${record.ID}`),
          status: 'waived',
          kind: String(record.kind ?? 'image'),
          description: bodyOf(record, ''),
        },
      },
    }]
  })

  return { creativeReferences, assetSlots }
}

function buildProjectProposalSnapshotFromWorkspace(data: WorkspaceData) {
  const activeReferences = data.creativeReferences.filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
  const activeAssetSlots = data.assetSlots.filter((record) => !['ignored', 'waived', 'merged'].includes(String(record.status ?? '')))

  return {
    creativeReferences: activeReferences.map((record) => ({
      id: record.ID,
      fields: {
        name: titleOf(record, `设定 #${record.ID}`),
        kind: String(record.kind ?? ''),
        alias: String(record.alias ?? ''),
        description: String(record.description ?? ''),
        content: String(record.content ?? ''),
        importance: String(record.importance ?? ''),
        status: String(record.status ?? ''),
        profile_json: String(record.profile_json ?? ''),
        tags_json: String(record.tags_json ?? ''),
      },
    })),
    assetSlots: activeAssetSlots.map((record) => ({
      id: record.ID,
      owner: buildProjectProposalSnapshotOwner(record),
      fields: {
        name: titleOf(record, `素材需求 #${record.ID}`),
        kind: String(record.kind ?? 'image'),
        description: String(record.description ?? ''),
        slot_key: String(record.slot_key ?? ''),
        prompt_hint: String(record.prompt_hint ?? ''),
        status: String(record.status ?? ''),
        priority: String(record.priority ?? ''),
        metadata_json: String(record.metadata_json ?? ''),
        ...(record.production_id ? { production_id: record.production_id } : {}),
        ...(record.creative_reference_id ? { creative_reference_id: record.creative_reference_id } : {}),
        ...(record.resource_id ? { resource_id: record.resource_id } : {}),
        ...(record.locked_asset_slot_id ? { locked_asset_slot_id: record.locked_asset_slot_id } : {}),
      },
    })),
  }
}

function buildProjectProposalSnapshotOwner(record: WorkspaceRecord) {
  const creativeReferenceId = numberOf(record.creative_reference_id)
  if (creativeReferenceId > 0) return { type: 'creative_reference', id: creativeReferenceId }
  const ownerId = numberOf(record.owner_id)
  if (String(record.owner_type ?? '') === 'creative_reference' && ownerId > 0) return { type: 'creative_reference', id: ownerId }
  return undefined
}

function buildProjectStyleApplyPayload(draft: AgentDraft) {
  const content = JSON.parse(draft.content) as Record<string, unknown>
  const proposal = isRecord(content.proposal) ? content.proposal : {}
  return JSON.stringify({
    ...content,
    mode: 'patch',
    proposal: {
      ...proposal,
      project_style: isRecord(proposal.project_style) ? proposal.project_style : {},
      creative_references: [],
      asset_slots: [],
    },
  }, null, 2)
}

function formatDraftEntry(entry: ProjectProposalDraftEntry) {
  const parts = [entry.label]
  if (entry.target) parts.push(entry.target)
  return parts.join(' · ')
}

function draftEntryLabel(entry: ProjectProposalDraftEntry) {
  return entry.kind === 'creative_references' ? '设定资料' : '素材需求'
}

function draftEntryChangeLabel(entry: ProjectProposalDraftEntry) {
  if (entry.changeType === 'added') return '新增'
  if (entry.changeType === 'deleted') return '删除'
  if (entry.changeType === 'unchanged') return '保留'
  return '修改'
}

function draftEntryCurrentRecord(entry: ProjectProposalDraftEntry, data: WorkspaceData) {
  const id = numberOf(entry.raw.id)
  if (id <= 0) return null
  if (entry.kind === 'creative_references') {
    return data.creativeReferences.find((record) => record.ID === id) ?? null
  }
  return data.assetSlots.find((record) => record.ID === id) ?? null
}

function draftEntryFieldText(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value) || isRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function draftEntryOwnerLabel(entry: ProjectProposalDraftEntry, referenceLabels: Map<string, string>, rawOwnerValue?: string) {
  if (rawOwnerValue) return referenceLabels.get(rawOwnerValue) ?? rawOwnerValue
  if (entry.ownerKey) return referenceLabels.get(entry.ownerKey) ?? entry.ownerKey
  return '未绑定设定'
}

function buildProjectProposalEntryDiffRows(
  entry: ProjectProposalDraftEntry,
  data: WorkspaceData,
  referenceLabels: Map<string, string>,
): ProjectProposalDiffRow[] {
  const current = draftEntryCurrentRecord(entry, data)
  const rows: ProjectProposalDiffRow[] = []

  if (entry.changeType === 'deleted') {
    rows.push({
      label: entry.kind === 'creative_references' ? '设定' : '素材需求',
      before: entry.label,
      after: entry.kind === 'creative_references' ? '移出项目设定' : '移出素材需求',
      tone: 'deleted',
    })
    return rows
  }

  const pushField = (label: string, beforeValue: unknown, afterValue: unknown) => {
    const afterText = draftEntryFieldText(afterValue)
    const beforeText = draftEntryFieldText(beforeValue)
    const changed = entry.changeType === 'added' || beforeText !== afterText
    if (!changed) return
    rows.push({
      label,
      before: entry.changeType === 'added' ? '' : beforeText,
      after: afterText || '未填写',
      tone: entry.changeType === 'added' ? 'added' : 'modified',
    })
  }

  const currentFields = current ? { ...current } as Record<string, unknown> : {}
  const currentNestedFields = current ? nestedFields(current as Record<string, unknown>) : {}
  const currentField = (keys: string[]) => {
    for (const key of keys) {
      if (currentFields[key] !== undefined) return currentFields[key]
      if (currentNestedFields[key] !== undefined) return currentNestedFields[key]
    }
    return undefined
  }

  const item = entry.raw
  const proposedField = (keys: string[]) => proposalField(item, keys)

  if (entry.kind === 'creative_references') {
    pushField('名称', currentField(['name', 'title', 'label']), proposedField(['name', 'title', 'label']))
    pushField('类型', currentField(['kind']), proposedField(['kind']))
    pushField('说明', currentField(['description', 'summary', 'content', 'rationale']), proposedField(['description', 'summary', 'content', 'rationale']))
    pushField('别名', currentField(['alias']), proposedField(['alias']))
    pushField('重要度', currentField(['importance']), proposedField(['importance']))
    pushField('状态', currentField(['status']), proposedField(['status']))
    pushField('画像', currentField(['profile_json']), proposedField(['profile_json']))
    pushField('标签', currentField(['tags_json']), proposedField(['tags_json']))
    const mergeCandidates = Array.isArray(item.merge_candidates) ? item.merge_candidates.filter(isRecord) : []
    for (const [index, candidate] of mergeCandidates.entries()) {
      const sourceId = draftEntryFieldText(candidate.source_id)
      const reason = draftEntryFieldText(candidate.reason)
      rows.push({
        label: `合并候选 #${index + 1}`,
        before: '',
        after: [sourceId ? `来源 #${sourceId}` : '来源未标注', reason ? `原因：${reason}` : ''].filter(Boolean).join(' · '),
        tone: 'added',
      })
    }
  } else {
    pushField('名称', currentField(['name', 'title', 'label']), proposedField(['name', 'title', 'label']))
    pushField('类型', currentField(['kind']), proposedField(['kind']))
    pushField('说明', currentField(['description', 'summary', 'content', 'rationale']), proposedField(['description', 'summary', 'content', 'rationale']))
    pushField('用途', currentField(['usage', 'prompt_hint']), proposedField(['usage', 'prompt_hint']))
    pushField('优先级', currentField(['priority']), proposedField(['priority']))
    pushField('状态', currentField(['status']), proposedField(['status']))
    pushField('资源 ID', currentField(['resource_id']), proposedField(['resource_id']))
    pushField('锁定素材', currentField(['locked_asset_slot_id']), proposedField(['locked_asset_slot_id']))

    const currentOwnerId = current
      ? asKey(isRecord(current.owner) ? current.owner.client_id ?? current.owner.id : proposalField(current, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), '')
      : ''
    const currentOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, currentOwnerId)
    const proposedOwnerId = asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), '')
    const proposedOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, proposedOwnerId)
    if (entry.changeType === 'added' || currentOwnerLabel !== proposedOwnerLabel) {
      rows.push({
        label: '归属',
        before: entry.changeType === 'added' ? '' : currentOwnerLabel,
        after: proposedOwnerLabel,
        tone: entry.changeType === 'added' ? 'added' : 'modified',
      })
    }

    const currentMetadata = currentField(['metadata_json'])
    const proposedMetadata = proposedField(['metadata_json'])
    pushField('元数据', currentMetadata, proposedMetadata)
  }

  return rows
}

function parseProjectStyleDraftRows(draft: AgentDraft, project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : {}
    const projectStyle = isRecord(proposal.project_style) ? proposal.project_style : {}
    const currentStyle = parseProjectStyleRecord(project)
    const labels: Record<string, string> = {
      aspect_ratio: '画幅比例',
      shot_size_system: '镜头大小体系',
      camera_language: '镜头语言',
      visual_style: '视觉风格',
      lighting_style: '灯光规则',
      color_palette: '色彩规则',
      pacing_rules: '节奏规则',
      negative_rules: '负面规则',
    }
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = projectStyle[key]
      const text = draftEntryFieldText(value)
      if (!text) return []
      const before = draftEntryFieldText(key === 'aspect_ratio'
        ? project?.aspect_ratio ?? currentStyle[key]
        : key === 'visual_style'
          ? project?.visual_style ?? currentStyle[key]
          : currentStyle[key])
      return [{ key, label, before, after: text, changed: before !== text }]
    })
  } catch {
    return []
  }
}

function parseProjectStyleRecord(project?: WorkspaceRecord | null): Record<string, unknown> {
  if (!project?.project_style) return {}
  try {
    const parsed = JSON.parse(project.project_style)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function projectHasGlobalStyle(project?: WorkspaceRecord | null) {
  if (!project) return false
  return Boolean(
    textOf(project.aspect_ratio) ||
    textOf(project.visual_style) ||
    Object.keys(parseProjectStyleRecord(project)).length > 0,
  )
}

function projectStandardRows(project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
  const style = parseProjectStyleRecord(project)
  const rows: Array<[string, string, unknown]> = [
    ['aspect_ratio', '镜头比例', project?.aspect_ratio ?? style.aspect_ratio],
    ['visual_style', '画风', project?.visual_style ?? style.visual_style],
    ['shot_size_system', '镜头大小体系', style.shot_size_system],
    ['camera_language', '镜头语言', style.camera_language],
    ['lighting_style', '灯光规则', style.lighting_style],
    ['color_palette', '色彩规则', style.color_palette],
    ['pacing_rules', '节奏规则', style.pacing_rules],
    ['negative_rules', '负面规则', style.negative_rules],
  ]
  return rows.map(([key, label, value]) => ({
    key,
    label,
    before: '',
    after: draftEntryFieldText(value),
    changed: false,
  }))
}

function projectStandardMissingLabels(project?: WorkspaceRecord | null) {
  return projectStandardRows(project)
    .filter((row) => !row.after)
    .map((row) => row.label)
}

function projectStandardFilledCount(project?: WorkspaceRecord | null) {
  return projectStandardRows(project).filter((row) => row.after).length
}

function draftStatusVariant(status: AgentDraft['status']) {
  if (status === 'applied') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'superseded') return 'outline' as const
  if (status === 'accepted') return 'secondary' as const
  return 'warning' as const
}

function draftStatusLabel(status: AgentDraft['status']) {
  const labels: Record<AgentDraft['status'], string> = {
    draft: '待应用',
    accepted: '已接受',
    rejected: '已拒绝',
    applied: '已应用',
    superseded: '已替代',
  }
  return labels[status] ?? status
}

function formatDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

async function safeList(projectId: number, kind: SemanticEntityKind): Promise<WorkspaceRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkspaceRecord[]
  } catch (error) {
    console.warn(`Failed to load project workspace entity: ${kind}`, error)
    return []
  }
}

async function loadWorkspaceData(projectId: number): Promise<WorkspaceData> {
  const [
    project,
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  ] = await Promise.all([
    getProject(projectId).catch((error) => {
      console.warn('Failed to load project globals', error)
      return null
    }),
    safeList(projectId, 'productions'),
    safeList(projectId, 'creativeReferences'),
    safeList(projectId, 'creativeRelationships'),
    safeList(projectId, 'creativeReferenceUsages'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'assetSlotCandidates'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'contentUnits'),
  ])

  return {
    project: project as WorkspaceRecord | null,
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  }
}

function StatCard({ title, value, detail, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

export default function ProjectOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const orchestrationToolCleanupRef = useRef<(() => void) | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'structure' | 'review'>('structure')
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const [draftEntryDecisions, setDraftEntryDecisions] = useState<ProjectProposalEntryDecisions>({})
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const openedDraftId = searchParams.get('draftId')?.trim() || ''

  const queryKey = ['project-workspace', projectId] as const

  const { data = emptyData, isFetching, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => loadWorkspaceData(projectId!),
    enabled: !!projectId,
  })

  const pageKey = useMemo(() => {
    if (!projectId) return undefined
    return buildPageKey({
      route: { pathname: '/project-workspace' },
      projectId,
      selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
      labels: ['project-workspace', 'project-standards'],
    })
  }, [project?.name, projectId])

  useEffect(() => {
    setActiveDraftId(openedDraftId || null)
    if (openedDraftId) setWorkspaceView('review')
  }, [openedDraftId])

  useEffect(() => {
    return () => orchestrationToolCleanupRef.current?.()
  }, [])

  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['project-workspace-drafts', projectId, pageKey, activeDraftId, openedDraftId],
    queryFn: async () => {
      if (!projectId || !pageKey) return []
      const scopedDraftId = openedDraftId || activeDraftId
      if (scopedDraftId) {
        const draft = await localAgentClient.getDraft(scopedDraftId)
        return draft.kind === 'project_proposal' ? [draft] : []
      }
      const { drafts } = await localAgentClient.listDrafts({ projectId, kind: 'project_proposal', pageKey, limit: 20 })
      return drafts
    },
    enabled: !!projectId && !!pageKey,
    refetchInterval: (openedDraftId || activeDraftId) ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (openedDraftId || activeDraftId) return
    const firstProjectProposalDraft = draftsQuery.data?.find((draft) => draft.kind === 'project_proposal')
    if (!firstProjectProposalDraft) return
    setActiveDraftId(firstProjectProposalDraft.id)
    setWorkspaceView('review')
  }, [activeDraftId, draftsQuery.data, openedDraftId])

  const derived = useMemo(() => {
    const activeReferences = data.creativeReferences.filter((item) => !['ignored', 'merged'].includes(String(item.status ?? '')))
    const activeProductions = data.productions.filter((item) => !['delivered', 'archived'].includes(String(item.status ?? '')))

    return {
      activeReferences,
      activeProductions,
    }
  }, [data])

  const draftCounts = useMemo(() => {
    const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectProposalHelperDraft(draft))
    return {
      draft: drafts.filter((item) => item.status === 'draft').length,
      applied: drafts.filter((item) => item.status === 'applied').length,
    }
  }, [draftsQuery.data])

  async function startProjectOrchestration(promptOverride?: string) {
    if (!projectId || !pageKey) return
    const requestedPrompt = typeof promptOverride === 'string' ? promptOverride : orchestrationPrompt
    setLaunching(true)
    try {
      const draftShell = await localAgentClient.createDraft({
        projectId,
        kind: 'project_proposal',
        title: `项目标准提案草稿 - ${project?.name ?? `#${projectId}`}`,
        content: JSON.stringify(buildEmptyProjectProposalDraftContent({
          projectId,
          mode: 'patch',
          projectStyle: buildDefaultProjectStylePatch(),
          creativeReferences: [],
          assetSlots: [],
          createdAt: new Date().toISOString(),
          summary: '请定义项目级制作标准：画幅、镜头大小体系、镜头语言、视觉风格、灯光、色彩、节奏和负面规则。',
        }), null, 2),
        source: {
          entityType: 'project',
          entityId: projectId,
          pageKey,
          pageType: 'project_standards',
          pageRoute: '/project-workspace',
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'project_style',
        },
        metadata: {
          pageOwned: true,
          proposalScope: 'project_standards',
          proposalMode: 'patch',
          backendApply: 'project_proposal',
        },
      })
      setActiveDraftId(draftShell.id)
      setWorkspaceView('review')
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('draftId', draftShell.id)
        return next
      }, { replace: true })

      const requestId = `project_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const userMessage = requestedPrompt || `请基于已写入 draft 的空模板，为项目「${project?.name ?? `#${projectId}`}」制定项目级制作标准。只填写 proposal.project_style，包括画幅、镜头大小体系、镜头语言、视觉风格、灯光、色彩、节奏和负面规则；不要创建设定资料或素材需求。`

      orchestrationToolCleanupRef.current?.()
      orchestrationToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
        if (payload.run?.status === 'failed' || payload.run?.status === 'cancelled') {
          await draftsQuery.refetch()
          return
        }
        const latestDraftArtifact = selectLatestDraftArtifact(payload.artifacts, 'project_proposal')
        const nextDraftId = latestDraftArtifact?.draftId || draftShell.id
        setActiveDraftId(nextDraftId)
        setSearchParams((current) => {
          const next = new URLSearchParams(current)
          next.set('draftId', nextDraftId)
          return next
        }, { replace: true })
        await draftsQuery.refetch()
      })

      openAgentPanelDraft({
        requestId,
        taskType: 'project_standards_proposal',
        message: `请制定项目标准：${project?.name ?? `#${projectId}`}`,
        title: `项目标准提案: ${project?.name ?? `#${projectId}`}`,
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: userMessage,
          labels: ['project-workspace', 'project-standards', 'draft-review'],
          hints: {
            projectId,
            draftId: draftShell.id,
            route: { pathname: '/project-workspace' },
            selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
          },
        }),
        runPolicy: { maxToolCalls: 16, maxIterations: 10 },
        timeoutMs: 180_000,
        renderMode: 'page',
      })
      toast.info('已打开项目标准提案会话；AI 生成的草稿会回到审阅区')
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目提案启动失败')
    } finally {
      setLaunching(false)
    }
  }

  async function applyDraft(draft: AgentDraft) {
    if (!projectId) return
    if (draft.kind === 'project_proposal') {
      setApplyingDraftId(draft.id)
      try {
        const proposedValue = buildProjectStyleApplyPayload(draft)
        await localAgentClient.updateDraft(draft.id, {
          metadata: {
            ...(isRecord(draft.metadata) ? draft.metadata : {}),
            reviewedFrom: 'project-standards-workbench',
            reviewedAt: new Date().toISOString(),
          },
        })
        try {
          await localAgentClient.applyDraft(draft.id, {
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            currentValue: {
              aspect_ratio: data.project?.aspect_ratio ?? '',
              visual_style: data.project?.visual_style ?? '',
              project_style: data.project?.project_style ?? '',
            },
            proposedValue,
          })
        } catch (error) {
          await applyProjectProposal(projectId, JSON.parse(proposedValue) as Record<string, unknown>)
          await localAgentClient.updateDraft(draft.id, {
            status: 'applied',
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            metadata: {
              ...(isRecord(draft.metadata) ? draft.metadata : {}),
              reviewedFrom: 'project-standards-workbench',
              reviewedAt: new Date().toISOString(),
              backendWritePerformed: true,
              backendApplyFallback: error instanceof Error ? error.message : String(error),
            },
          })
        }
        const nextProject = await getProject(projectId)
        useProjectStore.getState().setCurrent(nextProject)
        toast.success('项目全局设定已写入后端')
        await refetch()
        await draftsQuery.refetch()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '应用项目标准提案失败')
      } finally {
        setApplyingDraftId(null)
      }
      return
    }
  }

  function refreshAll() {
    void refetch()
    void draftsQuery.refetch()
  }

  const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectProposalHelperDraft(draft))

  function setDraftEntryDecision(key: string, decision: ProjectProposalEntryDecision) {
    setDraftEntryDecisions((current) => ({ ...current, [key]: decision }))
  }

  function clearDraftEntryDecision(key: string) {
    setDraftEntryDecisions((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function draftReferenceOptions(view: ProjectProposalDraftView) {
    return [
      ...derived.activeReferences.map((reference) => ({
        value: String(reference.ID),
        label: titleOf(reference, `设定 #${reference.ID}`),
        numericId: reference.ID,
      })),
      ...view.creativeReferences.map((reference) => ({
        value: reference.raw.client_id ? String(reference.raw.client_id) : reference.key,
        label: reference.label,
        numericId: undefined,
      })),
    ]
  }

  const currentStandardRows = projectStandardRows(data.project)
  const filledStandardCount = projectStandardFilledCount(data.project)
  const missingStandardLabels = projectStandardMissingLabels(data.project)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Layers3 size={13} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={12} />
              <span>项目标准</span>
              <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">
                backend apply
              </Badge>
              {isFetching ? <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">同步中</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-normal text-foreground">项目标准工作台</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration()} loading={launching} disabled={!projectId}>
              <Wand2 size={13} />
              发起提案
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={refreshAll}>
              <RefreshCw size={13} className={isFetching || draftsQuery.isFetching ? 'animate-spin' : undefined} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载项目现状…
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-5">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title="镜头比例" value={textOf(data.project?.aspect_ratio, '未设置')} detail={projectHasGlobalStyle(data.project) ? '已接入 Project 全局字段' : '等待项目标准提案写入'} icon={Route} />
                <StatCard title="画风" value={textOf(data.project?.visual_style, '未设置')} detail="由 project_proposal.project_style 写入" icon={Sparkles} />
                <StatCard title="制作标准" value="8 类" detail="画幅、镜头、风格、光色、节奏和负面规则" icon={Sparkles} />
                <StatCard title="独立工作台" value="2 个" detail="设定资料和素材需求已拆分审阅" icon={PackageCheck} />
              </section>

              <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-muted/90 px-4 py-3 backdrop-blur lg:-mx-5 lg:px-5">
                <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                    <Button
                      size="sm"
                      variant={workspaceView === 'structure' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('structure')}
                    >
                      <Route size={13} />
                      主视图
                    </Button>
                    <Button
                      size="sm"
                      variant={workspaceView === 'review' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('review')}
                    >
                      <GitBranch size={13} />
                      审阅
                      <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">{draftCounts.draft}</Badge>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant={workspaceView === 'review' ? 'secondary' : 'outline'} className="h-6 rounded-full px-2 text-[10px]">
                      {workspaceView === 'review' ? '标准审阅' : '项目标准'}
                    </Badge>
                    <span>{workspaceView === 'review' ? '审阅并写入项目级镜头、风格和节奏规则' : '定义项目全局设定，不维护设定或素材需求'}</span>
                  </div>
                </div>
              </div>

              {workspaceView === 'structure' && (
                <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                  <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">项目全局标准</h2>
                        <p className="mt-1 text-xs text-muted-foreground">这里展示 Project 本体的全局制作设定；人物、地点、道具和素材需求不在此视图编辑。</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration('请为当前项目制定项目级制作标准：镜头比例、画风、镜头大小体系、镜头语言、灯光、色彩、节奏和负面规则。不要创建设定资料或素材需求。')}>
                        <Wand2 size={12} />
                        让 AI 制定
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {currentStandardRows.map((row) => (
                        <div key={row.key} className={cn(
                          'min-h-24 rounded-md border px-3 py-2',
                          row.after ? 'border-border bg-background' : 'border-dashed border-amber-500/40 bg-amber-500/5',
                        )}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-medium text-muted-foreground">{row.label}</p>
                            <Badge variant={row.after ? 'secondary' : 'warning'} className="h-5 rounded-full px-1.5 text-[9px]">
                              {row.after ? '已设置' : '缺失'}
                            </Badge>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground">{row.after || '未设置'}</p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <div className="min-h-0 space-y-4">
                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-foreground">标准完整度</h2>
                          <p className="mt-1 text-xs text-muted-foreground">用于判断当前项目是否已经具备可复用的视觉生成约束。</p>
                        </div>
                        <Badge variant={missingStandardLabels.length === 0 ? 'success' : 'warning'} className="text-[10px]">
                          {filledStandardCount}/8
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MiniMetric icon={Route} label="已设置标准" value={filledStandardCount} />
                        <MiniMetric icon={GitBranch} label="待审阅草稿" value={draftCounts.draft} />
                      </div>
                      {missingStandardLabels.length > 0 ? (
                        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                          <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">缺失字段</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {missingStandardLabels.map((label) => (
                              <Badge key={label} variant="warning" className="h-5 rounded-full px-1.5 text-[9px]">{label}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[10px] leading-4 text-emerald-700 dark:text-emerald-300">
                          项目全局标准已经覆盖当前工作台的 8 个核心字段。
                        </div>
                      )}
                    </Card>

                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-foreground">项目上下文概览</h2>
                          <p className="mt-1 text-xs text-muted-foreground">这些数量只用于判断标准覆盖范围；具体内容请进入对应工作台。</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">只读摘要</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MiniMetric icon={Sparkles} label="设定资料" value={derived.activeReferences.length} />
                        <MiniMetric icon={PackageCheck} label="素材需求" value={data.assetSlots.length} />
                        <MiniMetric icon={Route} label="制作单元" value={data.contentUnits.length} />
                        <MiniMetric icon={FileText} label="Production" value={derived.activeProductions.length} />
                      </div>
                    </Card>
                  </div>
                </section>
              )}

              {workspaceView === 'review' && (
                <section className="min-w-0 space-y-4">
                  <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">项目标准审阅</h2>
                        <p className="mt-1 text-xs text-muted-foreground">这里只审阅 project_proposal 中的 project_style；确认后写入 Project 的全局设定字段。</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">draft {draftCounts.draft}</Badge>
                    </div>

                    <div className="mt-3 min-h-0 space-y-3 overflow-y-auto">
                      {draftsQuery.isLoading ? (
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                          <Loader2 size={12} className="animate-spin" />
                          读取草稿…
                        </div>
                      ) : drafts.length === 0 ? (
                        <EmptyBlock title="暂无项目标准草稿" detail="从上方发起项目标准提案后，AI 对画幅、镜头、风格和节奏规则的建议会进入这里审阅。" />
                      ) : drafts.map((draft) => {
                        const proposalView = parseProjectProposalDraft(draft, pageKey, data)
                        const styleRows = parseProjectStyleDraftRows(draft, data.project)
                        const referenceEntries = proposalView?.creativeReferences ?? []
                        const assetEntries = proposalView?.assetSlots ?? []
                        const allEntries = [...referenceEntries, ...assetEntries]
                        const referenceOptions = proposalView ? draftReferenceOptions(proposalView) : []
                        const referenceLabels = new Map(referenceOptions.map((option) => [option.value, option.label]))
                        const handledEntries = allEntries.filter((entry) => entry.applied)
                        const rejectedEntries = allEntries.filter((entry) => draftEntryDecisions[entry.key] === 'rejected')
                        const unchangedEntries = allEntries.filter((entry) => entry.changeType === 'unchanged')

                        return (
                          <div key={draft.id} className="rounded-lg border border-border bg-background p-3 last:mb-0">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{draft.title}</p>
                                <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(draft.updatedAt)} · {draft.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[10px]">{draftStatusLabel(draft.status)}</Badge>
                                <Badge variant="outline" className="text-[10px]">{allEntries.length} 条变更</Badge>
                              </div>
                            </div>

                            {proposalView ? (
                              <div className="mt-3 space-y-3">
                                <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-medium text-foreground">项目标准提案</p>
                                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{proposalView.summary}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <Badge variant="secondary" className="h-5 rounded-full px-1.5">{styleRows.length} 条标准</Badge>
                                      {allEntries.length > 0 ? <Badge variant="warning" className="h-5 rounded-full px-1.5">{allEntries.length} 条旧结构项</Badge> : null}
                                      <Badge variant="outline" className="h-5 rounded-full px-1.5">写入 Project</Badge>
                                      {proposalView.mode === 'snapshot' ? <Badge variant="outline" className="h-5 rounded-full px-1.5">{unchangedEntries.length} 保留</Badge> : null}
                                      <Badge variant="success" className="h-5 rounded-full px-1.5">{handledEntries.length} 已处理</Badge>
                                      {rejectedEntries.length > 0 ? <Badge variant="destructive" className="h-5 rounded-full px-1.5">{rejectedEntries.length} 已忽略</Badge> : null}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-muted-foreground">提交后会写入 Project.aspect_ratio、Project.visual_style 和完整 project_style JSON。</p>
                                    <div className="flex gap-1.5">
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={() => applyDraft(draft)}
                                        loading={applyingDraftId === draft.id}
                                        disabled={draft.status === 'applied' || draft.status === 'accepted' || styleRows.length === 0}
                                      >
                                        <CheckCircle2 size={12} />
                                        应用标准
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {styleRows.length > 0 ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    {styleRows.map((row) => (
                                      <div key={row.key} className="rounded-md border border-border bg-card px-3 py-2">
                                        <p className="text-[10px] font-medium text-muted-foreground">{row.label}</p>
                                        <div className="mt-1 flex items-start gap-1.5 text-[10px] leading-4">
                                          <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">{row.before || '未设置'}</span>
                                          <ArrowRight size={9} className="mt-0.5 shrink-0 text-muted-foreground" />
                                          <span className={cn('min-w-0 flex-1 whitespace-pre-wrap', row.changed ? 'text-foreground' : 'text-muted-foreground')}>{row.after}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                    这份草稿还没有填写 project_style。
                                  </div>
                                )}

                                {allEntries.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">兼容旧草稿：以下设定/素材需求项不属于新的 project_proposal 边界，请迁移到设定工作台或素材需求工作台。</p>
                                    {allEntries.map((entry) => {
                                      const isHandled = entry.applied
                                      const isRejected = draftEntryDecisions[entry.key] === 'rejected'
                                      const rows = buildProjectProposalEntryDiffRows(entry, data, referenceLabels)
                                      return (
                                        <div key={entry.key} className={cn(
                                          'rounded-md border px-2.5 py-2',
                                          entry.changeType === 'deleted'
                                            ? 'border-rose-500/40 bg-rose-500/5'
                                            : entry.changeType === 'unchanged'
                                              ? 'border-border/60 bg-muted/20'
                                              : 'border-border/70 bg-card',
                                        )}>
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[10px] font-medium text-foreground">{formatDraftEntry(entry)}</span>
                                                <Badge variant={entry.changeType === 'deleted' ? 'destructive' : entry.changeType === 'added' ? 'secondary' : 'outline'} className="h-5 rounded-full px-1.5 text-[9px]">
                                                  {entry.changeType === 'deleted' ? <Trash2 size={9} /> : null}
                                                  {draftEntryChangeLabel(entry)}
                                                </Badge>
                                                {entry.inferred ? <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px]">缺席推断</Badge> : null}
                                                <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px]">{draftEntryLabel(entry)}</Badge>
                                                {isHandled ? <Badge variant="success" className="h-5 rounded-full px-1.5 text-[9px]">已处理</Badge> : null}
                                                {isRejected ? <Badge variant="destructive" className="h-5 rounded-full px-1.5 text-[9px]">已忽略</Badge> : null}
                                              </div>
                                              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{entry.detail}</p>
                                              <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                                                项目标准工作台不再提交设定或素材需求；请在对应工作台新建/导入为 setting_proposal 或 asset_proposal 后审阅。
                                              </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                              {isRejected ? (
                                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => clearDraftEntryDecision(entry.key)}>
                                                  恢复
                                                </Button>
                                              ) : (
                                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setDraftEntryDecision(entry.key, 'rejected')}>
                                                  忽略
                                                </Button>
                                              )}
                                            </div>
                                          </div>

                                          {rows.length > 0 ? (
                                            <div className="mt-2 space-y-1 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1">
                                              {rows.map((row, index) => (
                                                <div key={`${entry.key}-${row.label}-${index}`} className="flex items-start gap-1.5 text-[10px] leading-4">
                                                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-muted-foreground">{row.label}</span>
                                                  <span className={cn('min-w-0 flex-1 truncate', row.before ? 'line-through text-muted-foreground' : 'text-muted-foreground')}>
                                                    {row.before || '新增'}
                                                  </span>
                                                  <ArrowRight size={9} className="mt-0.5 shrink-0 text-muted-foreground" />
                                                  <span className={cn(
                                                    'min-w-0 flex-1 truncate',
                                                    row.tone === 'added' ? 'text-emerald-700 dark:text-emerald-300' : row.tone === 'deleted' ? 'text-rose-700 dark:text-rose-300' : 'text-foreground',
                                                  )}>
                                                    {row.after || '未填写'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="mt-2 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                                              没有可展示的字段差异。
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                    这份草稿没有可展示的 diff。
                                  </div>
                                )}

                                {proposalView.impactNotes.length > 0 ? (
                                  <div className="space-y-1 rounded-md border border-border bg-background/70 p-2">
                                    <p className="text-[10px] font-medium text-foreground">影响说明</p>
                                    {proposalView.impactNotes.slice(0, 4).map((note, index) => (
                                      <p key={`${draft.id}-impact-${index}`} className="text-[10px] leading-4 text-muted-foreground">{note}</p>
                                    ))}
                                  </div>
                                ) : null}

                                <div className="rounded-md border border-border bg-muted/20 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-medium text-foreground">历史</p>
                                    <Button size="sm" variant="outline" className="h-6 gap-1.5 px-2 text-[10px]" asChild>
                                      <Link to="/agent/drafts">
                                        <FileText size={12} />
                                        查看全部
                                      </Link>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                无法解析这份草稿的差异。
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </section>
              )}
            </div>
          )}
        </main>
      </div>

    </div>
  )
}

function MiniMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={12} />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function EmptyBlock({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('rounded-md border border-dashed border-border bg-background text-center', compact ? 'px-3 py-4' : 'px-4 py-6')}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function dedupeDrafts(drafts: AgentDraft[]) {
  const seen = new Set<string>()
  const result: AgentDraft[] = []
  for (const draft of drafts) {
    if (seen.has(draft.id)) continue
    seen.add(draft.id)
    result.push(draft)
  }
  return result
}

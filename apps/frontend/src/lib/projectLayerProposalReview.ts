import type { AgentDraft } from './localAgentClient'
import { isRecord } from '@/lib/jsonValue'

export { isRecord } from '@/lib/jsonValue'

export type ProjectLayerProposalEntryKind = 'creative_references' | 'asset_slots'
export type ProjectLayerProposalEntryChangeType = 'added' | 'modified' | 'deleted' | 'unchanged'

export interface ProjectLayerProposalRecord {
  ID: number
  id?: number
  title?: string
  name?: string
  label?: string
  description?: string
  summary?: string
  content?: string
  kind?: string
  status?: string
  owner?: unknown
  owner_id?: number | string | null
  owner_type?: string
  creative_reference_id?: number | string | null
  reference_id?: number | string | null
  [key: string]: unknown
}

export interface ProjectLayerProposalData {
  creativeReferences: ProjectLayerProposalRecord[]
  assetSlots: ProjectLayerProposalRecord[]
}

export interface ProjectLayerProposalEntry {
  key: string
  kind: ProjectLayerProposalEntryKind
  index: number
  changeType: ProjectLayerProposalEntryChangeType
  inferred?: boolean
  applied: boolean
  label: string
  detail: string
  target?: string
  ownerKey?: string
  raw: Record<string, unknown>
}

export interface ProjectLayerProposalView {
  mode: 'snapshot'
  summary: string
  creativeReferences: ProjectLayerProposalEntry[]
  assetSlots: ProjectLayerProposalEntry[]
  impactNotes: string[]
}

export interface ProjectLayerProposalDiffRow {
  label: string
  before?: string
  after: string
  tone: 'added' | 'modified' | 'deleted' | 'unchanged'
}

export function parseProjectLayerProposalDraft(
  draft: AgentDraft,
  data: ProjectLayerProposalData,
  options: { includeCreativeReferences?: boolean; includeAssetSlots?: boolean } = {},
): ProjectLayerProposalView | null {
  const includeCreativeReferences = options.includeCreativeReferences ?? true
  const includeAssetSlots = options.includeAssetSlots ?? true
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : {}
    const mode = 'snapshot' as const
    const appliedEntryKeys = draftAppliedEntryKeySet(draft)

    const creativeReferences = includeCreativeReferences
      ? asRecordArray(proposal.creative_references).map((item, index) => ({
        key: `${draft.id}:creative_references:${index}`,
        kind: 'creative_references' as const,
        index,
        changeType: inferProjectLayerEntryChangeType('creative_references', item, data),
        applied: appliedEntryKeys.has(`${draft.id}:creative_references:${index}`),
        label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `设定建议 #${index + 1}`),
        detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
        target: typeof item.id === 'number' ? `合并到 #${item.id}` : '新增候选',
        raw: item,
      }))
      : []

    const assetSlots = includeAssetSlots
      ? asRecordArray(proposal.asset_slots).map((item, index) => ({
        key: `${draft.id}:asset_slots:${index}`,
        kind: 'asset_slots' as const,
        index,
        changeType: inferProjectLayerEntryChangeType('asset_slots', item, data),
        applied: appliedEntryKeys.has(`${draft.id}:asset_slots:${index}`),
        label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `素材需求 #${index + 1}`),
        detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
        target: typeof item.id === 'number' ? `调整 #${item.id}` : '新增候选',
        ownerKey: asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['creative_reference_id', 'owner_id', 'reference_id']), ''),
        raw: item,
      }))
      : []

    const snapshotDeleted = mode === 'snapshot'
      ? inferSnapshotDeletionEntries(draft, proposal, data, appliedEntryKeys, { includeCreativeReferences, includeAssetSlots })
      : { creativeReferences: [], assetSlots: [] }

    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...asRecordArray(content.impactNotes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
      ...(Array.isArray(content.impactNotes) ? content.impactNotes.map((item) => asString(item)).filter(Boolean) : []),
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

export function buildProjectLayerDraftContentForEntries(
  draft: AgentDraft,
  entries: ProjectLayerProposalEntry[],
  data: ProjectLayerProposalData,
  summary?: string,
) {
  const content = JSON.parse(draft.content) as Record<string, unknown>
  const proposal = isRecord(content.proposal) ? { ...content.proposal } : {}
  const ownsCreativeReferences = draft.kind === 'setting_proposal'
  const ownsAssetSlots = draft.kind === 'asset_proposal'
  const creativeReferenceSnapshot = data.creativeReferences.map(projectLayerCreativeReferenceSnapshot)
  const assetSlotSnapshot = data.assetSlots.map(projectLayerAssetSlotSnapshot)
  const creativeReferences = ownsCreativeReferences
    ? applyProjectLayerEntriesToSnapshot(
      creativeReferenceSnapshot,
      entries.filter((entry) => entry.kind === 'creative_references'),
    )
    : []
  const assetSlots = ownsAssetSlots
    ? applyProjectLayerEntriesToSnapshot(
      assetSlotSnapshot,
      entries
        .filter((entry) => entry.kind === 'asset_slots')
        .map((entry) => ({
          ...entry,
          raw: rebaseAssetSlotOwner(entry.raw, data),
        })),
    )
    : []

  return JSON.stringify({
    ...content,
    mode: 'snapshot',
    ...(summary ? { summary } : {}),
    snapshot_base: {
      creative_references: creativeReferenceSnapshot,
      asset_slots: assetSlotSnapshot,
    },
    proposal: {
      ...proposal,
      creative_references: creativeReferences,
      asset_slots: assetSlots,
    },
  }, null, 2)
}

function applyProjectLayerEntriesToSnapshot(base: Record<string, unknown>[], entries: ProjectLayerProposalEntry[]) {
  const next = [...base]
  for (const entry of entries) {
    const id = numberOf(entry.raw.id)
    if (entry.changeType === 'deleted') {
      if (id > 0) {
        const index = next.findIndex((item) => numberOf(item.id) === id)
        if (index >= 0) next.splice(index, 1)
      }
      continue
    }
    if (id > 0) {
      const index = next.findIndex((item) => numberOf(item.id) === id)
      if (index >= 0) {
        next[index] = { ...next[index], ...entry.raw }
      } else {
        next.push(entry.raw)
      }
    } else {
      next.push(entry.raw)
    }
  }
  return next
}

function projectLayerCreativeReferenceSnapshot(record: ProjectLayerProposalRecord): Record<string, unknown> {
  return {
    id: record.ID,
    name: titleOf(record, `设定 #${record.ID}`),
    kind: String(record.kind ?? ''),
    alias: String(record.alias ?? ''),
    description: String(record.description ?? ''),
    content: String(record.content ?? ''),
    importance: String(record.importance ?? ''),
    status: String(record.status ?? ''),
    profile_json: String(record.profile_json ?? ''),
    tags_json: String(record.tags_json ?? ''),
  }
}

function projectLayerAssetSlotSnapshot(record: ProjectLayerProposalRecord): Record<string, unknown> {
  return {
    id: record.ID,
    owner: record.creative_reference_id ? { type: 'creative_reference', id: record.creative_reference_id } : undefined,
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
  }
}

function rebaseAssetSlotOwner(item: Record<string, unknown>, data: ProjectLayerProposalData): Record<string, unknown> {
  const resolvedReferenceID = resolveAssetSlotOwnerReferenceID(item, data)
  if (resolvedReferenceID <= 0) return item
  const owner = isRecord(item.owner) ? item.owner : {}
  return {
    ...item,
    owner: {
      ...owner,
      type: 'creative_reference',
      id: resolvedReferenceID,
    },
    creative_reference_id: resolvedReferenceID,
  }
}

function resolveAssetSlotOwnerReferenceID(item: Record<string, unknown>, data: ProjectLayerProposalData) {
  const currentReferenceIds = new Set(data.creativeReferences.map((reference) => reference.ID).filter((id) => id > 0))
  const owner = isRecord(item.owner) ? item.owner : undefined
  const ownerID = numberOf(owner?.id ?? item.creative_reference_id ?? item.owner_id)
  if (ownerID > 0 && currentReferenceIds.has(ownerID)) return ownerID

  const ownerClientID = asKey(owner?.client_id ?? item.creative_reference_client_id, '')
  if (ownerClientID) {
    const matchedByClientID = data.creativeReferences.find((reference) => asKey(reference.proposal_client_id, '') === ownerClientID)
    if (matchedByClientID?.ID) return matchedByClientID.ID
  }

  const itemText = searchableProjectLayerText(item)
  const matchedByName = uniqueProjectLayerReferenceMatch(data.creativeReferences, (referenceText, reference) => {
    const name = asString(reference.name ?? reference.title ?? reference.label, '')
    return name.length >= 2 && itemText.includes(normalizeSearchText(name))
  })
  if (matchedByName?.ID) return matchedByName.ID

  const matchedByRole = uniqueProjectLayerReferenceMatch(data.creativeReferences, (referenceText) => {
    const roleTokens = ['女主', '男主', '萌宝', '女配', '男配', '爷爷', '奶奶', '父亲', '母亲', '反派']
    return roleTokens.some((token) => itemText.includes(token) && referenceText.includes(token))
  })
  return matchedByRole?.ID ?? 0
}

function uniqueProjectLayerReferenceMatch(
  references: ProjectLayerProposalRecord[],
  predicate: (referenceText: string, reference: ProjectLayerProposalRecord) => boolean,
): ProjectLayerProposalRecord | undefined {
  const matches = references.filter((reference) => predicate(searchableProjectLayerText(reference), reference))
  return matches.length === 1 ? matches[0] : undefined
}

function searchableProjectLayerText(record: Record<string, unknown>) {
  return normalizeSearchText([
    record.name,
    record.title,
    record.label,
    record.kind,
    record.alias,
    record.description,
    record.summary,
    record.content,
  ].map((value) => (typeof value === 'string' ? value : '')).join(' '))
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

export function buildProjectLayerProposalEntryDiffRows(
  entry: ProjectLayerProposalEntry,
  data: ProjectLayerProposalData,
  referenceLabels: Map<string, string> = new Map(),
): ProjectLayerProposalDiffRow[] {
  const current = draftEntryCurrentRecord(entry, data)
  const rows: ProjectLayerProposalDiffRow[] = []

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
  const currentField = (keys: string[]) => {
    for (const key of keys) {
      if (currentFields[key] !== undefined) return currentFields[key]
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
      ? asKey(isRecord(current.owner) ? current.owner.client_id ?? current.owner.id : proposalField(current, ['creative_reference_id', 'owner_id', 'reference_id']), '')
      : ''
    const proposedOwnerId = asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['creative_reference_id', 'owner_id', 'reference_id']), '')
    const currentOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, currentOwnerId)
    const proposedOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, proposedOwnerId)
    if (entry.changeType === 'added' || currentOwnerLabel !== proposedOwnerLabel) {
      rows.push({
        label: '归属',
        before: entry.changeType === 'added' ? '' : currentOwnerLabel,
        after: proposedOwnerLabel,
        tone: entry.changeType === 'added' ? 'added' : 'modified',
      })
    }

    pushField('元数据', currentField(['metadata_json']), proposedField(['metadata_json']))
  }

  return rows
}

export function formatProjectLayerProposalEntry(entry: ProjectLayerProposalEntry) {
  return [entry.label, entry.target].filter(Boolean).join(' · ')
}

export function projectLayerProposalEntryLabel(entry: ProjectLayerProposalEntry) {
  return entry.kind === 'creative_references' ? '设定资料' : '素材需求'
}

export function projectLayerProposalEntryChangeLabel(entry: ProjectLayerProposalEntry) {
  if (entry.changeType === 'added') return '新增'
  if (entry.changeType === 'deleted') return '删除'
  if (entry.changeType === 'unchanged') return '保留'
  return '修改'
}

export function draftAppliedEntryKeySet(draft: AgentDraft) {
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  const appliedEntryKeys = Array.isArray(metadata.appliedEntryKeys) ? metadata.appliedEntryKeys : []
  return new Set(appliedEntryKeys.map((value) => asKey(value, '')).filter(Boolean))
}

function inferProjectLayerEntryChangeType(
  kind: ProjectLayerProposalEntryKind,
  item: Record<string, unknown>,
  data: ProjectLayerProposalData,
): ProjectLayerProposalEntryChangeType {
  const status = asString(proposalField(item, ['status']), '')
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  const id = numberOf(item.id)
  if (id <= 0) return 'added'
  const current = kind === 'creative_references'
    ? data.creativeReferences.find((record) => record.ID === id)
    : data.assetSlots.find((record) => record.ID === id)
  if (!current) return 'modified'
  return projectLayerRecordHasFieldDiff(kind, item, current) ? 'modified' : 'unchanged'
}

function projectLayerRecordHasFieldDiff(kind: ProjectLayerProposalEntryKind, item: Record<string, unknown>, current: ProjectLayerProposalRecord): boolean {
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
  proposal: Record<string, unknown>,
  data: ProjectLayerProposalData,
  appliedEntryKeys: Set<string>,
  options: { includeCreativeReferences: boolean; includeAssetSlots: boolean },
): { creativeReferences: ProjectLayerProposalEntry[]; assetSlots: ProjectLayerProposalEntry[] } {
  const proposedReferenceIds = new Set(asRecordArray(proposal.creative_references).map((item) => numberOf(item.id)).filter((id) => id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(proposal.asset_slots).map((item) => numberOf(item.id)).filter((id) => id > 0))

  const creativeReferences = options.includeCreativeReferences
    ? data.creativeReferences
      .filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
      .flatMap((record, index) => {
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
            name: titleOf(record, `设定 #${record.ID}`),
            status: 'ignored',
            description: bodyOf(record, ''),
          },
        }]
      })
    : []

  const assetSlots = options.includeAssetSlots
    ? data.assetSlots
      .filter((record) => !['ignored', 'waived', 'merged'].includes(String(record.status ?? '')))
      .flatMap((record, index) => {
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
            name: titleOf(record, `素材需求 #${record.ID}`),
            status: 'waived',
            kind: String(record.kind ?? 'image'),
            description: bodyOf(record, ''),
          },
        }]
      })
    : []

  return { creativeReferences, assetSlots }
}

function draftEntryCurrentRecord(entry: ProjectLayerProposalEntry, data: ProjectLayerProposalData) {
  const id = numberOf(entry.raw.id)
  if (id <= 0) return null
  if (entry.kind === 'creative_references') return data.creativeReferences.find((record) => record.ID === id) ?? null
  return data.assetSlots.find((record) => record.ID === id) ?? null
}

function draftEntryOwnerLabel(entry: ProjectLayerProposalEntry, referenceLabels: Map<string, string>, rawOwnerValue?: string) {
  if (rawOwnerValue) return referenceLabels.get(rawOwnerValue) ?? rawOwnerValue
  if (entry.ownerKey) return referenceLabels.get(entry.ownerKey) ?? entry.ownerKey
  return '未绑定设定'
}

export function draftEntryFieldText(value: unknown) {
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

function titleOf(record: ProjectLayerProposalRecord, fallback: string) {
  return asString(record.title, asString(record.name, asString(record.label, fallback)))
}

function bodyOf(record: ProjectLayerProposalRecord, fallback = '暂无说明') {
  return asString(record.description, asString(record.summary, asString(record.content, fallback)))
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function asKey(value: unknown, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return asString(value, fallback)
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function proposalField(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
  }
  return undefined
}

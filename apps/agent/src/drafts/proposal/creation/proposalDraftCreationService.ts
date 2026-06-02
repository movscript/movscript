import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/drafts'
import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import type { DraftProposalSnapshotHydrationPort } from '../../../ports/draft/hydration/proposalSnapshotHydrationPort.js'
import type { AgentRun, JSONValue } from '../../../state/shared/types.js'
import {
  type AgentDraftKind,
  type AgentDraftSource,
  type AgentDraftStore,
  type AgentDraftTarget,
} from '../../store/draftStore.js'
import {
  isValidAgentEntityId,
  isValidAgentProjectId,
  isValidAgentReferenceId,
} from '../../../context/runtime/runtimeContext.js'
import {
  normalizeAssetProposalSnapshotSlot,
  normalizeAssetProposalSnapshotSlots,
  normalizeSettingProposalSnapshotReferences,
  normalizedNumber,
} from '../snapshot/proposalSnapshotNormalization.js'

interface PreparedProposalDraftContent {
  content: string
  seed?: JSONValue
  hydratedProposalBase?: boolean
  seededProposalSnapshot?: boolean
}

export async function createProposalDraft(
  draftStore: AgentDraftStore,
  run: AgentRun,
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort,
  args: Record<string, JSONValue>,
  signal?: AbortSignal,
): Promise<JSONValue> {
  const kind = normalizeProposalDraftKind(args.kind)
  if (!kind) throw new Error('create_proposal requires kind')
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const pageContext = extractPageContext(run)
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(args.projectId)
    ?? projectIdField(args.project_id)
    ?? projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_proposal' && projectId === undefined) {
    throw new Error('create_proposal requires projectId for project_standards_proposal')
  }
  const target = normalizeProposalDraftTarget(args.target)
    ?? inferProposalDraftTarget(kind, projectId, context, pageContext, args)
  const title = stringField(args.title) ?? defaultProposalDraftTitle(kind, projectId, target)
  const rawContent = normalizeProposalDraftContent(args.content)
  if (rawContent === undefined) throw new Error('create_proposal requires content')
  const prepared = await prepareProposalDraftContent({
    kind,
    content: rawContent,
    target,
    proposalSnapshotHydrationPort,
    signal,
  })
  const content = prepared.content
  validateStructuredProposalDraftContent(kind, content)
  const source = normalizeProposalDraftSource(args.source, run, context, pageContext)
  const seed = args.seed ?? prepared.seed
  const draft = draftStore.createDraft({
    projectId,
    kind,
    title,
    content,
    source,
    target,
    seed,
    createdByRunId: run.id,
    createdByThreadId: run.threadId,
    metadata: {
      ...(isJSONRecord(args.metadata) ? args.metadata : {}),
      proposal: true,
      proposalKind: kind,
      producer: 'conversation',
      ...(projectId !== undefined ? { projectId } : {}),
      ...(isJSONRecord(target) ? { target } : {}),
      ...(typeof source.pageKey === 'string' ? { pageKey: source.pageKey } : {}),
      ...(prepared.hydratedProposalBase ? { proposalBaseHydrated: true } : {}),
      ...(prepared.seededProposalSnapshot ? { proposalSnapshotSeeded: true } : {}),
    },
  })
  return {
    proposalRef: draft.id,
    draftRef: draft.id,
    draftId: draft.id,
    draft: draft as unknown as JSONValue,
    status: 'created',
    message: 'Created a local proposal review draft from the conversation.',
  } as unknown as JSONValue
}

async function prepareProposalDraftContent(input: {
  kind: AgentDraftKind
  content: string
  target?: AgentDraftTarget
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  signal?: AbortSignal
}): Promise<PreparedProposalDraftContent> {
  const kind = input.kind
  if (kind !== 'setting_proposal' && kind !== 'asset_proposal') {
    return { content: input.content }
  }
  const originalParsed = parseProposalDraftContent(kind, input.content)
  const parsed = normalizeProjectLayerProposalSnapshotContent(kind, originalParsed)
  const normalizedSnapshotContent = JSON.stringify(parsed) !== JSON.stringify(originalParsed)
  if (!hasProjectLayerTarget(input.target)) {
    const contentWithoutBase = removeProjectLayerSnapshotBase(parsed)
    if (!normalizedSnapshotContent && JSON.stringify(contentWithoutBase) === JSON.stringify(originalParsed)) return { content: input.content }
    return { content: JSON.stringify(contentWithoutBase, null, 2) }
  }

  const hydrated = await input.proposalSnapshotHydrationPort.hydrateProjectLayerSnapshotBase({
    kind,
    ...(input.target ? { target: input.target } : {}),
    signal: input.signal,
  })
  const seeded = seedProjectLayerProposalSnapshot(kind, removeProjectLayerSnapshotBase(parsed), hydrated.snapshotBase)
  return {
    content: JSON.stringify(seeded.content, null, 2),
    seed: hydrated.seed,
    hydratedProposalBase: true,
    ...(seeded.changed ? { seededProposalSnapshot: true } : {}),
  }
}

function normalizeProposalDraftKind(value: JSONValue | undefined): AgentDraftKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'setting_proposal') return 'setting_proposal'
  if (normalized === 'project_standards_proposal') return 'project_standards_proposal'
  if (normalized === 'production_proposal') return 'production_proposal'
  if (normalized === 'content_unit_proposal') return 'content_unit_proposal'
  if (normalized === 'asset_proposal') return 'asset_proposal'
  return undefined
}

export function isStructuredProposalDraftKind(value: JSONValue | undefined): boolean {
  return value === 'setting_proposal'
    || value === 'asset_proposal'
    || value === 'project_standards_proposal'
    || value === 'production_proposal'
    || value === 'content_unit_proposal'
}

function normalizeProposalDraftContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isJSONRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
}

function validateStructuredProposalDraftContent(kind: AgentDraftKind, content: string): Record<string, JSONValue> | undefined {
  const requiredSchema = kind === 'setting_proposal'
    ? DRAFT_CONTENT_SCHEMA_IDS.settingProposal
    : kind === 'project_standards_proposal'
      ? DRAFT_CONTENT_SCHEMA_IDS.projectStandardsProposal
      : kind === 'production_proposal'
        ? DRAFT_CONTENT_SCHEMA_IDS.productionProposal
        : kind === 'asset_proposal'
          ? DRAFT_CONTENT_SCHEMA_IDS.assetProposal
          : kind === 'content_unit_proposal'
            ? DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal
            : undefined
  if (!requiredSchema) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON with schema ${requiredSchema}`)
  }
  if (!isJSONRecord(parsed) || parsed.schema !== requiredSchema) {
    throw new Error(`create_proposal ${kind} content must include schema ${requiredSchema}`)
  }
  return parsed
}

function normalizeProposalDraftTarget(value: unknown): AgentDraftTarget | undefined {
  if (!isJSONRecord(value)) return undefined
  const target: AgentDraftTarget = {
    ...(typeof value.entityType === 'string' && value.entityType.trim() ? { entityType: value.entityType.trim() } : {}),
    ...(isValidAgentReferenceId(value.entityId) ? { entityId: value.entityId } : {}),
    ...(isValidAgentProjectId(value.projectId) ? { projectId: value.projectId } : {}),
    ...(typeof value.field === 'string' && value.field.trim() ? { field: value.field.trim() } : {}),
  }
  return Object.keys(target).length > 0 ? target : undefined
}

function inferProposalDraftTarget(
  kind: AgentDraftKind,
  projectId: number | undefined,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
  args: Record<string, JSONValue>,
): AgentDraftTarget | undefined {
  const productionId = entityIdField(args.productionId)
    ?? entityIdField(args.production_id)
    ?? entityIdField(context?.productionId)
    ?? entityIdField(pageContext.pageEntityType === 'production' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'project',
      ...(projectId !== undefined ? { entityId: projectId } : {}),
      field: 'proposal',
    }
  }
  if (kind === 'production_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'production',
      ...(productionId !== undefined ? { entityId: productionId } : {}),
      field: 'proposal',
    }
  }
  if (kind === 'content_unit_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      ...(productionId !== undefined ? { entityType: 'production', entityId: productionId } : {}),
      field: 'proposal',
    }
  }
  return projectId !== undefined ? { projectId } : undefined
}

function normalizeProposalDraftSource(
  value: unknown,
  run: AgentRun,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
): AgentDraftSource {
  const source = isJSONRecord(value) ? { ...value } : {}
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  return {
    ...source,
    runId: run.id,
    threadId: run.threadId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...extractPageContext(run),
    producer: 'conversation',
  }
}

function defaultProposalDraftTitle(
  kind: AgentDraftKind,
  projectId: number | undefined,
  target: AgentDraftTarget | undefined,
): string {
  const projectLabel = projectId !== undefined ? `#${projectId}` : 'conversation'
  if (kind === 'project_standards_proposal') return `项目规范提案 - ${projectLabel}`
  if (kind === 'production_proposal') {
    const targetLabel = target?.entityId !== undefined ? `#${String(target.entityId)}` : projectLabel
    return `制作提案 - ${targetLabel}`
  }
  if (kind === 'content_unit_proposal') return `内容单元提案 - ${projectLabel}`
  return `提案草稿 - ${kind}`
}

export function extractPageContext(run: AgentRun): Record<string, JSONValue> {
  const clientInput = isJSONRecord(run.metadata?.clientInput) ? run.metadata.clientInput : undefined
  const uiSnapshot = isJSONRecord(clientInput?.uiSnapshot) ? clientInput.uiSnapshot : undefined
  const pageContext = isJSONRecord(uiSnapshot?.pageContext) ? uiSnapshot.pageContext : undefined
  const route = isJSONRecord(uiSnapshot?.route) ? uiSnapshot.route : undefined
  const selection = isJSONRecord(uiSnapshot?.selection) ? uiSnapshot.selection : undefined
  return {
    ...(typeof pageContext?.pageKey === 'string' ? { pageKey: pageContext.pageKey } : {}),
    ...(typeof pageContext?.pageType === 'string' ? { pageType: pageContext.pageType } : {}),
    ...(typeof pageContext?.pageRoute === 'string' ? { pageRoute: pageContext.pageRoute } : typeof route?.pathname === 'string' ? { pageRoute: route.pathname } : {}),
    ...(typeof pageContext?.pageEntityType === 'string' ? { pageEntityType: pageContext.pageEntityType } : typeof selection?.entityType === 'string' ? { pageEntityType: selection.entityType } : {}),
    ...(isValidAgentReferenceId(pageContext?.pageEntityId)
      ? { pageEntityId: pageContext.pageEntityId }
      : isValidAgentReferenceId(selection?.entityId)
        ? { pageEntityId: selection.entityId }
        : {}),
    ...(typeof pageContext?.draftId === 'string' ? { draftId: pageContext.draftId } : {}),
  }
}

function parseProposalDraftContent(kind: AgentDraftKind, content: string): Record<string, JSONValue> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON`)
  }
  if (!isJSONRecord(parsed)) throw new Error(`create_proposal ${kind} content must be a JSON object`)
  return parsed
}

function hasProjectLayerTarget(target: AgentDraftTarget | undefined): boolean {
  if (!isJSONRecord(target)) return false
  return projectIdField(target.projectId) !== undefined || projectIdField(target.entityId) !== undefined
}

function removeProjectLayerSnapshotBase(parsed: Record<string, JSONValue>): Record<string, JSONValue> {
  const rest = { ...parsed }
  delete rest.snapshot_base
  return rest
}

function mergeHydratedProjectLayerBaseIntoProposal(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
  hydratedSnapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  const field = kind === 'setting_proposal' ? 'creative_references' : 'asset_slots'
  const hydratedItems = Array.isArray(hydratedSnapshotBase[field]) ? hydratedSnapshotBase[field] : []
  const proposal = isJSONRecord(parsed.proposal) ? parsed.proposal : {}
  const proposedItems = Array.isArray(proposal[field]) ? proposal[field] : undefined
  const shouldSeedWithHydratedItems = proposedItems === undefined
    || proposedItems.length === 0
    || (hydratedItems.length > 0 && proposedItems.every(isNewSnapshotNode))
  if (!shouldSeedWithHydratedItems) return { content: parsed, changed: false }
  const nextItems = proposedItems !== undefined && proposedItems.length > 0
    ? [...cloneJSONValue(hydratedItems), ...proposedItems]
    : cloneJSONValue(hydratedItems)
  return {
    content: {
      ...parsed,
      proposal: {
        ...proposal,
        [field]: nextItems,
      },
    },
    changed: true,
  }
}

function isNewSnapshotNode(value: JSONValue): boolean {
  if (!isJSONRecord(value)) return true
  return normalizedNumber(value.id) === undefined && normalizedNumber(value.ID) === undefined
}

function normalizeProjectLayerProposalSnapshotContent(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const proposal = isJSONRecord(parsed.proposal) ? parsed.proposal : undefined
  const nextProposal = proposal && kind === 'setting_proposal' && Array.isArray(proposal.creative_references)
    ? { ...proposal, creative_references: normalizeSettingProposalSnapshotReferences(proposal.creative_references) }
    : proposal && kind === 'asset_proposal' && Array.isArray(proposal.asset_slots)
      ? { ...proposal, asset_slots: normalizeAssetProposalSnapshotSlots(proposal.asset_slots) }
      : proposal
  const nextSlot = kind === 'asset_proposal' && isJSONRecord(parsed.slot)
    ? normalizeAssetProposalSnapshotSlot(parsed.slot)
    : undefined
  return {
    ...parsed,
    ...(nextProposal ? { proposal: nextProposal } : {}),
    ...(nextSlot ? { slot: nextSlot } : {}),
  }
}

function seedProjectLayerProposalSnapshot(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
  snapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  return mergeHydratedProjectLayerBaseIntoProposal(kind, parsed, snapshotBase)
}

function cloneJSONValue<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}

import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { contentUnitAdapterFor, hasSpecializedContentUnitAdapter } from './contentProductionAdapters.js'
import {
  canonicalEntities,
  entityDir,
  idField,
  readSelectedContentUnit,
  requiredString,
  stableJsonValue,
  stringField,
} from './contentProductionHelpers.js'
import type {
  ContentUnitDerivedArtifactBundle,
  ContentUnitDependencyReport,
  ContentUnitSelectionValidity,
  NormalizedContentUnitPrompt,
} from './contentProductionTypes.js'

export { hasSpecializedContentUnitAdapter }
export type {
  ContentUnitDerivedArtifactBundle,
  ContentUnitDependencyReport,
  ContentUnitOutputKind,
  ContentUnitPromptBlocker,
  ContentUnitPromptRef,
  ContentUnitPromptRefKind,
  ContentUnitResolvedRef,
  ContentUnitRuntimePanel,
  ContentUnitRuntimePanelStatus,
  ContentUnitSelectionValidity,
  ContentUnitUpstreamSelection,
  NormalizedContentUnitPrompt,
} from './contentProductionTypes.js'

const INTERPRETER_VERSION = 'movscript-interpreter@0.2.0'

export function deriveContentUnitArtifacts(
  index: MovScriptWorkspaceDomainIndex,
  input: { createdAt: string; interpreterVersion?: string },
): ContentUnitDerivedArtifactBundle[] {
  return canonicalEntities(index)
    .filter((entity) => entity.entityKind === 'content_unit' && entity.id !== undefined)
    .map((contentUnit) => deriveContentUnitArtifact(index, contentUnit, {
      createdAt: input.createdAt,
      interpreterVersion: input.interpreterVersion ?? INTERPRETER_VERSION,
    }))
}

export function deriveContentUnitArtifact(
  index: MovScriptWorkspaceDomainIndex,
  contentUnit: MovScriptWorkspaceIndexedEntity,
  input: { createdAt: string; interpreterVersion?: string },
): ContentUnitDerivedArtifactBundle {
  if (contentUnit.id === undefined) throw new Error(`content_unit missing id: ${contentUnit.path}`)
  const contentUnitType = requiredString(contentUnit.record.content_unit_type, `content_unit_type missing: ${contentUnit.path}`)
  const adapter = contentUnitAdapterFor(contentUnitType)
  const context = {
    index,
    contentUnit,
    interpreterVersion: input.interpreterVersion ?? INTERPRETER_VERSION,
    createdAt: input.createdAt,
  }
  const issues = adapter.validate(context)
  const generationPrompt = adapter.derivePrompt(context)
  const dependencies = adapter.collectDependencies(context, generationPrompt)
  const runtimePanel = adapter.deriveRuntimePanel(context, { dependencies, prompt: generationPrompt })
  const dependencyReport: ContentUnitDependencyReport = {
    schema: 'movscript.content_unit_dependency_report.v1',
    content_unit_ref: entityDir(contentUnit.path),
    content_unit_type: contentUnitType,
    dependencies: Object.entries(dependencies.entities).flatMap(([role, entities]) => {
      return entities.map((entity) => ({
        role,
        entityKind: entity.entityKind,
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
      }))
    }),
    refs: dependencies.refs,
    upstream_selections: dependencies.upstreamSelections,
    ...(dependencies.blockers.length > 0 ? { blockers: dependencies.blockers } : {}),
    issues,
  }
  const selectionValidity = selectionValidityFor(index, contentUnit, generationPrompt)
  return {
    contentUnitId: contentUnit.id,
    contentUnitPath: contentUnit.path,
    runtimePanel,
    generationPrompt,
    dependencyReport,
    selectionValidity,
  }
}

function selectionValidityFor(
  index: MovScriptWorkspaceDomainIndex,
  contentUnit: MovScriptWorkspaceIndexedEntity,
  currentPrompt: NormalizedContentUnitPrompt,
): ContentUnitSelectionValidity {
  const selection = readSelectedContentUnit(index, entityDir(contentUnit.path))
  const stalePolicy = selection?.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict'
  const selectedCandidateId = idField(selection?.candidate_id)
  const selectedResourceId = idField(selection?.resource_id)
  const candidate = selectedCandidateId === undefined
    ? undefined
    : readContentUnitCandidate(index, entityDir(contentUnit.path), selectedCandidateId)
  const candidatePromptRecord = recordField(candidate?.prompt_snapshot)
  const candidatePrompt = isNormalizedContentUnitPrompt(candidatePromptRecord) ? candidatePromptRecord : undefined
  const staleReasons = selection
    ? staleReasonsFor(currentPrompt, {
      candidateId: selectedCandidateId,
      candidate,
      candidatePrompt,
    })
    : []
  return {
    schema: 'movscript.content_unit_selection_validity.v2',
    content_unit_ref: entityDir(contentUnit.path),
    selected: Boolean(selection),
    ...(selectedCandidateId !== undefined ? { candidate_id: selectedCandidateId } : {}),
    ...(selectedResourceId !== undefined ? { resource_id: selectedResourceId } : {}),
    stale: staleReasons.length > 0,
    stale_policy: stalePolicy,
    reason: stringField(selection?.reason),
    ...(staleReasons.length > 0 ? { stale_reasons: staleReasons } : {}),
  }
}

function readContentUnitCandidate(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitRef: string,
  candidateId: string | number,
): Record<string, unknown> | undefined {
  return index.documents.find((document) => {
    if (!document.path.startsWith(`${contentUnitRef}/candidates/`)) return false
    if (!document.path.endsWith('/content_candidate.json')) return false
    if (!recordField(document.data)) return false
    return String((document.data as Record<string, unknown>).id ?? '') === String(candidateId)
  })?.data as Record<string, unknown> | undefined
}

function staleReasonsFor(
  currentPrompt: NormalizedContentUnitPrompt,
  input: {
    candidateId: string | number | undefined
    candidate: Record<string, unknown> | undefined
    candidatePrompt: NormalizedContentUnitPrompt | undefined
  },
): NonNullable<ContentUnitSelectionValidity['stale_reasons']> {
  if (input.candidateId !== undefined && !input.candidate) return ['candidate_missing']
  const candidatePrompt = input.candidatePrompt
  if (!candidatePrompt) return ['candidate_prompt_missing']
  const reasons = new Set<NonNullable<ContentUnitSelectionValidity['stale_reasons']>[number]>()
  if (!sameCanonical(currentPrompt.edit_prompt, candidatePrompt.edit_prompt)) reasons.add('edit_prompt_changed')
  if (!sameCanonical(currentPrompt.model_intent, candidatePrompt.model_intent)) reasons.add('model_intent_changed')
  if (!sameCanonical(refComparisonValue(currentPrompt), refComparisonValue(candidatePrompt))) reasons.add('refs_changed')
  if (!sameCanonical(currentPrompt.runtime_request, candidatePrompt.runtime_request)) reasons.add('runtime_inputs_changed')
  if ((currentPrompt.blockers?.length ?? 0) > 0) reasons.add('prompt_dependency_missing')
  return [...reasons]
}

function refComparisonValue(prompt: NormalizedContentUnitPrompt): unknown {
  return prompt.refs.map((ref) => ({
    kind: ref.kind,
    id: ref.id,
    raw: ref.raw,
    role: ref.role,
    resolved: ref.resolved,
    selection: ref.selection,
  }))
}

function isNormalizedContentUnitPrompt(value: unknown): value is NormalizedContentUnitPrompt {
  const record = recordField(value)
  return record?.schema === 'movscript.content_unit_prompt.v1'
    && Array.isArray(record.refs)
    && recordField(record.runtime_request) !== undefined
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableJsonValue(left ?? null)) === JSON.stringify(stableJsonValue(right ?? null))
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/drafts'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type {
  AgentDraft,
  AgentDraftValidationIssue,
  AgentDraftValidationResult,
} from '../draftStore.js'

export function validateDraft(draft: AgentDraft): AgentDraftValidationResult {
  const issues: AgentDraftValidationIssue[] = []
  if (!draft.title.trim()) {
    issues.push({ path: '/title', message: 'Draft title is required.', severity: 'error' })
  }
  if (!draft.content.trim()) {
    issues.push({ path: '/content', message: 'Draft content is required.', severity: 'error' })
  }
  if (draft.kind === 'setting_proposal') {
    validateProjectLayerProposalDraft(draft, issues, { kind: 'setting' })
  } else if (draft.kind === 'project_standards_proposal') {
    validateProjectLayerProposalDraft(draft, issues, { kind: 'project_standards' })
  } else if (draft.kind === 'content_unit_proposal') {
    validateContentUnitProposalDraft(draft, issues)
  } else if (draft.kind === 'asset_proposal') {
    validateAssetProposalDraft(draft, issues)
  } else if (draft.kind === 'production_proposal') {
    validateProductionProposalDraft(draft, issues)
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    draftId: draft.id,
    kind: draft.kind,
    issues,
  }
}

function validateProjectLayerProposalDraft(
  draft: AgentDraft,
  issues: AgentDraftValidationIssue[],
  options: { kind: 'legacy' | 'setting' | 'asset_requirement' | 'project_standards' } = { kind: 'legacy' },
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Project standards proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Project standards proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  const expectedSchema = options.kind === 'setting'
    ? DRAFT_CONTENT_SCHEMA_IDS.settingProposal
    : options.kind === 'asset_requirement'
      ? DRAFT_CONTENT_SCHEMA_IDS.assetProposal
      : DRAFT_CONTENT_SCHEMA_IDS.projectStandardsProposal
  const expectedScope = options.kind === 'setting'
    ? 'setting_proposal'
    : options.kind === 'asset_requirement'
      ? 'asset_proposal'
      : 'project_standards_proposal'
  if (parsed.schema !== expectedSchema) {
    issues.push({ path: '/schema', message: `Project-level proposal draft schema must be ${expectedSchema}.`, severity: 'error' })
  }
  if (parsed.scope !== expectedScope) {
    issues.push({ path: '/scope', message: `Project-level proposal draft scope must be ${expectedScope}.`, severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Project standards proposal draft mode must be "snapshot".', severity: 'error' })
  }

  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Project standards proposal draft requires proposal.', severity: 'error' })
    return
  }

  if (options.kind === 'project_standards') {
    validateAbsentProjectLayerProposalArray('creative_references', proposal.creative_references, issues)
    validateAbsentProjectLayerProposalArray('asset_slots', proposal.asset_slots, issues)
    if (!isRecord(proposal.project_style)) {
      issues.push({ path: '/proposal/project_style', message: 'Project standards proposal requires proposal.project_style.', severity: 'error' })
    } else {
      validateProjectStyleCustomRules(proposal.project_style.custom_rules, '/proposal/project_style/custom_rules', issues)
    }
  } else {
    if (options.kind === 'setting') {
      validateProjectLayerProposalPatchArray('creative_references', proposal.creative_references, issues)
      validateEmptyProjectLayerProposalArray('asset_slots', proposal.asset_slots, issues)
    } else if (options.kind === 'asset_requirement') {
      validateProjectLayerProposalPatchArray('asset_slots', proposal.asset_slots, issues)
      validateEmptyProjectLayerProposalArray('creative_references', proposal.creative_references, issues)
    } else {
      validateProjectLayerProposalPatchArray('creative_references', proposal.creative_references, issues)
      validateProjectLayerProposalPatchArray('asset_slots', proposal.asset_slots, issues)
    }
  }

  if (parsed.operations !== undefined) {
      issues.push({
        path: '/operations',
        message: 'Project standards proposal drafts must not include operations; edit the proposed backend snapshot directly.',
        severity: 'error',
      })
  }
}

function validateProjectStyleCustomRules(
  value: unknown,
  basePath: string,
  issues: AgentDraftValidationIssue[],
): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'custom_rules must be an array when present.', severity: 'error' })
    return
  }
  const allowedPromptRoles = new Set(['context', 'style', 'constraint', 'negative', 'quality_gate'])
  value.forEach((item, index) => {
    const itemPath = `${basePath}/${index}`
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'custom_rules entries must be objects.', severity: 'error' })
      return
    }
    for (const key of ['key', 'label', 'value'] as const) {
      if (typeof item[key] !== 'string' || !item[key].trim()) {
        issues.push({ path: `${itemPath}/${key}`, message: `custom_rules.${key} must be a non-empty string.`, severity: 'error' })
      }
    }
    if (item.prompt_role !== undefined && (typeof item.prompt_role !== 'string' || !allowedPromptRoles.has(item.prompt_role))) {
      issues.push({ path: `${itemPath}/prompt_role`, message: 'custom_rules.prompt_role must be one of context, style, constraint, negative, quality_gate.', severity: 'error' })
    }
    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
      issues.push({ path: `${itemPath}/enabled`, message: 'custom_rules.enabled must be a boolean when present.', severity: 'error' })
    }
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      issues.push({ path: `${itemPath}/required`, message: 'custom_rules.required must be a boolean when present.', severity: 'error' })
    }
    if (item.order !== undefined && (typeof item.order !== 'number' || !Number.isFinite(item.order))) {
      issues.push({ path: `${itemPath}/order`, message: 'custom_rules.order must be a finite number when present.', severity: 'error' })
    }
  })
}

function validateAbsentProjectLayerProposalArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentDraftValidationIssue[],
): void {
  if (value === undefined) return
  issues.push({ path: `/proposal/${key}`, message: `${key} is outside project_standards_proposal. Use the dedicated proposal kind instead.`, severity: 'error' })
}

function validateEmptyProjectLayerProposalArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentDraftValidationIssue[],
): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `/proposal/${key}`, message: `${key} must be an array when present.`, severity: 'error' })
    return
  }
  if (value.length > 0) {
    issues.push({ path: `/proposal/${key}`, message: `${key} is outside this proposal boundary. Use the dedicated proposal kind instead.`, severity: 'error' })
  }
}

function validateAssetProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Asset proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Asset proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.assetProposal) {
    issues.push({ path: '/schema', message: `Asset proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.assetProposal}.`, severity: 'error' })
  }
  if (parsed.scope !== 'asset_proposal') {
    issues.push({ path: '/scope', message: 'Asset proposal draft scope must be asset_proposal.', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Asset proposal draft requires proposal.', severity: 'error' })
    return
  }
  const requirementItems = Array.isArray(proposal.asset_slots) ? proposal.asset_slots : []
  if (proposal.asset_slots !== undefined) {
    validateProjectLayerProposalPatchArray('asset_slots', proposal.asset_slots, issues)
  }
  if (proposal.creative_references !== undefined) {
    validateEmptyProjectLayerProposalArray('creative_references', proposal.creative_references, issues)
  }
  const plans = proposal.candidate_plans
  if (plans !== undefined && !Array.isArray(plans)) {
    issues.push({ path: '/proposal/candidate_plans', message: 'Asset proposal candidate_plans must be an array.', severity: 'error' })
    return
  }
  const candidatePlans = Array.isArray(plans) ? plans : []
  const hasRequirementItems = requirementItems.length > 0
  const hasCandidatePlans = candidatePlans.length > 0
  if (!hasRequirementItems && !hasCandidatePlans) {
    issues.push({ path: '/proposal', message: 'Asset proposal draft requires proposal.asset_slots or proposal.candidate_plans.', severity: 'warning' })
  }
  const assetSlotId = numberValue(parsed.assetSlotId ?? parsed.asset_slot_id)
  if (hasCandidatePlans && (assetSlotId === undefined || assetSlotId <= 0)) {
    issues.push({ path: '/assetSlotId', message: 'Asset proposal candidate plans require a positive assetSlotId.', severity: 'error' })
  }
  const slot = isRecord(parsed.slot) ? parsed.slot : undefined
  if (hasCandidatePlans && !slot) {
    issues.push({ path: '/slot', message: 'Asset proposal draft requires slot.', severity: 'error' })
  } else if (slot) {
    const slotId = numberValue(slot.id ?? slot.ID)
    if (slotId === undefined || slotId <= 0) {
      issues.push({ path: '/slot/id', message: 'Asset proposal slot requires a positive id.', severity: 'error' })
    }
    if (assetSlotId !== undefined && slotId !== undefined && assetSlotId !== slotId) {
      issues.push({ path: '/slot/id', message: 'Asset proposal slot.id must match assetSlotId.', severity: 'error' })
    }
    if (typeof slot.name !== 'string' || !slot.name.trim()) {
      issues.push({ path: '/slot/name', message: 'Asset proposal slot requires name.', severity: 'error' })
    }
    if (typeof slot.kind !== 'string' || !slot.kind.trim()) {
      issues.push({ path: '/slot/kind', message: 'Asset proposal slot requires kind.', severity: 'error' })
    }
  }

  candidatePlans.forEach((taskGraph, index) => {
    const base = `/proposal/candidate_plans/${index}`
    if (!isRecord(taskGraph)) {
      issues.push({ path: base, message: 'Asset proposal candidate taskGraph must be an object.', severity: 'error' })
      return
    }
    const outputKind = typeof taskGraph.output_kind === 'string' ? taskGraph.output_kind : ''
    if (!['image', 'video', 'audio', 'text', 'file'].includes(outputKind)) {
      issues.push({ path: `${base}/output_kind`, message: 'Asset proposal candidate taskGraph output_kind must be image, video, audio, text, or file.', severity: 'error' })
    }
    if (typeof taskGraph.prompt !== 'string' || !taskGraph.prompt.trim()) {
      issues.push({ path: `${base}/prompt`, message: 'Asset proposal candidate taskGraph requires prompt.', severity: 'error' })
    }
    if (!Array.isArray(taskGraph.input_resource_ids)) {
      issues.push({ path: `${base}/input_resource_ids`, message: 'Asset proposal candidate taskGraph requires input_resource_ids array.', severity: 'error' })
    } else {
      taskGraph.input_resource_ids.forEach((value, resourceIndex) => {
        const resourceId = numberValue(value)
        if (resourceId === undefined || resourceId <= 0) {
          issues.push({ path: `${base}/input_resource_ids/${resourceIndex}`, message: 'Asset proposal input resource ids must be positive numbers.', severity: 'error' })
        }
      })
    }
    if (!Array.isArray(taskGraph.acceptance_criteria) || taskGraph.acceptance_criteria.length === 0) {
      issues.push({ path: `${base}/acceptance_criteria`, message: 'Asset proposal candidate taskGraph requires acceptance_criteria.', severity: 'warning' })
    }
    const modelCapability = typeof taskGraph.model_capability === 'string' ? taskGraph.model_capability : ''
    const allowedModelCapabilities = ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v', 'audio_tts', 'audio_transcribe', 'subtitle_align', 'render_video']
    if (modelCapability && !allowedModelCapabilities.includes(modelCapability)) {
      issues.push({ path: `${base}/model_capability`, message: `Asset proposal model_capability must be one of: ${allowedModelCapabilities.join(', ')}.`, severity: 'error' })
    }
  })
}

function validateContentUnitProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Content unit proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Content unit proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal) {
    issues.push({ path: '/schema', message: `Content unit proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal}.`, severity: 'error' })
  }
  if (parsed.scope !== 'content_unit_proposal') {
    issues.push({ path: '/scope', message: 'Content unit proposal draft scope must be content_unit_proposal.', severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Content unit proposal draft requires productionId.', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Content unit proposal draft requires proposal.', severity: 'error' })
    return
  }
  const units = Array.isArray(proposal.units) ? proposal.units : []
  if (units.length === 0) {
    issues.push({ path: '/proposal/units', message: 'Content unit proposal draft requires at least one content unit.', severity: 'error' })
    return
  }
  const allowedKinds = new Set(['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'])
  units.forEach((unit, index) => {
    const base = `/proposal/units/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: base, message: 'Content unit proposal unit must be an object.', severity: 'error' })
      return
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Content unit proposal unit requires title.', severity: 'error' })
    }
    if ('action' in unit) {
      issues.push({ path: `${base}/action`, message: 'Content unit proposal uses snapshot mode; remove operation fields and provide the complete proposed unit snapshot.', severity: 'error' })
    }
    const kind = typeof unit.kind === 'string' ? unit.kind.trim() : ''
    if (!allowedKinds.has(kind)) {
      issues.push({ path: `${base}/kind`, message: 'Content unit proposal unit kind must be shot, voiceover, dialogue_audio, sound, music_beat, subtitle, caption_card, or transition.', severity: 'error' })
    }
  })
  if ('timeline_items' in proposal || 'timelineItems' in proposal) {
    issues.push({ path: '/proposal/timeline_items', message: 'Content unit proposal must not own production preview timeline items; use per-unit timing intent or a production-level proposal.', severity: 'error' })
  }
}

function validateProductionProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Production proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Production proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.productionProposal) {
    issues.push({ path: '/schema', message: `Production proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.productionProposal}.`, severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Production proposal draft requires productionId.', severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Production proposal draft requires mode "snapshot".', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Production proposal draft requires proposal.', severity: 'error' })
    return
  }
  const segments = Array.isArray(proposal.segments) ? proposal.segments : []
  if (segments.length === 0) {
    issues.push({ path: '/proposal/segments', message: 'Production proposal draft requires at least one segment.', severity: 'error' })
    return
  }
  segments.forEach((segment, segmentIndex) => {
    const base = `/proposal/segments/${segmentIndex}`
    if (!isRecord(segment)) {
      issues.push({ path: base, message: 'Production proposal segment must be an object.', severity: 'error' })
      return
    }
    if (segment.action !== undefined) {
      issues.push({ path: `${base}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof segment.title !== 'string' || !segment.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Production proposal segment requires title.', severity: 'error' })
    }
    const sceneMoments = Array.isArray(segment.scene_moments) ? segment.scene_moments : []
    if (sceneMoments.length === 0) {
      issues.push({ path: `${base}/scene_moments`, message: 'Production proposal segment requires at least one scene moment.', severity: 'warning' })
    }
    sceneMoments.forEach((sceneMoment, sceneIndex) => {
      const sceneBase = `${base}/scene_moments/${sceneIndex}`
      if (!isRecord(sceneMoment)) {
        issues.push({ path: sceneBase, message: 'Scene moment must be an object.', severity: 'error' })
        return
      }
      if (sceneMoment.action !== undefined) {
        issues.push({ path: `${sceneBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
      }
      if (typeof sceneMoment.title !== 'string' || !sceneMoment.title.trim()) {
        issues.push({ path: `${sceneBase}/title`, message: 'Scene moment requires title.', severity: 'error' })
      }
      const creativeReferences = Array.isArray(sceneMoment.creative_references) ? sceneMoment.creative_references : []
      const assetSlots = Array.isArray(sceneMoment.asset_slots) ? sceneMoment.asset_slots : []
      creativeReferences.forEach((reference, referenceIndex) => {
        const referenceBase = `${sceneBase}/creative_references/${referenceIndex}`
        if (!isRecord(reference)) {
          issues.push({ path: referenceBase, message: 'Creative reference binding must be an object.', severity: 'error' })
          return
        }
        if (reference.action !== undefined) {
          issues.push({ path: `${referenceBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
        }
        if (numberValue(reference.id) === undefined) {
          issues.push({ path: `${referenceBase}/id`, message: 'Production proposal creative_reference must reference an existing project-level id.', severity: 'error' })
        }
      })
      assetSlots.forEach((slot, slotIndex) => {
        const slotBase = `${sceneBase}/asset_slots/${slotIndex}`
        if (!isRecord(slot)) {
          issues.push({ path: slotBase, message: 'Asset slot must be an object.', severity: 'error' })
          return
        }
        if (slot.action !== undefined) {
          issues.push({ path: `${slotBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
        }
      })
      if (creativeReferences.length === 0 && assetSlots.length === 0) {
        issues.push({
          path: sceneBase,
          message: 'Scene moment has no creative_references or asset_slots; downstream generation context may be incomplete.',
          severity: 'warning',
        })
      }
      validateProductionProposalContentUnits(sceneMoment.content_units, `${sceneBase}/content_units`, issues)
      validateProductionProposalKeyframes(sceneMoment.keyframes, `${sceneBase}/keyframes`, issues)
    })
  })
}

function validateProductionProposalContentUnits(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production proposal content_units must be an array.', severity: 'error' })
    return
  }
  value.forEach((unit, index) => {
    const unitBase = `${basePath}/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: unitBase, message: 'Content unit must be an object.', severity: 'error' })
      return
    }
    if (unit.action !== undefined) {
      issues.push({ path: `${unitBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${unitBase}/title`, message: 'Content unit requires title.', severity: 'error' })
    }
    validateProductionProposalKeyframes(unit.keyframes, `${unitBase}/keyframes`, issues)
  })
}

function validateProductionProposalKeyframes(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production proposal keyframes must be an array.', severity: 'error' })
    return
  }
  value.forEach((keyframe, index) => {
    const keyframeBase = `${basePath}/${index}`
    if (!isRecord(keyframe)) {
      issues.push({ path: keyframeBase, message: 'Keyframe must be an object.', severity: 'error' })
      return
    }
    if (keyframe.action !== undefined) {
      issues.push({ path: `${keyframeBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof keyframe.title !== 'string' || !keyframe.title.trim()) {
      issues.push({ path: `${keyframeBase}/title`, message: 'Keyframe requires title.', severity: 'error' })
    }
  })
}

function validateProjectLayerProposalPatchArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentDraftValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path: `/proposal/${key}`, message: `Project standards proposal draft requires proposal.${key}.`, severity: 'error' })
    return
  }
  value.forEach((item, index) => {
    const base = `/proposal/${key}/${index}`
    if (!isRecord(item)) {
      issues.push({ path: base, message: 'Project standards proposal node must be an object.', severity: 'error' })
      return
    }
    validateProjectLayerProposalPatchNode(item, key, base, issues)
  })
}

function validateProjectLayerProposalPatchNode(
  node: Record<string, unknown>,
  key: 'creative_references' | 'asset_slots',
  basePath: string,
  issues: AgentDraftValidationIssue[],
): void {
  const allowedKeys = key === 'creative_references'
    ? new Set(['client_id', 'id', 'merge_candidates', 'source_script_id', 'source_analysis_id', 'kind', 'name', 'alias', 'description', 'content', 'importance', 'status', 'profile_json', 'tags_json'])
    : new Set(['client_id', 'id', 'owner', 'production_id', 'creative_reference_id', 'creative_reference_state_id', 'owner_type', 'owner_id', 'kind', 'name', 'description', 'slot_key', 'prompt_hint', 'status', 'priority', 'resource_id', 'locked_asset_slot_id', 'metadata_json'])
  for (const nodeKey of Object.keys(node)) {
    if (!allowedKeys.has(nodeKey)) {
      issues.push({
        path: `${basePath}/${nodeKey}`,
        message: 'Project standards proposal snapshot nodes only allow direct backend snapshot fields. Do not use fields wrappers or action fields.',
        severity: 'error',
      })
    }
  }
  for (const forbidden of ['action', 'entity', 'target_id', 'targetId', 'source_ids', 'sourceIds', 'payload']) {
    if (node[forbidden] !== undefined) {
      issues.push({
        path: `${basePath}/${forbidden}`,
        message: 'Project standards proposal nodes are editable snapshot rows; do not use operation fields.',
        severity: 'error',
      })
    }
  }
  const id = numberValue(node.id)
  if (node.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/id`, message: 'Project standards proposal id must be a positive existing entity id when present.', severity: 'error' })
  }
  if (node.fields !== undefined) {
    issues.push({ path: `${basePath}/fields`, message: 'Project standards proposal snapshot nodes must put editable values directly on the node; fields is deprecated.', severity: 'error' })
  }
  if (id === undefined && !snapshotNodeName(node)) {
    issues.push({ path: `${basePath}/name`, message: `New project standards proposal ${key} entries require name.`, severity: 'error' })
  }
  if (key === 'creative_references') {
    validateProjectLayerProposalMergeCandidates(node.merge_candidates, id, basePath, issues)
  }
  if (key === 'asset_slots') {
    validateProjectLayerProposalOwner(node.owner, basePath, issues)
    const ownerType = isRecord(node.owner) ? node.owner.type : node.owner_type
    if (typeof ownerType === 'string' && ownerType.trim() && !isProjectLayerProposalAssetSlotOwnerType(ownerType)) {
      issues.push({
        path: isRecord(node.owner) ? `${basePath}/owner/type` : `${basePath}/owner_type`,
        message: 'Project standards proposal asset slot owner type must use a backend snake_case owner type such as creative_reference, scene_moment, or content_unit.',
        severity: 'error',
      })
    }
  }
}

function validateProjectLayerProposalMergeCandidates(value: unknown, targetID: number | undefined, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project standards proposal merge_candidates must be an array.', severity: 'error' })
    return
  }
  if (targetID === undefined) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project standards proposal merge_candidates require the target creative reference id on the same node.', severity: 'error' })
  }
  value.forEach((candidate, index) => {
    const path = `${basePath}/merge_candidates/${index}`
    if (!isRecord(candidate)) {
      issues.push({ path, message: 'Project standards proposal merge candidate must be an object.', severity: 'error' })
      return
    }
    const sourceID = numberValue(candidate.source_id)
    if (sourceID === undefined || sourceID <= 0) {
      issues.push({ path: `${path}/source_id`, message: 'Project standards proposal merge candidate requires a positive source_id.', severity: 'error' })
    }
    if (targetID !== undefined && sourceID === targetID) {
      issues.push({ path: `${path}/source_id`, message: 'Project standards proposal merge candidate source_id must not equal the target id.', severity: 'error' })
    }
  })
}

function validateProjectLayerProposalOwner(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({ path: `${basePath}/owner`, message: 'Project standards proposal owner must be an object.', severity: 'error' })
    return
  }
  const id = numberValue(value.id)
  const clientID = typeof value.client_id === 'string' && value.client_id.trim() ? value.client_id.trim() : ''
  if (value.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/owner/id`, message: 'Project standards proposal owner.id must be a positive id when present.', severity: 'error' })
  }
  if (id === undefined && !clientID) {
    issues.push({ path: `${basePath}/owner`, message: 'Project standards proposal owner requires id or client_id when present.', severity: 'error' })
  }
}

function isProjectLayerProposalAssetSlotOwnerType(value: string): boolean {
  return new Set([
    'creative_reference',
    'creative_reference_state',
    'segment',
    'scene_moment',
    'content_unit',
    'keyframe',
  ]).has(value.trim())
}

function snapshotNodeName(node: Record<string, unknown>): boolean {
  return typeof node.name === 'string' && node.name.trim().length > 0
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

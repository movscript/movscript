import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/workspaces'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type {
  AgentWorkspace,
  AgentWorkspaceValidationIssue,
  AgentWorkspaceValidationResult,
} from '../workspaceStore.js'

export function validateWorkspace(workspace: AgentWorkspace): AgentWorkspaceValidationResult {
  const issues: AgentWorkspaceValidationIssue[] = []
  if (!workspace.title.trim()) {
    issues.push({ path: '/title', message: 'Workspace title is required.', severity: 'error' })
  }
  if (!workspace.content.trim()) {
    issues.push({ path: '/content', message: 'Workspace content is required.', severity: 'error' })
  }
  if (workspace.kind === 'setting_workspace') {
    validateProjectLayerWorkspaceWorkspace(workspace, issues, { kind: 'setting' })
  } else if (workspace.kind === 'project_standards_workspace') {
    validateProjectLayerWorkspaceWorkspace(workspace, issues, { kind: 'project_standards' })
  } else if (workspace.kind === 'content_unit_workspace') {
    validateContentUnitWorkspaceWorkspace(workspace, issues)
  } else if (workspace.kind === 'asset_workspace') {
    validateAssetWorkspaceWorkspace(workspace, issues)
  } else if (workspace.kind === 'production_workspace') {
    validateProductionWorkspaceWorkspace(workspace, issues)
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    workspaceId: workspace.id,
    kind: workspace.kind,
    issues,
  }
}

function validateProjectLayerWorkspaceWorkspace(
  workspace: AgentWorkspace,
  issues: AgentWorkspaceValidationIssue[],
  options: { kind: 'legacy' | 'setting' | 'asset_requirement' | 'project_standards' } = { kind: 'legacy' },
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(workspace.content)
  } catch {
    issues.push({ path: '/content', message: 'Project standards workspace workspace content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Project standards workspace workspace content must be a JSON object.', severity: 'error' })
    return
  }
  const expectedSchema = options.kind === 'setting'
    ? WORKSPACE_CONTENT_SCHEMA_IDS.settingWorkspace
    : options.kind === 'asset_requirement'
      ? WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace
      : WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace
  const expectedScope = options.kind === 'setting'
    ? 'setting_workspace'
    : options.kind === 'asset_requirement'
      ? 'asset_workspace'
      : 'project_standards_workspace'
  if (parsed.schema !== expectedSchema) {
    issues.push({ path: '/schema', message: `Project-level workspace workspace schema must be ${expectedSchema}.`, severity: 'error' })
  }
  if (parsed.scope !== expectedScope) {
    issues.push({ path: '/scope', message: `Project-level workspace workspace scope must be ${expectedScope}.`, severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Project standards workspace workspace mode must be "snapshot".', severity: 'error' })
  }

  const workspacePayload = isRecord(parsed.workspace) ? parsed.workspace : undefined
  if (!workspacePayload) {
    issues.push({ path: '/workspace', message: 'Project standards workspace workspace requires workspace.', severity: 'error' })
    return
  }

  if (options.kind === 'project_standards') {
    validateAbsentProjectLayerWorkspaceArray('creative_references', workspacePayload.creative_references, issues)
    validateAbsentProjectLayerWorkspaceArray('asset_slots', workspacePayload.asset_slots, issues)
    if (!isRecord(workspacePayload.project_style)) {
      issues.push({ path: '/workspace/project_style', message: 'Project standards workspace requires workspacePayload.project_style.', severity: 'error' })
    } else {
      validateProjectStyleCustomRules(workspacePayload.project_style.custom_rules, '/workspace/project_style/custom_rules', issues)
    }
  } else {
    if (options.kind === 'setting') {
      validateProjectLayerWorkspacePatchArray('creative_references', workspacePayload.creative_references, issues)
      validateEmptyProjectLayerWorkspaceArray('asset_slots', workspacePayload.asset_slots, issues)
    } else if (options.kind === 'asset_requirement') {
      validateProjectLayerWorkspacePatchArray('asset_slots', workspacePayload.asset_slots, issues)
      validateEmptyProjectLayerWorkspaceArray('creative_references', workspacePayload.creative_references, issues)
    } else {
      validateProjectLayerWorkspacePatchArray('creative_references', workspacePayload.creative_references, issues)
      validateProjectLayerWorkspacePatchArray('asset_slots', workspacePayload.asset_slots, issues)
    }
  }

  if (parsed.operations !== undefined) {
      issues.push({
        path: '/operations',
        message: 'Project standards workspace workspaces must not include operations; edit the proposed backend snapshot directly.',
        severity: 'error',
      })
  }
}

function validateProjectStyleCustomRules(
  value: unknown,
  basePath: string,
  issues: AgentWorkspaceValidationIssue[],
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

function validateAbsentProjectLayerWorkspaceArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentWorkspaceValidationIssue[],
): void {
  if (value === undefined) return
  issues.push({ path: `/workspace/${key}`, message: `${key} is outside project_standards_workspace. Use the dedicated workspace kind instead.`, severity: 'error' })
}

function validateEmptyProjectLayerWorkspaceArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentWorkspaceValidationIssue[],
): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `/workspace/${key}`, message: `${key} must be an array when present.`, severity: 'error' })
    return
  }
  if (value.length > 0) {
    issues.push({ path: `/workspace/${key}`, message: `${key} is outside this workspace boundary. Use the dedicated workspace kind instead.`, severity: 'error' })
  }
}

function validateAssetWorkspaceWorkspace(workspace: AgentWorkspace, issues: AgentWorkspaceValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(workspace.content)
  } catch {
    issues.push({ path: '/content', message: 'Asset workspace workspace content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Asset workspace workspace content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace) {
    issues.push({ path: '/schema', message: `Asset workspace workspace schema must be ${WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace}.`, severity: 'error' })
  }
  if (parsed.scope !== 'asset_workspace') {
    issues.push({ path: '/scope', message: 'Asset workspace workspace scope must be asset_workspace.', severity: 'error' })
  }
  const workspacePayload = isRecord(parsed.workspace) ? parsed.workspace : undefined
  if (!workspacePayload) {
    issues.push({ path: '/workspace', message: 'Asset workspace workspace requires workspace.', severity: 'error' })
    return
  }
  const requirementItems = Array.isArray(workspacePayload.asset_slots) ? workspacePayload.asset_slots : []
  if (workspacePayload.asset_slots !== undefined) {
    validateProjectLayerWorkspacePatchArray('asset_slots', workspacePayload.asset_slots, issues)
  }
  if (workspacePayload.creative_references !== undefined) {
    validateEmptyProjectLayerWorkspaceArray('creative_references', workspacePayload.creative_references, issues)
  }
  const plans = workspacePayload.candidate_plans
  if (plans !== undefined && !Array.isArray(plans)) {
    issues.push({ path: '/workspace/candidate_plans', message: 'Asset workspace candidate_plans must be an array.', severity: 'error' })
    return
  }
  const candidatePlans = Array.isArray(plans) ? plans : []
  const hasRequirementItems = requirementItems.length > 0
  const hasCandidatePlans = candidatePlans.length > 0
  if (!hasRequirementItems && !hasCandidatePlans) {
    issues.push({ path: '/workspace', message: 'Asset workspace workspace requires workspacePayload.asset_slots or workspacePayload.candidate_plans.', severity: 'warning' })
  }
  const assetSlotId = numberValue(parsed.assetSlotId ?? parsed.asset_slot_id)
  if (hasCandidatePlans && (assetSlotId === undefined || assetSlotId <= 0)) {
    issues.push({ path: '/assetSlotId', message: 'Asset workspace candidate plans require a positive assetSlotId.', severity: 'error' })
  }
  const slot = isRecord(parsed.slot) ? parsed.slot : undefined
  if (hasCandidatePlans && !slot) {
    issues.push({ path: '/slot', message: 'Asset workspace workspace requires slot.', severity: 'error' })
  } else if (slot) {
    const slotId = numberValue(slot.id ?? slot.ID)
    if (slotId === undefined || slotId <= 0) {
      issues.push({ path: '/slot/id', message: 'Asset workspace slot requires a positive id.', severity: 'error' })
    }
    if (assetSlotId !== undefined && slotId !== undefined && assetSlotId !== slotId) {
      issues.push({ path: '/slot/id', message: 'Asset workspace slot.id must match assetSlotId.', severity: 'error' })
    }
    if (typeof slot.name !== 'string' || !slot.name.trim()) {
      issues.push({ path: '/slot/name', message: 'Asset workspace slot requires name.', severity: 'error' })
    }
    if (typeof slot.kind !== 'string' || !slot.kind.trim()) {
      issues.push({ path: '/slot/kind', message: 'Asset workspace slot requires kind.', severity: 'error' })
    }
  }

  candidatePlans.forEach((taskGraph, index) => {
    const base = `/workspace/candidate_plans/${index}`
    if (!isRecord(taskGraph)) {
      issues.push({ path: base, message: 'Asset workspace candidate taskGraph must be an object.', severity: 'error' })
      return
    }
    const outputKind = typeof taskGraph.output_kind === 'string' ? taskGraph.output_kind : ''
    if (!['image', 'video', 'audio', 'text', 'file'].includes(outputKind)) {
      issues.push({ path: `${base}/output_kind`, message: 'Asset workspace candidate taskGraph output_kind must be image, video, audio, text, or file.', severity: 'error' })
    }
    if (typeof taskGraph.prompt !== 'string' || !taskGraph.prompt.trim()) {
      issues.push({ path: `${base}/prompt`, message: 'Asset workspace candidate taskGraph requires prompt.', severity: 'error' })
    }
    if (!Array.isArray(taskGraph.input_resource_ids)) {
      issues.push({ path: `${base}/input_resource_ids`, message: 'Asset workspace candidate taskGraph requires input_resource_ids array.', severity: 'error' })
    } else {
      taskGraph.input_resource_ids.forEach((value, resourceIndex) => {
        const resourceId = numberValue(value)
        if (resourceId === undefined || resourceId <= 0) {
          issues.push({ path: `${base}/input_resource_ids/${resourceIndex}`, message: 'Asset workspace input resource ids must be positive numbers.', severity: 'error' })
        }
      })
    }
    if (!Array.isArray(taskGraph.acceptance_criteria) || taskGraph.acceptance_criteria.length === 0) {
      issues.push({ path: `${base}/acceptance_criteria`, message: 'Asset workspace candidate taskGraph requires acceptance_criteria.', severity: 'warning' })
    }
    const modelCapability = typeof taskGraph.model_capability === 'string' ? taskGraph.model_capability : ''
    const allowedModelCapabilities = ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v', 'audio_tts', 'audio_transcribe', 'subtitle_align', 'render_video']
    if (modelCapability && !allowedModelCapabilities.includes(modelCapability)) {
      issues.push({ path: `${base}/model_capability`, message: `Asset workspace model_capability must be one of: ${allowedModelCapabilities.join(', ')}.`, severity: 'error' })
    }
  })
}

function validateContentUnitWorkspaceWorkspace(workspace: AgentWorkspace, issues: AgentWorkspaceValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(workspace.content)
  } catch {
    issues.push({ path: '/content', message: 'Content unit workspace workspace content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Content unit workspace workspace content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== WORKSPACE_CONTENT_SCHEMA_IDS.contentUnitWorkspace) {
    issues.push({ path: '/schema', message: `Content unit workspace workspace schema must be ${WORKSPACE_CONTENT_SCHEMA_IDS.contentUnitWorkspace}.`, severity: 'error' })
  }
  if (parsed.scope !== 'content_unit_workspace') {
    issues.push({ path: '/scope', message: 'Content unit workspace workspace scope must be content_unit_workspace.', severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Content unit workspace workspace requires productionId.', severity: 'error' })
  }
  const workspacePayload = isRecord(parsed.workspace) ? parsed.workspace : undefined
  if (!workspacePayload) {
    issues.push({ path: '/workspace', message: 'Content unit workspace workspace requires workspace.', severity: 'error' })
    return
  }
  const units = Array.isArray(workspacePayload.units) ? workspacePayload.units : []
  if (units.length === 0) {
    issues.push({ path: '/workspace/units', message: 'Content unit workspace workspace requires at least one content unit.', severity: 'error' })
    return
  }
  const allowedKinds = new Set(['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'])
  units.forEach((unit, index) => {
    const base = `/workspace/units/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: base, message: 'Content unit workspace unit must be an object.', severity: 'error' })
      return
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Content unit workspace unit requires title.', severity: 'error' })
    }
    if ('action' in unit) {
      issues.push({ path: `${base}/action`, message: 'Content unit workspace uses snapshot mode; remove operation fields and provide the complete proposed unit snapshot.', severity: 'error' })
    }
    const kind = typeof unit.kind === 'string' ? unit.kind.trim() : ''
    if (!allowedKinds.has(kind)) {
      issues.push({ path: `${base}/kind`, message: 'Content unit workspace unit kind must be shot, voiceover, dialogue_audio, sound, music_beat, subtitle, caption_card, or transition.', severity: 'error' })
    }
  })
  if ('timeline_items' in workspace || 'timelineItems' in workspace) {
    issues.push({ path: '/workspace/timeline_items', message: 'Content unit workspace must not own production preview timeline items; use per-unit timing intent or a production-level workspace.', severity: 'error' })
  }
}

function validateProductionWorkspaceWorkspace(workspace: AgentWorkspace, issues: AgentWorkspaceValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(workspace.content)
  } catch {
    issues.push({ path: '/content', message: 'Production workspace workspace content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Production workspace workspace content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace) {
    issues.push({ path: '/schema', message: `Production workspace workspace schema must be ${WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace}.`, severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Production workspace workspace requires productionId.', severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Production workspace workspace requires mode "snapshot".', severity: 'error' })
  }
  const workspacePayload = isRecord(parsed.workspace) ? parsed.workspace : undefined
  if (!workspacePayload) {
    issues.push({ path: '/workspace', message: 'Production workspace workspace requires workspace.', severity: 'error' })
    return
  }
  const segments = Array.isArray(workspacePayload.segments) ? workspacePayload.segments : []
  if (segments.length === 0) {
    issues.push({ path: '/workspace/segments', message: 'Production workspace workspace requires at least one segment.', severity: 'error' })
    return
  }
  segments.forEach((segment, segmentIndex) => {
    const base = `/workspace/segments/${segmentIndex}`
    if (!isRecord(segment)) {
      issues.push({ path: base, message: 'Production workspace segment must be an object.', severity: 'error' })
      return
    }
    if (segment.action !== undefined) {
      issues.push({ path: `${base}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof segment.title !== 'string' || !segment.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Production workspace segment requires title.', severity: 'error' })
    }
    const sceneMoments = Array.isArray(segment.scene_moments) ? segment.scene_moments : []
    if (sceneMoments.length === 0) {
      issues.push({ path: `${base}/scene_moments`, message: 'Production workspace segment requires at least one scene moment.', severity: 'warning' })
    }
    sceneMoments.forEach((sceneMoment, sceneIndex) => {
      const sceneBase = `${base}/scene_moments/${sceneIndex}`
      if (!isRecord(sceneMoment)) {
        issues.push({ path: sceneBase, message: 'Scene moment must be an object.', severity: 'error' })
        return
      }
      if (sceneMoment.action !== undefined) {
        issues.push({ path: `${sceneBase}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
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
          issues.push({ path: `${referenceBase}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
        }
        if (numberValue(reference.id) === undefined) {
          issues.push({ path: `${referenceBase}/id`, message: 'Production workspace creative_reference must reference an existing project-level id.', severity: 'error' })
        }
      })
      assetSlots.forEach((slot, slotIndex) => {
        const slotBase = `${sceneBase}/asset_slots/${slotIndex}`
        if (!isRecord(slot)) {
          issues.push({ path: slotBase, message: 'Asset slot must be an object.', severity: 'error' })
          return
        }
        if (slot.action !== undefined) {
          issues.push({ path: `${slotBase}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
        }
      })
      if (creativeReferences.length === 0 && assetSlots.length === 0) {
        issues.push({
          path: sceneBase,
          message: 'Scene moment has no creative_references or asset_slots; downstream generation context may be incomplete.',
          severity: 'warning',
        })
      }
      validateProductionWorkspaceContentUnits(sceneMoment.content_units, `${sceneBase}/content_units`, issues)
      validateProductionWorkspaceKeyframes(sceneMoment.keyframes, `${sceneBase}/keyframes`, issues)
    })
  })
}

function validateProductionWorkspaceContentUnits(value: unknown, basePath: string, issues: AgentWorkspaceValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production workspace content_units must be an array.', severity: 'error' })
    return
  }
  value.forEach((unit, index) => {
    const unitBase = `${basePath}/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: unitBase, message: 'Content unit must be an object.', severity: 'error' })
      return
    }
    if (unit.action !== undefined) {
      issues.push({ path: `${unitBase}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${unitBase}/title`, message: 'Content unit requires title.', severity: 'error' })
    }
    validateProductionWorkspaceKeyframes(unit.keyframes, `${unitBase}/keyframes`, issues)
  })
}

function validateProductionWorkspaceKeyframes(value: unknown, basePath: string, issues: AgentWorkspaceValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production workspace keyframes must be an array.', severity: 'error' })
    return
  }
  value.forEach((keyframe, index) => {
    const keyframeBase = `${basePath}/${index}`
    if (!isRecord(keyframe)) {
      issues.push({ path: keyframeBase, message: 'Keyframe must be an object.', severity: 'error' })
      return
    }
    if (keyframe.action !== undefined) {
      issues.push({ path: `${keyframeBase}/action`, message: 'Production workspace snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof keyframe.title !== 'string' || !keyframe.title.trim()) {
      issues.push({ path: `${keyframeBase}/title`, message: 'Keyframe requires title.', severity: 'error' })
    }
  })
}

function validateProjectLayerWorkspacePatchArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentWorkspaceValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path: `/workspace/${key}`, message: `Project standards workspace workspace requires workspace.${key}.`, severity: 'error' })
    return
  }
  value.forEach((item, index) => {
    const base = `/workspace/${key}/${index}`
    if (!isRecord(item)) {
      issues.push({ path: base, message: 'Project standards workspace node must be an object.', severity: 'error' })
      return
    }
    validateProjectLayerWorkspacePatchNode(item, key, base, issues)
  })
}

function validateProjectLayerWorkspacePatchNode(
  node: Record<string, unknown>,
  key: 'creative_references' | 'asset_slots',
  basePath: string,
  issues: AgentWorkspaceValidationIssue[],
): void {
  const allowedKeys = key === 'creative_references'
    ? new Set(['client_id', 'id', 'merge_candidates', 'source_script_id', 'source_analysis_id', 'kind', 'name', 'alias', 'description', 'content', 'importance', 'status', 'profile_json', 'tags_json'])
    : new Set(['client_id', 'id', 'owner', 'production_id', 'creative_reference_id', 'creative_reference_state_id', 'owner_type', 'owner_id', 'kind', 'name', 'description', 'slot_key', 'prompt_hint', 'status', 'priority', 'resource_id', 'locked_asset_slot_id', 'metadata_json'])
  for (const nodeKey of Object.keys(node)) {
    if (!allowedKeys.has(nodeKey)) {
      issues.push({
        path: `${basePath}/${nodeKey}`,
        message: 'Project standards workspace snapshot nodes only allow direct backend snapshot fields. Do not use fields wrappers or action fields.',
        severity: 'error',
      })
    }
  }
  for (const forbidden of ['action', 'entity', 'target_id', 'targetId', 'source_ids', 'sourceIds', 'payload']) {
    if (node[forbidden] !== undefined) {
      issues.push({
        path: `${basePath}/${forbidden}`,
        message: 'Project standards workspace nodes are editable snapshot rows; do not use operation fields.',
        severity: 'error',
      })
    }
  }
  const id = numberValue(node.id)
  if (node.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/id`, message: 'Project standards workspace id must be a positive existing entity id when present.', severity: 'error' })
  }
  if (node.fields !== undefined) {
    issues.push({ path: `${basePath}/fields`, message: 'Project standards workspace snapshot nodes must put editable values directly on the node; fields is deprecated.', severity: 'error' })
  }
  if (id === undefined && !snapshotNodeName(node)) {
    issues.push({ path: `${basePath}/name`, message: `New project standards workspace ${key} entries require name.`, severity: 'error' })
  }
  if (key === 'creative_references') {
    validateProjectLayerWorkspaceMergeCandidates(node.merge_candidates, id, basePath, issues)
  }
  if (key === 'asset_slots') {
    validateProjectLayerWorkspaceOwner(node.owner, basePath, issues)
    const ownerType = isRecord(node.owner) ? node.owner.type : node.owner_type
    if (typeof ownerType === 'string' && ownerType.trim() && !isProjectLayerWorkspaceAssetSlotOwnerType(ownerType)) {
      issues.push({
        path: isRecord(node.owner) ? `${basePath}/owner/type` : `${basePath}/owner_type`,
        message: 'Project standards workspace asset slot owner type must use a backend snake_case owner type such as creative_reference, scene_moment, or content_unit.',
        severity: 'error',
      })
    }
  }
}

function validateProjectLayerWorkspaceMergeCandidates(value: unknown, targetID: number | undefined, basePath: string, issues: AgentWorkspaceValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project standards workspace merge_candidates must be an array.', severity: 'error' })
    return
  }
  if (targetID === undefined) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project standards workspace merge_candidates require the target creative reference id on the same node.', severity: 'error' })
  }
  value.forEach((candidate, index) => {
    const path = `${basePath}/merge_candidates/${index}`
    if (!isRecord(candidate)) {
      issues.push({ path, message: 'Project standards workspace merge candidate must be an object.', severity: 'error' })
      return
    }
    const sourceID = numberValue(candidate.source_id)
    if (sourceID === undefined || sourceID <= 0) {
      issues.push({ path: `${path}/source_id`, message: 'Project standards workspace merge candidate requires a positive source_id.', severity: 'error' })
    }
    if (targetID !== undefined && sourceID === targetID) {
      issues.push({ path: `${path}/source_id`, message: 'Project standards workspace merge candidate source_id must not equal the target id.', severity: 'error' })
    }
  })
}

function validateProjectLayerWorkspaceOwner(value: unknown, basePath: string, issues: AgentWorkspaceValidationIssue[]): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({ path: `${basePath}/owner`, message: 'Project standards workspace owner must be an object.', severity: 'error' })
    return
  }
  const id = numberValue(value.id)
  const clientID = typeof value.client_id === 'string' && value.client_id.trim() ? value.client_id.trim() : ''
  if (value.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/owner/id`, message: 'Project standards workspace owner.id must be a positive id when present.', severity: 'error' })
  }
  if (id === undefined && !clientID) {
    issues.push({ path: `${basePath}/owner`, message: 'Project standards workspace owner requires id or client_id when present.', severity: 'error' })
  }
}

function isProjectLayerWorkspaceAssetSlotOwnerType(value: string): boolean {
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

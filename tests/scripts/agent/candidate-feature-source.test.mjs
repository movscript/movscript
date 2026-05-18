import assert from 'node:assert/strict'
import test from 'node:test'

import { readTextFile, repoRootFromMeta } from '../../../scripts/verifier-utils.mjs'

const SOURCE_FILES = {
  generatedCard: 'apps/frontend/src/components/agent/GeneratedResultCard.tsx',
  generatedAttachments: 'apps/frontend/src/lib/agentGeneratedResultAttachments.ts',
  generatedBinding: 'apps/frontend/src/lib/agentGeneratedResourceBinding.ts',
  canvasCandidatePushTest: 'apps/frontend/src/lib/canvasCandidatePushContract.test.ts',
  frontendSemanticEntities: 'apps/frontend/src/api/semanticEntities.ts',
  frontendSemanticEntitiesTest: 'apps/frontend/src/api/semanticEntities.test.ts',
  aiAgentPanel: 'apps/frontend/src/components/layout/AIAgentPanel.tsx',
  tasksPage: 'apps/frontend/src/pages/project/tasks/TasksPage.tsx',
  workbenchPage: 'apps/frontend/src/pages/workbench/WorkbenchPage.tsx',
  canvasEditor: 'apps/frontend/src/pages/canvas/CanvasEditorPage.tsx',
  canvasNodes: 'apps/frontend/src/pages/canvas/components/CanvasNodes.tsx',
  preProductionPage: 'apps/frontend/src/pages/pre-production/PreProductionPage.tsx',
  mcpCandidateParams: 'apps/frontend/electron/mcp/candidateParams.ts',
  mcpServer: 'apps/frontend/electron/mcp/server.ts',
  mcpServerTest: 'apps/frontend/electron/mcp/server.test.ts',
  assetTool: 'apps/agent/catalog/tools/movscript/visual-generation/attach-asset-slot-candidate.tool.json',
  frontendAssetTool: 'apps/frontend/movscript-agent/catalog/tools/movscript/visual-generation/attach-asset-slot-candidate.tool.json',
  keyframeTool: 'apps/agent/catalog/tools/movscript/visual-generation/attach-keyframe-candidate.tool.json',
  frontendKeyframeTool: 'apps/frontend/movscript-agent/catalog/tools/movscript/visual-generation/attach-keyframe-candidate.tool.json',
  createJobTool: 'apps/agent/catalog/tools/movscript/visual-generation/create-job.tool.json',
  frontendCreateJobTool: 'apps/frontend/movscript-agent/catalog/tools/movscript/visual-generation/create-job.tool.json',
  contextTool: 'apps/agent/catalog/tools/movscript/workspace/query-production-context.tool.json',
  movscriptPack: 'apps/agent/catalog/packs/movscript.pack.json',
  movscriptPolicy: 'apps/agent/catalog/skills/movscript/policy/instruction.md',
  frontendMovscriptPolicy: 'apps/frontend/movscript-agent/catalog/skills/movscript/policy/instruction.md',
  visualGenerationWorkflow: 'apps/agent/catalog/skills/movscript/workflow/generation/visual-generation/skill.workflow.json',
  frontendVisualGenerationWorkflow: 'apps/frontend/movscript-agent/catalog/skills/movscript/workflow/generation/visual-generation/skill.workflow.json',
  visualGenerationInstruction: 'apps/agent/catalog/skills/movscript/workflow/generation/visual-generation/instruction.md',
  frontendVisualGenerationInstruction: 'apps/frontend/movscript-agent/catalog/skills/movscript/workflow/generation/visual-generation/instruction.md',
  catalogLayeringTest: 'apps/agent/src/catalog/layering.test.ts',
  productionService: 'apps/backend/internal/app/semantic/production.go',
  assetService: 'apps/backend/internal/app/semantic/asset.go',
  workflowEntitySchema: 'apps/backend/internal/domain/workflow/entity_schema.go',
  workflowEntityWrite: 'apps/backend/internal/app/workflow/entity_write_repository.go',
  resourceBindingRepository: 'apps/backend/internal/app/resource/binding/repository.go',
  workApplyRepository: 'apps/backend/internal/app/semantic/work_apply_repository.go',
  assetCandidateDomain: 'apps/backend/internal/domain/semantic/asset_candidate.go',
  workItemDomain: 'apps/backend/internal/domain/semantic/work_item.go',
}

const REQUIRED_SOURCE_MARKERS = {
  generatedBinding: [
    ["Extract<ResourceBindingOwnerType, 'asset_slot' | 'keyframe'>", 'generated binding targets must include asset slots and keyframes'],
    ["{ value: 'asset_slot', label: '素材需求', slot: 'candidate', entityKind: 'assetSlots' }", 'asset slots must be exposed as candidate targets'],
    ["{ value: 'keyframe', label: '画面锚点', slot: 'candidate', entityKind: 'keyframes' }", 'keyframes must be exposed as candidate targets'],
    ['Number.isInteger(resourceId)', 'generated resource IDs must be positive integers before candidate writes'],
    ["source: 'ai_generated_keyframe_candidate'", 'keyframe candidates must carry AI-generated candidate metadata'],
    ['target_keyframe_id: targetKeyframe.ID', 'keyframe candidates must point back to their target keyframe'],
    ['invalidateAssetCandidateConsumers(queryClient, projectId)', 'generated candidate writes must invalidate shared candidate consumers'],
    ['return !isGeneratedKeyframeCandidateRecord(record)', 'generated keyframe candidates must not be selectable as candidate targets'],
  ],
  generatedAttachments: [
    ['attachment.generated !== undefined || attachment.id.startsWith', 'generated placeholders without resource IDs must remain visible'],
  ],
  generatedCard: [
    ['GeneratedBulkCandidateAttachControl', 'AI result card must support bulk candidate attach'],
    ['GeneratedCandidateAttachControl', 'AI result card must support per-resource candidate attach'],
    ['agent-generated-resource-candidate-missing-id', 'AI result card must explain generated outputs with no resource ID'],
    ['未返回资源 ID', 'AI result card must label outputs that have no resource ID'],
    ['无资源 ID', 'copy action must be disabled for outputs with no resource ID'],
    ['hasCandidateAttachments', 'bulk attach target loading must be guarded by usable generated resources'],
    ['enabled: !!projectId && hasCandidateAttachments', 'bulk target query must not run without a usable generated resource'],
    ['enabled: !!projectId && attachment.resourceId !== undefined', 'single target query must not run without a usable generated resource'],
    ['{generated.length} 个结果', 'result count copy must count generated results, not only resource IDs'],
    ['素材需求、画面锚点的候选列表', 'result footer must describe both supported candidate target types'],
    ['这些生成结果暂未返回资源 ID，暂不能复制引用或加入候选。', 'result footer must handle all-placeholder outputs'],
    ['api.post<SemanticEntityRecord>(`/projects/${projectId}/entities/keyframes`', 'keyframe candidate attach must post to keyframes'],
    ['api.post<AssetSlotCandidate>(`/projects/${projectId}/entities/asset-slot-candidates`', 'asset candidate attach must post to asset-slot-candidates'],
  ],
  aiAgentPanel: [
    ['hasUsableGeneratedResource', 'assistant panel must distinguish generated placeholders from usable resources'],
    ['showLargeMedia && hasUsableGeneratedResource ? hideGeneratedResultTechnicalSummary', 'assistant technical summary must remain visible when generated outputs have no resource ID'],
    ['<GeneratedResultCard attachments={generatedMediaAttachments} projectId={projectId} />', 'assistant panel must render the generated result card'],
  ],
  tasksPage: [
    ["TaskPurpose = 'general' | 'review_output' | 'choose_asset_candidate' | 'confirm_content_unit' | 'accept_keyframe'", 'task creation must support accept_keyframe purpose'],
    ["candidateId: positiveSearchParamID(params.get('candidate_id'))", 'task deep links must preserve candidate_id'],
    ['requestedAssetCandidateUnavailable', 'asset candidate task creation must detect stale candidate deep links'],
    ['requestedKeyframeCandidateUnavailable', 'keyframe task creation must detect stale candidate deep links'],
    ['指定候选不可采纳', 'stale candidate deep links must not silently fall back to another candidate'],
    ['JSON.stringify({ asset_slot_candidate_id: selectedCandidate.ID })', 'asset candidate tasks must submit the selected candidate ID'],
    ['JSON.stringify({ keyframe_candidate_id: selectedKeyframeCandidate.ID })', 'keyframe accept tasks must submit the selected candidate ID'],
    ["!isGeneratedKeyframeCandidateRecord(record)).map((record) => targetOption('keyframe'", 'task target list must exclude generated keyframe candidates'],
  ],
  workbenchPage: [
    ['content-workbench-keyframe-candidates', 'workbench must show keyframe candidates below official keyframes'],
    ['keyframeCandidatesForTargets(data.keyframes, selectedUnitKeyframes)', 'workbench must derive candidate rows for selected keyframes'],
    ['candidate_id: candidate.ID', 'workbench must deep-link the exact keyframe candidate for acceptance'],
    ["keyframeStatusPatchPayload(candidate, 'rejected')", 'workbench must support rejecting keyframe candidates'],
    ['!isGeneratedKeyframeCandidateRecord(keyframe)', 'workbench official keyframe lists must exclude generated candidates'],
    ['缺资源', 'workbench must label resource-less keyframe candidates instead of allowing adoption'],
    ['keyframeResourceCandidatePayload(keyframe, resourceId, \'library\')', 'workbench library keyframe resources must be added as candidates'],
    ['keyframeResourceCandidatePayload(keyframe, resource.ID, \'upload\')', 'workbench uploaded keyframe resources must be added as candidates'],
    ['source_origin: source === \'upload\' ? \'workbench_upload\' : \'workbench_resource_library\'', 'workbench keyframe candidate metadata must record manual origin'],
  ],
  canvasEditor: [
    ['invalidateAssetCandidateConsumers(qc, canvas.project_id)', 'canvas candidate push must invalidate shared candidate consumers'],
    ['entities/asset-slot-candidates', 'canvas push must create asset slot candidates instead of patching target slots'],
    ['已加入素材候选', 'canvas push success copy must use candidate wording'],
  ],
  canvasNodes: [
    ['加入候选', 'canvas push button must use candidate wording'],
  ],
  canvasCandidatePushTest: [
    ['canvas output push adds asset slot candidates instead of locking slots directly', 'frontend tests must guard canvas candidate push semantics'],
    ["assert.doesNotMatch(source, /status:\\s*'locked'/)", 'frontend tests must reject direct canvas slot locking'],
    ["assert.doesNotMatch(domainCardSource, /outputPortId:\\s*'locked_asset_slot_id'/)", 'frontend tests must reject canvas domain direct lock ports'],
  ],
  frontendSemanticEntitiesTest: [
    ['official asset slot and keyframe configs hide direct resource adoption fields', 'frontend tests must guard official resource field hiding'],
    ["assert.doesNotMatch(keyframesBlock, /num\\('resource_id'/)", 'frontend tests must hide direct keyframe resource ids'],
    ["assert.doesNotMatch(assetSlotsBlock, /num\\('locked_asset_slot_id'/)", 'frontend tests must hide direct asset slot locks'],
  ],
  preProductionPage: [
    ["candidate.status !== 'rejected'", 'pre-production candidate list must hide rejected asset candidates'],
    ["candidatePatchPayload(row.slot.ID, candidate, 'selected')", 'pre-production must allow locking asset candidates'],
    ["candidatePatchPayload(row.slot.ID, candidate, 'rejected')", 'pre-production must allow rejecting asset candidates'],
  ],
  mcpServer: [
    ["name: 'movscript_attach_asset_slot_candidate'", 'MCP server must expose asset candidate attach tool'],
    ["name: 'movscript_attach_keyframe_candidate'", 'MCP server must expose keyframe candidate attach tool'],
    ['Add an existing raw resource to the reviewable candidate set', 'MCP attach wording must describe candidate membership, not direct binding'],
    ["getRequiredPositiveIntegerAliasParam(args, resourceIdAliases, 'resource_id')", 'MCP attach tools must normalize candidate resource aliases as positive integers'],
    ['keyframe_id', 'MCP keyframe tool must accept keyframe_id'],
    ['target_keyframe_id', 'MCP keyframe tool must accept target_keyframe_id alias'],
    ["source: 'ai_generated_keyframe_candidate'", 'MCP keyframe attach must write generated-candidate metadata'],
    ['isGeneratedKeyframeCandidateTarget(target)', 'MCP keyframe attach must reject nested candidate targets'],
    ["asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'status', 'metadata_json'])", 'MCP generic apply must not directly write asset slot resources'],
    ["keyframe: new Set(['title', 'description', 'prompt', 'status', 'metadata_json'])", 'MCP generic apply must not directly write keyframe resources'],
    ["enum: ['productions', 'segments', 'scene_moments', 'content_units', 'keyframes']", 'production context query must support include=keyframes'],
    ['if (isGeneratedKeyframeCandidateRecord(item)) return false', 'production context keyframes must exclude generated candidates'],
  ],
  mcpCandidateParams: [
    ['${label} must be a positive integer', 'MCP attach tools must reject non-positive resource IDs before writing candidates'],
    ['aliases must match', 'MCP attach tools must reject conflicting candidate ID aliases'],
  ],
  mcpServerTest: [
    ['movscript_attach_keyframe_candidate', 'MCP tests must cover keyframe candidate attach'],
    ["source: 'ai_generated_keyframe_candidate'", 'MCP tests must assert generated keyframe metadata'],
    ['assert.deepEqual(result.keyframes.map((item: any) => item.ID), [401])', 'MCP production context tests must exclude generated keyframe candidates'],
  ],
  assetTool: [
    ['"name": "movscript_attach_asset_slot_candidate"', 'asset candidate tool catalog must keep the attach tool name'],
    ['"output_resource_id"', 'asset candidate tool catalog must require output resource IDs'],
    ['"minimum": 1', 'asset candidate tool catalog must declare positive candidate IDs'],
    ['"additionalProperties": false', 'asset candidate tool catalog must reject unknown input properties'],
    ['不会 accept、select、bind 或 lock 候选', 'asset candidate tool catalog must describe attach-only semantics'],
  ],
  keyframeTool: [
    ['"name": "movscript_attach_keyframe_candidate"', 'keyframe candidate tool catalog must keep the attach tool name'],
    ['"target_keyframe_id"', 'keyframe candidate tool catalog must require target keyframes'],
    ['"output_resource_id"', 'keyframe candidate tool catalog must require output resource IDs'],
    ['"minimum": 1', 'keyframe candidate tool catalog must declare positive candidate IDs'],
    ['"additionalProperties": false', 'keyframe candidate tool catalog must reject unknown input properties'],
    ['不会 accept、select、bind 或 lock 候选', 'keyframe candidate tool catalog must describe attach-only semantics'],
  ],
  contextTool: [
    ['"keyframes"', 'production context tool catalog must support keyframe context'],
    ['正式画面锚点', 'production context tool catalog must distinguish official keyframes from candidates'],
  ],
  movscriptPack: [
    ['"movscript_attach_keyframe_candidate"', 'agent pack must include keyframe candidate attach tool'],
  ],
  movscriptPolicy: [
    ['默认只表示把输出资源加入目标候选集', 'agent policy must interpret generated-result binding requests as candidate membership by default'],
    ['只有用户明确要求采纳、锁定、正式使用', 'agent policy must reserve official binding/locking semantics for explicit acceptance requests'],
    ['不得用通用 draft apply 直接写 `asset_slot.resource_id`、`asset_slot.locked_asset_slot_id` 或 `keyframe.resource_id`', 'agent policy must forbid generic apply resource adoption bypasses'],
  ],
  visualGenerationWorkflow: [
    ['"tool://movscript_attach_keyframe_candidate"', 'visual generation workflow must include keyframe candidate attach tool'],
  ],
  visualGenerationInstruction: [
    ['include keyframes', 'visual generation instruction must tell agents to query keyframes when needed'],
    ['movscript_attach_keyframe_candidate', 'visual generation instruction must attach successful keyframe outputs as candidates'],
  ],
  catalogLayeringTest: [
    ['movscript_attach_keyframe_candidate', 'catalog layering tests must cover keyframe candidate attach tool visibility'],
    ['include keyframes', 'catalog layering tests must cover keyframe context instructions'],
  ],
  productionService: [
    ['generated keyframe candidate requires resource', 'backend must reject generated keyframe candidates without resources'],
    ['validateScopedOwner(ctx, projectID, "resource"', 'backend must reject generated keyframe candidates with unknown resources'],
    ['generated keyframe candidate must be accepted through a work item', 'backend must prevent direct acceptance of generated keyframe candidates'],
    ['generated keyframe candidate target must be an original keyframe', 'backend must reject nested generated candidate targets'],
    ['findGeneratedKeyframeCandidateByResource', 'backend must reuse existing generated keyframe candidates for the same target and resource'],
    ['if existing.Status == "rejected"', 'backend must reactivate rejected generated keyframe candidates instead of duplicating them'],
    ['} else if input.ResourceID != nil {', 'backend must reject direct keyframe resource adoption creates'],
    ['关键帧资源采纳必须通过候选采纳流程', 'backend must reject direct keyframe resource adoption patches'],
    ['recordKeyframeCandidateRejectionArtifacts', 'backend must record direct keyframe candidate rejection artifacts'],
    ['direct_keyframe_candidate_rejection', 'backend must mark direct keyframe candidate rejections'],
    ['"source":                "ai_generated_keyframe_candidate"', 'backend must write candidate relations with AI-generated source metadata'],
  ],
  workApplyRepository: [
    ['func applyWorkItemKeyframeCandidate', 'work application must support keyframe candidate acceptance'],
    ['关键帧候选缺少资源', 'work application must reject keyframe candidates without resources'],
    ['关键帧候选资源不存在', 'work application must reject keyframe candidates with unknown resources'],
    ['素材候选资源不存在', 'work application must reject asset candidates with unknown resources'],
    ['关键帧候选不属于当前任务目标画面锚点', 'work application must validate keyframe candidate target match'],
    ['target.ResourceID = candidate.ResourceID', 'work application must copy selected keyframe candidate resource to target'],
    ['candidate.Status = domainsemantic.KeyframeStatusAccepted', 'work application must mark accepted keyframe candidates'],
    ['loadRejectedKeyframeCandidates', 'work application must reject sibling keyframe candidates'],
    ['work_item_keyframe_candidate_selection', 'work application must persist keyframe candidate decision metadata'],
  ],
  assetService: [
    ['func (s *Service) CreateAssetSlotCandidate', 'backend must support creating asset slot candidates'],
    ['asset slot candidate resource_id must be positive', 'backend must reject zero resource IDs before creating asset slot candidates'],
    ['func (s *Service) PatchAssetSlotCandidate', 'backend must support selecting and rejecting asset slot candidates'],
    ['ensureSelectableAssetSlotCandidateResource', 'backend must reject direct asset candidate selection without a valid resource'],
    ['素材候选缺少资源', 'backend must reject direct asset candidate selection without resources'],
    ['素材候选资源不存在', 'backend must reject direct asset candidate selection with stale resources'],
    ['input.ResourceID != nil || input.LockedAssetSlotID != nil', 'backend must reject direct asset slot resource adoption creates'],
    ['素材资源采纳必须通过候选锁定流程', 'backend must reject direct asset slot resource adoption patches'],
    ['resetAssetSlotCandidateStatusIfEmpty', 'backend must reset target asset slot status when the last active candidate is rejected'],
    ['direct_asset_slot_candidate_rejection', 'backend must record direct asset candidate rejections'],
  ],
  assetCandidateDomain: [
    ['CandidateDecisionReject                 = "reject"', 'candidate decision domain must include reject decisions'],
  ],
  workItemDomain: [
    ['KeyframeCandidateID  uint   `json:"keyframe_candidate_id"`', 'work item result payload must carry keyframe candidate IDs'],
    ['WorkItemResultApplicationAcceptKeyframeCandidate = "accept_keyframe_candidate"', 'work item application must distinguish keyframe candidate acceptance'],
  ],
  workflowEntitySchema: [
    ['numberField("resource_id", "details.attachments", "Resource", false)', 'workflow schema must keep direct asset-slot resource adoption read-only'],
    ['numberField("locked_asset_slot_id", "details.lockedAsset", "Locked Asset Slot", false)', 'workflow schema must keep direct asset-slot lock adoption read-only'],
  ],
  workflowEntityWrite: [
    ['assetSlotCandidatePortValue(values)', 'asset-slot media workflow writes must be routed to candidate creation'],
    ['assetSlotCandidateWritePort(portID)', 'asset-slot candidate media ports must be skipped by direct resource binding writes'],
  ],
  resourceBindingRepository: [
    ['func (r *gormRepository) BackfillAssetSlotResource(ctx context.Context, binding domainbinding.Binding) error', 'resource binding repository must expose the legacy backfill hook'],
    ['_ = binding', 'resource binding backfill hook must not adopt asset-slot resources directly'],
  ],
}

const REQUIRED_SOURCE_PATTERNS = {
  generatedCard: [
    [/attachments\.filter\(isGeneratedResultAttachment\)/, 'generated card must use generated-result attachment detection'],
  ],
  tasksPage: [
    [/keyframeCandidateOptionsForTarget[\s\S]*recordHasLoadedResource\(keyframe\)/, 'keyframe task candidate options must require loaded resources'],
  ],
  workbenchPage: [
    [/keyframeCandidatesForTargets[\s\S]*keyframe\.status[\s\S]*=== 'rejected'/, 'workbench keyframe candidates must filter rejected candidates'],
    [/adoptableCandidates = candidates\.filter\(hasLoadedResource\)/, 'workbench keyframe candidate acceptance must require loaded resources'],
    [/candidateResourceId = hasLoadedResource\(candidate\) \? numberOf\(candidate\.resource\?\.ID\) : 0/, 'workbench keyframe candidate previews must require loaded resources'],
  ],
}

const FRONTEND_CATALOG_COPY_PAIRS = [
  ['movscriptPolicy', 'frontendMovscriptPolicy', 'frontend packaged Movscript policy must match source catalog policy'],
  ['assetTool', 'frontendAssetTool', 'frontend packaged asset candidate tool must match source catalog tool'],
  ['keyframeTool', 'frontendKeyframeTool', 'frontend packaged keyframe candidate tool must match source catalog tool'],
  ['createJobTool', 'frontendCreateJobTool', 'frontend packaged create-job tool must match source catalog tool'],
  ['visualGenerationWorkflow', 'frontendVisualGenerationWorkflow', 'frontend packaged visual generation workflow must match source catalog workflow'],
  ['visualGenerationInstruction', 'frontendVisualGenerationInstruction', 'frontend packaged visual generation instruction must match source catalog instruction'],
]

test('candidate feature source contracts stay wired across agent, frontend, and backend', () => {
  assert.deepEqual(verifyCandidateFeatureSource(), [])
})

function verifyCandidateFeatureSource(root = repoRootFromMeta(import.meta.url)) {
  const sources = Object.fromEntries(
    Object.entries(SOURCE_FILES).map(([key, path]) => [key, readTextFile(root, path)]),
  )
  const errors = []

  for (const [key, checks] of Object.entries(REQUIRED_SOURCE_MARKERS)) {
    for (const [marker, message] of checks) {
      if (!sources[key].includes(marker)) errors.push(`${SOURCE_FILES[key]}: ${message}`)
    }
  }
  for (const [key, checks] of Object.entries(REQUIRED_SOURCE_PATTERNS)) {
    for (const [pattern, message] of checks) {
      if (!pattern.test(sources[key])) errors.push(`${SOURCE_FILES[key]}: ${message}`)
    }
  }
  for (const [sourceKey, frontendKey, message] of FRONTEND_CATALOG_COPY_PAIRS) {
    if (sources[sourceKey] !== sources[frontendKey]) {
      errors.push(`${SOURCE_FILES[frontendKey]}: ${message}`)
    }
  }

  return errors
}

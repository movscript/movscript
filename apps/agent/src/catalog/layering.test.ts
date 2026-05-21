import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DRAFT_SCHEMA_REGISTRY, getActiveSchemaForKind, getDraftSchemaEntry, listSchemasByKind } from '@movscript/draft-schemas'
import { buildLayeredCatalogRegistry } from './registry.js'
import { lintCatalog } from './linter.js'
import { buildMCPVirtualPack } from './mcpVirtualPack.js'
import { loadAgentPluginCatalog } from './loader.js'
import { resolveProfile } from '../profiles/resolveProfile.js'
import { composePrompt } from '../skills/promptComposer.js'
import { resolveRuntimeLayers } from '../skills/runtimeLayerResolver.js'
import { selectActiveWorkflows } from '../skills/triggerEvaluator.js'
import { resolveToolCatalog } from '../tools/capabilityResolver.js'
import { resolveVisibleTools } from '../tools/toolCatalogResolver.js'
import type { JSONValue } from '../types.js'

const CATALOG_SKILLS_DIR = new URL('../../catalog/skills/', import.meta.url)
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function schemaProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.properties) ? value.properties : {}
}

function schemaDescription(value: unknown): string {
  return isRecord(value) && typeof value.description === 'string' ? value.description : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function generationValidationErrorCodes(): string[] {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'contracts/agent/agent-generation-validation-error-v1.schema.json'), 'utf8')) as unknown
  const codes = isRecord(schema)
    && isRecord(schema.$defs)
    && isRecord(schema.$defs.errorCode)
    && Array.isArray(schema.$defs.errorCode.enum)
    ? schema.$defs.errorCode.enum
    : []
  return codes.filter((code): code is string => typeof code === 'string')
}

test('draft schema registry is keyed by full schema id and supports active kind lookup', () => {
  assert.ok(DRAFT_SCHEMA_REGISTRY['movscript.project_standards_proposal.v1'])
  assert.equal(getDraftSchemaEntry('movscript.project_standards_proposal.v1')?.kind, 'project_standards_proposal')
  assert.equal(getActiveSchemaForKind('project_standards_proposal').id, 'movscript.project_standards_proposal.v1')
  assert.deepEqual(listSchemasByKind('project_standards_proposal').map((schema) => schema.id), ['movscript.project_standards_proposal.v1'])
  assert.match(getActiveSchemaForKind('content_unit_proposal').promptSummary, /shot_size/)
  assert.match(getActiveSchemaForKind('content_unit_proposal').promptSummary, /lighting/)
  assert.match(getActiveSchemaForKind('content_unit_proposal').promptSummary, /performance/)
})

test('layered catalog registry exposes schema/tool/skill/pack/profile boundaries', () => {
  const catalog = loadAgentPluginCatalog()
  const registry = catalog.layeredRegistry

  assert.ok(registry.schemas.has('movscript.project_standards_proposal.v1'))
  assert.ok(registry.tools.has('movscript_validate_draft'))
  assert.ok(registry.tools.has('movscript_preview_draft_apply'))
  assert.ok(registry.tools.has('movscript_get_draft_model'))
  assert.ok(registry.tools.has('movscript_search_knowledge'))
  assert.ok(registry.tools.has('movscript_get_knowledge'))
  const readScriptsTool = registry.tools.get('movscript_read_project_scripts')
  assert.ok(readScriptsTool)
  assert.match(readScriptsTool.description, /后端项目剧本/)
  assert.match(readScriptsTool.description, /不要用 movscript_get_draft 读取剧本/)
  const readScriptsProperties = schemaProperties(readScriptsTool.inputSchema)
  assert.ok(readScriptsProperties.scriptId)
  assert.ok(readScriptsProperties.scriptTitle)
  assert.ok(readScriptsProperties.query)
  assert.ok(readScriptsProperties.contentLimit)
  assert.ok(registry.skills.has('movscript.policy.drafts'))
  assert.ok(registry.skills.has('movscript.expertise.storyboard.general-director'))
  assert.ok(registry.packs.has('movscript.pack.default'))
  assert.ok(registry.packs.has('movscript.pack.agent-core'))
  assert.ok(registry.packs.has('movscript.pack.drafts'))
  assert.ok(registry.packs.has('movscript.pack.movscript'))
  assert.ok(registry.profiles.has('movscript.profile.default'))
  assert.equal(registry.profiles.size, 1)
  assert.equal(catalog.catalogIssues.some((issue) => issue.level === 'error'), false)
  assert.deepEqual(catalog.catalogIssues, [])
})

test('target-state pack files and the default profile are loaded as first-class catalog resources', () => {
  const catalog = loadAgentPluginCatalog()
  const movscriptPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.movscript')
  const defaultProfile = catalog.profiles.find((profile) => profile.id === 'movscript.profile.default')

  assert.ok(movscriptPack)
  assert.equal(movscriptPack.source, 'builtin')
  assert.deepEqual(movscriptPack.schemas, [])
  assert.deepEqual(movscriptPack.requires?.packs, {
    'movscript.pack.agent-core': '>=1.0.0',
    'movscript.pack.drafts': '>=1.0.0',
  })
  assert.ok(movscriptPack.skills.includes('movscript.workflow.project-standards-proposal'))
  assert.ok(movscriptPack.skills.includes('movscript.workflow.setting-proposal'))
  assert.ok(movscriptPack.skills.includes('movscript.workflow.asset-proposal'))
  assert.ok(movscriptPack.skills.includes('movscript.workflow.production-proposal'))
  assert.ok(movscriptPack.skills.includes('movscript.workflow.content-unit-proposal'))
  assert.ok(movscriptPack.skills.includes('movscript.workflow.visual-generation'))
  assert.ok(movscriptPack.skills.includes('movscript.expertise.storyboard.general-director'))
  assert.ok(movscriptPack.tools.includes('movscript_search_knowledge'))
  assert.ok(movscriptPack.tools.includes('movscript_get_knowledge'))
  assert.ok(movscriptPack.knowledge?.includes('movscript.knowledge.storyboard'))
  assert.ok(catalog.layeredRegistry.knowledge.has('movscript.knowledge.storyboard'))
  const directorExpertise = catalog.layeredRegistry.skills.get('movscript.expertise.storyboard.general-director')
  assert.equal(directorExpertise?.kind, 'expertise')
  assert.equal(defaultProfile?.limits?.maxKnowledgeCharsPerRun, 8000)
  assert.equal(defaultProfile?.limits?.maxKnowledgeChunksPerRun, 3)
  assert.equal(defaultProfile?.limits?.maxHistoryMessages, 6)
  assert.equal(defaultProfile?.limits?.contextWindowCharLimit, 96000)
  const corePack = catalog.packs.find((pack) => pack.id === 'movscript.pack.agent-core')
  const draftPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.drafts')
  assert.ok(corePack?.skills.includes('movscript.workflow.planner-subagents'))
  assert.ok(draftPack?.skills.includes('movscript.workflow.draft-lifecycle'))
  assert.deepEqual(draftPack?.requires?.packs, { 'movscript.pack.agent-core': '>=1.0.0' })
  assert.ok(defaultProfile)
  assert.deepEqual(defaultProfile.enabledPacks, [
    'movscript.pack.agent-core',
    'movscript.pack.drafts',
    'movscript.pack.movscript',
  ])
  assert.equal(defaultProfile.persona, 'movscript.persona.default')
  assert.deepEqual(defaultProfile.enabledWorkflows, [
    'movscript.workflow.memory-access',
    'movscript.workflow.planner-subagents',
    'movscript.workflow.draft-lifecycle',
    'movscript.workflow.project-progress',
    'movscript.workflow.script-reading',
    'movscript.workflow.proposal-first',
    'movscript.workflow.project-standards-proposal',
    'movscript.workflow.setting-proposal',
    'movscript.workflow.asset-proposal',
    'movscript.workflow.setting-prep',
    'movscript.workflow.production-proposal',
    'movscript.workflow.asset-candidate-generation',
    'movscript.workflow.content-unit-proposal',
    'movscript.workflow.storyboard-gap-review',
    'movscript.workflow.visual-generation',
  ])
  assert.deepEqual(defaultProfile.enabledPolicies, [
    'movscript.policy.agent-core',
  ])

  const resolved = resolveProfile(catalog.layeredRegistry)
  assert.equal(resolved.profile.id, 'movscript.profile.default')
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.project-standards-proposal'))
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.planner-subagents'))
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.draft-lifecycle'))
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.script-reading'))
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.production-proposal'))
  assert.ok(resolved.profile.toolGrants.some((grant) => grant.name === 'agent_io_start' && grant.approval === 'always'))
  assert.ok(resolved.profile.toolGrants.some((grant) => grant.name === 'movscript_request_user_input' && grant.approval === 'never'))
})

test('draft lifecycle workflow describes read-before-write draft handling', () => {
  const catalog = loadAgentPluginCatalog()
  const profile = resolveProfile(catalog.layeredRegistry).profile
  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.draft-lifecycle')

  assert.ok(workflow?.kind === 'workflow')
  assert.ok(workflow.toolRefs.includes('tool://movscript_get_draft'))
  assert.ok(workflow.toolRefs.includes('tool://movscript_create_draft'))
  assert.ok(workflow.toolRefs.includes('tool://movscript_validate_draft'))
  assert.ok(workflow.toolRefs.includes('tool://movscript_preview_draft_apply'))
  assert.equal(workflow.toolRefs.includes('tool://movscript_list_drafts'), false)
  assert.match(workflow.instructionTemplate, /当前会话没有 draftId/)
  assert.match(workflow.instructionTemplate, /若用户或当前会话上下文给了 draftId，先 get 该 draft/)
  assert.match(workflow.instructionTemplate, /不要跨会话查找旧 draft/)
  assert.match(workflow.instructionTemplate, /绝不在未读取当前会话现有 draft 前直接覆盖写入/)

  const selected = selectActiveWorkflows([workflow], {
    profile,
    message: '修改这个 draft',
    intents: [],
    uiContext: { projectId: 1 },
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  })
  assert.deepEqual(selected.warnings, [])
  assert.deepEqual(selected.workflows.map((item) => item.id), ['movscript.workflow.draft-lifecycle'])
})

test('proposal workflows reference runtime draft model contract before field-specific edits', () => {
  const catalog = loadAgentPluginCatalog()
  const workflowIds = [
    'movscript.workflow.draft-lifecycle',
    'movscript.workflow.project-standards-proposal',
    'movscript.workflow.production-proposal',
  ]

  for (const workflowId of workflowIds) {
    const workflow = catalog.layeredRegistry.skills.get(workflowId)
    assert.ok(workflow?.kind === 'workflow', `${workflowId} should be a workflow`)
    assert.match(workflow.instructionTemplate, /runtime draft model contract|模型契约/, `${workflowId} should point to the runtime draft model contract`)
    assert.match(workflow.instructionTemplate, /MCP/, `${workflowId} should route field contracts through MCP`)
    assert.match(workflow.instructionTemplate, /schema fallback|schema.*fallback/i, `${workflowId} should define the current schema fallback`)
    assert.ok(workflow.toolRefs.includes('tool://movscript_get_draft_model'), `${workflowId} should be able to call the draft model MCP contract tool`)
  }
})

test('planner subagent behavior is provided by agent-core workflow skill', () => {
  const catalog = loadAgentPluginCatalog()
  const profile = resolveProfile(catalog.layeredRegistry).profile
  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.planner-subagents')

  assert.ok(workflow?.kind === 'workflow')
  assert.ok(workflow.toolRefs.includes('tool://movscript_spawn_subagent'))
  assert.ok(workflow.toolRefs.includes('tool://movscript_wait_subagent'))
  assert.match(workflow.instructionTemplate, /简单、单上下文、立即阻塞的任务由 planner 自己完成/)
  assert.match(workflow.instructionTemplate, /maxWorkers/)
  assert.match(workflow.instructionTemplate, /workerTimeoutMs/)

  const selected = selectActiveWorkflows([workflow], {
    profile,
    message: '请并行处理这些任务',
    intents: ['planner_subagents'],
    uiContext: {},
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  })
  assert.deepEqual(selected.warnings, [])
  assert.deepEqual(selected.workflows.map((item) => item.id), ['movscript.workflow.planner-subagents'])

  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx: {
      profile,
      message: '请并行处理这些任务',
      intents: ['planner_subagents'],
      uiContext: {},
      conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
      catalogVersion: catalog.layeredRegistry.version,
    },
    policies: [],
    workflows: selected.workflows,
  })
  assert.match(prompt.systemPrompt, /Planner Subagents/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{tool:/)
})

test('asset candidate preparation is separated from generation execution', () => {
  const catalog = loadAgentPluginCatalog()
  const assetCandidate = catalog.layeredRegistry.skills.get('movscript.workflow.asset-candidate-generation')
  const visualGeneration = catalog.layeredRegistry.skills.get('movscript.workflow.visual-generation')
  const listModelsTool = catalog.layeredRegistry.tools.get('movscript_list_models')
  const ioStartTool = catalog.layeredRegistry.tools.get('agent_io_start')
  const ioWaitTool = catalog.layeredRegistry.tools.get('agent_io_wait')
  const attachCandidateTool = catalog.layeredRegistry.tools.get('movscript_attach_asset_slot_candidate')
  const attachKeyframeCandidateTool = catalog.layeredRegistry.tools.get('movscript_attach_keyframe_candidate')
  const productionContextTool = catalog.layeredRegistry.tools.get('movscript_query_production_context')
  const profile = resolveProfile(catalog.layeredRegistry).profile

  assert.ok(assetCandidate?.kind === 'workflow')
  assert.ok(visualGeneration?.kind === 'workflow')
  assert.match(assetCandidate.outputContract ?? '', /output_resource_id 列表/)
  assert.match(assetCandidate.outputContract ?? '', /每个 output_resource_id 的候选写入结果/)
  assert.match(visualGeneration.outputContract ?? '', /输出资源列表/)
  assert.match(visualGeneration.outputContract ?? '', /每个 output_resource_id 的候选集写入结果/)
  assert.ok(listModelsTool)
  assert.ok(ioStartTool)
  assert.ok(ioWaitTool)
  assert.ok(attachCandidateTool)
  assert.ok(attachKeyframeCandidateTool)
  assert.ok(productionContextTool)
  assert.match(JSON.stringify(visualGeneration.triggers), /关键帧候选/)
  assert.match(JSON.stringify(visualGeneration.triggers), /画面锚点候选/)
  assert.match(JSON.stringify(visualGeneration.triggers), /keyframe candidate/)
  assert.match(JSON.stringify(visualGeneration.triggers), /visual anchor candidate/)

  assert.ok(assetCandidate.toolRefs.includes('tool://agent_io_start'))
  assert.ok(assetCandidate.toolRefs.includes('tool://agent_io_wait'))
  assert.ok(assetCandidate.toolRefs.includes('tool://movscript_attach_asset_slot_candidate'))
  assert.equal(assetCandidate.toolRefs.includes('tool://movscript_attach_keyframe_candidate'), false)
  assert.equal(assetCandidate.toolRefs.includes('tool://agent_io_cancel'), true)
  assert.ok(assetCandidate.toolRefs.includes('tool://movscript_get_focus'))
  assert.ok(assetCandidate.toolRefs.includes('tool://movscript_get_draft_model'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_get_focus'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_get_draft_model'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_request_user_input'))
  assert.ok(visualGeneration.toolRefs.includes('tool://agent_io_start'))
  assert.ok(visualGeneration.toolRefs.includes('tool://agent_io_wait'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_attach_asset_slot_candidate'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_attach_keyframe_candidate'))
  assert.ok(visualGeneration.toolRefs.includes('tool://agent_io_cancel'))

  const ctx = {
    profile,
    message: '请准备素材候选',
    intents: ['asset_candidate_generation'],
    uiContext: { projectId: 1 },
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const assetTools = resolveVisibleTools({ registry: catalog.layeredRegistry, ctx, activeWorkflows: [assetCandidate] })
  const visualTools = resolveVisibleTools({ registry: catalog.layeredRegistry, ctx, activeWorkflows: [visualGeneration] })
  assert.ok(assetTools.available.some((tool) => tool.name === 'agent_io_start'))
  assert.ok(assetTools.available.some((tool) => tool.name === 'agent_io_wait'))
  assert.ok(assetTools.available.some((tool) => tool.name === 'movscript_attach_asset_slot_candidate'))
  assert.equal(assetTools.available.some((tool) => tool.name === 'movscript_attach_keyframe_candidate'), false)
  assert.ok(assetTools.available.some((tool) => tool.name === 'agent_io_cancel'))
  assert.ok(assetTools.available.some((tool) => tool.name === 'movscript_get_focus'))
  assert.ok(assetTools.available.some((tool) => tool.name === 'movscript_get_draft_model'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'agent_io_start'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'agent_io_wait'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'movscript_attach_asset_slot_candidate'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'movscript_attach_keyframe_candidate'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'agent_io_cancel'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'movscript_request_user_input'))

  assert.match(assetCandidate.instructionTemplate, /生成任务创建、监控，以及把成功输出加入目标 asset slot 候选集/)
  assert.match(assetCandidate.instructionTemplate, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_asset_slot_candidate`/)
  assert.match(assetCandidate.instructionTemplate, /不要把 `output_resource_ids`、`resource_ids` 或多个资源 ID 合并传入同一次候选写入/)
  assert.match(assetCandidate.instructionTemplate, /如果有多个 output_resource_id，必须逐个调用 attach，并逐项报告成功、失败或阻塞/)
  assert.match(assetCandidate.instructionTemplate, /除非 `movscript_attach_asset_slot_candidate` 对对应 output_resource_id 成功返回，否则绝不声称该资源已经加入候选集/)
  assert.match(assetCandidate.instructionTemplate, /使用模型发现 contracts，而不是 provider 假设/)
  assert.match(assetCandidate.instructionTemplate, /先确认当前设定材料是否已有可复用素材/)
  assert.match(assetCandidate.instructionTemplate, /保留人物一致性、场景一致性和可复用识别点/)
  assert.match(assetCandidate.instructionTemplate, /主角或重要角色即使文本说“丑”“狼狈”“不起眼”/)
  assert.match(visualGeneration.instructionTemplate, /只能通过需要审批的异步生成 runtime operation 创建生成任务/)
  assert.match(visualGeneration.instructionTemplate, /优先用 `model_contracts` 做紧凑规划/)
  assert.match(visualGeneration.instructionTemplate, /确认当前设定材料是否已有素材/)
  assert.match(visualGeneration.instructionTemplate, /include keyframes/)
  assert.match(visualGeneration.instructionTemplate, /已有角色\/场景素材必须优先作为一致性约束/)
  assert.match(visualGeneration.instructionTemplate, /主角、核心反派、重要常驻角色要保持可长期复用的美术价值/)
  assert.match(visualGeneration.instructionTemplate, /优先用 `mode: "any"` 让任一任务完成即可返回/)
  assert.match(visualGeneration.instructionTemplate, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_asset_slot_candidate`/)
  assert.match(visualGeneration.instructionTemplate, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_keyframe_candidate`/)
  assert.match(visualGeneration.instructionTemplate, /不要把 `output_resource_ids`、`resource_ids` 或多个资源 ID 合并传入同一次候选写入/)
  assert.match(visualGeneration.instructionTemplate, /每个 output_resource_id 的候选集写入结果/)
  assert.match(visualGeneration.instructionTemplate, /如果有多个 output_resource_id，必须逐个调用 attach，并逐项报告成功、失败或阻塞/)
  assert.match(visualGeneration.instructionTemplate, /除非用户明确要求只预览结果，否则不要停留在让用户手动选择/)
  assert.match(visualGeneration.instructionTemplate, /只提交被选中模型的 `supported_param_keys` \/ `supported_params` 支持的顶层参数和 `extra_params` 值/)
  assert.match(visualGeneration.instructionTemplate, /图片\/视频数量满足所选 `job_type` contract 的 `input_requirements` 的参考资源/)
  assert.match(visualGeneration.instructionTemplate, /`image` 文生图不需要参考图/)
  assert.match(visualGeneration.instructionTemplate, /将带有 `audit_version: 1` 的 `param_validation` 视为参数过滤和本地 preflight 的审计轨迹/)
  assert.match(visualGeneration.instructionTemplate, /`input_preflight_errors`/)
  assert.match(visualGeneration.instructionTemplate, /解释性审计数据，而不是最终后端拒绝/)
  assert.match(visualGeneration.instructionTemplate, /不要在同一次请求中自动修复 `UNSUPPORTED_OUTPUT_TYPE` 或 `INVALID_INPUT_COUNT`/)
  assert.match(visualGeneration.instructionTemplate, /agent_io_start\(kind:"generation_job"\)/)
  assert.match(listModelsTool.description, /model_contracts/)
  assert.match(listModelsTool.description, /contract_version 1/)
  assert.match(listModelsTool.description, /supported_param_keys/)
  const listModelsProperties = schemaProperties(listModelsTool.inputSchema)
  assert.ok(listModelsProperties.feature_key)
  assert.ok(listModelsProperties.provider_variants)
  assert.ok(listModelsProperties.include_provider_variants)
  const listModelsOutputProperties = schemaProperties(listModelsTool.outputSchema)
  assert.ok(listModelsOutputProperties.model_contracts)
  assert.ok(listModelsOutputProperties.models)
  const listModelsContract = isRecord(listModelsOutputProperties.model_contracts)
    && isRecord(listModelsOutputProperties.model_contracts.items)
    ? listModelsOutputProperties.model_contracts.items
    : {}
  const listModelsContractProperties = schemaProperties(listModelsContract)
  assert.ok(listModelsContractProperties.model_id)
  assert.ok(listModelsContractProperties.logical_model_id)
  assert.ok(listModelsContractProperties.capabilities)
  assert.ok(listModelsContractProperties.input_requirements)
  assert.ok(listModelsContractProperties.supported_param_keys)
  assert.ok(listModelsContractProperties.supported_params)
  assert.ok(listModelsContractProperties.params_schema_rule_count)
  assert.match(attachCandidateTool.description, /加入某个 asset slot 的候选集/)
  assert.match(attachCandidateTool.description, /不会 accept、select、bind 或 lock 候选/)
  assert.equal(attachCandidateTool.risk, 'write')
  const attachCandidateProperties = schemaProperties(attachCandidateTool.inputSchema)
  assert.ok(attachCandidateProperties.asset_slot_id)
  assert.ok(attachCandidateProperties.assetSlotId)
  assert.ok(attachCandidateProperties.resource_id)
  assert.ok(attachCandidateProperties.resourceId)
  assert.ok(attachCandidateProperties.output_resource_id)
  assert.ok(attachCandidateProperties.outputResourceId)
  assert.ok(attachCandidateProperties.resource_ids)
  assert.ok(attachCandidateProperties.resourceIds)
  assert.ok(attachCandidateProperties.output_resource_ids)
  assert.ok(attachCandidateProperties.outputResourceIds)
  assert.ok(attachCandidateProperties.source_type)
  assert.ok(attachCandidateProperties.sourceType)
  assert.ok(attachCandidateProperties.source_id)
  assert.ok(attachCandidateProperties.sourceId)
  assert.ok(attachCandidateProperties.jobId)
  assert.equal((attachCandidateTool.inputSchema as any).additionalProperties, false)
  assert.equal((attachCandidateTool.outputSchema as any).additionalProperties, false)
  assert.deepEqual((attachCandidateTool.inputSchema as any).allOf, [
    { anyOf: [{ required: ['asset_slot_id'] }, { required: ['assetSlotId'] }] },
    { anyOf: [
      { required: ['resource_id'] },
      { required: ['resourceId'] },
      { required: ['output_resource_id'] },
      { required: ['outputResourceId'] },
      { required: ['resource_ids'] },
      { required: ['resourceIds'] },
      { required: ['output_resource_ids'] },
      { required: ['outputResourceIds'] },
    ] },
  ])
  assert.match(attachKeyframeCandidateTool.description, /加入某个原始 keyframe \/ 画面锚点的候选集/)
  assert.match(attachKeyframeCandidateTool.description, /不要把已有 generated candidate keyframe 当作目标传入/)
  assert.match(attachKeyframeCandidateTool.description, /不会 accept、select、bind 或 lock 候选/)
  assert.equal(attachKeyframeCandidateTool.risk, 'write')
  const attachKeyframeCandidateProperties = schemaProperties(attachKeyframeCandidateTool.inputSchema)
  assert.ok(attachKeyframeCandidateProperties.keyframe_id)
  assert.ok(attachKeyframeCandidateProperties.keyframeId)
  assert.ok(attachKeyframeCandidateProperties.target_keyframe_id)
  assert.ok(attachKeyframeCandidateProperties.targetKeyframeId)
  assert.match(schemaDescription(attachKeyframeCandidateProperties.target_keyframe_id), /原始目标 keyframe \/ 画面锚点 ID 的别名/)
  assert.match(schemaDescription(attachKeyframeCandidateProperties.target_keyframe_id), /不要传 generated candidate keyframe 自身 ID/)
  assert.ok(attachKeyframeCandidateProperties.resource_id)
  assert.ok(attachKeyframeCandidateProperties.resourceId)
  assert.ok(attachKeyframeCandidateProperties.output_resource_id)
  assert.ok(attachKeyframeCandidateProperties.outputResourceId)
  assert.ok(attachKeyframeCandidateProperties.resource_ids)
  assert.ok(attachKeyframeCandidateProperties.resourceIds)
  assert.ok(attachKeyframeCandidateProperties.output_resource_ids)
  assert.ok(attachKeyframeCandidateProperties.outputResourceIds)
  assert.ok(attachKeyframeCandidateProperties.source_type)
  assert.ok(attachKeyframeCandidateProperties.sourceType)
  assert.ok(attachKeyframeCandidateProperties.source_id)
  assert.ok(attachKeyframeCandidateProperties.sourceId)
  assert.ok(attachKeyframeCandidateProperties.jobId)
  assert.equal((attachKeyframeCandidateTool.inputSchema as any).additionalProperties, false)
  assert.equal((attachKeyframeCandidateTool.outputSchema as any).additionalProperties, false)
  assert.deepEqual((attachKeyframeCandidateTool.inputSchema as any).allOf, [
    { anyOf: [{ required: ['keyframe_id'] }, { required: ['keyframeId'] }, { required: ['target_keyframe_id'] }, { required: ['targetKeyframeId'] }] },
    { anyOf: [
      { required: ['resource_id'] },
      { required: ['resourceId'] },
      { required: ['output_resource_id'] },
      { required: ['outputResourceId'] },
      { required: ['resource_ids'] },
      { required: ['resourceIds'] },
      { required: ['output_resource_ids'] },
      { required: ['outputResourceIds'] },
    ] },
  ])
  const productionContextProperties = schemaProperties(productionContextTool.inputSchema)
  const productionContextInclude = productionContextProperties.include as { items?: { enum?: string[] } }
  assert.ok(productionContextInclude.items?.enum?.includes('keyframes'))
  assert.match(productionContextTool.description, /排除 AI 候选画面锚点/)
  const productionContextCapability = productionContextTool.capability
  if (typeof productionContextCapability !== 'string') assert.fail('production context tool capability should be a string')
  assert.match(productionContextCapability, /keyframes 结果不包含 AI 候选画面锚点/)
  assert.ok(attachCandidateProperties.note)
  const attachCandidateOutputProperties = schemaProperties(attachCandidateTool.outputSchema)
  assert.ok(attachCandidateOutputProperties.candidate)
  assert.ok(attachCandidateOutputProperties.candidate_asset_slot_id)
})

test('storyboard knowledge tools are only visible for content unit workflows', () => {
  const catalog = loadAgentPluginCatalog()
  const contentUnit = catalog.layeredRegistry.skills.get('movscript.workflow.content-unit-proposal')
  assert.ok(contentUnit?.kind === 'workflow')

  const inactive = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: catalog.manifest,
    currentProjectId: 4,
    activeSkills: [],
    userMessage: '普通聊天',
  })
  assert.equal(inactive.byName.movscript_search_knowledge?.available, false)
  assert.equal(inactive.byName.movscript_search_knowledge?.unavailableReason, 'workflow_scope')

  const active = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: catalog.manifest,
    currentProjectId: 4,
    activeSkills: [{
      id: contentUnit.id,
      name: contentUnit.name,
      description: contentUnit.description,
      enabled: contentUnit.enabled,
      category: contentUnit.kind,
      instruction: contentUnit.instructionTemplate,
      compiledInstruction: contentUnit.instructionTemplate,
      toolHints: contentUnit.toolRefs,
      resolvedPriority: contentUnit.priority,
      activationReason: 'trigger',
      warnings: [],
      metadata: { kind: 'workflow' },
    }],
    userMessage: '规划内容单元分镜节奏',
  })
  assert.equal(active.byName.movscript_search_knowledge?.available, true)
  assert.equal(active.byName.movscript_get_knowledge?.available, true)
})

test('content unit proposal activates general director storyboard expertise', () => {
  const catalog = loadAgentPluginCatalog()
  const layers = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: catalog.manifest,
    message: '请用普通导演的方式给这个情节做分镜，写出镜头参数、人物动作和光线',
    debugContext: {
      route: { pathname: '/content-unit-orchestrate' },
      projects: [{ id: 4, name: '测试项目' }],
      project: { id: 4, name: '测试项目' },
      selection: { entityType: 'scene_moment', entityId: 8 },
      productionId: 2,
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
  })

  assert.ok(layers.trace.workflowIds.includes('movscript.workflow.content-unit-proposal'))
  assert.ok(layers.skills.some((skill) => skill.id === 'movscript.workflow.content-unit-proposal'))
  assert.equal(layers.skillDiscovery.profileId, 'movscript.profile.default')
  assert.ok(layers.skillDiscovery.enabledPackIds.includes('movscript.pack.movscript'))
  assert.deepEqual(layers.manifest.metadata?.promptPolicy, {
    projectStandards: { mode: 'required_for_project_work' },
    finalSourceBlock: true,
  })
  assert.ok(layers.skillDiscovery.availableSkills.some((skill) => skill.id === 'movscript.workflow.content-unit-proposal' && skill.active))
  assert.ok(layers.skillDiscovery.availableSkills.some((skill) => skill.id === 'movscript.expertise.storyboard.general-director' && skill.kind === 'expertise'))
  const expertise = layers.skills.find((skill) => skill.id === 'movscript.expertise.storyboard.general-director')
  assert.ok(expertise)
  assert.equal(expertise.category, 'expertise')
  assert.match(expertise.compiledInstruction, /镜头参数/)
  assert.match(expertise.compiledInstruction, /人物动作/)
  assert.match(expertise.compiledInstruction, /光线/)
})

test('manual script reading skill is discovered before it exposes script tools', () => {
  const catalog = loadAgentPluginCatalog()
  const message = '请查看 projectId=5 的总剧本'
  const debugContext = {
    route: { pathname: '/project/scripts' },
    projects: [{ id: 5, name: '好运甜妻' }],
    project: { id: 5, name: '好运甜妻' },
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }

  const coreOnly = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: {
      ...catalog.manifest,
      metadata: {
        ...(catalog.manifest.metadata ?? {}),
        profileId: 'movscript.profile.default.tool-policy',
        defaultToolGrants: [],
      },
    },
    message,
    debugContext,
  })

  assert.equal(coreOnly.warnings.some((warning) => /Profile movscript\.profile\.default\.tool-policy/.test(warning)), false)
  assert.equal(coreOnly.manifest.metadata?.profileId, 'movscript.profile.default')
  assert.equal(coreOnly.trace.workflowIds.includes('movscript.workflow.script-reading'), false)
  const discoveredScriptSkill = coreOnly.skillDiscovery.availableSkills.find((skill) => skill.id === 'movscript.workflow.script-reading')
  assert.ok(discoveredScriptSkill)
  assert.equal(discoveredScriptSkill.loadMode, 'manual')

  const coreTools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: coreOnly.manifest,
    currentProjectId: 5,
    activeSkills: coreOnly.skills,
    userMessage: message,
  })
  assert.equal(coreTools.byName.movscript_read_project_scripts?.available, false)
  assert.equal(coreTools.byName.movscript_read_project_scripts?.unavailableReason, 'workflow_scope')
  assert.equal(coreTools.byName.movscript_update_active_skills?.available, true)

  const loaded = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: coreOnly.manifest,
    message,
    debugContext,
    requestedSkillIds: ['movscript.workflow.script-reading'],
  })
  assert.ok(loaded.trace.workflowIds.includes('movscript.workflow.script-reading'))

  const loadedTools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: loaded.manifest,
    currentProjectId: 5,
    activeSkills: loaded.skills,
    userMessage: message,
  })
  assert.equal(loadedTools.byName.movscript_read_project_scripts?.available, true)
})

test('manual script reading skill overrides tool-policy deny for its script tool', () => {
  const catalog = loadAgentPluginCatalog()
  const message = '请查看 projectId=5 的总剧本'
  const debugContext = {
    route: { pathname: '/project/scripts' },
    projects: [{ id: 5, name: '好运甜妻' }],
    project: { id: 5, name: '好运甜妻' },
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
  const defaultToolGrants = catalog.manifest.tools.map((grant) => ({
    ...grant,
    mode: grant.name === 'movscript_read_project_scripts' ? 'deny' as const : grant.mode,
  }))

  const coreOnly = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: {
      ...catalog.manifest,
      metadata: {
        ...(catalog.manifest.metadata ?? {}),
        profileId: 'movscript.profile.default.tool-policy',
        defaultToolGrants,
      },
    },
    message,
    debugContext,
  })
  const coreTools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: coreOnly.manifest,
    currentProjectId: 5,
    activeSkills: coreOnly.skills,
    userMessage: message,
  })
  assert.equal(coreTools.byName.movscript_read_project_scripts?.available, false)
  assert.equal(coreTools.byName.movscript_read_project_scripts?.unavailableReason, 'workflow_scope')

  const loaded = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: coreOnly.manifest,
    message,
    debugContext,
    requestedSkillIds: ['movscript.workflow.script-reading'],
  })
  assert.equal(loaded.manifest.tools.find((grant) => grant.name === 'movscript_read_project_scripts')?.mode, 'allow')
  const loadedTools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: loaded.manifest,
    currentProjectId: 5,
    activeSkills: loaded.skills,
    userMessage: message,
  })
  assert.equal(loadedTools.byName.movscript_read_project_scripts?.available, true)
  assert.equal(loadedTools.byName.movscript_read_project_scripts?.granted, true)
})

test('visual generation prompt exposes backend generation validation error codes', () => {
  const catalog = loadAgentPluginCatalog()
  const visualGeneration = catalog.layeredRegistry.skills.get('movscript.workflow.visual-generation')
  const profile = resolveProfile(catalog.layeredRegistry).profile
  assert.ok(visualGeneration?.kind === 'workflow')

  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx: {
      profile,
      message: '生成视频',
      intents: ['visual_generation'],
      uiContext: { projectId: 1 },
      conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
      catalogVersion: catalog.layeredRegistry.version,
    },
    policies: [],
    workflows: [visualGeneration],
  })

  assert.doesNotMatch(prompt.systemPrompt, /\{\{tool:/)
  for (const code of generationValidationErrorCodes()) {
    assert.match(prompt.systemPrompt, new RegExp(`\\b${code}\\b`))
  }
  assert.match(prompt.systemPrompt, /`preflight_errors` 和 `input_preflight_errors` 视为解释性审计数据/)
  assert.match(prompt.systemPrompt, /不要在同一次请求中自动修复 `UNSUPPORTED_OUTPUT_TYPE` 或 `INVALID_INPUT_COUNT`/)
  assert.match(prompt.systemPrompt, /已有角色\/场景素材必须优先作为一致性约束/)
  assert.match(prompt.systemPrompt, /优先用 `mode: "any"` 让任一任务完成即可返回/)
  assert.match(prompt.systemPrompt, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_asset_slot_candidate`/)
  assert.match(prompt.systemPrompt, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_keyframe_candidate`/)
  assert.match(prompt.systemPrompt, /如果有多个 output_resource_id，必须逐个调用 attach，并逐项报告成功、失败或阻塞/)
  assert.match(prompt.systemPrompt, /除非用户明确要求只预览结果，否则不要停留在让用户手动选择/)
})

test('image edit wording with image context activates visual generation tools', () => {
  const catalog = loadAgentPluginCatalog()
  const message = '让这张小猫站起来'
  const layers = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: catalog.manifest,
    message,
    debugContext: {
      route: { pathname: '/script-split-workbench' },
      projects: [{ id: 4, name: '测试项目' }],
      project: { id: 4, name: '测试项目' },
      selection: null,
      recentResources: [{ id: 2, name: 'job_3_image.jpg', type: 'image', mimeType: 'image/jpeg' }],
      attachments: [{ id: 'resource-2', name: 'job_3_image.jpg', type: 'image', resourceId: 2 }],
      memories: [],
      labels: ['Project 素材', 'image_edit 生成请求'],
    },
  })

  assert.ok(layers.trace.workflowIds.includes('movscript.workflow.visual-generation'))
  assert.ok(layers.skills.some((skill) => skill.id === 'movscript.workflow.visual-generation'))

  const tools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: layers.manifest,
    currentProjectId: 4,
    activeSkills: layers.skills,
    userMessage: message,
  })
  assert.ok(tools.available.some((tool) => tool.name === 'agent_io_start'))
  assert.notEqual(tools.byName.agent_io_start?.unavailableReason, 'workflow_scope')
})

test('asset candidate generation activates visual generation tools on asset slot pages', () => {
  const catalog = loadAgentPluginCatalog()
  const message = '生成图片候选 人物主视图 周建军'
  const layers = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: catalog.manifest,
    message,
    debugContext: {
      route: { pathname: '/asset-slots' },
      projects: [{ id: 4, name: '测试项目' }],
      project: { id: 4, name: '测试项目' },
      selection: { entityType: 'asset_slot', entityId: 24 },
      recentResources: [],
      attachments: [],
      memories: [],
      labels: ['asset_candidate_generation'],
    },
  })

  assert.deepEqual(layers.trace.workflowIds, [
    'movscript.workflow.asset-candidate-generation',
    'movscript.workflow.visual-generation',
  ])
  assert.ok(layers.ctx.intents.includes('asset_candidate_generation'))
  assert.ok(layers.ctx.intents.includes('visual_generation'))

  const tools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: layers.manifest,
    currentProjectId: 4,
    activeSkills: layers.skills,
    userMessage: message,
  })
  assert.ok(tools.available.some((tool) => tool.name === 'agent_io_start'))
  assert.notEqual(tools.byName.agent_io_start?.unavailableReason, 'workflow_scope')
})

test('pre-production prep routes to setting and asset proposal drafts without generation tools', () => {
  const catalog = loadAgentPluginCatalog()
  const message = [
    '请梳理当前项目「测试项目」的前期准备。',
    '读取当前 draft model / 已有 proposal draft 的 seed 与 snapshot 作为设定基准，再检查 asset_slots，输出可审阅草稿：',
    '1. 如果设定资料缺漏、重复、状态不清晰，创建或更新 setting_proposal；只修改 proposal.creative_references，proposal.asset_slots 必须为空。',
    '2. 如果素材需求缺漏、归属不清晰、优先级/状态/类型需要修正，创建或更新 asset_proposal；只修改 proposal.asset_slots，proposal.creative_references 必须为空。',
    '3. 不要生成候选素材，不要创建生成任务，不要把候选图 prompt 写成本轮结果。',
    '4. 已有 setting_proposal draft 时，优先使用 draft 的 metadata.seed.data 或 content.snapshot_base；不要用 live creative reference 查询覆盖 draft 基准。',
    '5. 如果查询工具返回 total_count > 0 但 count/returned = 0，说明当前筛选没有可用明细；应回到 draft seed/snapshot 或放宽筛选，不要据此判定“有资料但不能编辑”。',
    '6. 保留已确认信息，在 summary 或 impact_notes 中列出关键缺口和建议审阅顺序。',
  ].join('\n')
  const layers = resolveRuntimeLayers({
    registry: catalog.layeredRegistry,
    baseManifest: catalog.manifest,
    message,
    debugContext: {
      route: { pathname: '/pre-production' },
      projects: [{ id: 4, name: '测试项目' }],
      project: { id: 4, name: '测试项目' },
      selection: { entityType: 'project', entityId: 4 },
      recentResources: [],
      attachments: [],
      memories: [],
      labels: ['pre-production', 'setting_proposal', 'asset_proposal', 'draft-review'],
    },
  })

  assert.deepEqual(layers.trace.workflowIds, [
    'movscript.workflow.setting-proposal',
    'movscript.workflow.asset-proposal',
  ])
  assert.ok(!layers.ctx.intents.includes('asset_candidate_generation'))
  assert.ok(!layers.ctx.intents.includes('visual_generation'))

  const tools = resolveToolCatalog({
    mcpTools: [],
    registry: catalog.registry,
    manifest: layers.manifest,
    currentProjectId: 4,
    activeSkills: layers.skills,
    userMessage: message,
  })
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_create_draft'))
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_validate_draft'))
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_preview_draft_apply'))
  assert.equal(tools.byName.agent_io_start?.unavailableReason, 'workflow_scope')
})

test('workflow skills use isolated skill directories', () => {
  assert.equal(existsSync(new URL('workflow/general-workflows.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/project-standards-proposal.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/project-standards-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/proposal-workflows.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/proposal-first.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/production-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/dual-orchestration.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/asset-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/content-unit-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/content-unit-media-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/script-split.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/setting-prep.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/script-writing.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/project-progress.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/storyboard-gap-review.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/creative-workbench.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/visual-generation.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/visual-generation.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/asset-candidate-generation.workflow.md', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/planning/proposal-first/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/project/project-standards-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/production/production-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/production/dual-orchestration/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/asset/asset-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/content-unit/content-unit-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/content-unit/content-unit-media-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/planning/script-split/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/project/setting-prep/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/writing/script-writing/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/workspace/project-progress/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/content-unit/storyboard-gap-review/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/creative/creative-workbench/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('movscript/workflow/generation/visual-generation/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/generation/visual-generation/instruction.md', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/asset/asset-candidate-generation/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('movscript/workflow/proposal/asset/asset-candidate-generation/instruction.md', CATALOG_SKILLS_DIR)), true)
})

test('target-state skill and tool files define the active runtime resources', () => {
  const catalog = loadAgentPluginCatalog()
  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.project-standards-proposal')
  const inputTool = catalog.layeredRegistry.tools.get('movscript_request_user_input')

  assert.ok(workflow?.kind === 'workflow')
  assert.equal(workflow.version, '1.0.0')
  assert.ok(workflow.schemaRefs?.includes('schema://movscript.project_standards_proposal.v1'))
  assert.match(workflow.instructionTemplate, /目标：\n产出或编辑一个本地 project_standards_proposal draft/)
  assert.match(workflow.instructionTemplate, /\{\{schema:movscript\.project_standards_proposal\.v1\}\}/)
  assert.equal(catalog.layeredRegistry.skills.has('movscript.workflow.script-split'), false)
  assert.equal(catalog.layeredRegistry.skills.has('movscript.workflow.script-writing'), false)
  assert.equal(catalog.layeredRegistry.skills.has('movscript.workflow.creative-workbench'), false)
  assert.ok(inputTool)
  assert.equal(inputTool.source, 'runtime')
  assert.equal(inputTool.defaults.approval, 'never')
  assert.deepEqual(inputTool.inputSchema.required, ['question'])
})

test('linter rejects missing refs and old profile permissions field', () => {
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [],
    layeredSkills: [{
      id: 'movscript.workflow.broken',
      kind: 'workflow',
      version: '1.0.0',
      name: 'Broken',
      description: 'Broken workflow',
      priority: 100,
      enabled: true,
      instructionTemplate: 'Use {{tool:missing_tool}} and {{schema:missing.schema.v1}}.',
      triggers: [{ kind: 'intent', id: 'broken' }],
      toolRefs: ['tool://missing_tool'],
    }],
  })
  registry.profiles.set('movscript.profile.broken', {
    schema: 'movscript.agent.profile.v1',
    id: 'movscript.profile.broken',
    version: '1.0.0',
    name: 'Broken',
    enabledPacks: ['movscript.pack.default'],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants: [],
    permissions: ['draft.write'],
  } as never)

  const issues = lintCatalog(registry)
  assert.ok(issues.some((issue) => issue.code === 'skill.tool_ref.missing'))
  assert.ok(issues.some((issue) => issue.code === 'skill.placeholder.schema_missing'))
  assert.ok(issues.some((issue) => issue.code === 'profile.permissions.present'))
})

test('linter rejects packs that do not cover included skill refs', () => {
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [{
      name: 'studio_read',
      description: 'Read studio data.',
      permission: 'studio.read',
      risk: 'read',
      projectScoped: false,
      requiresApprovalByDefault: false,
      source: 'runtime',
    }],
    layeredSkills: [{
      id: 'studio.workflow.read',
      kind: 'workflow',
      version: '1.0.0',
      name: 'Read',
      description: 'Read workflow',
      priority: 100,
      enabled: true,
      instructionTemplate: 'Read.',
      triggers: [{ kind: 'intent', id: 'read' }],
      toolRefs: ['tool://studio_read'],
    }],
    packs: [{
      id: 'studio.pack.incomplete',
      version: '1.0.0',
      name: 'Incomplete',
      source: 'builtin',
      resources: { skills: ['studio/read'] },
      schemas: [],
      tools: [],
      skills: ['studio.workflow.read'],
    }],
  })

  const issues = lintCatalog(registry)
  assert.ok(issues.some((issue) => issue.code === 'pack.tool_ref.uncovered'))
})

test('linter requires pack resource paths for declared skills and tools', () => {
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [{
      name: 'studio_read',
      description: 'Read.',
      permission: 'project.read',
      risk: 'read',
      projectScoped: false,
      requiresApprovalByDefault: false,
      source: 'runtime',
    }],
    layeredSkills: [{
      id: 'studio.workflow.read',
      kind: 'workflow',
      version: '1.0.0',
      name: 'Read',
      description: 'Read workflow',
      priority: 100,
      enabled: true,
      instructionTemplate: 'Read.',
      triggers: [{ kind: 'intent', id: 'read' }],
      toolRefs: ['tool://studio_read'],
    }],
    packs: [{
      id: 'studio.pack.no-resources',
      version: '1.0.0',
      name: 'No Resources',
      source: 'builtin',
      schemas: [],
      tools: ['studio_read'],
      skills: ['studio.workflow.read'],
    }],
  })

  const issues = lintCatalog(registry)
  assert.ok(issues.some((issue) => issue.code === 'pack.resources.skills.missing'))
  assert.ok(issues.some((issue) => issue.code === 'pack.resources.tools.missing'))
})

test('linter flags workflow language in tool descriptions', () => {
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [{
      name: 'studio_create_draft',
      description: 'Create a draft. Use this only when the user asks for a proposal workflow.',
      permission: 'draft.write',
      risk: 'draft',
      projectScoped: true,
      requiresApprovalByDefault: false,
      source: 'runtime',
    }],
  })

  const issues = lintCatalog(registry)
  assert.ok(issues.some((issue) => issue.code === 'tool.description.polluted'))
})

test('linter warns when knowledge chunks exceed the chunk size budget', () => {
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [],
    knowledgeCollections: [{
      id: 'studio.knowledge.large',
      version: '1.0.0',
      domain: 'storyboard',
      name: 'Large Knowledge',
      tags: [],
      chunkIds: ['large.chunk'],
      chunks: [{ id: 'large.chunk', title: 'Large', charCount: 12001 }],
    } as never],
  })

  const issues = lintCatalog(registry)
  assert.ok(issues.some((issue) => issue.code === 'knowledge.chunk.too_large'))
})

test('profile resolution, trigger selection, prompt refs, and tool scope work together', () => {
  const catalog = loadAgentPluginCatalog()
  const { profile, warnings } = resolveProfile(catalog.layeredRegistry)
  assert.deepEqual(warnings, [])

  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.project-standards-proposal')
  const policy = catalog.layeredRegistry.skills.get('movscript.policy.drafts')
  assert.ok(workflow?.kind === 'workflow')
  assert.ok(policy?.kind === 'policy')

  profile.enabledWorkflows = [workflow.id]
  profile.enabledPolicies = [policy.id]
  profile.toolGrants = [
    { name: 'movscript_validate_draft', mode: 'allow', approval: 'never' },
    { name: 'agent_io_start', mode: 'allow', approval: 'always' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
  ]

  const ctx = {
    profile,
    message: '请帮我做项目规范提案',
    intents: [],
    uiContext: { projectId: 1 },
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }

  const selected = selectActiveWorkflows([workflow], ctx)
  assert.equal(selected.workflows.length, 1)

  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    policies: [policy],
    workflows: selected.workflows,
  })
  assert.match(prompt.systemPrompt, /Project Standards Proposal/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{schema:/)

  const tools = resolveVisibleTools({
    registry: catalog.layeredRegistry,
    ctx,
    activeWorkflows: selected.workflows,
  })
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_validate_draft'))
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_request_user_input'))
  assert.equal(tools.available.some((tool) => tool.name === 'agent_io_start'), false)
})

test('org and user profile overrides can only narrow runtime capability', () => {
  const catalog = loadAgentPluginCatalog()
  const base = resolveProfile(catalog.layeredRegistry).profile
  const orgProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.org',
    version: '1.0.0',
    name: 'Org Override',
    enabledPacks: ['movscript.pack.agent-core', 'movscript.pack.drafts', 'movscript.pack.movscript'],
    persona: null,
    enabledWorkflows: ['movscript.workflow.project-standards-proposal'],
    enabledPolicies: ['movscript.policy.drafts', 'movscript.policy.agent-core', 'movscript.policy.movscript'],
    toolGrants: [
      { name: 'movscript_validate_draft', mode: 'allow' as const, approval: 'always' as const },
      { name: 'movscript_create_draft', mode: 'deny' as const },
    ],
    limits: { maxActiveWorkflows: 1 },
  }
  const userProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.user',
    version: '1.0.0',
    name: 'User Override',
    enabledPacks: [],
    persona: null,
    enabledWorkflows: ['movscript.workflow.project-standards-proposal'],
    enabledPolicies: [],
    toolGrants: [
      { name: 'movscript_validate_draft', mode: 'deny' as const },
    ],
  }

  const resolved = resolveProfile(catalog.layeredRegistry, {
    orgProfile,
    userProfile,
  })

  assert.deepEqual(resolved.warnings, [])
  assert.deepEqual(resolved.profile.enabledPacks, ['movscript.pack.agent-core', 'movscript.pack.drafts', 'movscript.pack.movscript'])
  assert.deepEqual(resolved.profile.enabledWorkflows, ['movscript.workflow.project-standards-proposal'])
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_validate_draft')?.mode, 'deny')
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_create_draft')?.mode, 'deny')
  assert.equal(resolved.profile.limits?.maxActiveWorkflows, 1)
  assert.deepEqual(resolved.profile.resolvedFrom?.layers.map((layer) => layer.source), ['default', 'org', 'user'])
})

test('org and user profile overrides are rejected as a whole when they add or loosen capability', () => {
  const catalog = loadAgentPluginCatalog()
  const base = resolveProfile(catalog.layeredRegistry).profile
  const orgProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.bad-org',
    version: '1.0.0',
    name: 'Bad Org Override',
    enabledPacks: [...base.enabledPacks, 'movscript.pack.nonexistent'],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants: [
      { name: 'movscript_validate_draft', mode: 'allow' as const, approval: 'never' as const },
      { name: 'agent_io_start', mode: 'allow' as const, approval: 'never' as const },
    ],
  }
  const userProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.bad-user',
    version: '1.0.0',
    name: 'Bad User Override',
    enabledPacks: [],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: ['movscript.policy.drafts'],
    toolGrants: [],
  }

  const resolved = resolveProfile(catalog.layeredRegistry, {
    orgProfile,
    userProfile,
  })

  assert.ok(resolved.warnings.some((warning) => warning.includes('profile.override.rejected: org profile acme.profile.bad-org cannot add enabledPack movscript.pack.nonexistent')))
  assert.ok(resolved.warnings.some((warning) => warning.includes('profile.override.rejected: user profile acme.profile.bad-user cannot add enabledPolicies')))
  assert.deepEqual(resolved.profile.enabledPacks, base.enabledPacks)
  assert.deepEqual(resolved.profile.toolGrants, base.toolGrants)
  assert.deepEqual(resolved.profile.resolvedFrom?.layers.map((layer) => layer.source), ['default'])
})

test('prompt composer degrades oversized prompts by dropping non-critical policies and workflows', () => {
  const catalog = loadAgentPluginCatalog()
  const { profile } = resolveProfile(catalog.layeredRegistry)
  profile.limits = { systemPromptCharLimit: 180 }
  const ctx = {
    profile,
    message: 'x',
    intents: [],
    uiContext: {},
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const lowPolicy = {
    id: 'test.policy.low',
    kind: 'policy' as const,
    version: '1.0.0',
    name: 'Low Policy',
    description: '',
    priority: 50,
    enabled: true,
    instructionTemplate: 'low policy '.repeat(40),
  }
  const workflow = {
    id: 'test.workflow.low',
    kind: 'workflow' as const,
    version: '1.0.0',
    name: 'Low Workflow',
    description: '',
    priority: 10,
    enabled: true,
    triggers: [{ kind: 'always' as const }],
    toolRefs: [],
    instructionTemplate: 'workflow '.repeat(40),
  }
  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    policies: [lowPolicy],
    workflows: [workflow],
  })

  assert.equal(prompt.parts.some((part) => part.id === lowPolicy.id), false)
  assert.equal(prompt.parts.some((part) => part.id === workflow.id), false)
  assert.equal(prompt.degraded, 'dropped_workflows')
  assert.ok(prompt.warnings.some((warning) => warning.includes('dropped non-critical policy')))
  assert.ok(prompt.warnings.some((warning) => warning.includes('dropped workflow')))
})

test('prompt composer throws prompt.size.exceeded when degradation cannot fit the prompt', () => {
  const catalog = loadAgentPluginCatalog()
  const { profile } = resolveProfile(catalog.layeredRegistry)
  profile.limits = { systemPromptCharLimit: 20 }
  const ctx = {
    profile,
    message: 'x',
    intents: [],
    uiContext: {},
    conversation: { turnCount: 1, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const persona = {
    id: 'test.persona.large',
    kind: 'persona' as const,
    version: '1.0.0',
    name: 'Large Persona',
    description: '',
    priority: 1000,
    enabled: true,
    instructionTemplate: 'persona '.repeat(20),
  }

  assert.throws(() => composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    persona,
    policies: [],
    workflows: [],
  }), /prompt\.size\.exceeded/)
})

test('MCP tools are modeled as namespaced tools inside a virtual MCP pack', () => {
  const virtualPack = buildMCPVirtualPack({
    serverId: 'studio-tools',
    tools: [{
      name: 'render.image',
      description: 'Render an image through the connected studio MCP server.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
      },
    }],
  })
  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [],
    packs: [virtualPack.pack],
    layeredTools: virtualPack.tools,
  })
  const tool = registry.tools.get('mcp__studio_tools__render_image')

  assert.equal(virtualPack.pack.id, 'mcp.studio_tools')
  assert.equal(virtualPack.pack.source, 'mcp')
  assert.deepEqual(virtualPack.pack.tools, ['mcp__studio_tools__render_image'])
  assert.ok(tool)
  assert.equal(tool.source, 'mcp')
  assert.equal(tool.mcpServerId, 'studio_tools')
  assert.equal(tool.permission, 'mcp.studio_tools.render_image')
  assert.equal(tool.defaults.grant, 'deny')
  assert.equal(tool.defaults.approval, 'always')
  assert.deepEqual(lintCatalog(registry).filter((issue) => issue.level === 'error'), [])
})

test('MCP virtual pack ignores non-plain tool schemas', () => {
  class RuntimeSchema {
    type = 'object'
    properties = { prompt: { type: 'string' } }
  }

  const virtualPack = buildMCPVirtualPack({
    serverId: 'studio-tools',
    tools: [{
      name: 'render.image',
      description: 'Render an image through the connected studio MCP server.',
      inputSchema: new RuntimeSchema() as unknown as JSONValue,
    }],
  })

  assert.deepEqual(virtualPack.tools[0]?.inputSchema, {
    type: 'object',
    additionalProperties: true,
    properties: {},
  })
})

test('prompt composer ignores non-plain action schema records', () => {
  class RuntimeActionSchema {
    action = { const: 'runtime_only' }
  }

  const registry = buildLayeredCatalogRegistry({
    manifest: {
      schema: 'movscript.agent.current',
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      tools: [],
    },
    tools: [],
    layeredTools: [{
      name: 'studio_action',
      description: 'Run studio action.',
      permission: 'studio.action',
      risk: 'read',
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
      source: 'runtime',
      inputSchema: {
        type: 'object',
        anyOf: [
          { properties: { action: { const: 'keep' } } },
          new RuntimeActionSchema(),
        ],
      } as never,
    }],
  })

  const prompt = composePrompt({
    registry,
    ctx: {
      profile: { limits: {} } as never,
      message: '',
      intents: [],
      uiContext: {},
      conversation: {
        turnCount: 0,
        lastToolCalls: [],
        recentErrors: [],
      },
      catalogVersion: 'test',
    },
    policies: [],
    workflows: [],
    persona: {
      id: 'persona.action',
      kind: 'persona',
      version: '1.0.0',
      name: 'Action Persona',
      description: 'Action persona',
      priority: 100,
      enabled: true,
      instructionTemplate: 'Actions: {{tool:studio_action.actions}}',
    },
  })

  assert.match(prompt.systemPrompt, /Actions: keep/)
  assert.doesNotMatch(prompt.systemPrompt, /runtime_only/)
})

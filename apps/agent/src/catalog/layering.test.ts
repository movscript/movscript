import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { DRAFT_SCHEMA_REGISTRY, getActiveSchemaForKind, getDraftSchemaEntry, listSchemasByKind } from '@movscript/draft-schemas'
import { buildLayeredCatalogRegistry } from './registry.js'
import { lintCatalog } from './linter.js'
import { buildMCPVirtualPack } from './mcpVirtualPack.js'
import { loadAgentPluginCatalog } from './loader.js'
import { resolveProfile } from '../profiles/resolveProfile.js'
import { composePrompt } from '../skills/promptComposer.js'
import { selectActiveWorkflows } from '../skills/triggerEvaluator.js'
import { resolveVisibleTools } from '../tools/toolCatalogResolver.js'

const CATALOG_SKILLS_DIR = new URL('../../catalog/skills/', import.meta.url)
const REPO_ROOT = resolve(new URL('../../../../', import.meta.url).pathname)

function schemaProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.properties) ? value.properties : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function generationValidationErrorCodes(): string[] {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/agent-generation-validation-error-v1.schema.json'), 'utf8')) as unknown
  const codes = isRecord(schema)
    && isRecord(schema.$defs)
    && isRecord(schema.$defs.errorCode)
    && Array.isArray(schema.$defs.errorCode.enum)
    ? schema.$defs.errorCode.enum
    : []
  return codes.filter((code): code is string => typeof code === 'string')
}

test('draft schema registry is keyed by full schema id and supports active kind lookup', () => {
  assert.ok(DRAFT_SCHEMA_REGISTRY['movscript.project_proposal.v1'])
  assert.equal(getDraftSchemaEntry('movscript.project_proposal.v1')?.kind, 'project_proposal')
  assert.equal(getActiveSchemaForKind('project_proposal').id, 'movscript.project_proposal.v1')
  assert.deepEqual(listSchemasByKind('project_proposal').map((schema) => schema.id), ['movscript.project_proposal.v1'])
})

test('layered catalog registry exposes schema/tool/skill/pack/profile boundaries', () => {
  const catalog = loadAgentPluginCatalog()
  const registry = catalog.layeredRegistry

  assert.ok(registry.schemas.has('movscript.project_proposal.v1'))
  assert.ok(registry.tools.has('movscript_update_draft'))
  assert.ok(registry.skills.has('movscript.policy.safe-drafts'))
  assert.ok(registry.packs.has('movscript.pack.default'))
  assert.ok(registry.packs.has('movscript.pack.agent-core'))
  assert.ok(registry.packs.has('movscript.pack.movscript-workspace'))
  assert.ok(registry.packs.has('movscript.pack.proposal-project'))
  assert.ok(registry.packs.has('movscript.pack.proposal-production'))
  assert.ok(registry.packs.has('movscript.pack.proposal-asset'))
  assert.ok(registry.packs.has('movscript.pack.proposal-content-unit'))
  assert.ok(registry.profiles.has('movscript.profile.default'))
  assert.equal(registry.profiles.size, 1)
  assert.equal(catalog.catalogIssues.some((issue) => issue.level === 'error'), false)
  assert.deepEqual(catalog.catalogIssues, [])
})

test('target-state pack files and the default profile are loaded as first-class catalog resources', () => {
  const catalog = loadAgentPluginCatalog()
  const projectProposalPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.proposal-project')
  const productionProposalPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.proposal-production')
  const defaultProfile = catalog.profiles.find((profile) => profile.id === 'movscript.profile.default')

  assert.ok(projectProposalPack)
  assert.equal(projectProposalPack.source, 'builtin')
  assert.ok(projectProposalPack.schemas.includes('movscript.project_proposal.v1'))
  assert.ok(projectProposalPack.skills.includes('movscript.workflow.project-proposal'))
  assert.ok(productionProposalPack)
  assert.ok(productionProposalPack.schemas.includes('movscript.production_proposal.v1'))
  assert.ok(productionProposalPack.skills.includes('movscript.workflow.production-proposal'))
  assert.ok(defaultProfile)
  assert.ok(defaultProfile.enabledPacks.includes('movscript.pack.proposal-project'))
  assert.ok(defaultProfile.enabledPacks.includes('movscript.pack.proposal-production'))
  assert.ok(defaultProfile.enabledPacks.includes('movscript.pack.proposal-asset'))
  assert.ok(defaultProfile.enabledPacks.includes('movscript.pack.proposal-content-unit'))
  assert.ok(defaultProfile.enabledPacks.includes('movscript.pack.visual-generation'))
  assert.equal(defaultProfile.persona, 'movscript.persona.default')

  const resolved = resolveProfile(catalog.layeredRegistry)
  assert.equal(resolved.profile.id, 'movscript.profile.default')
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.project-proposal'))
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.production-proposal'))
})

test('asset candidate preparation is separated from generation execution', () => {
  const catalog = loadAgentPluginCatalog()
  const assetCandidate = catalog.layeredRegistry.skills.get('movscript.workflow.asset-candidate-generation')
  const visualGeneration = catalog.layeredRegistry.skills.get('movscript.workflow.visual-generation')
  const listModelsTool = catalog.layeredRegistry.tools.get('movscript_list_models')
  const createJobTool = catalog.layeredRegistry.tools.get('movscript_create_generation_job')
  const profile = resolveProfile(catalog.layeredRegistry).profile

  assert.ok(assetCandidate?.kind === 'workflow')
  assert.ok(visualGeneration?.kind === 'workflow')
  assert.ok(listModelsTool)
  assert.ok(createJobTool)

  assert.equal(assetCandidate.toolRefs.includes('tool://movscript_create_generation_job'), false)
  assert.equal(assetCandidate.toolRefs.includes('tool://movscript_cancel_generation_job'), false)
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_create_generation_job'))
  assert.ok(visualGeneration.toolRefs.includes('tool://movscript_cancel_generation_job'))

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
  assert.equal(assetTools.available.some((tool) => tool.name === 'movscript_create_generation_job'), false)
  assert.equal(assetTools.available.some((tool) => tool.name === 'movscript_cancel_generation_job'), false)
  assert.ok(visualTools.available.some((tool) => tool.name === 'movscript_create_generation_job'))
  assert.ok(visualTools.available.some((tool) => tool.name === 'movscript_cancel_generation_job'))

  assert.match(assetCandidate.instructionTemplate, /Do not create image or video generation jobs here/)
  assert.match(assetCandidate.instructionTemplate, /use model discovery contracts rather than provider assumptions/i)
  assert.match(visualGeneration.instructionTemplate, /This workflow may create generation jobs/)
  assert.match(visualGeneration.instructionTemplate, /Prefer `model_contracts` for compact planning/)
  assert.match(visualGeneration.instructionTemplate, /Submit only top-level and `extra_params` values supported by the selected model/)
  assert.match(visualGeneration.instructionTemplate, /reference resources whose image\/video counts satisfy `input_requirements`/)
  assert.match(visualGeneration.instructionTemplate, /Treat `param_validation` with `audit_version: 1` as the audit trail/)
  assert.match(visualGeneration.instructionTemplate, /`input_preflight_errors`/)
  assert.match(visualGeneration.instructionTemplate, /explanatory audit data, not final backend rejection/)
  assert.match(visualGeneration.instructionTemplate, /Do not auto-repair `UNSUPPORTED_OUTPUT_TYPE` or `INVALID_INPUT_COUNT`/)
  assert.match(visualGeneration.instructionTemplate, /\{\{tool:movscript_create_generation_job\.errors\}\}/)
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
  assert.ok(listModelsContractProperties.model_config_id)
  assert.ok(listModelsContractProperties.logical_model_id)
  assert.ok(listModelsContractProperties.capabilities)
  assert.ok(listModelsContractProperties.input_requirements)
  assert.ok(listModelsContractProperties.supported_param_keys)
  assert.ok(listModelsContractProperties.supported_params)
  assert.ok(listModelsContractProperties.params_schema_rule_count)
  assert.match(createJobTool.description, /call movscript_list_models/)
  assert.match(createJobTool.description, /selected model's contract/)
  assert.match(createJobTool.description, /param_validation audit_version 1/)
  assert.match(createJobTool.description, /input_preflight_errors/)
  assert.match(createJobTool.description, /explanatory audit data, not backend rejection/)
  assert.match(createJobTool.description, /UNSUPPORTED_OUTPUT_TYPE and INVALID_INPUT_COUNT/)
  assert.deepEqual(createJobTool.errorCodes, generationValidationErrorCodes())
  const createJobOutputProperties = schemaProperties(createJobTool.outputSchema)
  assert.ok(createJobOutputProperties.status)
  assert.ok(createJobOutputProperties.job)
  assert.ok(createJobOutputProperties.jobId)
  assert.ok(createJobOutputProperties.monitor)
  assert.ok(createJobOutputProperties.output_resource)
  assert.ok(createJobOutputProperties.output_resource_id)
  assert.ok(createJobOutputProperties.param_validation)
  const paramValidation = isRecord(createJobOutputProperties.param_validation)
    ? createJobOutputProperties.param_validation
    : {}
  const paramValidationProperties = schemaProperties(paramValidation)
  assert.ok(paramValidationProperties.audit_version)
  assert.ok(paramValidationProperties.input_requirements)
  assert.ok(paramValidationProperties.submitted_inputs)
  assert.ok(paramValidationProperties.preflight_errors)
  assert.ok(paramValidationProperties.input_preflight_errors)
  const createJobProperties = schemaProperties(createJobTool.inputSchema)
  assert.equal(createJobProperties.model, undefined)
  assert.ok(createJobProperties.title)
  assert.ok(createJobProperties.job_type)
  assert.ok(createJobProperties.input_resource_ids)
  assert.ok(createJobProperties.reference_type)
  assert.ok(createJobProperties.aspect_ratio)
  assert.ok(createJobProperties.duration)
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
  assert.match(prompt.systemPrompt, /preflight_errors` and `input_preflight_errors` as explanatory audit data/)
  assert.match(prompt.systemPrompt, /Do not auto-repair `UNSUPPORTED_OUTPUT_TYPE` or `INVALID_INPUT_COUNT`/)
})

test('workflow skills use isolated skill directories', () => {
  assert.equal(existsSync(new URL('workflow/general-workflows.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/project-proposal.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/project-proposal.workflow.md', CATALOG_SKILLS_DIR)), false)
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
  assert.equal(existsSync(new URL('workflow/planning/proposal-first/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/project/project-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/production/production-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/production/dual-orchestration/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/asset/asset-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/content-unit/content-unit-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/content-unit/content-unit-media-proposal/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/planning/script-split/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/proposal/project/setting-prep/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/writing/script-writing/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/movscript/workspace/project-progress/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/content-unit/storyboard-gap-review/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/creative/creative-workbench/skill.workflow.json', CATALOG_SKILLS_DIR)), false)
  assert.equal(existsSync(new URL('workflow/generation/visual-generation/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/generation/visual-generation/instruction.md', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/asset/asset-candidate-generation/skill.workflow.json', CATALOG_SKILLS_DIR)), true)
  assert.equal(existsSync(new URL('workflow/proposal/asset/asset-candidate-generation/instruction.md', CATALOG_SKILLS_DIR)), true)
})

test('target-state skill and tool files define the active runtime resources', () => {
  const catalog = loadAgentPluginCatalog()
  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.project-proposal')
  const inputTool = catalog.layeredRegistry.tools.get('movscript_request_user_input')

  assert.ok(workflow?.kind === 'workflow')
  assert.equal(workflow.version, '1.0.0')
  assert.ok(workflow.schemaRefs?.includes('schema://movscript.project_proposal.v1'))
  assert.match(workflow.instructionTemplate, /Goal: produce or edit one local project_proposal draft/)
  assert.match(workflow.instructionTemplate, /\{\{schema:movscript\.project_proposal\.v1\}\}/)
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

test('profile resolution, trigger selection, prompt refs, and tool scope work together', () => {
  const catalog = loadAgentPluginCatalog()
  const { profile, warnings } = resolveProfile(catalog.layeredRegistry)
  assert.deepEqual(warnings, [])

  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.project-proposal')
  const policy = catalog.layeredRegistry.skills.get('movscript.policy.safe-drafts')
  assert.ok(workflow?.kind === 'workflow')
  assert.ok(policy?.kind === 'policy')

  profile.enabledWorkflows = [workflow.id]
  profile.enabledPolicies = [policy.id]
  profile.toolGrants = [
    { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
  ]

  const ctx = {
    profile,
    message: '请帮我做项目提案',
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
  assert.match(prompt.systemPrompt, /Project Proposal/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{schema:/)

  const tools = resolveVisibleTools({
    registry: catalog.layeredRegistry,
    ctx,
    activeWorkflows: selected.workflows,
  })
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_update_draft'))
  assert.ok(tools.available.some((tool) => tool.name === 'movscript_request_user_input'))
  assert.equal(tools.available.some((tool) => tool.name === 'movscript_create_generation_job'), false)
})

test('org and user profile overrides can only narrow runtime capability', () => {
  const catalog = loadAgentPluginCatalog()
  const base = resolveProfile(catalog.layeredRegistry).profile
  const orgProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.org',
    version: '1.0.0',
    name: 'Org Override',
    enabledPacks: ['movscript.pack.agent-core', 'movscript.pack.drafts', 'movscript.pack.proposal-project'],
    persona: null,
    enabledWorkflows: ['movscript.workflow.project-proposal'],
    enabledPolicies: ['movscript.policy.safe-drafts', 'movscript.policy.approval-boundaries', 'movscript.policy.platform-concepts'],
    toolGrants: [
      { name: 'movscript_update_draft', mode: 'allow' as const, approval: 'always' as const },
      { name: 'movscript_create_draft', mode: 'deny' as const },
    ],
    limits: { maxToolCallsPerTurn: 4 },
  }
  const userProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.user',
    version: '1.0.0',
    name: 'User Override',
    enabledPacks: [],
    persona: null,
    enabledWorkflows: ['movscript.workflow.project-proposal'],
    enabledPolicies: [],
    toolGrants: [
      { name: 'movscript_update_draft', mode: 'deny' as const },
    ],
  }

  const resolved = resolveProfile(catalog.layeredRegistry, {
    orgProfile,
    userProfile,
  })

  assert.deepEqual(resolved.warnings, [])
  assert.deepEqual(resolved.profile.enabledPacks, ['movscript.pack.agent-core', 'movscript.pack.drafts', 'movscript.pack.proposal-project'])
  assert.deepEqual(resolved.profile.enabledWorkflows, ['movscript.workflow.project-proposal'])
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_update_draft')?.mode, 'deny')
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_create_draft')?.mode, 'deny')
  assert.equal(resolved.profile.limits?.maxToolCallsPerTurn, 4)
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
      { name: 'movscript_update_draft', mode: 'allow' as const, approval: 'never' as const },
      { name: 'movscript_create_generation_job', mode: 'allow' as const, approval: 'never' as const },
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
    enabledPolicies: ['movscript.policy.safe-drafts'],
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

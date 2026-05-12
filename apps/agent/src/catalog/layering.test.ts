import assert from 'node:assert/strict'
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
  assert.ok(registry.packs.has('movscript.pack.proposal'))
  assert.ok(registry.packs.has('movscript.pack.content-unit'))
  assert.ok(registry.profiles.has('movscript.profile.default'))
  assert.equal(registry.modeProfiles.get('project-orchestration')?.id, 'movscript.profile.project-orchestration')
  assert.deepEqual(Array.from(registry.modeProfiles.keys()).sort(), [
    'asset-candidate-generation',
    'asset-proposal',
    'chat',
    'content-unit-media-proposal',
    'content-unit-proposal',
    'create',
    'creative-workbench',
    'dual-orchestration',
    'plan',
    'production-orchestration',
    'project-orchestration',
    'review',
    'script-split',
    'setting-prep',
    'visual-generation',
  ])
  assert.equal(catalog.catalogIssues.some((issue) => issue.level === 'error'), false)
  assert.deepEqual(catalog.catalogIssues, [])
})

test('target-state pack and profile files are loaded as first-class catalog resources', () => {
  const catalog = loadAgentPluginCatalog()
  const proposalPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.proposal')
  const projectProfile = catalog.profiles.find((profile) => profile.id === 'movscript.profile.project-orchestration')

  assert.ok(proposalPack)
  assert.equal(proposalPack.source, 'builtin')
  assert.ok(proposalPack.schemas.includes('movscript.project_proposal.v1'))
  assert.ok(proposalPack.skills.includes('movscript.workflow.project-proposal'))
  assert.ok(projectProfile)
  assert.deepEqual(projectProfile.enabledPacks, ['movscript.pack.core', 'movscript.pack.drafts', 'movscript.pack.proposal'])
  assert.equal(projectProfile.persona, 'movscript.persona.project-orchestrator')

  const resolved = resolveProfile(catalog.layeredRegistry, { modeAlias: 'project-orchestration' })
  assert.equal(resolved.profile.id, 'movscript.profile.project-orchestration')
  assert.ok(resolved.profile.enabledWorkflows.includes('movscript.workflow.project-proposal'))

  const production = resolveProfile(catalog.layeredRegistry, { modeAlias: 'production-orchestration' })
  assert.ok(production.profile.enabledWorkflows.includes('movscript.workflow.production-proposal'))
  assert.equal(production.profile.persona, 'movscript.persona.production-orchestrator')
})

test('target-state skill and tool files override legacy compatibility resources', () => {
  const catalog = loadAgentPluginCatalog()
  const workflow = catalog.layeredRegistry.skills.get('movscript.workflow.project-proposal')
  const inputTool = catalog.layeredRegistry.tools.get('movscript_request_user_input')

  assert.ok(workflow?.kind === 'workflow')
  assert.equal(workflow.version, '1.0.0')
  assert.ok(workflow.schemaRefs?.includes('schema://movscript.project_proposal.v1'))
  assert.match(workflow.instructionTemplate, /Goal: produce or edit one local project_proposal draft/)
  assert.match(workflow.instructionTemplate, /\{\{schema:movscript\.project_proposal\.v1\}\}/)
  const scriptSplit = catalog.layeredRegistry.skills.get('movscript.workflow.script-split')
  assert.ok(scriptSplit?.kind === 'workflow')
  assert.match(scriptSplit.instructionTemplate, /\{\{schema:movscript\.script_split_proposal\.v1\}\}/)
  assert.doesNotMatch(scriptSplit.instructionTemplate, /"episode_drafts"/)
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
      skills: [],
      tools: [],
    },
    skills: [{
      id: 'movscript.intent.broken',
      name: 'Broken',
      description: 'Broken workflow',
      enabled: true,
      instruction: 'Use {{tool:missing_tool}} and {{schema:missing.schema.v1}}.',
      toolHints: ['missing_tool'],
    }],
    tools: [],
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
    uiContext: { mode: 'project-orchestration', projectId: 1 },
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
  const base = resolveProfile(catalog.layeredRegistry, { modeAlias: 'project-orchestration' }).profile
  const orgProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.org',
    version: '1.0.0',
    name: 'Org Override',
    enabledPacks: ['movscript.pack.core', 'movscript.pack.drafts'],
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
    modeAlias: 'project-orchestration',
    orgProfile,
    userProfile,
  })

  assert.deepEqual(resolved.warnings, [])
  assert.deepEqual(resolved.profile.enabledPacks, ['movscript.pack.core', 'movscript.pack.drafts'])
  assert.deepEqual(resolved.profile.enabledWorkflows, ['movscript.workflow.project-proposal'])
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_update_draft')?.mode, 'deny')
  assert.equal(resolved.profile.toolGrants.find((grant) => grant.name === 'movscript_create_draft')?.mode, 'deny')
  assert.equal(resolved.profile.limits?.maxToolCallsPerTurn, 4)
  assert.deepEqual(resolved.profile.resolvedFrom?.layers.map((layer) => layer.source), ['default', 'mode', 'org', 'user'])
})

test('org and user profile overrides are rejected as a whole when they add or loosen capability', () => {
  const catalog = loadAgentPluginCatalog()
  const base = resolveProfile(catalog.layeredRegistry, { modeAlias: 'project-orchestration' }).profile
  const orgProfile = {
    schema: 'movscript.agent.profile.v1' as const,
    id: 'acme.profile.bad-org',
    version: '1.0.0',
    name: 'Bad Org Override',
    enabledPacks: [...base.enabledPacks, 'movscript.pack.visual-generation'],
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
    modeAlias: 'project-orchestration',
    orgProfile,
    userProfile,
  })

  assert.ok(resolved.warnings.some((warning) => warning.includes('profile.override.rejected: org profile acme.profile.bad-org cannot add enabledPack movscript.pack.visual-generation')))
  assert.ok(resolved.warnings.some((warning) => warning.includes('profile.override.rejected: user profile acme.profile.bad-user cannot add enabledPolicies')))
  assert.deepEqual(resolved.profile.enabledPacks, base.enabledPacks)
  assert.deepEqual(resolved.profile.toolGrants, base.toolGrants)
  assert.deepEqual(resolved.profile.resolvedFrom?.layers.map((layer) => layer.source), ['default', 'mode'])
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
      skills: [],
      tools: [],
    },
    skills: [],
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

import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAFT_SCHEMA_REGISTRY, getActiveSchemaForKind, getDraftSchemaEntry, listSchemasByKind } from '@movscript/draft-schemas'
import { buildLayeredCatalogRegistry } from './registry.js'
import { lintCatalog } from './linter.js'
import { loadAgentPluginCatalog } from '../manifest/pluginCatalog.js'
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
  assert.ok(registry.profiles.has('movscript.profile.catalog-default'))
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
      permissions: [],
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
    bundles: [],
  })
  const profile = registry.profiles.get('movscript.profile.default')
  assert.ok(profile)
  Object.assign(profile, { permissions: ['draft.write'] })

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

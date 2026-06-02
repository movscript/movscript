import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import { resolveToolCatalog } from './capabilityResolver.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../../registry/core/toolRegistry.js'

test('resolveToolCatalog keeps plan updates visible without an active Skill', () => {
  const catalog = resolveToolCatalog({
    mcpTools: [],
    registry: DEFAULT_TOOL_REGISTRY,
    manifest: DEFAULT_AGENT_MANIFEST,
    activeSkills: [{
      id: 'core.base.default',
      name: 'Base Instructions',
      description: '',
      enabled: true,
      instruction: '',
      resolvedPriority: 1,
      activationReason: 'default',
      compiledInstruction: '',
      warnings: [],
    }],
    userMessage: '生成一个plan',
  })

  assert.equal(catalog.byName.core_update_plan?.available, true)
  assert.equal(catalog.byName.core_update_plan?.approval, 'never')
})

test('resolveToolCatalog exposes registered tool execution metadata', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.preview',
      description: 'Preview draft changes.',
      permission: 'draft.preview',
      risk: 'draft',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
      execution: {
        readOnly: true,
        destructive: false,
        concurrencySafe: true,
        interruptBehavior: 'cancel',
        resultRefStrategy: 'summary_ref',
      },
    },
  ])
  const catalog = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'studio.preview', mode: 'allow', approval: 'never' }],
    },
  })

  assert.deepEqual(catalog.byName['studio.preview'].execution, {
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    interruptBehavior: 'cancel',
    resultRefStrategy: 'summary_ref',
  })
  assert.deepEqual(catalog.byName['studio.preview'].runtime, {
    registered: true,
    source: 'runtime',
    grantMode: 'allow',
    grantSource: 'manifest',
    approval: 'never',
    approvalRequired: false,
    approvalReason: 'none',
    available: true,
    execution: {
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      interruptBehavior: 'cancel',
      resultRefStrategy: 'summary_ref',
    },
    reason: 'Tool is available as a read-only runtime operation.',
  })
})

test('resolveToolCatalog exposes local registered tool source', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.local_preview',
      description: 'Preview local project context.',
      permission: 'project.read',
      risk: 'read',
      source: 'local',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
  ])
  const catalog = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'studio.local_preview', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(catalog.byName['studio.local_preview'].source, 'local')
  assert.equal(catalog.byName['studio.local_preview'].runtime?.source, 'local')
  assert.equal(catalog.byName['studio.local_preview'].granted, true)
})

test('resolveToolCatalog scopes business tools to active task hints', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.production_context',
      description: 'Read production context.',
      permission: 'project.read',
      risk: 'read',
      source: 'runtime',
      category: 'production_proposal',
      projectScoped: true,
      requiresApprovalByDefault: false,
    },
    {
      name: 'studio.general_context',
      description: 'Read general context.',
      permission: 'project.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: true,
      requiresApprovalByDefault: false,
    },
  ])
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [
      { name: 'studio.production_context', mode: 'allow' as const, approval: 'never' as const },
      { name: 'studio.general_context', mode: 'allow' as const, approval: 'never' as const },
    ],
  }

  const inactive = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest,
    currentProjectId: 1,
    activeSkills: [{
      id: 'skill.base',
      name: 'Base Instructions',
      description: '',
      enabled: true,
      instruction: '',
      resolvedPriority: 1,
      activationReason: 'default',
      compiledInstruction: '',
      warnings: [],
    }],
  })

  assert.equal(inactive.byName['studio.production_context'].available, false)
  assert.equal(inactive.byName['studio.production_context'].unavailableReason, 'skill_scope')
  assert.deepEqual(inactive.byName['studio.production_context'].resolution, {
    authorized: true,
    visible: false,
    reason: 'skill_scope',
    grantSource: 'manifest',
    approval: 'never',
    activeSkillIds: ['skill.base'],
  })
  assert.equal(inactive.byName['studio.general_context'].available, false)
  assert.equal(inactive.byName['studio.general_context'].unavailableReason, 'skill_scope')

  const active = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest,
    currentProjectId: 1,
    activeSkills: [{
      id: 'skill.production',
      name: 'Production',
      description: '',
      enabled: true,
      instruction: '',
      toolHints: ['studio.production_context'],
      resolvedPriority: 1,
      activationReason: 'default',
      compiledInstruction: '',
      warnings: [],
    }],
  })

  assert.equal(active.byName['studio.production_context'].available, true)
  assert.equal(active.byName['studio.production_context'].unavailableReason, undefined)
  assert.deepEqual(active.byName['studio.production_context'].resolution, {
    authorized: true,
    visible: true,
    grantSource: 'manifest',
    approval: 'never',
    activeSkillIds: ['skill.production'],
  })
})

test('resolveToolCatalog treats active skill tool refs as first-class grants', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.skill_context',
      description: 'Read skill-scoped context.',
      permission: 'project.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
  ])
  const catalog = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [],
    },
    activeSkills: [{
      id: 'skill.context',
      name: 'Context skill',
      description: '',
      enabled: true,
      instruction: '',
      toolGrants: ['studio.skill_context'],
      resolvedPriority: 1,
      activationReason: 'trigger',
      compiledInstruction: '',
      warnings: [],
    }],
  })

  assert.equal(catalog.byName['studio.skill_context'].available, true)
  assert.equal(catalog.byName['studio.skill_context'].granted, true)
  assert.equal(catalog.byName['studio.skill_context'].runtime?.grantSource, 'skill')
  assert.equal(catalog.byName['studio.skill_context'].runtime?.grantMode, 'allow')
  assert.deepEqual(catalog.byName['studio.skill_context'].resolution, {
    authorized: true,
    visible: true,
    grantSource: 'skill',
    approval: 'never',
    activeSkillIds: ['skill.context'],
    grantingSkillIds: ['skill.context'],
  })
})

test('resolveToolCatalog preserves union task scope', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.write_draft',
      description: 'Write draft.',
      permission: 'draft.write',
      risk: 'draft',
      source: 'runtime',
      projectScoped: true,
      requiresApprovalByDefault: false,
    },
  ])
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [{ name: 'studio.write_draft', mode: 'allow' as const, approval: 'never' as const }],
  }

  const catalog = resolveToolCatalog({
    mcpTools: [],
    registry,
    manifest,
    currentProjectId: 1,
    activeSkills: [{
      id: 'skill.union',
      name: 'Union',
      description: '',
      enabled: true,
      instruction: '',
      resolvedPriority: 1,
      activationReason: 'default',
      compiledInstruction: '',
      warnings: [],
      metadata: { toolScope: 'union' },
    }],
  })

  assert.equal(catalog.byName['studio.write_draft'].available, true)
})

test('resolveToolCatalog treats invalid project ids as missing project scope', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.project_context',
      description: 'Read project context.',
      permission: 'project.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: true,
      requiresApprovalByDefault: false,
    },
  ])
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [{ name: 'studio.project_context', mode: 'allow' as const, approval: 'never' as const }],
  }

  for (const currentProjectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const catalog = resolveToolCatalog({
      mcpTools: [],
      registry,
      manifest,
      currentProjectId,
    })

    assert.equal(catalog.byName['studio.project_context'].available, false)
    assert.equal(catalog.byName['studio.project_context'].unavailableReason, 'missing_project')
  }
})

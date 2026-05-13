import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { resolveToolCatalog } from './capabilityResolver.js'
import { StaticToolRegistry } from './toolRegistry.js'

test('resolveToolCatalog scopes business tools to active workflow hints', () => {
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
      id: 'skill.persona',
      name: 'Persona',
      description: '',
      enabled: true,
      category: 'persona',
      instruction: '',
      resolvedPriority: 1,
      activationReason: 'profile',
      compiledInstruction: '',
      warnings: [],
      metadata: { kind: 'persona' },
    }],
  })

  assert.equal(inactive.byName['studio.production_context'].available, false)
  assert.equal(inactive.byName['studio.production_context'].unavailableReason, 'workflow_scope')
  assert.equal(inactive.byName['studio.general_context'].available, false)
  assert.equal(inactive.byName['studio.general_context'].unavailableReason, 'workflow_scope')

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
      category: 'production_proposal',
      instruction: '',
      toolHints: ['studio.production_context'],
      resolvedPriority: 1,
      activationReason: 'profile',
      compiledInstruction: '',
      warnings: [],
      metadata: { kind: 'workflow' },
    }],
  })

  assert.equal(active.byName['studio.production_context'].available, true)
  assert.equal(active.byName['studio.production_context'].unavailableReason, undefined)
})

test('resolveToolCatalog preserves union workflow scope', () => {
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
      category: 'workflow',
      instruction: '',
      resolvedPriority: 1,
      activationReason: 'profile',
      compiledInstruction: '',
      warnings: [],
      metadata: { kind: 'workflow', toolScope: 'union' },
    }],
  })

  assert.equal(catalog.byName['studio.write_draft'].available, true)
})

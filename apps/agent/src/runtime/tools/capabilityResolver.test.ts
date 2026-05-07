import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { resolveToolCatalog } from './capabilityResolver.js'
import { StaticToolRegistry } from './toolRegistry.js'

test('resolveToolCatalog activates categorized tools only for matching skills or tool hints', () => {
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
    permissions: ['project.read'],
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
    activeSkills: [],
  })

  assert.equal(inactive.byName['studio.production_context'].available, false)
  assert.equal(inactive.byName['studio.production_context'].unavailableReason, 'inactive')
  assert.equal(inactive.byName['studio.general_context'].available, true)

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
      resolvedPriority: 1,
      activationReason: 'applies_when',
      compiledInstruction: '',
      warnings: [],
    }],
  })

  assert.equal(active.byName['studio.production_context'].available, true)
})

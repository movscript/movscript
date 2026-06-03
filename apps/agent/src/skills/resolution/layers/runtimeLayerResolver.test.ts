import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import { buildLayeredCatalogRegistry } from '../../../catalog/registry/core/registry.js'
import type { AgentConfigFile, SkillDefinition } from '../../../catalog/registry/shared/types.js'
import { resolveRuntimeLayers } from './runtimeLayerResolver.js'
import type { AgentDebugContextPanel } from '../../../state/shared/types.js'

test('resolveRuntimeLayers can trigger installed non-builtin Codex skills without base config skill ids', () => {
  const configFile: AgentConfigFile = {
    schema: 'movscript.agent.config_file.v1',
    id: 'test.config',
    version: '1.0.0',
    name: 'Test Config',
    enabledPackIds: ['core.pack.base'],
    skillIds: [],
    toolGrants: [],
  }
  const installedSkill: SkillDefinition = {
    id: 'plugin.story_domain',
    version: '1.0.0',
    name: 'Story Domain',
    description: 'Use for story domain requests.',
    enabled: true,
    priority: 900,
    source: 'plugin',
    loadMode: 'on_demand',
    triggers: [{ kind: 'keyword', any: ['剧本'] }],
    instructionTemplate: 'Use the installed story domain skill.',
  }
  const baseManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: { configFileId: configFile.id },
  }
  const registry = buildLayeredCatalogRegistry({
    manifest: baseManifest,
    configFiles: [configFile],
    layeredSkills: [installedSkill],
    tools: [],
  })

  const layers = resolveRuntimeLayers({
    registry,
    baseManifest,
    message: '请检查这个剧本的情节',
    debugContext: debugContext(),
  })

  assert.deepEqual(configFile.skillIds, [])
  assert.ok(layers.trace.skillIds.includes('plugin.story_domain'))
  assert.equal(layers.skills.find((skill) => skill.id === 'plugin.story_domain')?.activationReason, 'trigger')
})

function debugContext(): AgentDebugContextPanel {
  return {
    route: { pathname: '/test' },
    projects: [],
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

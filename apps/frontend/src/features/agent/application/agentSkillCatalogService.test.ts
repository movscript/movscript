import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentSkillCatalogService } from './agentSkillCatalogService'
import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('agent skill catalog service inspects neutral skills capability without provider-session inspect', async () => {
  const service = new AgentSkillCatalogService(async (provider) => ({
    provider: provider.kind,
    providerId: provider.id,
    label: provider.label,
    capabilities: {
      skills: {
        list: async () => ({
          skills: [
            {
              id: 'codex:review',
              name: 'Review',
              description: 'Review code.',
              instruction: 'Review carefully.',
              source: 'local',
              enabled: true,
              tags: ['review'],
            },
          ],
        }),
      },
    },
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource))

  const catalog = await service.inspect({ provider: providerFixture() })

  assert.equal(catalog.activeProviderManifest.id, 'codex')
  assert.equal(catalog.skills.length, 1)
  assert.equal(catalog.skills[0]?.id, 'codex:review')
  assert.equal(catalog.skills[0]?.source, 'local')
  assert.deepEqual(catalog.activeProviderManifest.skills, [{ id: 'codex:review', enabled: true }])
  assert.deepEqual(catalog.configFiles, [])
})

test('agent skill catalog service returns an empty neutral catalog when skills capability is unavailable', async () => {
  const service = new AgentSkillCatalogService(async (provider) => ({
    provider: provider.kind,
    providerId: provider.id,
    label: provider.label,
    capabilities: {},
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource))

  const catalog = await service.inspect({ provider: providerFixture({ id: 'claude', kind: 'claude', label: 'Claude' }) })

  assert.equal(catalog.activeProviderManifest.id, 'claude')
  assert.deepEqual(catalog.skills, [])
  assert.deepEqual(catalog.activeProviderManifest.tools, [])
})

test('agent skill catalog service normalizes resolved tools for settings capabilities', async () => {
  const service = new AgentSkillCatalogService(async (provider) => ({
    provider: provider.kind,
    providerId: provider.id,
    label: provider.label,
    capabilities: {
      skills: {
        list: async () => ({
          resolvedTools: {
            discovered: [
              { name: 'read_file', source: 'mcp', available: true, risk: 'read', approval: 'never', requiresApproval: false },
              { name: 'write_file', source: 'mcp', available: false, risk: 'write', unavailableReason: 'not_granted' },
            ],
          },
        }),
      },
    },
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource))

  const capabilities = await service.capabilities({ provider: providerFixture() })

  assert.equal(capabilities.resolvedTools.discovered.length, 2)
  assert.equal(capabilities.resolvedTools.available[0]?.name, 'read_file')
  assert.equal(capabilities.resolvedTools.blocked[0]?.name, 'write_file')
  assert.equal(capabilities.resolvedTools.byName.write_file?.unavailableReason, 'not_granted')
  assert.deepEqual(capabilities.registry, [])
})

function providerFixture(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'codex',
    kind: 'codex',
    label: 'Codex',
    enabled: true,
    ...patch,
  } as ProviderConfig
}

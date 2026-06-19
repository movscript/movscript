import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentProviderSelectionConfigFromSettings,
  agentProviderActivationSettings,
  agentProviderSettingsWithWorkspaceSelection,
  commitAgentProviderActivation,
} from '@/features/agent/application/agentProviderActivation'
import type { ProviderConfig, ProviderSettings } from '@/shared/infrastructure/providerConfigStore'

test('agent provider activation selects the clicked provider for default and new conversations', () => {
  const mova = sdkProvider('mova')
  const codex = sdkProvider('codex')
  const settings: ProviderSettings = {
    providers: [mova, codex],
    defaultProviderId: 'mova',
    newConversationProviderId: 'mova',
  }

  const next = agentProviderActivationSettings(settings, codex)

  assert.equal(next.defaultProviderId, 'codex')
  assert.equal(next.newConversationProviderId, 'codex')
})

test('agent provider selection maps to and from Electron workspace config', () => {
  const mova = sdkProvider('mova')
  const codex = sdkProvider('codex')
  const settings: ProviderSettings = {
    providers: [mova, codex],
    defaultProviderId: 'mova',
    newConversationProviderId: 'mova',
  }

  assert.deepEqual(agentProviderSelectionConfigFromSettings(settings), {
    defaultProviderId: 'mova',
    newConversationProviderId: 'mova',
  })

  const next = agentProviderSettingsWithWorkspaceSelection(settings, {
    defaultProviderId: 'codex',
    newConversationProviderId: 'codex',
  })

  assert.equal(next.defaultProviderId, 'codex')
  assert.equal(next.newConversationProviderId, 'codex')
})

test('agent provider activation clears the current conversation and persists to Electron workspace config', async () => {
  const mova = sdkProvider('mova')
  const codex = sdkProvider('codex')
  const settings: ProviderSettings = {
    providers: [mova, codex],
    defaultProviderId: 'mova',
    newConversationProviderId: 'mova',
  }
  let savedSettings: ProviderSettings | null = null
  const activeConversations: Array<{ userId: string; conversationId: string | null }> = []
  const savedWorkspaceInputs: unknown[] = []

  await commitAgentProviderActivation({
    settings,
    provider: codex,
    userId: 'user_1',
    setSettings: (next) => {
      savedSettings = next
    },
    setActiveConversation: (userId, conversationId) => {
      activeConversations.push({ userId, conversationId })
    },
    saveWorkspaceConfig: async (input) => {
      savedWorkspaceInputs.push(input)
    },
  })

  assert.equal(savedSettings?.defaultProviderId, 'codex')
  assert.deepEqual(activeConversations, [{ userId: 'user_1', conversationId: null }])
  assert.deepEqual(savedWorkspaceInputs, [{
    agentSelection: {
      defaultProviderId: 'codex',
      newConversationProviderId: 'codex',
    },
  }])
})

function sdkProvider(id: string): ProviderConfig {
  return {
    id,
    kind: id,
    protocol: 'sdk',
    messageAdapter: 'thread-turn-item',
    label: id,
    enabled: true,
    runtime: {
      id: `${id}-sdk`,
      api: `${id}-sdk`,
      label: `${id} SDK`,
    },
  }
}

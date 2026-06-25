import assert from 'node:assert/strict'
import test from 'node:test'

import { hasEnabledAgentProvider } from './agentAvailability'
import { DEFAULT_PROVIDER_SETTINGS } from '../../../shared/infrastructure/providerConfigStore'

test('agent availability follows enabled app-server and SDK providers', () => {
  assert.equal(hasEnabledAgentProvider(DEFAULT_PROVIDER_SETTINGS), true)

  assert.equal(hasEnabledAgentProvider({
    ...DEFAULT_PROVIDER_SETTINGS,
    providers: DEFAULT_PROVIDER_SETTINGS.providers.map((provider) => ({
      ...provider,
      enabled: false,
    })),
  }), false)
})

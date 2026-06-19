import assert from 'node:assert/strict'
import test from 'node:test'

import {
  providerKindRouteKey,
  providerRoute,
  providerRouteForKey,
  providerRouteKey,
  providerTitle,
} from './providerRoutes'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('provider routes use dynamic provider keys for built-in and custom providers', () => {
  assert.equal(providerRouteForKey('mova'), '/agents/mova')
  assert.equal(providerRouteForKey('codex'), '/agents/codex')
  assert.equal(providerRouteForKey('studio-agent'), '/agents/studio-agent')
  assert.equal(providerTitle('mova'), 'Mova')
  assert.equal(providerTitle('codex'), 'Codex')
  assert.equal(providerTitle('claude'), 'Claude')
  assert.equal(providerTitle('studio-agent'), 'Studio Agent')
})

test('provider routes use provider ids without leaking runtime-owned provider keys', () => {
  const provider: ProviderConfig = {
    id: 'studio-primary',
    kind: 'studio-agent',
    protocol: 'sdk',
    messageAdapter: 'thread-turn-item',
    label: 'Studio Agent',
    enabled: true,
    runtime: {
      id: 'studio-runtime',
      api: 'studio-sdk',
      label: 'Studio SDK',
    },
  }

  assert.equal(providerRouteKey(provider), 'studio-primary')
  assert.equal(providerRoute(provider), '/agents/studio-primary')
  assert.equal(providerKindRouteKey(provider), 'studio-agent')
})

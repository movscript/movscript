import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appServerKey,
  providerRoute,
  providerRouteForKey,
  providerRouteKey,
  providerTitle,
} from './providerRoutes'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('provider routes use dynamic provider keys for built-in and custom app-server providers', () => {
  assert.equal(providerRouteForKey('mova'), '/agents/mova')
  assert.equal(providerRouteForKey('codex'), '/agents/codex')
  assert.equal(providerRouteForKey('studio-agent'), '/agents/studio-agent')
  assert.equal(providerTitle('mova'), 'Mova')
  assert.equal(providerTitle('codex'), 'Codex')
  assert.equal(providerTitle('claude'), 'Claude')
  assert.equal(providerTitle('studio-agent'), 'Studio Agent')
})

test('provider routes use provider instance ids without changing app-server provider keys', () => {
  const provider: ProviderConfig = {
    id: 'studio-primary',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Studio Agent',
    enabled: true,
    appServerProfile: {
      id: 'studio-home',
      label: 'Studio Agent',
      providerKey: 'studio-agent',
      home: '.studio-agent',
      lifecycle: 'movscript-owned',
    },
  }

  assert.equal(providerRouteKey(provider), 'studio-primary')
  assert.equal(providerRoute(provider), '/agents/studio-primary')
  assert.equal(appServerKey(provider), 'studio-agent')
})

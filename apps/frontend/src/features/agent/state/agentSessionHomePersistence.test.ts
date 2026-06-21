import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('agent session Home persistence owns storage hydration and save side effects', () => {
  const storeSource = readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8')
  const homePersistenceSource = readFileSync(resolve('src/features/agent/state/agentSessionHomePersistence.ts'), 'utf8')

  assert.match(storeSource, /installAgentSessionHomePersistence\(useAgentSessionStore\)/)
  for (const boundary of [
    'readElectronApi',
    'readBrowserStorageItem',
    'removeBrowserStorageItem',
    'listenToWindowEvent',
    'AGENT_SESSION_LEGACY_STORAGE_KEY',
  ]) {
    assert.match(homePersistenceSource, new RegExp(`\\b${boundary}\\b`))
    assert.doesNotMatch(storeSource, new RegExp(`\\b${boundary}\\b`))
  }
  assert.match(homePersistenceSource, /persistedAgentSessionState\(store\.getState\(\)\)/)
  assert.match(homePersistenceSource, /mergePersistedAgentSessionState\(current, state\)/)
  assert.match(homePersistenceSource, /normalizePersistedAgentSessionState\(parsed\)/)
})

test('agent session Home persistence keeps cross-window registry sync at the persistence boundary', () => {
  const homePersistenceSource = readFileSync(resolve('src/features/agent/state/agentSessionHomePersistence.ts'), 'utf8')

  assert.match(homePersistenceSource, /attachAgentConversationRegistryBroadcastBridge\(\)/)
  assert.match(homePersistenceSource, /subscribeAgentConversationRegistryEvents\(\(event\) => \{/)
  assert.match(homePersistenceSource, /event\.delivery !== 'cross-window' \|\| !event\.snapshot/)
  assert.match(homePersistenceSource, /store\.setState\(\(current\) => applyRemoteAgentSessionRegistryEvent\(current, event\)\)/)
})

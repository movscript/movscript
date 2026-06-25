import assert from 'node:assert/strict'
import test from 'node:test'

import { RELAY_GATEWAY_PROVIDER_INSTANCE_ID } from './adminRelayGatewayMode'
import { isModelProviderAccountStartupInstance, modelProviderAccountStartupInstances } from './adminModelProviderInstances'

const systemStartupInstances = [
  { id: 'database:sqlite', type: 'database', adapter: 'sqlite' },
  { id: 'blob_storage:filesystem', type: 'blob_storage', adapter: 'filesystem' },
  { id: 'workspace_repository:http', type: 'workspace_repository', adapter: 'http' },
  { id: 'ai_gateway:local', type: 'ai_gateway', adapter: 'local' },
  { id: 'vector_index:local-index', type: 'vector_index', adapter: 'local-index' },
  { id: 'cache:memory', type: 'cache', adapter: 'memory' },
  { id: 'media_processing:desktop-managed', type: 'media_processing', adapter: 'desktop-managed' },
  { id: 'agent_runtime:desktop-managed', type: 'agent_runtime', adapter: 'desktop-managed' },
]

test('model provider account startup filter excludes system dependency instances', () => {
  for (const instance of systemStartupInstances) {
    assert.equal(isModelProviderAccountStartupInstance(instance), false, instance.id)
  }
})

test('model provider account startup filter keeps relay gateway and skips referenced credentials', () => {
  const instances = [
    ...systemStartupInstances,
    { id: RELAY_GATEWAY_PROVIDER_INSTANCE_ID, type: 'ai_gateway', adapter: 'relay-gateway' },
    { id: 'ai_gateway:credential:1', type: 'ai_gateway', adapter: 'openai_compat', ref: { kind: 'ai_credential', id: 1 } },
  ]

  assert.deepEqual(
    modelProviderAccountStartupInstances(instances).map((instance) => instance.id),
    [RELAY_GATEWAY_PROVIDER_INSTANCE_ID],
  )
})

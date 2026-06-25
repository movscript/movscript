import assert from 'node:assert/strict'
import test from 'node:test'

import {
  callSdkRuntimeMcpTool,
  listSdkRuntimeMcpServers,
  readSdkRuntimeMcpResource,
} from './sdkRuntimeMcpBridge'

test('SDK runtime MCP bridge exposes the MovScript tool server', () => {
  const inventory = listSdkRuntimeMcpServers()

  assert.equal(inventory.servers[0]?.id, 'movscript')
  assert.equal(inventory.servers[0]?.status, 'running')
  assert.equal(inventory.servers[0]?.toolCount, inventory.tools.length)
  assert.equal(inventory.tools.length > 0, true)
})

test('SDK runtime MCP bridge rejects unknown servers', async () => {
  await assert.rejects(
    () => callSdkRuntimeMcpTool({ server: 'unknown', tool: 'domain_overview' }),
    /does not know server: unknown/,
  )
  await assert.rejects(
    () => readSdkRuntimeMcpResource({ server: 'unknown', uri: 'movscript://resource-file/1' }),
    /does not know server: unknown/,
  )
})

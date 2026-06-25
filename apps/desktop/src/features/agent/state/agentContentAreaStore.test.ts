import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { AGENT_CONTENT_AREA_STORAGE_KEY } from './agentContentAreaStore'

test('agent content area persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/features/agent/state/agentContentAreaStore.ts'), 'utf8')

  assert.equal(AGENT_CONTENT_AREA_STORAGE_KEY, 'agent-content-area-store-v1')
  assert.match(source, /createDesktopStateStorage\(\s*AGENT_CONTENT_AREA_STORAGE_KEY,\s*createInstrumentedAgentStateStorage\('agent_content_area_store'\),\s*\)/)
})

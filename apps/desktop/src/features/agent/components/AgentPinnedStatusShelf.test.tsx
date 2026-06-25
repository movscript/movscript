import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentPinnedStatusShelf } from '@/features/agent/components/AgentPinnedStatusShelf'

test('AgentPinnedStatusShelf renders compact thread status summaries', () => {
  const html = renderToStaticMarkup(
    <AgentPinnedStatusShelf
      statusItems={[
        {
          id: 'token-usage:thread_1',
          threadId: 'thread_1',
          title: 'Token usage',
          detail: 'total 1200 · input 900 · output 300',
          badge: 'tokens',
        },
        {
          id: 'mcp:filesystem',
          title: 'MCP filesystem',
          detail: 'ready for tools',
          badge: 'ready',
          tone: 'success',
        },
      ]}
    />,
  )

  assert.match(html, /agent-pinned-status-root/)
  assert.match(html, /Status/)
  assert.match(html, /Token usage/)
  assert.match(html, /total 1200/)
  assert.match(html, /MCP filesystem/)
  assert.match(html, /ready/)
})

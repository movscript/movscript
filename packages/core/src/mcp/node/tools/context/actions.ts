import { getMCPFocusSnapshot } from '../focus/store.js'

export function getCurrentContext(): unknown {
  const startedAt = Date.now()
  const context = getMCPFocusSnapshot()
  const contextMs = Date.now() - startedAt
  return {
    schema: 'movscript.mcp.context-current.v1',
    context,
    source: {
      kind: 'mcp-context-snapshot',
      routeSearchSanitized: true,
      note: 'This is a UI/session hint. Project-scoped writes must still pass an explicit project locator.',
    },
    timings: {
      totalMs: contextMs,
      contextMs,
    },
  }
}

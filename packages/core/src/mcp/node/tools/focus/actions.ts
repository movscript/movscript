import { getMCPFocusSnapshot } from './store.js'

export function getFocus(): unknown {
  const startedAt = Date.now()
  const focusMs = Date.now() - startedAt
  return {
    focus: getMCPFocusSnapshot(),
    timings: {
      totalMs: focusMs,
      focusMs,
    },
  }
}

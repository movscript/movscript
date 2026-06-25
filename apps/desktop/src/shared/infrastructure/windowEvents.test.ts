import assert from 'node:assert/strict'
import test from 'node:test'

import { listenToWindowEvent, publishWindowEvent } from './windowEvents.ts'

test('window event facade no-ops when tests provide a partial window mock', () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  } as typeof window

  try {
    const unsubscribe = listenToWindowEvent('storage', () => {})

    assert.doesNotThrow(unsubscribe)
    assert.equal(publishWindowEvent(new Event('storage')), false)
  } finally {
    globalThis.window = previousWindow
  }
})

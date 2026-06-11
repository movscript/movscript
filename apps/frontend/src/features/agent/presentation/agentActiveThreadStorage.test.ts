import assert from 'node:assert/strict'
import test from 'node:test'

import {
  openAgentChatDataSourceThread,
  readStoredActiveThreadId,
  writeStoredActiveThreadId,
} from './agentActiveThreadStorage'

test('agent active thread storage trims reads and clears missing thread ids', () => {
  const storage = installWindowStorage()

  try {
    writeStoredActiveThreadId('thread-key', ' thread_1 ')
    assert.equal(readStoredActiveThreadId('thread-key'), 'thread_1')

    writeStoredActiveThreadId('thread-key', null)
    assert.equal(readStoredActiveThreadId('thread-key'), null)
  } finally {
    storage.restore()
  }
})

test('agent active thread storage opens a thread and dispatches the shell event', () => {
  const storage = installWindowStorage()
  let openedThreadId: string | null = null
  window.addEventListener('agent-thread-open', (event) => {
    openedThreadId = (event as CustomEvent<{ threadId: string }>).detail.threadId
  })

  try {
    openAgentChatDataSourceThread({
      storageKey: 'thread-key',
      eventName: 'agent-thread-open',
      threadId: 'thread_2',
    })

    assert.equal(storage.values.get('thread-key'), 'thread_2')
    assert.equal(openedThreadId, 'thread_2')
  } finally {
    storage.restore()
  }
})

function installWindowStorage() {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map<string, string>()
  const listeners = new Map<string, Array<(event: Event) => void>>()

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      addEventListener: (eventName: string, listener: (event: Event) => void) => {
        listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) listener(event)
        return true
      },
    },
  })

  return {
    values,
    restore: () => {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    },
  }
}

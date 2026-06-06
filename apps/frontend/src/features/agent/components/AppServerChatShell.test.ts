import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appServerActiveThreadStorageKey,
  appServerThreadOpenEvent,
  appServerWorkspaceContextFromRoute,
  readAppServerActiveThreadId,
} from '@/features/agent/components/AppServerChatShell'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('app-server chat shell maps routes to MovScript workspace contexts', () => {
  assert.deepEqual(appServerWorkspaceContextFromRoute({
    userId: '7',
    pathname: '/project/agent',
    search: '',
  }), { scope: 'global' })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    userId: '7',
    projectId: 42,
    pathname: '/project/agent',
    search: '',
  }), {
    scope: 'project',
    userId: '7',
    projectId: 42,
  })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    userId: '7',
    projectId: 42,
    pathname: '/project/production/orchestration',
    search: '?productionId=99',
  }), {
    scope: 'production',
    userId: '7',
    projectId: 42,
    productionId: 99,
  })
})

test('app-server chat shell scopes active thread keys by provider instance', () => {
  const provider = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-home',
  })
  const otherProfile = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-sandbox',
  })

  assert.equal(
    appServerActiveThreadStorageKey(provider),
    'movscript.studio-agent.studio-primary.studio-home.activeThreadId',
  )
  assert.equal(
    appServerThreadOpenEvent(provider),
    'movscript:studio-agent.studio-primary.studio-home-thread-open',
  )
  assert.notEqual(
    appServerActiveThreadStorageKey(provider),
    appServerActiveThreadStorageKey(otherProfile),
  )
  assert.notEqual(
    appServerThreadOpenEvent(provider),
    appServerThreadOpenEvent(otherProfile),
  )
})

test('app-server chat shell recovers active threads from provider compatibility keys', () => {
  const provider = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-home',
  })
  const storage = new Map<string, string>()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })

  try {
    storage.set('movscript.studio-agent.studio-primary.activeThreadId', 'thread_compat')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_compat')

    storage.set(appServerActiveThreadStorageKey(provider), 'thread_current')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_current')
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

function appServerProvider(input: {
  id: string
  kind: string
  profileId: string
}): ProviderConfig {
  return {
    id: input.id,
    kind: input.kind,
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: input.kind,
    enabled: true,
    appServerProfile: {
      id: input.profileId,
      label: input.profileId,
      providerKey: input.kind,
      home: `.movscript/.${input.kind}`,
      lifecycle: 'movscript-owned',
    },
  }
}

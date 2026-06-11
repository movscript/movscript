import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ACTIVE_APP_SERVER_THREAD_STORAGE_KEY,
  appServerActiveThreadStorageKey,
  appServerThreadOpenEvent,
  appServerWorkspaceContextFromRoute,
  readAppServerActiveThreadId,
} from '@/features/agent/components/AppServerChatShell'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('app-server chat shell maps routes to MovScript workspace contexts', () => {
  assert.deepEqual(appServerWorkspaceContextFromRoute({
    pathname: '/project/agent',
    search: '',
  }), { scope: 'global' })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/agent',
    search: '',
  }), {
    scope: 'project',
    projectId: 42,
  })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/scripts/workbench',
    search: '?productionId=99',
  }), {
    scope: 'production',
    projectId: 42,
    productionId: 99,
  })
})

test('app-server dock panel stays independent from route location updates', () => {
  const source = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const shellEntry = source.match(/export function AppServerChatShell[\s\S]*?function RouteAwareAppServerChatShell/)?.[0] ?? ''

  assert.match(shellEntry, /surface === 'page'/)
  assert.match(shellEntry, /appServerProjectWorkspaceContext\(project\?\.ID\)/)
  assert.doesNotMatch(shellEntry, /useLocation\(\)/)
  assert.match(source, /function RouteAwareAppServerChatShell[\s\S]*useLocation\(\)/)
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

    storage.delete(appServerActiveThreadStorageKey(provider))
    storage.delete('movscript.studio-agent.studio-primary.activeThreadId')
    storage.set(ACTIVE_APP_SERVER_THREAD_STORAGE_KEY, 'thread_global')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_global')
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('agent chat active thread storage is owned by the presentation helper', () => {
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const storageSource = readFileSync(resolve('src/features/agent/presentation/agentActiveThreadStorage.ts'), 'utf8')

  assert.match(storageSource, /export function readStoredActiveThreadId/)
  assert.match(storageSource, /export function writeStoredActiveThreadId/)
  assert.match(storageSource, /window\.localStorage\.getItem\(storageKey\)/)
  assert.match(appServerShellSource, /const readActiveThreadId = useCallback\(\(\) => readAppServerActiveThreadId\(provider\), \[provider\]\)/)
  assert.match(appServerShellSource, /readActiveThreadId=\{readActiveThreadId\}/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProvider/)
  assert.match(unifiedShellSource, /readAppServerActiveThreadId\(selectedProvider\)/)
  assert.match(unifiedShellSource, /find\(\(provider\) => readAppServerActiveThreadId\(provider\)\)/)
  assert.match(unifiedShellSource, /window\.addEventListener\(appServerThreadOpenEvent\(provider\), handleActiveThreadChanged\)/)
  assert.match(unifiedShellSource, /AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT/)
  assert.match(dataSourceShellSource, /readActiveThreadId\?: \(\) => string \| null/)
  assert.match(dataSourceShellSource, /const readCurrentActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /createAgentChatRuntimeState\(readCurrentActiveThreadId\(\)\)/)
  assert.match(dataSourceShellSource, /writeStoredActiveThreadId\(activeThreadStorageKey, activeThreadId\)/)
  assert.match(dataSourceShellSource, /notifyAgentChatDataSourceActiveThread\(\{[\s\S]*eventName: openThreadEventName,[\s\S]*sourceId: shellInstanceIdRef\.current,[\s\S]*threadId: activeThreadId,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /if \(detail\?\.sourceId === shellInstanceIdRef\.current\) return/)
  assert.match(dataSourceShellSource, /const candidateIds = uniqueAgentChatThreadIds\(\[[\s\S]*stored,[\s\S]*\.\.\.nextThreads\.map\(\(thread\) => thread\.id\),[\s\S]*\]\)/)
  assert.match(dataSourceShellSource, /provisionalAgentChatThread\(stored, dataSource\)/)
  assert.doesNotMatch(dataSourceShellSource, /clearUnavailableActiveThread\(stored\)/)
  assert.doesNotMatch(appServerShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
})

test('agent chat pending server requests survive shell remounts without stale replay', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')

  assert.match(dataSourceShellSource, /const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest\[\]>\(\)/)
  assert.match(dataSourceShellSource, /function storePersistentServerRequest/)
  assert.match(dataSourceShellSource, /upsertAgentChatPendingServerRequest\(current, request, persistentResolve\)/)
  assert.match(dataSourceShellSource, /const replayPersistentServerRequests = useCallback/)
  assert.match(dataSourceShellSource, /type: 'updatePendingServerRequests'[\s\S]*upsertAgentChatPendingServerRequest\(next, entry\.request, entry\.resolve\)/)
  assert.match(dataSourceShellSource, /useEffect\(\(\) => \{[\s\S]*replayPersistentServerRequests\(\)[\s\S]*\}, \[activeThreadId, dataSource, replayPersistentServerRequests\]\)/)
  assert.match(dataSourceShellSource, /function applyPersistentServerRequestNotification/)
  assert.match(dataSourceShellSource, /agentChatPendingServerRequestMatchesResolvedEvent\(entry\.request, event\)/)
  assert.match(dataSourceShellSource, /dropPersistentServerRequests\(scopeKey, \(entry\) => entry\.request\.threadId === event\.threadId\)/)
  assert.match(dataSourceShellSource, /notification\.method !== 'turn\/completed'/)
  assert.match(dataSourceShellSource, /applyPersistentServerRequestNotification\(persistentRequestScopeKey, notification\)/)
  assert.doesNotMatch(dataSourceShellSource, /setPendingServerRequests\(\(current\) => removeAgentChatPendingServerRequests\(current, \(\) => true\)\)/)
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

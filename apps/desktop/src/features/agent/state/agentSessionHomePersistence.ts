import type { StoreApi } from 'zustand'
import { readBrowserStorageItem, removeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'
import {
  attachAgentConversationRegistryBroadcastBridge,
  subscribeAgentConversationRegistryEvents,
} from '@/features/agent/state/agentConversationRegistryEvents'
import {
  applyRemoteAgentSessionRegistryEvent,
  hasPersistedAgentSessionState,
  mergePersistedAgentSessionState,
  normalizePersistedAgentSessionState,
} from '@/features/agent/state/agentSessionPersistenceModel'
import {
  persistedAgentSessionState,
  type AgentSessionStore,
  type PersistedAgentSessionStore,
} from '@/features/agent/state/agentSessionStoreTypes'

type AgentSessionHomePersistenceStore = Pick<StoreApi<AgentSessionStore>, 'getState' | 'setState' | 'subscribe'>

const AGENT_SESSION_LEGACY_STORAGE_KEY = 'agent-session-store-v2'

let agentSessionPersistenceInstalled = false
let agentSessionHydratedFromHome = false
let agentSessionSaveTimer: ReturnType<typeof setTimeout> | undefined
let agentSessionSaveInFlight: Promise<unknown> | undefined
let agentSessionSaveQueued = false
let agentSessionStore: AgentSessionHomePersistenceStore | undefined

export function installAgentSessionHomePersistence(store: AgentSessionHomePersistenceStore): void {
  if (agentSessionPersistenceInstalled || typeof window === 'undefined') return
  agentSessionPersistenceInstalled = true
  agentSessionStore = store
  attachAgentConversationRegistryBroadcastBridge()
  subscribeAgentConversationRegistryEvents((event) => {
    if (event.delivery !== 'cross-window' || !event.snapshot) return
    store.setState((current) => applyRemoteAgentSessionRegistryEvent(current, event))
  })
  store.subscribe(() => {
    if (!agentSessionHydratedFromHome) return
    scheduleAgentSessionHomeSave()
  })
  void hydrateAgentSessionStoreFromHome(store)
  listenToWindowEvent('pagehide', flushAgentSessionHomeSave)
  listenToWindowEvent('beforeunload', flushAgentSessionHomeSave)
}

async function hydrateAgentSessionStoreFromHome(store: AgentSessionHomePersistenceStore): Promise<void> {
  const api = readElectronApi()
  const legacyState = readLegacyAgentSessionState()
  if (!api?.getAgentSessionState) {
    if (legacyState && hasPersistedAgentSessionState(legacyState)) {
      store.setState((current) => mergePersistedAgentSessionState(current, legacyState))
    }
    agentSessionHydratedFromHome = true
    return
  }

  try {
    const result = await api.getAgentSessionState()
    const homeState = result.state
    const homeHasState = hasPersistedAgentSessionState(homeState)
    const state = homeHasState ? homeState : legacyState
    if (state && hasPersistedAgentSessionState(state)) {
      store.setState((current) => mergePersistedAgentSessionState(current, state))
    }
    if (legacyState) removeBrowserStorageItem('local', AGENT_SESSION_LEGACY_STORAGE_KEY)
    agentSessionHydratedFromHome = true
    if (!homeHasState && legacyState && api.setAgentSessionState) {
      await saveAgentSessionHomeState(store)
    }
  } catch {
    if (legacyState && hasPersistedAgentSessionState(legacyState)) {
      store.setState((current) => mergePersistedAgentSessionState(current, legacyState))
    }
    agentSessionHydratedFromHome = true
  }
}

function scheduleAgentSessionHomeSave(): void {
  if (agentSessionSaveTimer) return
  agentSessionSaveTimer = setTimeout(() => {
    agentSessionSaveTimer = undefined
    void saveAgentSessionHomeState()
  }, 250)
}

function flushAgentSessionHomeSave(): void {
  if (agentSessionSaveTimer) {
    clearTimeout(agentSessionSaveTimer)
    agentSessionSaveTimer = undefined
  }
  void saveAgentSessionHomeState()
}

async function saveAgentSessionHomeState(store = agentSessionStore): Promise<void> {
  const api = readElectronApi()
  if (!store || !api?.setAgentSessionState || !agentSessionHydratedFromHome) return
  if (agentSessionSaveInFlight) {
    agentSessionSaveQueued = true
    return agentSessionSaveInFlight.then(() => undefined)
  }
  const state = persistedAgentSessionState(store.getState())
  agentSessionSaveInFlight = api.setAgentSessionState({ state })
    .catch(() => null)
    .finally(() => {
      agentSessionSaveInFlight = undefined
      if (agentSessionSaveQueued) {
        agentSessionSaveQueued = false
        void saveAgentSessionHomeState(store)
      }
    })
  await agentSessionSaveInFlight
}

function readLegacyAgentSessionState(): PersistedAgentSessionStore | null {
  const raw = readBrowserStorageItem('local', AGENT_SESSION_LEGACY_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return normalizePersistedAgentSessionState(parsed)
  } catch {
    return null
  }
}

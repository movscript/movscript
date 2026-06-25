import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { User, OrgMembership } from '@/types'
import { syncElectronBackendAuthSession } from './backendAuthSessionSync'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export const USER_SESSION_STORAGE_KEY = 'movscript-user'
export const LOCAL_WORKSPACE_REALM_KEY = 'local'
export const LOCAL_WORKSPACE_USER: User = {
  ID: 1,
  username: 'Local Workspace',
  system_role: 'super_admin',
}
export const LOCAL_WORKSPACE_ORG: OrgMembership = {
  org_id: 1,
  org_name: 'Local Workspace',
  org_slug: 'local-workspace',
  is_personal: true,
  taskGraph: 'personal',
  status: 'active',
  role: 'owner',
}

interface UserStore {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
  gitCredential: AuthGitCredential | null
  orgMemberships: OrgMembership[]
  currentOrgID: number | null
  activeRealmKey: string
  sessionsByRealm: Record<string, UserSessionSnapshot>
  hydrated: boolean
  setSession: (session: AuthSession | null) => void
  setLocalWorkspaceSession: () => void
  setCurrentUser: (u: User | null) => void
  setActiveRealm: (realmKey: string) => void
  setOrgMemberships: (memberships: OrgMembership[], preferredOrgId?: number | null) => void
  setCurrentOrg: (orgId: number | null) => void
}

export interface AuthSession {
  user: User | AuthUserPayload
  token?: string
  expires_at?: string
  git_credential?: AuthGitCredential
  org_memberships?: OrgMembership[]
}

export interface AuthGitCredential {
  provider: 'gitea'
  username: string
  token?: string
  masked_token?: string
  maskedToken?: string
  status?: string
  last_error?: string
  lastError?: string
}

interface AuthUserPayload {
  ID?: number
  id?: number | string
  username: string
  system_role?: 'super_admin' | 'user'
  systemRole?: 'super_admin' | 'user'
}

interface UserSessionSnapshot {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
  gitCredential: AuthGitCredential | null
  orgMemberships: OrgMembership[]
  currentOrgID: number | null
}

function resolveInitialOrg(memberships: OrgMembership[], preferredOrgId?: number | null): number | null {
  if (preferredOrgId && memberships.some((m) => m.org_id === preferredOrgId)) {
    return preferredOrgId
  }
  return memberships.find((m) => m.is_personal)?.org_id ?? memberships[0]?.org_id ?? null
}

function normalizeUser(user: User | AuthUserPayload): User {
  return {
    ID: Number((user as AuthUserPayload).ID ?? (user as AuthUserPayload).id ?? 0),
    username: user.username,
    system_role: (user as AuthUserPayload).system_role ?? (user as AuthUserPayload).systemRole ?? 'user',
  }
}

const memoryUserSessionStorage: StateStorage = (() => {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
})()

function getUserSessionStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryUserSessionStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(USER_SESSION_STORAGE_KEY, fallback)
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      currentUser: null,
      token: null,
      tokenExpiresAt: null,
      gitCredential: null,
      orgMemberships: [],
      currentOrgID: null,
      activeRealmKey: LOCAL_WORKSPACE_REALM_KEY,
      sessionsByRealm: {},
      hydrated: false,
      setSession: (session: AuthSession | null) => {
        const realmKey = get().activeRealmKey
        if (!session) {
          set((state) => {
            const sessionsByRealm = { ...state.sessionsByRealm }
            delete sessionsByRealm[realmKey]
            return { ...emptyUserSession(), sessionsByRealm }
          })
          void syncElectronBackendAuthSession(null)
          return
        }
        const memberships = session.org_memberships ?? []
        const snapshot: UserSessionSnapshot = {
          currentUser: normalizeUser(session.user),
          token: session.token ?? null,
          tokenExpiresAt: session.expires_at ?? null,
          gitCredential: session.git_credential ?? null,
          orgMemberships: memberships,
          currentOrgID: resolveInitialOrg(memberships),
        }
        set((state) => ({
          ...snapshot,
          sessionsByRealm: {
            ...state.sessionsByRealm,
            [realmKey]: snapshot,
          },
        }))
        void syncElectronBackendAuthSession(session)
      },
      setLocalWorkspaceSession: () => {
        const snapshot: UserSessionSnapshot = {
          currentUser: LOCAL_WORKSPACE_USER,
          token: null,
          tokenExpiresAt: null,
          gitCredential: null,
          orgMemberships: [LOCAL_WORKSPACE_ORG],
          currentOrgID: LOCAL_WORKSPACE_ORG.org_id,
        }
        set((state) => ({
          activeRealmKey: LOCAL_WORKSPACE_REALM_KEY,
          ...snapshot,
          sessionsByRealm: {
            ...state.sessionsByRealm,
            [LOCAL_WORKSPACE_REALM_KEY]: snapshot,
          },
        }))
        void syncElectronBackendAuthSession(null)
      },
      setActiveRealm: (realmKey: string) => {
        const normalized = realmKey.trim() || LOCAL_WORKSPACE_REALM_KEY
        const snapshot = get().sessionsByRealm[normalized] ?? emptyUserSession()
        set((state) => ({
          activeRealmKey: normalized,
          ...snapshot,
        }))
        if (snapshot.currentUser && snapshot.token) {
          void syncElectronBackendAuthSession({
            token: snapshot.token,
            expires_at: snapshot.tokenExpiresAt ?? undefined,
            user: snapshot.currentUser,
            git_credential: snapshot.gitCredential ?? undefined,
          })
        } else {
          void syncElectronBackendAuthSession(null)
        }
      },
      setCurrentUser: (u: User | null) => {
        if (!u) {
          const realmKey = get().activeRealmKey
          void syncElectronBackendAuthSession(null)
          set((state: UserStore) => {
            const sessionsByRealm = { ...state.sessionsByRealm }
            delete sessionsByRealm[realmKey]
            return { ...emptyUserSession(), sessionsByRealm }
          })
          return
        }
        set((state: UserStore) => {
          const snapshot: UserSessionSnapshot = {
            currentUser: u,
            token: state.token,
            tokenExpiresAt: state.tokenExpiresAt,
            gitCredential: state.gitCredential,
            orgMemberships: state.orgMemberships,
            currentOrgID: state.currentOrgID,
          }
          return {
            ...snapshot,
            sessionsByRealm: {
              ...state.sessionsByRealm,
              [state.activeRealmKey]: snapshot,
            },
          }
        })
      },
      setOrgMemberships: (memberships: OrgMembership[], preferredOrgId?: number | null) => {
        set((state) => {
          const snapshot: UserSessionSnapshot = {
            currentUser: state.currentUser,
            token: state.token,
            tokenExpiresAt: state.tokenExpiresAt,
            gitCredential: state.gitCredential,
            orgMemberships: memberships,
            currentOrgID: resolveInitialOrg(memberships, preferredOrgId),
          }
          return {
            ...snapshot,
            sessionsByRealm: state.currentUser ? {
              ...state.sessionsByRealm,
              [state.activeRealmKey]: snapshot,
            } : state.sessionsByRealm,
          }
        })
      },
      setCurrentOrg: (orgId: number | null) => set((state) => {
        const snapshot: UserSessionSnapshot = {
          currentUser: state.currentUser,
          token: state.token,
          tokenExpiresAt: state.tokenExpiresAt,
          gitCredential: state.gitCredential,
          orgMemberships: state.orgMemberships,
          currentOrgID: orgId,
        }
        return {
          ...snapshot,
          sessionsByRealm: state.currentUser ? {
            ...state.sessionsByRealm,
            [state.activeRealmKey]: snapshot,
          } : state.sessionsByRealm,
        }
      }),
    }),
    {
      name: USER_SESSION_STORAGE_KEY,
      storage: createJSONStorage(getUserSessionStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UserStore> | undefined
        return {
          ...currentState,
          ...persisted,
          currentUser: persisted?.currentUser ? normalizeUser(persisted.currentUser) : null,
          activeRealmKey: persisted?.activeRealmKey || LOCAL_WORKSPACE_REALM_KEY,
          sessionsByRealm: normalizeSessionsByRealm(persisted?.sessionsByRealm, persisted),
          orgMemberships: persisted?.orgMemberships ?? [],
          currentOrgID: persisted?.currentOrgID ?? null,
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state?: UserStore) => {
        if (!state) return
        state.hydrated = true
        if (state.token && state.currentUser) {
          void syncElectronBackendAuthSession({
            token: state.token,
            expires_at: state.tokenExpiresAt,
            user: state.currentUser,
            git_credential: state.gitCredential,
          })
        }
      },
    }
  )
)

function emptyUserSession(): UserSessionSnapshot {
  return {
    currentUser: null,
    token: null,
    tokenExpiresAt: null,
    gitCredential: null,
    orgMemberships: [],
    currentOrgID: null,
  }
}

function normalizeSessionsByRealm(
  value: unknown,
  persisted: Partial<UserStore> | undefined,
): Record<string, UserSessionSnapshot> {
  const sessions: Record<string, UserSessionSnapshot> = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [realmKey, item] of Object.entries(value)) {
      const snapshot = normalizeSessionSnapshot(item)
      if (snapshot) sessions[realmKey] = snapshot
    }
  }
  if (Object.keys(sessions).length === 0 && persisted?.currentUser) {
    sessions[persisted.activeRealmKey || LOCAL_WORKSPACE_REALM_KEY] = {
      currentUser: normalizeUser(persisted.currentUser),
      token: persisted.token ?? null,
      tokenExpiresAt: persisted.tokenExpiresAt ?? null,
      gitCredential: persisted.gitCredential ?? null,
      orgMemberships: persisted.orgMemberships ?? [],
      currentOrgID: persisted.currentOrgID ?? null,
    }
  }
  return sessions
}

function normalizeSessionSnapshot(value: unknown): UserSessionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Partial<UserSessionSnapshot>
  if (!item.currentUser) return null
  return {
    currentUser: normalizeUser(item.currentUser),
    token: typeof item.token === 'string' ? item.token : null,
    tokenExpiresAt: typeof item.tokenExpiresAt === 'string' ? item.tokenExpiresAt : null,
    gitCredential: item.gitCredential ?? null,
    orgMemberships: item.orgMemberships ?? [],
    currentOrgID: item.currentOrgID ?? null,
  }
}

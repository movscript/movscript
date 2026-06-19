import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { User, OrgMembership } from '@/types'
import { syncElectronBackendAuthSession } from './backendAuthSessionSync'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export const USER_SESSION_STORAGE_KEY = 'movscript-user'

interface UserStore {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
  gitCredential: AuthGitCredential | null
  orgMemberships: OrgMembership[]
  currentOrgID: number | null
  hydrated: boolean
  setSession: (session: AuthSession | null) => void
  setCurrentUser: (u: User | null) => void
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
    (set) => ({
      currentUser: null,
      token: null,
      tokenExpiresAt: null,
      gitCredential: null,
      orgMemberships: [],
      currentOrgID: null,
      hydrated: false,
      setSession: (session: AuthSession | null) => {
        if (!session) {
          set({ currentUser: null, token: null, tokenExpiresAt: null, gitCredential: null, orgMemberships: [], currentOrgID: null })
          void syncElectronBackendAuthSession(null)
          return
        }
        const memberships = session.org_memberships ?? []
        set({
          currentUser: normalizeUser(session.user),
          token: session.token ?? null,
          tokenExpiresAt: session.expires_at ?? null,
          gitCredential: session.git_credential ?? null,
          orgMemberships: memberships,
          currentOrgID: resolveInitialOrg(memberships),
        })
        void syncElectronBackendAuthSession(session)
      },
      setCurrentUser: (u: User | null) => {
        if (!u) void syncElectronBackendAuthSession(null)
        set((state: UserStore) => ({
          currentUser: u,
          token: u ? state.token : null,
          tokenExpiresAt: u ? state.tokenExpiresAt : null,
          gitCredential: u ? state.gitCredential : null,
          orgMemberships: u ? state.orgMemberships : [],
          currentOrgID: u ? state.currentOrgID : null,
        }))
      },
      setOrgMemberships: (memberships: OrgMembership[], preferredOrgId?: number | null) => set({
        orgMemberships: memberships,
        currentOrgID: resolveInitialOrg(memberships, preferredOrgId),
      }),
      setCurrentOrg: (orgId: number | null) => set({ currentOrgID: orgId }),
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

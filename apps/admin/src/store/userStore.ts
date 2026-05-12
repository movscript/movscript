import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, OrgMembership } from '@/types'

interface UserStore {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
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
  org_memberships?: OrgMembership[]
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

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      currentUser: null,
      token: null,
      tokenExpiresAt: null,
      orgMemberships: [],
      currentOrgID: null,
      hydrated: false,
      setSession: (session: AuthSession | null) => {
        if (!session) {
          set({ currentUser: null, token: null, tokenExpiresAt: null, orgMemberships: [], currentOrgID: null })
          return
        }
        const memberships = session.org_memberships ?? []
        set({
          currentUser: normalizeUser(session.user),
          token: session.token ?? null,
          tokenExpiresAt: session.expires_at ?? null,
          orgMemberships: memberships,
          currentOrgID: resolveInitialOrg(memberships),
        })
      },
      setCurrentUser: (u: User | null) => set((state: UserStore) => ({
        currentUser: u,
        token: u ? state.token : null,
        tokenExpiresAt: u ? state.tokenExpiresAt : null,
        orgMemberships: u ? state.orgMemberships : [],
        currentOrgID: u ? state.currentOrgID : null,
      })),
      setOrgMemberships: (memberships: OrgMembership[], preferredOrgId?: number | null) => set({
        orgMemberships: memberships,
        currentOrgID: resolveInitialOrg(memberships, preferredOrgId),
      }),
      setCurrentOrg: (orgId: number | null) => set({ currentOrgID: orgId }),
    }),
    {
      name: 'movscript-user',
      onRehydrateStorage: () => (state?: UserStore) => {
        if (state) state.hydrated = true
      },
    }
  )
)

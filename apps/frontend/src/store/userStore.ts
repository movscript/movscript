import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, OrgMembership } from '@/types'

interface UserStore {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
  orgMemberships: OrgMembership[]
  currentOrgID: number | null
  setSession: (session: AuthSession | null) => void
  setCurrentUser: (u: User | null) => void
  setOrgMemberships: (memberships: OrgMembership[], preferredOrgId?: number | null) => void
  setCurrentOrg: (orgId: number | null) => void
}

export interface AuthSession {
  user: User
  token?: string
  expires_at?: string
  org_memberships?: OrgMembership[]
}

function visibleMemberships(memberships: OrgMembership[]): OrgMembership[] {
  return memberships.filter((m) => !m.is_personal)
}

function resolveInitialOrg(memberships: OrgMembership[], preferredOrgId?: number | null): number | null {
  if (preferredOrgId && memberships.some((m) => m.org_id === preferredOrgId)) {
    return preferredOrgId
  }
  return memberships.find((m) => m.is_personal)?.org_id ?? memberships[0]?.org_id ?? null
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      currentUser: null,
      token: null,
      tokenExpiresAt: null,
      orgMemberships: [],
      currentOrgID: null,
      setSession: (session) => {
        if (!session) {
          set({ currentUser: null, token: null, tokenExpiresAt: null, orgMemberships: [], currentOrgID: null })
          return
        }
        const memberships = session.org_memberships ?? []
        set({
          currentUser: session.user,
          token: session.token ?? null,
          tokenExpiresAt: session.expires_at ?? null,
          orgMemberships: memberships,
          currentOrgID: resolveInitialOrg(memberships),
        })
      },
      setCurrentUser: (u) => set((state) => ({
        currentUser: u,
        token: u ? state.token : null,
        tokenExpiresAt: u ? state.tokenExpiresAt : null,
        orgMemberships: u ? state.orgMemberships : [],
        currentOrgID: u ? state.currentOrgID : null,
      })),
      setOrgMemberships: (memberships, preferredOrgId) => set({
        orgMemberships: memberships,
        currentOrgID: resolveInitialOrg(memberships, preferredOrgId),
      }),
      setCurrentOrg: (orgId) => set({ currentOrgID: orgId }),
    }),
    {
      name: 'movscript-user',
    }
  )
)

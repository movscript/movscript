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
  setCurrentOrg: (orgId: number | null) => void
}

export interface AuthSession {
  user: User
  token: string
  expires_at: string
  org_memberships?: OrgMembership[]
}

function resolveInitialOrg(memberships: OrgMembership[]): number | null {
  if (memberships.length === 0) return null
  // Single org or only personal orgs → auto-select
  const nonPersonal = memberships.filter((m) => !m.is_personal)
  if (nonPersonal.length <= 1) {
    return memberships[0].org_id
  }
  // Multiple non-personal orgs → require explicit selection
  return null
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
          token: session.token,
          tokenExpiresAt: session.expires_at,
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
      setCurrentOrg: (orgId) => set({ currentOrgID: orgId }),
    }),
    {
      name: 'movscript-user',
    }
  )
)

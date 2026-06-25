import { create } from 'zustand'

import type { OrgMembership, User } from '@movscript/shared'

interface UserStore {
  currentUser: User | null
  currentOrgID: number | null
  orgMemberships: OrgMembership[]
  setCurrentUser: (user: User | null) => void
  setCurrentOrg: (orgId: number | null) => void
}

export const LOCAL_SURFACE_USER: User = {
  ID: 1,
  username: 'Local Workspace',
  system_role: 'super_admin',
}

export const LOCAL_SURFACE_ORG: OrgMembership = {
  org_id: 1,
  org_name: 'Local Workspace',
  org_slug: 'local-workspace',
  is_personal: true,
  status: 'active',
  role: 'owner',
}

export const useUserStore = create<UserStore>()((set) => ({
  currentUser: LOCAL_SURFACE_USER,
  currentOrgID: 1,
  orgMemberships: [LOCAL_SURFACE_ORG],
  setCurrentUser: (currentUser) => set({ currentUser }),
  setCurrentOrg: (currentOrgID) => set({ currentOrgID }),
}))

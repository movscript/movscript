export type OrgSettingsTabKey = 'members' | 'usage' | 'invitations' | 'generation-tools' | 'settings'

export const ORG_MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export const ORG_INVITATION_ROLES = ['admin', 'member', 'viewer'] as const

export type OrgUsageRow = {
  user_id: number
  username: string
  cost: number
  tokens: number
}

export type OrgUsageResult = {
  month: string
  by_user: OrgUsageRow[]
}

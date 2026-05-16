import type { Organization, User } from '@/types'

export function activeUserOptionLabel(user: Pick<User, 'ID' | 'username' | 'display_name' | 'primary_email'>): string {
  const displayName = user.display_name?.trim()
  const email = user.primary_email?.trim()
  const identity = displayName ? `${displayName} / ${user.username}` : user.username
  return `${identity} #${user.ID}${email ? ` · ${email}` : ''}`
}

export function activeOrgOptionLabel(org: Pick<Organization, 'ID' | 'name' | 'slug'>): string {
  return `${org.name} / ${org.slug} #${org.ID}`
}

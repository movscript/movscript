export const organizationKeys = {
  detail: (orgId: number) => ['org', orgId] as const,
  members: (orgId: number) => ['org', orgId, 'members'] as const,
  invitations: (orgId: number) => ['org', orgId, 'invitations'] as const,
  usage: (orgId: number) => ['org', orgId, 'usage'] as const,
  generationTools: (orgId: number) => ['org', orgId, 'generation-tools'] as const,
}

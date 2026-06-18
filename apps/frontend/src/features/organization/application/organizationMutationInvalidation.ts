import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import { publishAppEvent } from '@/shared/application/appEvents'

export interface OrganizationQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export interface OrganizationQueryCacheWriter extends OrganizationQueryInvalidator {
  setQueryData: <TData>(queryKey: readonly unknown[], updater: TData) => unknown
}

export type OrganizationMutationEvent =
  | {
    type: 'OrganizationChanged'
    orgId: number
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'OrganizationMembersChanged'
    orgId: number
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'OrganizationInvitationsChanged'
    orgId: number
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface OrganizationMutationResult {
  event: OrganizationMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function organizationChangedResult(input: OrganizationMutationInput): OrganizationMutationResult {
  return organizationMutationResult(organizationMutationEvent('OrganizationChanged', input))
}

export function organizationMembersChangedResult(input: OrganizationMutationInput): OrganizationMutationResult {
  return organizationMutationResult(organizationMutationEvent('OrganizationMembersChanged', input))
}

export function organizationInvitationsChangedResult(input: OrganizationMutationInput): OrganizationMutationResult {
  return organizationMutationResult(organizationMutationEvent('OrganizationInvitationsChanged', input))
}

export function invalidateOrganizationMutationResult(
  queryClient: OrganizationQueryInvalidator,
  result: OrganizationMutationResult,
): void {
  publishOrganizationMutationEvent(result.event)
  invalidateOrganizationMutationEvent(queryClient, result.event)
}

export function invalidateOrganizationMutationEvent(
  queryClient: OrganizationQueryInvalidator,
  event: OrganizationMutationEvent,
): void {
  switch (event.type) {
    case 'OrganizationChanged':
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(event.orgId) })
      return
    case 'OrganizationMembersChanged':
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(event.orgId) })
      return
    case 'OrganizationInvitationsChanged':
      void queryClient.invalidateQueries({ queryKey: organizationKeys.invitations(event.orgId) })
      return
  }
}

export function commitOrganizationGenerationToolsMutation<TSettings>(
  queryClient: OrganizationQueryCacheWriter,
  orgId: number,
  settings: TSettings,
): void {
  queryClient.setQueryData(organizationKeys.generationTools(orgId), settings)
}

interface OrganizationMutationInput {
  orgId: number
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}

function organizationMutationEvent(
  type: OrganizationMutationEvent['type'],
  input: OrganizationMutationInput,
): OrganizationMutationEvent {
  return {
    type,
    orgId: input.orgId,
    changedIds: input.changedIds ?? [input.orgId],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  }
}

function organizationMutationResult(event: OrganizationMutationEvent): OrganizationMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

function publishOrganizationMutationEvent(event: OrganizationMutationEvent): void {
  publishAppEvent({
    topic: 'organization.mutation',
    scope: { kind: 'global', id: String(event.orgId) },
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

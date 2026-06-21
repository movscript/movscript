import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const orgSettingsSource = [
  readSource('apps/frontend/src/features/organization/components/OrgSettingsPage.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgSettingsTabs.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgMembersTab.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgInvitationsTab.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgUsageTab.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgSettingsDetailsTab.tsx'),
  readSource('apps/frontend/src/features/organization/components/OrgGenerationToolsTab.tsx'),
].join('\n')
const organizationQueryKeysSource = readSource('apps/frontend/src/features/organization/application/organizationQueryKeys.ts')
const organizationMutationSource = readSource('apps/frontend/src/features/organization/application/organizationMutationInvalidation.ts')

test('organization settings delegates query keys and invalidation', () => {
  assert.match(orgSettingsSource, /from '@\/features\/organization\/application\/organizationQueryKeys'/)
  assert.match(orgSettingsSource, /organizationKeys\.members\(orgId\)/)
  assert.match(orgSettingsSource, /organizationKeys\.detail\(orgId\)/)
  assert.match(orgSettingsSource, /organizationKeys\.invitations\(orgId\)/)
  assert.match(orgSettingsSource, /organizationKeys\.usage\(orgId\)/)
  assert.match(orgSettingsSource, /organizationKeys\.generationTools\(orgId\)/)
  assert.match(orgSettingsSource, /organizationMembersChangedResult\(\{ orgId,/)
  assert.match(orgSettingsSource, /organizationInvitationsChangedResult\(\{ orgId,/)
  assert.match(orgSettingsSource, /organizationChangedResult\(\{ orgId \}\)/)
  assert.match(orgSettingsSource, /commitOrganizationGenerationToolsMutation\(qc, orgId, updated\)/)
  assert.doesNotMatch(orgSettingsSource, /queryKey: \['org'/)
  assert.doesNotMatch(orgSettingsSource, /invalidateQueries\(\{ queryKey: \['org'/)
  assert.doesNotMatch(orgSettingsSource, /qc\.setQueryData/)
  assert.doesNotMatch(orgSettingsSource, /invalidateOrganization(?:Members|Invitations)?\(qc, orgId\)/)

  assert.match(organizationQueryKeysSource, /export const organizationKeys/)
  assert.match(organizationQueryKeysSource, /detail: \(orgId: number\) => \['org', orgId\] as const/)
  assert.match(organizationQueryKeysSource, /members/)
  assert.match(organizationQueryKeysSource, /invitations/)
  assert.match(organizationQueryKeysSource, /usage/)
  assert.match(organizationQueryKeysSource, /generationTools/)
  assert.doesNotMatch(organizationQueryKeysSource, /export function invalidateOrganization/)

  assert.match(organizationMutationSource, /export type OrganizationMutationEvent/)
  assert.match(organizationMutationSource, /export interface OrganizationMutationResult/)
  assert.match(organizationMutationSource, /'OrganizationChanged'/)
  assert.match(organizationMutationSource, /'OrganizationMembersChanged'/)
  assert.match(organizationMutationSource, /'OrganizationInvitationsChanged'/)
  assert.match(organizationMutationSource, /export function invalidateOrganizationMutationResult/)
  assert.match(organizationMutationSource, /export function commitOrganizationGenerationToolsMutation/)
  assert.match(organizationMutationSource, /organizationKeys\.generationTools\(orgId\)/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

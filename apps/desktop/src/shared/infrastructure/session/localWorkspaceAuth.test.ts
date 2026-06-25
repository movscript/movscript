import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { ensureLocalWorkspaceAuthSession } from './localWorkspaceAuth'
import {
  LOCAL_WORKSPACE_ORG,
  LOCAL_WORKSPACE_REALM_KEY,
  LOCAL_WORKSPACE_USER,
  useUserStore,
} from './userStore'

test('local workspace auth does not request a backend session', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/session/localWorkspaceAuth.ts'), 'utf8')

  assert.doesNotMatch(source, /local-session/)
  assert.doesNotMatch(source, /api\.post/)
})

test('local workspace auth establishes local owner identity without a token', async () => {
  useAppSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      launchMode: 'local',
      apiBaseURL: 'http://localhost:8766',
      localAPIBaseURL: 'http://localhost:8766',
      onboardingCompleted: true,
    },
    hydrated: true,
  }))
  useUserStore.setState({
    currentUser: null,
    token: null,
    tokenExpiresAt: null,
    gitCredential: null,
    orgMemberships: [],
    currentOrgID: null,
    activeRealmKey: 'cloud:test',
    sessionsByRealm: {},
    hydrated: true,
  })

  const session = await ensureLocalWorkspaceAuthSession()

  assert.deepEqual(session.user, LOCAL_WORKSPACE_USER)
  assert.equal(session.token, undefined)
  assert.deepEqual(session.org_memberships, [LOCAL_WORKSPACE_ORG])
  assert.deepEqual(useUserStore.getState().currentUser, LOCAL_WORKSPACE_USER)
  assert.equal(useUserStore.getState().token, null)
  assert.equal(useUserStore.getState().activeRealmKey, LOCAL_WORKSPACE_REALM_KEY)
  assert.deepEqual(useUserStore.getState().orgMemberships, [LOCAL_WORKSPACE_ORG])
  assert.equal(useUserStore.getState().currentOrgID, LOCAL_WORKSPACE_ORG.org_id)
})

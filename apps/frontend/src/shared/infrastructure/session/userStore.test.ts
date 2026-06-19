import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { USER_SESSION_STORAGE_KEY, useUserStore } from './userStore'

test('user session persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/session/userStore.ts'), 'utf8')

  assert.equal(USER_SESSION_STORAGE_KEY, 'movscript-user')
  assert.match(source, /createDesktopStateStorage\(USER_SESSION_STORAGE_KEY, fallback\)/)
})

test('user session store normalizes auth payloads and clears sensitive session state', () => {
  useUserStore.setState({
    currentUser: null,
    token: null,
    tokenExpiresAt: null,
    gitCredential: null,
    orgMemberships: [],
    currentOrgID: null,
    activeRealmKey: 'local',
    sessionsByRealm: {},
    hydrated: true,
  })

  useUserStore.getState().setSession({
    user: { id: '7', username: 'zhao', systemRole: 'super_admin' },
    token: 'session-token',
    expires_at: '2026-06-20T00:00:00.000Z',
    git_credential: { provider: 'gitea', username: 'zhao', token: 'git-token' },
    org_memberships: [
      { org_id: 1, org_name: 'A', role: 'owner', is_personal: false },
      { org_id: 2, org_name: 'Personal', role: 'owner', is_personal: true },
    ],
  })

  assert.equal(useUserStore.getState().currentUser?.ID, 7)
  assert.equal(useUserStore.getState().currentUser?.system_role, 'super_admin')
  assert.equal(useUserStore.getState().token, 'session-token')
  assert.equal(useUserStore.getState().currentOrgID, 2)
  assert.equal(useUserStore.getState().sessionsByRealm.local?.currentUser?.ID, 7)

  useUserStore.getState().setActiveRealm('cloud:demo')
  assert.equal(useUserStore.getState().currentUser, null)
  assert.equal(useUserStore.getState().token, null)

  useUserStore.getState().setSession({
    user: { id: '8', username: 'cloud-user', systemRole: 'user' },
    token: 'cloud-token',
  })
  assert.equal(useUserStore.getState().currentUser?.ID, 8)

  useUserStore.getState().setActiveRealm('local')
  assert.equal(useUserStore.getState().currentUser?.ID, 7)
  assert.equal(useUserStore.getState().token, 'session-token')

  useUserStore.getState().setSession(null)
  assert.equal(useUserStore.getState().currentUser, null)
  assert.equal(useUserStore.getState().token, null)
  assert.equal(useUserStore.getState().gitCredential, null)
  assert.deepEqual(useUserStore.getState().orgMemberships, [])
  assert.equal(useUserStore.getState().sessionsByRealm.local, undefined)
  assert.equal(useUserStore.getState().sessionsByRealm['cloud:demo']?.currentUser?.ID, 8)
})

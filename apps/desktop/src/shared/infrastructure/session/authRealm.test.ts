import assert from 'node:assert/strict'
import test from 'node:test'

import { authRealmKey } from './authRealm'

test('auth realm follows typed dataConnection instead of legacy launch mode', () => {
  assert.equal(
    authRealmKey({
      dataConnection: { kind: 'cloud', url: 'https://team.example' },
      launchMode: 'local',
    } as Parameters<typeof authRealmKey>[0] & { launchMode: string }),
    authRealmKey({
      dataConnection: { kind: 'cloud', url: 'https://team.example' },
    }),
  )

  assert.equal(
    authRealmKey({
      dataConnection: { kind: 'local', url: 'http://localhost:8766' },
      launchMode: 'cloud',
    } as Parameters<typeof authRealmKey>[0] & { launchMode: string }),
    'local',
  )
})

test('auth realm ignores legacy apiBaseURL fallback for cloud sessions', () => {
  assert.equal(
    authRealmKey({
      dataConnection: { kind: 'cloud', url: 'https://team.example' },
      apiBaseURL: 'https://legacy.example',
    } as Parameters<typeof authRealmKey>[0] & { apiBaseURL: string }),
    authRealmKey({
      dataConnection: { kind: 'cloud', url: 'https://team.example' },
    }),
  )

  assert.equal(
    authRealmKey({
      cloudAPIBaseURL: 'https://team.example',
      apiBaseURL: 'https://legacy.example',
    } as Parameters<typeof authRealmKey>[0] & { apiBaseURL: string }),
    authRealmKey({
      cloudAPIBaseURL: 'https://team.example',
    }),
  )
})

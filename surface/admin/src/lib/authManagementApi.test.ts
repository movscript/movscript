import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  mapOrgMembers,
  mapOrgPage,
  mapUserPage,
} from './authManagementApi'

test('auth management api derives its base URL from the admin runtime config', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'authManagementApi.ts'), 'utf8')

  assert.match(source, /getAPIBaseURL/)
  assert.doesNotMatch(source, /baseURL:\s*['"]\/api\/admin\/auth['"]/)
})

test('auth management api maps auth-service user pages into admin-web user view models', () => {
  const page = mapUserPage({
    items: [{
      id: 7,
      username: 'alice',
      system_role: 'super_admin',
      status: 'active',
      primary_email: 'alice@example.com',
      display_name: 'Alice',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }],
    total: 1,
    page: 1,
    page_size: 50,
  })

  assert.equal(page.total, 1)
  assert.equal(page.items[0].ID, 7)
  assert.equal(page.items[0].system_role, 'super_admin')
  assert.equal(page.items[0].CreatedAt, '2026-01-01T00:00:00Z')
})

test('auth management api maps auth-service orgs and members into admin-web view models', () => {
  const orgs = mapOrgPage({
    items: [{
      id: 3,
      name: 'Studio',
      slug: 'studio',
      is_personal: false,
      plan: 'team',
      status: 'active',
      created_by: 7,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }],
    total: 1,
    page: 1,
    page_size: 50,
  })
  const members = mapOrgMembers({
    items: [{
      id: 9,
      org_id: 3,
      user_id: 7,
      role: 'owner',
      user: {
        id: 7,
        username: 'alice',
        system_role: 'super_admin',
        status: 'active',
      },
      created_at: '2026-01-03T00:00:00Z',
    }],
  })

  assert.equal(orgs.items[0].ID, 3)
  assert.equal(orgs.items[0].CreatedAt, '2026-01-01T00:00:00Z')
  assert.equal(members[0].ID, 9)
  assert.equal(members[0].user?.ID, 7)
})

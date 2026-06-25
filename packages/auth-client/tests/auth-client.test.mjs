import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AuthServiceClient,
  bearerTokenFromHeaders,
  createLocalOwnerAuthProvider,
  createNoAuthProvider,
  createOpaqueKeyAuthProvider,
  normalizeIssueKeyPayload,
  normalizeIntrospectionPayload,
  normalizeOrgMembershipListPayload,
  normalizeOrgPagePayload,
  normalizeOrganizationMemberListPayload,
  normalizeOrganizationPayload,
  normalizeUserPagePayload,
  normalizeUserProfilePayload,
} from '../dist/index.js'

test('normalizes current auth-service introspection payload into AuthContext shape', () => {
  const result = normalizeIntrospectionPayload({
    active: true,
    token_type: 'opaque',
    principal: {
      id: 'agent_1',
      type: 'agent',
      display_name: 'Agent One',
    },
    claims: {
      role: 'operator',
      scopes: ['project:read'],
    },
    auth_context: {
      token_id: 'token_1',
    },
  })

  assert.equal(result.active, true)
  assert.equal(result.principalKind, 'agent')
  assert.equal(result.subject, 'agent_1')
  assert.equal(result.displayName, 'Agent One')
  assert.deepEqual(result.scopes, ['project:read'])
  assert.equal(result.claims.role, 'operator')
  assert.equal(result.tokenId, 'token_1')
})

test('opaque provider calls auth-service introspection and returns active AuthContext', async () => {
  const calls = []
  const client = new AuthServiceClient({
    baseUrl: 'http://auth.example/',
    fetch: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({
        active: true,
        principal: { id: 'user_1', type: 'user' },
        claims: { roles: ['admin'], scopes: ['resource:read'] },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const provider = createOpaqueKeyAuthProvider({ client })

  const context = await provider.authenticate({
    headers: { authorization: 'Bearer sk-test' },
    action: 'resource.read',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://auth.example/v1/auth/introspect')
  assert.equal(JSON.parse(calls[0].init.body).token, 'sk-test')
  assert.equal(context.authenticated, true)
  assert.equal(context.principal.kind, 'cloud-user')
  assert.equal(context.principal.subject, 'user_1')
  assert.deepEqual(context.roles, ['admin'])
  assert.deepEqual(context.scopes, ['resource:read'])
})

test('auth service client issues and revokes keys through management endpoints', async () => {
  const calls = []
  const client = new AuthServiceClient({
    baseUrl: 'http://auth.example/',
    managementToken: 'sk-admin',
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/v1/auth/keys/issue')) {
        return new Response(JSON.stringify({
          token: 'sk-test_abc',
          token_id: 'token_1',
          token_type: 'opaque',
          principal: { id: 'agent_1', type: 'agent' },
          claims: { scope: 'project:read' },
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ revoked: true, token_id: 'token_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  const issued = await client.issueKey({
    principalId: 'agent_1',
    type: 'agent',
    claims: { scope: 'project:read' },
    prefix: 'sk-test',
  })
  const revoked = await client.revokeKey({ tokenId: issued.tokenId })

  assert.equal(calls[0].url, 'http://auth.example/v1/auth/keys/issue')
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-admin')
  assert.equal(JSON.parse(calls[0].init.body).principal_id, 'agent_1')
  assert.equal(JSON.parse(calls[0].init.body).prefix, 'sk-test')
  assert.equal(calls[1].url, 'http://auth.example/v1/auth/keys/revoke')
  assert.equal(JSON.parse(calls[1].init.body).token_id, 'token_1')
  assert.equal(issued.token, 'sk-test_abc')
  assert.equal(issued.claims.scope, 'project:read')
  assert.equal(revoked.revoked, true)
})

test('auth service client reads user profile and org memberships through management endpoints', async () => {
  const calls = []
  const client = new AuthServiceClient({
    baseUrl: 'http://auth.example/',
    managementToken: 'sk-admin',
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/v1/auth/users/7')) {
        return new Response(JSON.stringify({
          id: 7,
          username: 'alice',
          system_role: 'user',
          status: 'active',
          primary_email: 'alice@example.com',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        items: [{
          org_id: 3,
          org_name: 'Studio',
          org_slug: 'studio',
          is_personal: false,
          plan: 'team',
          status: 'active',
          role: 'owner',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  const profile = await client.getUserProfile(7)
  const memberships = await client.listUserOrgMemberships(7)

  assert.equal(calls[0].url, 'http://auth.example/v1/auth/users/7')
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-admin')
  assert.equal(calls[1].url, 'http://auth.example/v1/auth/users/7/org-memberships')
  assert.equal(profile.primary_email, 'alice@example.com')
  assert.equal(memberships[0].org_id, 3)
})

test('auth service client manages users through management endpoints', async () => {
  const calls = []
  const client = new AuthServiceClient({
    baseUrl: 'http://auth.example/',
    managementToken: 'sk-admin',
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (url.includes('/v1/auth/users?')) {
        return new Response(JSON.stringify({
          items: [{ id: 7, username: 'alice', system_role: 'user', status: 'active' }],
          total: 1,
          page: 1,
          page_size: 20,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.endsWith('/v1/auth/users') && init.method === 'POST') {
        return new Response(JSON.stringify({
          id: 7,
          username: 'alice',
          system_role: 'user',
          status: 'active',
          primary_email: 'alice@example.com',
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      if (url.endsWith('/v1/auth/users/7/password') && init.method === 'PUT') {
        return new Response(JSON.stringify({
          id: 7,
          username: 'alice',
          system_role: 'user',
          status: 'active',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        id: 7,
        username: 'alice',
        system_role: 'user',
        status: 'suspended',
        display_name: 'Alice Updated',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  const page = await client.listUsers({ query: 'ali', page: 1, pageSize: 20 })
  const created = await client.createUser({ username: 'alice', email: 'alice@example.com' })
  const passwordUpdated = await client.setUserPasswordHash(7, { passwordHash: 'hash-secret' })
  const updated = await client.updateUser(7, { status: 'suspended', displayName: 'Alice Updated' })

  assert.equal(calls[0].url, 'http://auth.example/v1/auth/users?query=ali&page=1&page_size=20')
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-admin')
  assert.equal(JSON.parse(calls[1].init.body).display_name, undefined)
  assert.equal(JSON.parse(calls[1].init.body).email, 'alice@example.com')
  assert.equal(JSON.parse(calls[1].init.body).password_hash, undefined)
  assert.equal(calls[2].url, 'http://auth.example/v1/auth/users/7/password')
  assert.equal(calls[2].init.method, 'PUT')
  assert.equal(JSON.parse(calls[2].init.body).password_hash, 'hash-secret')
  assert.equal(calls[3].url, 'http://auth.example/v1/auth/users/7')
  assert.equal(calls[3].init.method, 'PATCH')
  assert.equal(JSON.parse(calls[3].init.body).display_name, 'Alice Updated')
  assert.equal(page.total, 1)
  assert.equal(created.primary_email, 'alice@example.com')
  assert.equal(passwordUpdated.id, 7)
  assert.equal(updated.status, 'suspended')
})

test('auth service client manages orgs and members through management endpoints', async () => {
  const calls = []
  const client = new AuthServiceClient({
    baseUrl: 'http://auth.example/',
    managementToken: 'sk-admin',
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (url.includes('/v1/auth/orgs?')) {
        return new Response(JSON.stringify({
          items: [{ id: 3, name: 'Studio', slug: 'studio', is_personal: false, plan: 'team', status: 'active', created_by: 7 }],
          total: 1,
          page: 1,
          page_size: 20,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.endsWith('/v1/auth/orgs') && init.method === 'POST') {
        return new Response(JSON.stringify({ id: 3, name: 'Studio', slug: 'studio', is_personal: false, plan: 'team', status: 'active', created_by: 7 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/v1/auth/orgs/3') && init.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 3, name: 'Studio Updated', slug: 'studio', is_personal: false, plan: 'team', status: 'active', created_by: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/v1/auth/orgs/3/members') && init.method === 'GET') {
        return new Response(JSON.stringify({ items: [{ id: 11, org_id: 3, user_id: 8, role: 'member' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/v1/auth/orgs/3/members') && init.method === 'POST') {
        return new Response(JSON.stringify({ id: 11, org_id: 3, user_id: 8, role: 'member' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/v1/auth/orgs/3/members/8') && init.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 11, org_id: 3, user_id: 8, role: 'admin' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  const page = await client.listOrgs({ query: 'studio', orgId: 3, isPersonal: false, page: 1, pageSize: 20 })
  const created = await client.createOrg({ name: 'Studio', slug: 'studio', createdBy: 7 })
  const updated = await client.updateOrg(3, { name: 'Studio Updated' })
  const members = await client.listOrgMembers(3)
  const added = await client.addOrgMember(3, { userId: 8, role: 'member' })
  const roleUpdated = await client.updateOrgMember(3, 8, { role: 'admin' })
  const removed = await client.removeOrgMember(3, 8)

  assert.equal(calls[0].url, 'http://auth.example/v1/auth/orgs?query=studio&org_id=3&is_personal=false&page=1&page_size=20')
  assert.equal(JSON.parse(calls[1].init.body).created_by, 7)
  assert.equal(JSON.parse(calls[2].init.body).name, 'Studio Updated')
  assert.equal(JSON.parse(calls[4].init.body).user_id, 8)
  assert.equal(calls[6].init.method, 'DELETE')
  assert.equal(page.total, 1)
  assert.equal(created.slug, 'studio')
  assert.equal(updated.name, 'Studio Updated')
  assert.equal(members[0].user_id, 8)
  assert.equal(added.role, 'member')
  assert.equal(roleUpdated.role, 'admin')
  assert.equal(removed, true)
})

test('normalizes issue key payloads', () => {
  const issued = normalizeIssueKeyPayload({
    token: 'sk-test_abc',
    token_id: 'token_1',
    principal: { id: 'service_1', type: 'service', display_name: 'Service One' },
  })

  assert.equal(issued.tokenId, 'token_1')
  assert.equal(issued.principal.displayName, 'Service One')
  assert.deepEqual(issued.claims, {})
})

test('normalizes user profile and org membership payloads', () => {
  const profile = normalizeUserProfilePayload({
    id: 7,
    username: 'alice',
    system_role: 'user',
    status: 'active',
    primary_email: 'alice@example.com',
  })
  const memberships = normalizeOrgMembershipListPayload({
    items: [{
      org_id: 3,
      org_name: 'Studio',
      org_slug: 'studio',
      is_personal: true,
      plan: 'team',
      status: 'active',
      role: 'owner',
    }],
  })

  assert.equal(profile.id, 7)
  assert.equal(profile.system_role, 'user')
  assert.equal(profile.primary_email, 'alice@example.com')
  assert.equal(memberships[0].is_personal, true)
})

test('normalizes user page payloads', () => {
  const page = normalizeUserPagePayload({
    items: [{ id: 7, username: 'alice', system_role: 'user', status: 'active' }],
    total: 1,
    page: 1,
    page_size: 50,
  })

  assert.equal(page.items[0].id, 7)
  assert.equal(page.total, 1)
  assert.equal(page.page_size, 50)
})

test('normalizes organization payloads', () => {
  const org = normalizeOrganizationPayload({
    id: 3,
    name: 'Studio',
    slug: 'studio',
    is_personal: false,
    plan: 'team',
    status: 'active',
    created_by: 7,
  })
  const page = normalizeOrgPagePayload({
    items: [org],
    total: 1,
    page: 1,
    page_size: 50,
  })
  const members = normalizeOrganizationMemberListPayload({
    items: [{ id: 11, org_id: 3, user_id: 8, role: 'owner' }],
  })

  assert.equal(org.id, 3)
  assert.equal(page.items[0].slug, 'studio')
  assert.equal(members[0].role, 'owner')
})

test('local owner provider authenticates without remote auth service', async () => {
  const provider = createLocalOwnerAuthProvider({
    subject: 'local-owner',
    homeId: 'home_1',
    workspaceId: 'workspace_1',
  })

  const context = await provider.authenticate({})

  assert.equal(context.authenticated, true)
  assert.equal(context.mode, 'local-owner')
  assert.equal(context.principal.kind, 'local-owner')
  assert.equal(context.local.homeId, 'home_1')
  assert.deepEqual(context.scopes, ['local:*'])
})

test('no-auth provider is explicit and never authorizes by default', async () => {
  const provider = createNoAuthProvider()
  const context = await provider.authenticate({})
  const decision = await provider.authorize(context, 'anything')

  assert.equal(context.authenticated, false)
  assert.equal(context.mode, 'no-auth')
  assert.equal(decision.allowed, false)
})

test('bearer token helper accepts plain objects and Headers', () => {
  assert.equal(bearerTokenFromHeaders({ authorization: 'Bearer sk-object' }), 'sk-object')
  assert.equal(bearerTokenFromHeaders(new Headers({ authorization: 'Bearer sk-headers' })), 'sk-headers')
  assert.equal(bearerTokenFromHeaders({ authorization: 'Basic nope' }), undefined)
})

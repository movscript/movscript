export type AuthProviderMode = 'opaque-key' | 'local-owner' | 'no-auth' | 'test'

export type PrincipalKind =
  | 'cloud-user'
  | 'agent'
  | 'service'
  | 'local-owner'
  | 'anonymous'
  | 'test'

export interface AuthPrincipal {
  kind: PrincipalKind
  subject: string
  displayName?: string
}

export interface AuthContext {
  authenticated: boolean
  mode: AuthProviderMode
  principal: AuthPrincipal
  tenantId?: string
  orgId?: string
  local?: {
    homeId?: string
    workspaceId?: string
    deviceSessionId?: string
  }
  roles: string[]
  scopes: string[]
  claims: Record<string, unknown>
  tokenId?: string
}

export interface AuthResource {
  type: string
  id?: string
  attributes?: Record<string, unknown>
}

export interface AuthDecision {
  allowed: boolean
  reason?: string
}

export interface ServiceRequest {
  headers?: Headers | Record<string, string | string[] | undefined>
  token?: string
  action?: string
  resource?: AuthResource
}

export interface ServiceCredential {
  token: string
  tokenType: 'Bearer'
  expiresAt?: string
}

export interface AuthProvider {
  mode: AuthProviderMode
  authenticate(request: ServiceRequest): Promise<AuthContext>
  authorize(context: AuthContext, action: string, resource?: AuthResource): Promise<AuthDecision>
  getServiceCredential?(audience: string): Promise<ServiceCredential>
}

export interface TokenIntrospectionRequest {
  token: string
  audience?: string
  action?: string
  resource?: AuthResource
}

export interface TokenIntrospectionResult {
  active: boolean
  tokenType?: string
  principalKind?: PrincipalKind
  subject?: string
  displayName?: string
  roles?: string[]
  scopes?: string[]
  claims?: Record<string, unknown>
  tenantId?: string
  orgId?: string
  local?: AuthContext['local']
  tokenId?: string
  expiresAt?: string
  cacheTtlSeconds?: number
}

export interface IssueKeyRequest {
  principalId: string
  type?: string
  displayName?: string
  claims?: Record<string, unknown>
  prefix?: string
  tokenId?: string
}

export interface IssueKeyResult {
  token: string
  tokenId: string
  tokenType: string
  principal: {
    id: string
    type: string
    displayName?: string
  }
  claims: Record<string, unknown>
}

export interface RevokeKeyRequest {
  token?: string
  tokenId?: string
}

export interface RevokeKeyResult {
  revoked: boolean
  tokenId?: string
}

export interface AuthUserProfile {
  id: number
  username: string
  system_role: string
  primary_email?: string
  primary_phone?: string
  display_name?: string
  avatar_url?: string
  locale?: string
  status: string
  email_verified_at?: number
  created_at?: string
  updated_at?: string
}

export interface AuthUserListFilter {
  query?: string
  userId?: number
  systemRole?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface AuthUserPage {
  items: AuthUserProfile[]
  total: number
  page: number
  page_size: number
}

export interface CreateAuthUserRequest {
  username: string
  email?: string
  displayName?: string
  systemRole?: string
  status?: string
}

export interface UpdateAuthUserRequest {
  systemRole?: string
  status?: string
  displayName?: string
  email?: string
}

export interface SetAuthUserPasswordHashRequest {
  passwordHash: string
}

export interface AuthOrgMembership {
  org_id: number
  org_name: string
  org_slug: string
  is_personal: boolean
  plan: string
  status: string
  role: string
}

export interface AuthOrganization {
  id: number
  name: string
  slug: string
  is_personal: boolean
  plan: string
  status: string
  created_by: number
  created_at?: string
  updated_at?: string
}

export interface AuthOrganizationMember {
  id: number
  org_id: number
  user_id: number
  role: string
  user?: AuthUserProfile
  created_at?: string
  updated_at?: string
}

export interface AuthOrgListFilter {
  query?: string
  orgId?: number
  userId?: number
  status?: string
  plan?: string
  isPersonal?: boolean
  page?: number
  pageSize?: number
}

export interface AuthOrgPage {
  items: AuthOrganization[]
  total: number
  page: number
  page_size: number
}

export interface CreateAuthOrgRequest {
  name: string
  slug: string
  createdBy: number
  plan?: string
  status?: string
}

export interface UpdateAuthOrgRequest {
  name?: string
  slug?: string
  plan?: string
  status?: string
}

export interface AuthOrgMemberRequest {
  userId?: number
  role?: string
}

export interface AuthServiceManagementOptions {
  managementToken?: string
  signal?: AbortSignal
}

export interface AuthServiceClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  managementToken?: string
}

export class AuthServiceClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly managementToken?: string

  constructor(options: AuthServiceClientOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, '')
    if (!baseUrl) throw new Error('auth service baseUrl is required')
    this.baseUrl = baseUrl
    this.fetchImpl = options.fetch ?? fetch
    this.managementToken = options.managementToken?.trim() || undefined
  }

  async introspect(request: TokenIntrospectionRequest, signal?: AbortSignal): Promise<TokenIntrospectionResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/introspect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: request.token,
        audience: request.audience,
        action: request.action,
        resource: request.resource,
      }),
      signal,
    })
    if (!response.ok) {
      throw new Error(`auth introspection failed: ${response.status}`)
    }
    return normalizeIntrospectionPayload(await response.json())
  }

  async issueKey(request: IssueKeyRequest, options: AuthServiceManagementOptions = {}): Promise<IssueKeyResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/keys/issue`, {
      method: 'POST',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        principal_id: request.principalId,
        type: request.type,
        display_name: request.displayName,
        claims: request.claims,
        prefix: request.prefix,
        token_id: request.tokenId,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth key issue failed: ${response.status}`)
    }
    return normalizeIssueKeyPayload(await response.json())
  }

  async revokeKey(request: RevokeKeyRequest, options: AuthServiceManagementOptions = {}): Promise<RevokeKeyResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/keys/revoke`, {
      method: 'POST',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        token: request.token,
        token_id: request.tokenId,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth key revoke failed: ${response.status}`)
    }
    return normalizeRevokeKeyPayload(await response.json())
  }

  async listUsers(filter: AuthUserListFilter = {}, options: AuthServiceManagementOptions = {}): Promise<AuthUserPage> {
    const query = new URLSearchParams()
    if (filter.query) query.set('query', filter.query)
    if (filter.userId !== undefined) query.set('user_id', String(filter.userId))
    if (filter.systemRole) query.set('system_role', filter.systemRole)
    if (filter.status) query.set('status', filter.status)
    if (filter.page !== undefined) query.set('page', String(filter.page))
    if (filter.pageSize !== undefined) query.set('page_size', String(filter.pageSize))
    const queryString = query.toString()
    const suffix = queryString ? `?${queryString}` : ''
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users${suffix}`, {
      method: 'GET',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth users list failed: ${response.status}`)
    }
    return normalizeUserPagePayload(await response.json())
  }

  async createUser(request: CreateAuthUserRequest, options: AuthServiceManagementOptions = {}): Promise<AuthUserProfile> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users`, {
      method: 'POST',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        username: request.username,
        email: request.email,
        display_name: request.displayName,
        system_role: request.systemRole,
        status: request.status,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth user create failed: ${response.status}`)
    }
    return normalizeUserProfilePayload(await response.json())
  }

  async updateUser(userId: number, request: UpdateAuthUserRequest, options: AuthServiceManagementOptions = {}): Promise<AuthUserProfile> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users/${encodeURIComponent(String(userId))}`, {
      method: 'PATCH',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        system_role: request.systemRole,
        status: request.status,
        display_name: request.displayName,
        email: request.email,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth user update failed: ${response.status}`)
    }
    return normalizeUserProfilePayload(await response.json())
  }

  async setUserPasswordHash(userId: number, request: SetAuthUserPasswordHashRequest, options: AuthServiceManagementOptions = {}): Promise<AuthUserProfile> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users/${encodeURIComponent(String(userId))}/password`, {
      method: 'PUT',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        password_hash: request.passwordHash,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth user password hash update failed: ${response.status}`)
    }
    return normalizeUserProfilePayload(await response.json())
  }

  async listOrgs(filter: AuthOrgListFilter = {}, options: AuthServiceManagementOptions = {}): Promise<AuthOrgPage> {
    const query = new URLSearchParams()
    if (filter.query) query.set('query', filter.query)
    if (filter.orgId !== undefined) query.set('org_id', String(filter.orgId))
    if (filter.userId !== undefined) query.set('user_id', String(filter.userId))
    if (filter.status) query.set('status', filter.status)
    if (filter.plan) query.set('plan', filter.plan)
    if (filter.isPersonal !== undefined) query.set('is_personal', String(filter.isPersonal))
    if (filter.page !== undefined) query.set('page', String(filter.page))
    if (filter.pageSize !== undefined) query.set('page_size', String(filter.pageSize))
    const queryString = query.toString()
    const suffix = queryString ? `?${queryString}` : ''
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs${suffix}`, {
      method: 'GET',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth orgs list failed: ${response.status}`)
    }
    return normalizeOrgPagePayload(await response.json())
  }

  async createOrg(request: CreateAuthOrgRequest, options: AuthServiceManagementOptions = {}): Promise<AuthOrganization> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs`, {
      method: 'POST',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        name: request.name,
        slug: request.slug,
        created_by: request.createdBy,
        plan: request.plan,
        status: request.status,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org create failed: ${response.status}`)
    }
    return normalizeOrganizationPayload(await response.json())
  }

  async updateOrg(orgId: number, request: UpdateAuthOrgRequest, options: AuthServiceManagementOptions = {}): Promise<AuthOrganization> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs/${encodeURIComponent(String(orgId))}`, {
      method: 'PATCH',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        name: request.name,
        slug: request.slug,
        plan: request.plan,
        status: request.status,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org update failed: ${response.status}`)
    }
    return normalizeOrganizationPayload(await response.json())
  }

  async listOrgMembers(orgId: number, options: AuthServiceManagementOptions = {}): Promise<AuthOrganizationMember[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs/${encodeURIComponent(String(orgId))}/members`, {
      method: 'GET',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org members list failed: ${response.status}`)
    }
    return normalizeOrganizationMemberListPayload(await response.json())
  }

  async addOrgMember(orgId: number, request: AuthOrgMemberRequest, options: AuthServiceManagementOptions = {}): Promise<AuthOrganizationMember> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs/${encodeURIComponent(String(orgId))}/members`, {
      method: 'POST',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        user_id: request.userId,
        role: request.role,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org member add failed: ${response.status}`)
    }
    return normalizeOrganizationMemberPayload(await response.json())
  }

  async updateOrgMember(orgId: number, userId: number, request: AuthOrgMemberRequest, options: AuthServiceManagementOptions = {}): Promise<AuthOrganizationMember> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs/${encodeURIComponent(String(orgId))}/members/${encodeURIComponent(String(userId))}`, {
      method: 'PATCH',
      headers: this.managementHeaders(options.managementToken),
      body: JSON.stringify({
        role: request.role,
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org member update failed: ${response.status}`)
    }
    return normalizeOrganizationMemberPayload(await response.json())
  }

  async removeOrgMember(orgId: number, userId: number, options: AuthServiceManagementOptions = {}): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/orgs/${encodeURIComponent(String(orgId))}/members/${encodeURIComponent(String(userId))}`, {
      method: 'DELETE',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth org member remove failed: ${response.status}`)
    }
    const raw = asRecord(await response.json())
    return raw?.removed === true
  }

  async getUserProfile(userId: number, options: AuthServiceManagementOptions = {}): Promise<AuthUserProfile> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users/${encodeURIComponent(String(userId))}`, {
      method: 'GET',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth user profile failed: ${response.status}`)
    }
    return normalizeUserProfilePayload(await response.json())
  }

  async listUserOrgMemberships(userId: number, options: AuthServiceManagementOptions = {}): Promise<AuthOrgMembership[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/users/${encodeURIComponent(String(userId))}/org-memberships`, {
      method: 'GET',
      headers: this.managementHeaders(options.managementToken),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`auth user org memberships failed: ${response.status}`)
    }
    return normalizeOrgMembershipListPayload(await response.json())
  }

  private managementHeaders(managementToken?: string): Record<string, string> {
    const token = managementToken?.trim() || this.managementToken
    return {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }
  }
}

export function createOpaqueKeyAuthProvider(options: {
  client: AuthServiceClient
  token?: string
}): AuthProvider {
  return {
    mode: 'opaque-key',
    async authenticate(request) {
      const token = request.token ?? bearerTokenFromHeaders(request.headers) ?? options.token
      if (!token) return inactiveContext('opaque-key', 'missing-token')
      const result = await options.client.introspect({
        token,
        action: request.action,
        resource: request.resource,
      })
      return authContextFromIntrospection(result, 'opaque-key')
    },
    async authorize(context) {
      return { allowed: context.authenticated, reason: context.authenticated ? undefined : 'not-authenticated' }
    },
  }
}

export function createLocalOwnerAuthProvider(input: {
  subject: string
  homeId?: string
  workspaceId?: string
  deviceSessionId?: string
  roles?: string[]
  scopes?: string[]
  claims?: Record<string, unknown>
}): AuthProvider {
  return {
    mode: 'local-owner',
    async authenticate() {
      return {
        authenticated: true,
        mode: 'local-owner',
        principal: {
          kind: 'local-owner',
          subject: input.subject,
        },
        local: {
          homeId: input.homeId,
          workspaceId: input.workspaceId,
          deviceSessionId: input.deviceSessionId,
        },
        roles: input.roles ?? ['owner'],
        scopes: input.scopes ?? ['local:*'],
        claims: input.claims ?? {},
      }
    },
    async authorize() {
      return { allowed: true }
    },
  }
}

export function createNoAuthProvider(subject = 'anonymous'): AuthProvider {
  return {
    mode: 'no-auth',
    async authenticate() {
      return {
        authenticated: false,
        mode: 'no-auth',
        principal: {
          kind: 'anonymous',
          subject,
        },
        roles: [],
        scopes: [],
        claims: {},
      }
    },
    async authorize() {
      return { allowed: false, reason: 'no-auth' }
    },
  }
}

export function bearerTokenFromHeaders(headers: ServiceRequest['headers']): string | undefined {
  if (!headers) return undefined
  const value = headers instanceof Headers
    ? headers.get('authorization')
    : headerValue(headers.authorization ?? headers.Authorization)
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return undefined
  const token = trimmed.slice('bearer '.length).trim()
  return token || undefined
}

export function authContextFromIntrospection(result: TokenIntrospectionResult, mode: AuthProviderMode): AuthContext {
  if (!result.active || !result.principalKind || !result.subject) {
    return inactiveContext(mode, 'inactive')
  }
  return {
    authenticated: true,
    mode,
    principal: {
      kind: result.principalKind,
      subject: result.subject,
      ...(result.displayName ? { displayName: result.displayName } : {}),
    },
    ...(result.tenantId ? { tenantId: result.tenantId } : {}),
    ...(result.orgId ? { orgId: result.orgId } : {}),
    ...(result.local ? { local: result.local } : {}),
    roles: result.roles ?? [],
    scopes: result.scopes ?? [],
    claims: result.claims ?? {},
    ...(result.tokenId ? { tokenId: result.tokenId } : {}),
  }
}

export function normalizeIntrospectionPayload(value: unknown): TokenIntrospectionResult {
  const raw = asRecord(value)
  if (!raw) return { active: false }
  const authContext = asRecord(raw.auth_context ?? raw.authContext)
  const principal = asRecord(raw.principal ?? authContext?.principal)
  const claims = recordValue(raw.claims ?? authContext?.claims)
  return {
    active: raw.active === true,
    tokenType: stringValue(raw.token_type ?? raw.tokenType),
    principalKind: principalKindValue(raw.principal_kind ?? raw.principalKind ?? principal?.kind ?? principal?.type),
    subject: stringValue(raw.subject ?? principal?.subject ?? principal?.id),
    displayName: stringValue(raw.display_name ?? raw.displayName ?? principal?.display_name ?? principal?.displayName),
    roles: stringArrayValue(raw.roles ?? claims?.roles),
    scopes: stringArrayValue(raw.scopes ?? claims?.scopes),
    claims: claims ?? {},
    tenantId: stringValue(raw.tenant_id ?? raw.tenantId),
    orgId: stringValue(raw.org_id ?? raw.orgId),
    local: localValue(raw.local ?? authContext?.local),
    tokenId: stringValue(raw.token_id ?? raw.tokenId ?? authContext?.token_id ?? authContext?.tokenId),
    cacheTtlSeconds: numberValue(raw.cache_ttl_seconds ?? raw.cacheTtlSeconds),
    expiresAt: stringValue(raw.expires_at ?? raw.expiresAt),
  }
}

export function normalizeIssueKeyPayload(value: unknown): IssueKeyResult {
  const raw = asRecord(value)
  const principal = asRecord(raw?.principal)
  const token = stringValue(raw?.token)
  const tokenId = stringValue(raw?.token_id ?? raw?.tokenId)
  if (!raw || !token || !tokenId || !principal) {
    throw new Error('invalid issue key response')
  }
  return {
    token,
    tokenId,
    tokenType: stringValue(raw.token_type ?? raw.tokenType) ?? 'opaque',
    principal: {
      id: stringValue(principal.id) ?? '',
      type: stringValue(principal.type) ?? '',
      ...(stringValue(principal.display_name ?? principal.displayName) ? { displayName: stringValue(principal.display_name ?? principal.displayName) } : {}),
    },
    claims: recordValue(raw.claims) ?? {},
  }
}

export function normalizeRevokeKeyPayload(value: unknown): RevokeKeyResult {
  const raw = asRecord(value)
  return {
    revoked: raw?.revoked === true,
    ...(stringValue(raw?.token_id ?? raw?.tokenId) ? { tokenId: stringValue(raw?.token_id ?? raw?.tokenId) } : {}),
  }
}

export function normalizeUserProfilePayload(value: unknown): AuthUserProfile {
  const raw = asRecord(value)
  const id = numberValue(raw?.id)
  const username = stringValue(raw?.username)
  const systemRole = stringValue(raw?.system_role)
  const status = stringValue(raw?.status)
  if (!raw || id === undefined || !username || !systemRole || !status) {
    throw new Error('invalid auth user profile response')
  }
  return {
    id,
    username,
    system_role: systemRole,
    status,
    ...(stringValue(raw.primary_email) ? { primary_email: stringValue(raw.primary_email) } : {}),
    ...(stringValue(raw.primary_phone) ? { primary_phone: stringValue(raw.primary_phone) } : {}),
    ...(stringValue(raw.display_name) ? { display_name: stringValue(raw.display_name) } : {}),
    ...(stringValue(raw.avatar_url) ? { avatar_url: stringValue(raw.avatar_url) } : {}),
    ...(stringValue(raw.locale) ? { locale: stringValue(raw.locale) } : {}),
    ...(numberValue(raw.email_verified_at) !== undefined ? { email_verified_at: numberValue(raw.email_verified_at) } : {}),
    ...(stringValue(raw.created_at) ? { created_at: stringValue(raw.created_at) } : {}),
    ...(stringValue(raw.updated_at) ? { updated_at: stringValue(raw.updated_at) } : {}),
  }
}

export function normalizeUserPagePayload(value: unknown): AuthUserPage {
  const raw = asRecord(value)
  const items = raw?.items
  const total = numberValue(raw?.total)
  const page = numberValue(raw?.page)
  const pageSize = numberValue(raw?.page_size)
  if (!raw || !Array.isArray(items) || total === undefined || page === undefined || pageSize === undefined) {
    throw new Error('invalid auth users page response')
  }
  return {
    items: items.map(normalizeUserProfilePayload),
    total,
    page,
    page_size: pageSize,
  }
}

export function normalizeOrgMembershipListPayload(value: unknown): AuthOrgMembership[] {
  const raw = asRecord(value)
  const items = Array.isArray(value) ? value : raw?.items
  if (!Array.isArray(items)) {
    throw new Error('invalid auth org memberships response')
  }
  return items.map(normalizeOrgMembershipPayload)
}

export function normalizeOrgMembershipPayload(value: unknown): AuthOrgMembership {
  const raw = asRecord(value)
  const orgId = numberValue(raw?.org_id)
  const orgName = stringValue(raw?.org_name)
  const orgSlug = stringValue(raw?.org_slug)
  const plan = stringValue(raw?.plan)
  const status = stringValue(raw?.status)
  const role = stringValue(raw?.role)
  if (!raw || orgId === undefined || !orgName || !orgSlug || !plan || !status || !role) {
    throw new Error('invalid auth org membership response')
  }
  return {
    org_id: orgId,
    org_name: orgName,
    org_slug: orgSlug,
    is_personal: raw.is_personal === true,
    plan,
    status,
    role,
  }
}

export function normalizeOrganizationPayload(value: unknown): AuthOrganization {
  const raw = asRecord(value)
  const id = numberValue(raw?.id)
  const name = stringValue(raw?.name)
  const slug = stringValue(raw?.slug)
  const plan = stringValue(raw?.plan)
  const status = stringValue(raw?.status)
  const createdBy = numberValue(raw?.created_by)
  if (!raw || id === undefined || !name || !slug || !plan || !status || createdBy === undefined) {
    throw new Error('invalid auth organization response')
  }
  return {
    id,
    name,
    slug,
    is_personal: raw.is_personal === true,
    plan,
    status,
    created_by: createdBy,
    ...(stringValue(raw.created_at) ? { created_at: stringValue(raw.created_at) } : {}),
    ...(stringValue(raw.updated_at) ? { updated_at: stringValue(raw.updated_at) } : {}),
  }
}

export function normalizeOrgPagePayload(value: unknown): AuthOrgPage {
  const raw = asRecord(value)
  const items = raw?.items
  const total = numberValue(raw?.total)
  const page = numberValue(raw?.page)
  const pageSize = numberValue(raw?.page_size)
  if (!raw || !Array.isArray(items) || total === undefined || page === undefined || pageSize === undefined) {
    throw new Error('invalid auth orgs page response')
  }
  return {
    items: items.map(normalizeOrganizationPayload),
    total,
    page,
    page_size: pageSize,
  }
}

export function normalizeOrganizationMemberListPayload(value: unknown): AuthOrganizationMember[] {
  const raw = asRecord(value)
  const items = Array.isArray(value) ? value : raw?.items
  if (!Array.isArray(items)) {
    throw new Error('invalid auth org members response')
  }
  return items.map(normalizeOrganizationMemberPayload)
}

export function normalizeOrganizationMemberPayload(value: unknown): AuthOrganizationMember {
  const raw = asRecord(value)
  const id = numberValue(raw?.id)
  const orgId = numberValue(raw?.org_id)
  const userId = numberValue(raw?.user_id)
  const role = stringValue(raw?.role)
  if (!raw || id === undefined || orgId === undefined || userId === undefined || !role) {
    throw new Error('invalid auth org member response')
  }
  const rawUser = asRecord(raw.user)
  return {
    id,
    org_id: orgId,
    user_id: userId,
    role,
    ...(rawUser ? { user: normalizeUserProfilePayload(rawUser) } : {}),
    ...(stringValue(raw.created_at) ? { created_at: stringValue(raw.created_at) } : {}),
    ...(stringValue(raw.updated_at) ? { updated_at: stringValue(raw.updated_at) } : {}),
  }
}

function inactiveContext(mode: AuthProviderMode, reason: string): AuthContext {
  return {
    authenticated: false,
    mode,
    principal: {
      kind: mode === 'test' ? 'test' : 'anonymous',
      subject: reason,
    },
    roles: [],
    scopes: [],
    claims: {},
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
  return items.length > 0 ? items : undefined
}

function principalKindValue(value: unknown): PrincipalKind | undefined {
  const kind = stringValue(value)
  if (!kind) return undefined
  if (kind === 'user') return 'cloud-user'
  if ([
    'cloud-user',
    'agent',
    'service',
    'local-owner',
    'anonymous',
    'test',
  ].includes(kind)) {
    return kind as PrincipalKind
  }
  return undefined
}

function localValue(value: unknown): AuthContext['local'] | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  return {
    homeId: stringValue(raw.homeId ?? raw.home_id),
    workspaceId: stringValue(raw.workspaceId ?? raw.workspace_id),
    deviceSessionId: stringValue(raw.deviceSessionId ?? raw.device_session_id),
  }
}

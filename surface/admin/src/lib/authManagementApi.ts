import axios from 'axios'
import { useUserStore } from '@admin/store/userStore'
import { toast } from '@admin/store/toastStore'
import { getAPIBaseURL } from '@admin/lib/config'
import { translateApiError, type APIErrorBody } from '@admin/lib/apiError'
import type { Organization, OrganizationMember, PaginatedResponse, User } from '@admin/types'

export const authManagementApi = axios.create({
  baseURL: authManagementBaseURL(),
})

authManagementApi.interceptors.request.use((config) => {
  const { token } = useUserStore.getState()
  config.baseURL = authManagementBaseURL()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function authManagementBaseURL(): string {
  return `${getAPIBaseURL()}/api/admin/auth`
}

authManagementApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const body: APIErrorBody = error.response?.data ?? {}
    const message = translateApiError(body)

    let detail: string | undefined
    if (toast.isDebug()) {
      const status = error.response?.status ?? 'network error'
      const url = error.config?.url ?? ''
      const method = (error.config?.method ?? 'GET').toUpperCase()
      const rawBody = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {}, null, 2)
      detail = `${method} ${url}\nHTTP ${status}\n\n${rawBody}`
    }

    toast.error(message, detail)
    return Promise.reject(error)
  },
)

export interface AuthUserListParams {
  page?: number
  page_size?: number
  q?: string
  user_id?: string
  system_role?: string
  status?: string
}

export interface AuthOrgListParams {
  page?: number
  page_size?: number
  q?: string
  org_id?: string
  plan?: string
  status?: string
  is_personal?: string | boolean
}

export async function listAuthUsers(params: AuthUserListParams): Promise<PaginatedResponse<User>> {
  const response = await authManagementApi.get('/users', {
    params: {
      page: params.page,
      page_size: params.page_size,
      query: params.q,
      user_id: params.user_id,
      system_role: params.system_role,
      status: params.status,
    },
  })
  return mapUserPage(response.data)
}

export async function createAuthUser(input: {
  username: string
  email?: string
  display_name?: string
  system_role?: string
  status?: string
}): Promise<User> {
  const response = await authManagementApi.post('/users', input)
  return mapUser(response.data)
}

export async function updateAuthUser(userID: number, patch: Record<string, unknown>): Promise<User> {
  const response = await authManagementApi.patch(`/users/${encodeURIComponent(String(userID))}`, patch)
  return mapUser(response.data)
}

export async function listAuthOrgs(params: AuthOrgListParams): Promise<PaginatedResponse<Organization>> {
  const response = await authManagementApi.get('/orgs', {
    params: {
      page: params.page,
      page_size: params.page_size,
      query: params.q,
      org_id: params.org_id,
      plan: params.plan,
      status: params.status,
      is_personal: params.is_personal === undefined ? undefined : String(params.is_personal),
    },
  })
  return mapOrgPage(response.data)
}

export async function createAuthOrg(input: {
  name: string
  slug?: string
  owner_user_id: number
}): Promise<Organization> {
  const response = await authManagementApi.post('/orgs', {
    name: input.name,
    slug: input.slug,
    created_by: input.owner_user_id,
  })
  return mapOrganization(response.data)
}

export async function updateAuthOrg(orgID: number, patch: Partial<Pick<Organization, 'name' | 'plan' | 'status'>>): Promise<Organization> {
  const response = await authManagementApi.patch(`/orgs/${encodeURIComponent(String(orgID))}`, patch)
  return mapOrganization(response.data)
}

export async function listAuthOrgMembers(orgID: number): Promise<OrganizationMember[]> {
  const response = await authManagementApi.get(`/orgs/${encodeURIComponent(String(orgID))}/members`)
  return mapOrgMembers(response.data)
}

export async function addAuthOrgMember(orgID: number, input: { user_id: number; role: string }): Promise<OrganizationMember> {
  const response = await authManagementApi.post(`/orgs/${encodeURIComponent(String(orgID))}/members`, input)
  return mapOrgMember(response.data)
}

export async function updateAuthOrgMember(orgID: number, userID: number, input: { role: string }): Promise<OrganizationMember> {
  const response = await authManagementApi.patch(`/orgs/${encodeURIComponent(String(orgID))}/members/${encodeURIComponent(String(userID))}`, input)
  return mapOrgMember(response.data)
}

export async function removeAuthOrgMember(orgID: number, userID: number): Promise<void> {
  await authManagementApi.delete(`/orgs/${encodeURIComponent(String(orgID))}/members/${encodeURIComponent(String(userID))}`)
}

export function mapUserPage(raw: unknown): PaginatedResponse<User> {
  const record = asRecord(raw)
  const items = Array.isArray(record?.items) ? record.items.map(mapUser) : []
  return {
    items,
    total: numberValue(record?.total) ?? items.length,
    page: numberValue(record?.page) ?? 1,
    page_size: numberValue(record?.page_size) ?? items.length,
  }
}

export function mapUser(raw: unknown): User {
  const record = asRecord(raw)
  return {
    ID: requiredNumber(record?.id, 'auth user id'),
    username: requiredString(record?.username, 'auth username'),
    system_role: requiredString(record?.system_role, 'auth system_role') as User['system_role'],
    primary_email: stringValue(record?.primary_email),
    primary_phone: stringValue(record?.primary_phone),
    display_name: stringValue(record?.display_name),
    avatar_url: stringValue(record?.avatar_url),
    locale: stringValue(record?.locale),
    status: stringValue(record?.status) as User['status'],
    email_verified_at: numberValue(record?.email_verified_at),
    CreatedAt: stringValue(record?.created_at),
    UpdatedAt: stringValue(record?.updated_at),
  }
}

export function mapOrgPage(raw: unknown): PaginatedResponse<Organization> {
  const record = asRecord(raw)
  const items = Array.isArray(record?.items) ? record.items.map(mapOrganization) : []
  return {
    items,
    total: numberValue(record?.total) ?? items.length,
    page: numberValue(record?.page) ?? 1,
    page_size: numberValue(record?.page_size) ?? items.length,
  }
}

export function mapOrganization(raw: unknown): Organization {
  const record = asRecord(raw)
  return {
    ID: requiredNumber(record?.id, 'auth org id'),
    name: requiredString(record?.name, 'auth org name'),
    slug: requiredString(record?.slug, 'auth org slug'),
    is_personal: record?.is_personal === true,
    plan: stringValue(record?.plan) as Organization['plan'],
    status: stringValue(record?.status) as Organization['status'],
    created_by: requiredNumber(record?.created_by, 'auth org created_by'),
    CreatedAt: stringValue(record?.created_at) ?? '',
    UpdatedAt: stringValue(record?.updated_at) ?? '',
  }
}

export function mapOrgMembers(raw: unknown): OrganizationMember[] {
  const record = asRecord(raw)
  const items = Array.isArray(raw) ? raw : record?.items
  return Array.isArray(items) ? items.map(mapOrgMember) : []
}

export function mapOrgMember(raw: unknown): OrganizationMember {
  const record = asRecord(raw)
  return {
    ID: requiredNumber(record?.id, 'auth org member id'),
    org_id: requiredNumber(record?.org_id, 'auth org member org_id'),
    user_id: requiredNumber(record?.user_id, 'auth org member user_id'),
    role: requiredString(record?.role, 'auth org member role') as OrganizationMember['role'],
    user: record?.user ? mapUser(record.user) : undefined,
    CreatedAt: stringValue(record?.created_at) ?? '',
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function requiredNumber(value: unknown, field: string): number {
  const number = numberValue(value)
  if (number === undefined) throw new Error(`invalid ${field}`)
  return number
}

function requiredString(value: unknown, field: string): string {
  const string = stringValue(value)
  if (!string) throw new Error(`invalid ${field}`)
  return string
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

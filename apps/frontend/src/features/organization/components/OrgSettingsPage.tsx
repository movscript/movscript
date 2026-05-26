import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Coins, Copy, Plus, Trash2, UserMinus } from 'lucide-react'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import {
  Button,
  OrganizationConnectionStatus,
  OrganizationDataTable,
  OrganizationDataTableBody,
  OrganizationDataTableCell,
  OrganizationDataTableEmptyRow,
  OrganizationDataTableHeader,
  OrganizationDataTableHeadCell,
  OrganizationDataTableRow,
  OrganizationEmptyState,
  OrganizationGenerationToolsHeaderCard,
  OrganizationGenerationToolServerSurface,
  OrganizationInlineError,
  OrganizationJoinCodeCard,
  OrganizationListRow,
  OrganizationListSurface,
  OrganizationStack,
  OrganizationStatusMessage,
  OrganizationTableSurface,
  OrganizationTabButton,
  OrganizationTabs,
  OrganizationToolbar,
  OrganizationUsageCostCard,
  OrganizationUsageMetricCard,
  OrganizationUsageMetricGrid,
  StatusBadge,
} from '@movscript/ui'
import { CheckboxField, Input, NativeSelect } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@movscript/ui'
import { Badge } from '@movscript/ui'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationDefaultServerRecipe, organizationSaveRecipe, organizationServerEnabledRecipe } from '@/features/organization/presentation/organizationSemanticUi'
import type { Organization, OrganizationMember, OrgInvitation } from '@/types'

type Tab = 'members' | 'usage' | 'invitations' | 'generation-tools' | 'settings'

type OrgUsageRow = {
  user_id: number
  username: string
  cost: number
  tokens: number
}

type OrgUsageResult = {
  month: string
  by_user: OrgUsageRow[]
}

function MembersTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useUserStore((s) => s.currentUser)
  const [showAdd, setShowAdd] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addError, setAddError] = useState('')

  const { data: members = [], isLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['org', orgId, 'members'],
    queryFn: () => api.get(`/orgs/${orgId}/members`).then((r) => r.data),
  })

  const addMember = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/members`, { username: addUsername, role: addRole }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] })
      setShowAdd(false)
      setAddUsername('')
      setAddRole('member')
      setAddError('')
    },
    onError: (e: any) => setAddError(translateApiError(e.response?.data, t('org.addMemberFailed'))),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.patch(`/orgs/${orgId}/members/${userId}`, { role }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => api.delete(`/orgs/${orgId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  })

  const roles = ['owner', 'admin', 'member', 'viewer']

  if (isLoading) return <p className="type-body text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <OrganizationStack>
      <OrganizationToolbar>
        <p className="type-body text-muted-foreground">{t('org.membersCount', { count: members.length })}</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('org.addMember')}
        </Button>
      </OrganizationToolbar>

      <OrganizationListSurface>
        {members.map((m) => (
          <OrganizationListRow key={m.ID}>
            <div className="flex-1 min-w-0">
              <p className="type-body font-medium text-foreground truncate">{m.user?.username ?? `#${m.user_id}`}</p>
            </div>
            <Select
              value={m.role}
              onValueChange={(role) => updateRole.mutate({ userId: m.user_id, role })}
              disabled={m.user_id === currentUser?.ID}
            >
              <SelectTrigger className="w-28 h-7 type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="type-label">
                    {t(`org.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              tone="danger"
              className="text-muted-foreground"
              disabled={m.user_id === currentUser?.ID}
              onClick={() => removeMember.mutate(m.user_id)}
              title={t('org.removeMember')}
            >
              <UserMinus size={14} />
            </Button>
          </OrganizationListRow>
        ))}
      </OrganizationListSurface>

      {showAdd && (
        <Dialog open onOpenChange={(o) => !o && setShowAdd(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('org.addMember')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="add-username">{t('auth.username')}</Label>
                <Input
                  id="add-username"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder={t('org.usernamePlaceholder')}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>{t('org.role')}</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{t(`org.roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addError && <OrganizationInlineError>{addError}</OrganizationInlineError>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => addMember.mutate()} disabled={!addUsername.trim() || addMember.isPending}>
                {addMember.isPending ? t('common.creating') : t('org.addMember')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </OrganizationStack>
  )
}

function InvitationsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteNote, setInviteNote] = useState('')
  const [createError, setCreateError] = useState('')
  const [copied, setCopied] = useState('')

  const { data: org } = useQuery<Organization>({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
  })

  const { data: invitations = [], isLoading } = useQuery<OrgInvitation[]>({
    queryKey: ['org', orgId, 'invitations'],
    queryFn: () => api.get(`/orgs/${orgId}/invitations`).then((r) => r.data),
  })

  const createInvitation = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/invitations`, { role: inviteRole, note: inviteNote }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'invitations'] })
      setShowCreate(false)
      setInviteRole('member')
      setInviteNote('')
      setCreateError('')
    },
    onError: (e: any) => setCreateError(translateApiError(e.response?.data, t('org.createInviteFailed'))),
  })

  const revokeInvitation = useMutation({
    mutationFn: (invId: number) => api.delete(`/orgs/${orgId}/invitations/${invId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'invitations'] }),
  })

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(`link:${token}`)
      window.setTimeout(() => setCopied(''), 1600)
    }).catch(() => {})
  }

  function copyCode() {
    if (!org?.join_code) return
    navigator.clipboard.writeText(org.join_code).then(() => {
      setCopied('code')
      window.setTimeout(() => setCopied(''), 1600)
    }).catch(() => {})
  }

  const roles = ['admin', 'member', 'viewer']

  if (isLoading) return <p className="type-body text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <OrganizationStack>
      <OrganizationJoinCodeCard>
        <div className="flex-1 min-w-0">
          <p className="type-body font-medium text-foreground">{t('org.code')}</p>
          <p className="mt-1 font-mono type-body text-foreground">{org?.join_code ?? t('common.loadingShort')}</p>
          <p className="mt-1 type-label text-muted-foreground">{t('org.codeManagementHint')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={copyCode} disabled={!org?.join_code}>
          {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
          {t('org.copyOrgCode')}
        </Button>
      </OrganizationJoinCodeCard>

      <OrganizationToolbar>
        <p className="type-body text-muted-foreground">{t('org.invitationsCount', { count: invitations.length })}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('org.createInvite')}
        </Button>
      </OrganizationToolbar>

      {invitations.length === 0 ? (
        <p className="type-body text-muted-foreground py-4 text-center">{t('org.noInvitations')}</p>
      ) : (
        <OrganizationListSurface>
          {invitations.map((inv) => (
            <OrganizationListRow key={inv.ID}>
              <div className="flex-1 min-w-0">
                <p className="type-label font-mono text-muted-foreground truncate">{inv.token}</p>
                {inv.note && <p className="type-label text-muted-foreground mt-0.5 truncate">{inv.note}</p>}
              </div>
              <Badge variant="outline" className="type-label shrink-0">{t(`org.roles.${inv.role}`)}</Badge>
              {inv.used_at ? (
                <Badge className="type-label shrink-0">{t('org.inviteUsed')}</Badge>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => copyLink(inv.token)}
                    title={t('org.copyInviteLink')}
                  >
                    {copied === `link:${inv.token}` ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    tone="danger"
                    className="text-muted-foreground"
                    onClick={() => revokeInvitation.mutate(inv.ID)}
                    title={t('org.revokeInvite')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </OrganizationListRow>
          ))}
        </OrganizationListSurface>
      )}

      {showCreate && (
        <Dialog open onOpenChange={(o) => !o && setShowCreate(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('org.createInvite')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>{t('org.role')}</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{t(`org.roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invite-note">{t('org.inviteNote')}</Label>
                <Input
                  id="invite-note"
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder={t('org.inviteNotePlaceholder')}
                  className="mt-1"
                />
              </div>
              {createError && <OrganizationInlineError>{createError}</OrganizationInlineError>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => createInvitation.mutate()} disabled={createInvitation.isPending}>
                {createInvitation.isPending ? t('common.creating') : t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </OrganizationStack>
  )
}

function UsageTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()

  const { data } = useQuery<OrgUsageResult>({
    queryKey: ['org', orgId, 'usage'],
    queryFn: () => api.get(`/orgs/${orgId}/usage`).then((r) => r.data),
  })

  const rows = data?.by_user ?? []
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0)

  return (
    <OrganizationStack>
      <OrganizationUsageMetricGrid>
        <OrganizationUsageMetricCard label={t('org.usage.month')} value={data?.month ?? '—'} />
        <OrganizationUsageMetricCard label={t('org.usage.totalTokens')} value={totalTokens.toLocaleString()} />
      </OrganizationUsageMetricGrid>

      <OrganizationUsageCostCard
        icon={<Coins size={14} />}
        label={t('org.usage.totalCost')}
        value={totalCost.toFixed(3)}
        detail={t('common.credits')}
      />

      <OrganizationTableSurface>
        <OrganizationDataTable>
          <OrganizationDataTableHeader>
            <tr>
              <OrganizationDataTableHeadCell>{t('org.usage.user')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.tokens')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.cost')}</OrganizationDataTableHeadCell>
            </tr>
          </OrganizationDataTableHeader>
          <OrganizationDataTableBody>
            {rows.map((row) => (
              <OrganizationDataTableRow key={row.user_id} interactive>
                <OrganizationDataTableCell>{row.username}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" numeric>{row.tokens.toLocaleString()}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" emphasis="strong" numeric>{row.cost.toFixed(3)}</OrganizationDataTableCell>
              </OrganizationDataTableRow>
            ))}
            {rows.length === 0 && (
              <OrganizationDataTableEmptyRow colSpan={3}>{t('org.usage.empty')}</OrganizationDataTableEmptyRow>
            )}
          </OrganizationDataTableBody>
        </OrganizationDataTable>
      </OrganizationTableSurface>
    </OrganizationStack>
  )
}

type OrgGenerationToolServer = {
  id: string
  scope: 'org'
  type: 'comfyui' | 'webui'
  name: string
  enabled: boolean
  base_url: string
  timeout_ms: number
  priority: number
  auth_kind: 'none' | 'basic' | 'bearer'
  username?: string
  password?: string
  password_set?: boolean
  token?: string
  token_set?: boolean
  tags?: string[]
}

type OrgGenerationToolsSettings = {
  servers: OrgGenerationToolServer[]
  default_server_id?: string
  default_server_ids?: Partial<Record<OrgGenerationToolServer['type'], string>>
  allow_local: boolean
}

type OrgGenerationToolTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
}

const emptyOrgGenerationToolsSettings: OrgGenerationToolsSettings = {
  servers: [],
  default_server_id: '',
  default_server_ids: {},
  allow_local: true,
}

function createOrgGenerationToolServer(type: OrgGenerationToolServer['type']): OrgGenerationToolServer {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return {
    id: `org-${type}-${suffix}`,
    scope: 'org',
    type,
    name: type === 'comfyui' ? '组织 ComfyUI' : '组织 WebUI',
    enabled: true,
    base_url: type === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
    timeout_ms: 120000,
    priority: 30,
    auth_kind: 'none',
    username: '',
    password: '',
    token: '',
    tags: [],
  }
}

function GenerationToolsTab({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<OrgGenerationToolsSettings>(emptyOrgGenerationToolsSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, OrgGenerationToolTestResult>>({})

  const settingsQuery = useQuery<OrgGenerationToolsSettings>({
    queryKey: ['org', orgId, 'generation-tools'],
    queryFn: () => api.get(`/orgs/${orgId}/generation-tools/settings`).then((r) => r.data),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setForm({
      ...emptyOrgGenerationToolsSettings,
      ...settingsQuery.data,
      default_server_ids: settingsQuery.data.default_server_ids ?? {},
      servers: (settingsQuery.data.servers ?? []).map((server) => ({
        ...server,
        scope: 'org',
        password: '',
        token: '',
        tags: server.tags ?? [],
      })),
    })
  }, [settingsQuery.data])

  const updateSettings = useMutation({
    mutationFn: (payload: OrgGenerationToolsSettings) =>
      api.put(`/orgs/${orgId}/generation-tools/settings`, payload).then((r) => r.data as OrgGenerationToolsSettings),
    onSuccess: (updated) => {
      setError('')
      setSaved(true)
      qc.setQueryData(['org', orgId, 'generation-tools'], updated)
      setForm({
        ...emptyOrgGenerationToolsSettings,
        ...updated,
        default_server_ids: updated.default_server_ids ?? {},
        servers: (updated.servers ?? []).map((server) => ({ ...server, scope: 'org', password: '', token: '', tags: server.tags ?? [] })),
      })
      setTestResults({})
      setTimeout(() => setSaved(false), 1800)
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, '保存组织生成工具失败')),
  })

  const invalidServers = form.servers.filter((server) => !orgGenerationToolServerValid(server))
  const enabledCount = form.servers.filter((server) => server.enabled).length
  const savedServersById = new Map((settingsQuery.data?.servers ?? []).map((server) => [server.id, server]))

  function patchServer(id: string, patch: Partial<OrgGenerationToolServer>) {
    setForm((current) => ({
      ...current,
      servers: current.servers.map((server) => server.id === id ? { ...server, ...patch } : server),
      default_server_id: patch.enabled === false && current.default_server_id === id ? '' : current.default_server_id,
      default_server_ids: patch.enabled === false ? clearOrgGenerationToolDefaultServerID(current.default_server_ids, id) : current.default_server_ids,
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function addServer(type: OrgGenerationToolServer['type']) {
    setForm((current) => ({ ...current, servers: [...current.servers, createOrgGenerationToolServer(type)] }))
  }

  function removeServer(id: string) {
    setForm((current) => removeServerFromOrgSettings(current, id))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function save() {
    if (invalidServers.length) return
    updateSettings.mutate({
      allow_local: form.allow_local,
      default_server_id: form.default_server_id || '',
      default_server_ids: form.default_server_ids ?? {},
      servers: form.servers.map((server) => ({
        ...server,
        scope: 'org',
        name: server.name.trim(),
        base_url: server.base_url.trim(),
        username: server.username?.trim() ?? '',
        timeout_ms: Number(server.timeout_ms) || 120000,
        priority: Number(server.priority) || 0,
        tags: normalizeOrgGenerationToolTags(server.tags),
      })),
    })
  }

  async function testSavedServer(server: OrgGenerationToolServer) {
    const savedServer = savedServersById.get(server.id)
    if (!savedServer || !orgGenerationToolServerMatchesSaved(server, savedServer) || !orgGenerationToolServerValid(server) || !server.enabled) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: '请先保存当前配置再测试连接' },
      }))
      return
    }
    setTestingId(server.id)
    try {
      const startedAt = Date.now()
      const response = await api.post('/generation-tools/call', {
        tool_type: server.type,
        server_id: server.id,
        server_scope: 'org',
        operation: 'status',
      })
      setTestResults((current) => ({
        ...current,
        [server.id]: {
          success: true,
          latency_ms: Date.now() - startedAt,
          status_code: response.status,
          message: '连接正常',
        },
      }))
    } catch (e: any) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: translateApiError(e.response?.data, '连接测试失败') },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <OrganizationStack>
      <OrganizationGenerationToolsHeaderCard>
        <div>
          <p className="type-body font-medium text-foreground">组织生成服务器</p>
          <p className="mt-1 type-label leading-5 text-muted-foreground">
            配置当前工作区共享的 ComfyUI / WebUI。组织成员运行 Agent 时会先看到这里的服务器，再回落到平台全局服务器。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {saved && <StatusBadge {...organizationSaveRecipe(saved)}>已保存</StatusBadge>}
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('comfyui')}>添加 ComfyUI</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('webui')}>添加 WebUI</Button>
          <Button type="button" size="sm" onClick={save} disabled={updateSettings.isPending || invalidServers.length > 0}>
            {updateSettings.isPending ? '保存中…' : '保存组织配置'}
          </Button>
        </div>
      </OrganizationGenerationToolsHeaderCard>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...organizationServerEnabledRecipe(enabledCount)}>{enabledCount ? `${enabledCount} 个组织服务器已启用` : '未启用组织服务器'}</StatusBadge>
        <CheckboxField
          checked={form.allow_local}
          onCheckedChange={(checked) => setForm((current) => ({ ...current, allow_local: checked }))}
          className="h-auto px-2 py-1 type-label text-muted-foreground"
        >
          允许成员使用本地控制台配置
        </CheckboxField>
      </div>

      {(settingsQuery.error || error || invalidServers.length > 0) && (
        <OrganizationStatusMessage tone="danger">
          {settingsQuery.error ? translateApiError((settingsQuery.error as any).response?.data, '查询组织生成工具失败') : error || '启用服务器时 Base URL 必须以 http:// 或 https:// 开头，超时范围为 1000 到 600000 ms。'}
        </OrganizationStatusMessage>
      )}

      <div className="space-y-3">
        {form.servers.length === 0 ? (
          <OrganizationEmptyState title="尚未配置组织共享生成服务器。" />
        ) : form.servers.map((server) => {
          const savedServer = savedServersById.get(server.id)
          const canTest = server.enabled
            && orgGenerationToolServerValid(server)
            && Boolean(savedServer)
            && orgGenerationToolServerMatchesSaved(server, savedServer)
          return (
            <OrgGenerationToolServerCard
              key={server.id}
              server={server}
              isDefault={form.default_server_ids?.[server.type] === server.id || (!form.default_server_ids?.[server.type] && form.default_server_id === server.id)}
              onPatch={(patch) => patchServer(server.id, patch)}
              onRemove={() => removeServer(server.id)}
              onDefault={() => setForm((current) => ({
                ...current,
                default_server_id: current.default_server_id === server.id ? '' : current.default_server_id,
                default_server_ids: {
                  ...(current.default_server_ids ?? {}),
                  [server.type]: current.default_server_ids?.[server.type] === server.id ? undefined : server.id,
                },
              }))}
              testResult={testResults[server.id]}
              testing={testingId === server.id}
              canTest={canTest}
              onTest={() => testSavedServer(server)}
            />
          )
        })}
      </div>
    </OrganizationStack>
  )
}

function removeServerFromOrgSettings(current: OrgGenerationToolsSettings, id: string): OrgGenerationToolsSettings {
  return {
    ...current,
    servers: current.servers.filter((item) => item.id !== id),
    default_server_id: current.default_server_id === id ? '' : current.default_server_id,
    default_server_ids: clearOrgGenerationToolDefaultServerID(current.default_server_ids, id),
  }
}

function clearOrgGenerationToolDefaultServerID(
  defaults: OrgGenerationToolsSettings['default_server_ids'] | undefined,
  serverID: string,
): OrgGenerationToolsSettings['default_server_ids'] {
  if (!defaults) return {}
  const next = { ...defaults }
  for (const type of ['comfyui', 'webui'] as const) {
    if (next[type] === serverID) delete next[type]
  }
  return next
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function OrgGenerationToolServerCard({ server, isDefault, onPatch, onRemove, onDefault, testResult, testing, canTest, onTest }: {
  server: OrgGenerationToolServer
  isDefault: boolean
  onPatch: (patch: Partial<OrgGenerationToolServer>) => void
  onRemove: () => void
  onDefault: () => void
  testResult?: OrgGenerationToolTestResult
  testing?: boolean
  canTest: boolean
  onTest: () => void
}) {
  const invalid = !orgGenerationToolServerValid(server)
  return (
    <OrganizationGenerationToolServerSurface invalid={invalid}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-body font-medium text-foreground">{server.name || (server.type === 'comfyui' ? 'ComfyUI' : 'WebUI')}</p>
            <Badge variant="outline">{server.type === 'comfyui' ? 'ComfyUI' : 'WebUI'}</Badge>
            {isDefault && <StatusBadge {...organizationDefaultServerRecipe(isDefault)}>默认</StatusBadge>}
          </div>
          <p className="mt-1 truncate font-mono type-label text-muted-foreground">{server.base_url}</p>
        </div>
        <CheckboxField
          checked={server.enabled}
          onCheckedChange={(checked) => onPatch({ enabled: checked })}
          controlSize="sm"
          className="mt-1 h-4 w-4 p-0"
          inputProps={{ 'aria-label': '启用服务器' }}
        />
      </div>

      <div className={`mt-3 space-y-3 ${server.enabled ? '' : 'opacity-60'}`}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
          <OrgToolField label="名称" value={server.name} onChange={(value) => onPatch({ name: value })} />
          <div>
            <Label className="mb-1 block type-label text-muted-foreground">类型</Label>
            <NativeSelect
              value={server.type}
              onChange={(event) => onPatch({
                type: event.target.value as OrgGenerationToolServer['type'],
                base_url: event.target.value === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
              })}
              className="type-label"
            >
              <option value="comfyui">ComfyUI</option>
              <option value="webui">WebUI</option>
            </NativeSelect>
          </div>
        </div>
        <OrgToolField label="Base URL" value={server.base_url} onChange={(value) => onPatch({ base_url: value })} />
        <div className="grid gap-2 sm:grid-cols-[120px_120px_1fr]">
          <OrgToolField label="优先级" value={String(server.priority)} onChange={(value) => onPatch({ priority: Number(value) || 0 })} type="number" />
          <OrgToolField label="超时 ms" value={String(server.timeout_ms || '')} onChange={(value) => onPatch({ timeout_ms: Number(value) || 0 })} type="number" />
          <div>
            <Label className="mb-1 block type-label text-muted-foreground">认证</Label>
            <NativeSelect
              value={server.auth_kind}
              onChange={(event) => onPatch({ auth_kind: event.target.value as OrgGenerationToolServer['auth_kind'] })}
              className="type-label"
            >
              <option value="none">无</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer/API Key</option>
            </NativeSelect>
          </div>
        </div>
        {server.auth_kind === 'basic' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <OrgToolField label="用户名" value={server.username ?? ''} onChange={(value) => onPatch({ username: value })} />
            <OrgToolField label="密码" value={server.password ?? ''} onChange={(value) => onPatch({ password: value })} type="password" placeholder={server.password_set ? '已保存，留空不修改' : undefined} />
          </div>
        )}
        {server.auth_kind === 'bearer' && (
          <OrgToolField label="Token / API Key" value={server.token ?? ''} onChange={(value) => onPatch({ token: value })} type="password" placeholder={server.token_set ? '已保存，留空不修改' : undefined} />
        )}
        <OrgToolField label="标签（逗号分隔）" value={(server.tags ?? []).join(', ')} onChange={(value) => onPatch({ tags: value.split(',') })} placeholder="gpu, sdxl, 队列-a" />
        <div className="flex flex-wrap justify-end gap-2">
          {testResult && (
            <OrganizationConnectionStatus success={testResult.success}>
              {testResult.success ? `连接正常 ${testResult.latency_ms ?? 0}ms` : `连接失败 ${testResult.message ?? ''}`}
            </OrganizationConnectionStatus>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={testing || !canTest}>
            {testing ? '测试中…' : canTest ? '测试已保存连接' : '保存后测试'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDefault} disabled={!server.enabled}>
            {isDefault ? '取消默认' : '设为默认'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>删除</Button>
        </div>
      </div>
    </OrganizationGenerationToolServerSurface>
  )
}

function OrgToolField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block type-label text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 type-label" />
    </div>
  )
}

function orgGenerationToolServerValid(server: OrgGenerationToolServer): boolean {
  if (!Number.isFinite(Number(server.timeout_ms)) || Number(server.timeout_ms) < 1000 || Number(server.timeout_ms) > 600000) return false
  if (!server.enabled) return true
  const baseURL = server.base_url.trim()
  return baseURL.startsWith('http://') || baseURL.startsWith('https://')
}

function orgGenerationToolServerMatchesSaved(current: OrgGenerationToolServer, saved?: OrgGenerationToolServer): boolean {
  if (!saved) return false
  return current.id === saved.id
    && current.scope === saved.scope
    && current.type === saved.type
    && current.name.trim() === saved.name.trim()
    && current.enabled === saved.enabled
    && current.base_url.trim() === saved.base_url.trim()
    && Number(current.timeout_ms) === Number(saved.timeout_ms)
    && Number(current.priority) === Number(saved.priority)
    && current.auth_kind === saved.auth_kind
    && (current.username ?? '').trim() === (saved.username ?? '').trim()
    && !current.password
    && !current.token
    && Boolean(current.password_set) === Boolean(saved.password_set)
    && Boolean(current.token_set) === Boolean(saved.token_set)
    && normalizedStringArrayEquals(normalizeOrgGenerationToolTags(current.tags), normalizeOrgGenerationToolTags(saved.tags))
}

function normalizeOrgGenerationToolTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const next = tag.trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }
  return normalized
}

function normalizedStringArrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function SettingsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: org } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
    onSuccess: (data: any) => { if (!name) setName(data.name) },
  } as any)

  const update = useMutation({
    mutationFn: () => api.put(`/orgs/${orgId}`, { name }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError('')
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, t('org.updateFailed'))),
  })

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="org-name-setting">{t('org.name')}</Label>
        <Input
          id="org-name-setting"
          value={name || (org as any)?.name || ''}
          onChange={(e) => setName(e.target.value)}
          className="mt-1"
        />
      </div>
      {error && <OrganizationInlineError>{error}</OrganizationInlineError>}
      <Button onClick={() => update.mutate()} disabled={update.isPending || !name.trim()}>
        {saved ? t('org.saved') : update.isPending ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}

export default function OrgSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [tab, setTab] = useState<Tab>('members')

  if (!currentOrgID) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: t('org.tabs.members') },
    { key: 'usage', label: t('org.tabs.usage') },
    { key: 'invitations', label: t('org.tabs.invitations') },
    { key: 'generation-tools', label: '生成工具' },
    { key: 'settings', label: t('org.tabs.settings') },
  ]

  return (
    <div className={embedded ? '' : 'p-6 max-w-3xl'}>
      {!embedded && <h1 className="type-title font-semibold text-foreground mb-6">{t('org.settingsTitle')}</h1>}

      <OrganizationTabs>
        {tabs.map(({ key, label }) => (
          <OrganizationTabButton
            key={key}
            variant={tab === key ? 'solid' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {label}
          </OrganizationTabButton>
        ))}
      </OrganizationTabs>

      {tab === 'members' && <MembersTab orgId={currentOrgID} />}
      {tab === 'usage' && <UsageTab orgId={currentOrgID} />}
      {tab === 'invitations' && <InvitationsTab orgId={currentOrgID} />}
      {tab === 'generation-tools' && <GenerationToolsTab orgId={currentOrgID} />}
      {tab === 'settings' && <SettingsTab orgId={currentOrgID} />}
    </div>
  )
}

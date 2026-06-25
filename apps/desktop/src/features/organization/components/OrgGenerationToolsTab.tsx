import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckboxField, Button, StatusBadge } from '@movscript/ui/primitives'
import {
  OrganizationEmptyState,
  OrganizationGenerationToolsHeaderCard,
  OrganizationStack,
  OrganizationStatusMessage,
} from './OrganizationUi'
import { api } from '@/shared/infrastructure/api'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import { commitOrganizationGenerationToolsMutation } from '@/features/organization/application/organizationMutationInvalidation'
import { organizationSaveRecipe, organizationServerEnabledRecipe } from '@/features/organization/presentation/organizationSemanticUi'
import { OrgGenerationToolServerCard } from '@/features/organization/components/OrgGenerationToolServerCard'
import {
  clearOrgGenerationToolDefaultServerID,
  createOrgGenerationToolServer,
  emptyOrgGenerationToolsSettings,
  normalizeOrgGenerationToolTags,
  omitRecordKey,
  orgGenerationToolServerMatchesSaved,
  orgGenerationToolServerValid,
  removeServerFromOrgSettings,
  type OrgGenerationToolServer,
  type OrgGenerationToolTestResult,
  type OrgGenerationToolsSettings,
} from '@/features/organization/presentation/organizationGenerationToolsModel'

export function OrgGenerationToolsTab({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<OrgGenerationToolsSettings>(emptyOrgGenerationToolsSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, OrgGenerationToolTestResult>>({})

  const settingsQuery = useQuery<OrgGenerationToolsSettings>({
    queryKey: organizationKeys.generationTools(orgId),
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
      commitOrganizationGenerationToolsMutation(qc, orgId, updated)
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

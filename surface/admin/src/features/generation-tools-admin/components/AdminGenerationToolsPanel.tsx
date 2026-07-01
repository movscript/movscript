import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { AppInlineError } from '@movscript/ui/business/app'
import { Badge, Button } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  adminGenerationToolServerMatchesSaved,
  adminGenerationToolServerValid,
  clearAdminGenerationToolDefaultServerID,
  createAdminGenerationToolServer,
  emptyAdminGenerationToolsSettings,
  normalizeAdminGenerationToolTags,
  omitRecordKey,
  type AdminGenerationToolServer,
  type AdminGenerationToolsSettings,
  type GenerationToolConnectionTestResult,
} from '../model/generationToolsSettings'
import { AdminGenerationToolServerCard } from './AdminGenerationToolServerCard'

// ── Admin generation tools ───────────────────────────────────────────────────

export function AdminGenerationToolsPanel() {
  const qc = useQueryClient()
  const [form, setForm] = useState<AdminGenerationToolsSettings>(emptyAdminGenerationToolsSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, GenerationToolConnectionTestResult>>({})

  const settingsQuery = useQuery<AdminGenerationToolsSettings>({
    queryKey: ['admin', 'settings', 'generation-tools'],
    queryFn: () => api.get('/admin/settings/generation-tools').then((r) => r.data),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setForm({
      ...emptyAdminGenerationToolsSettings,
      ...settingsQuery.data,
      default_server_ids: settingsQuery.data.default_server_ids ?? {},
      servers: (settingsQuery.data.servers ?? []).map((server) => ({
        ...server,
        password: '',
        token: '',
        tags: server.tags ?? [],
      })),
    })
  }, [settingsQuery.data])

  const updateSettings = useMutation({
    mutationFn: (payload: AdminGenerationToolsSettings) =>
      api.put('/admin/settings/generation-tools', payload).then((r) => r.data as AdminGenerationToolsSettings),
    onSuccess: (updated) => {
      setError('')
      setSaved(true)
      qc.setQueryData(['admin', 'settings', 'generation-tools'], updated)
      setForm({
        ...emptyAdminGenerationToolsSettings,
        ...updated,
        default_server_ids: updated.default_server_ids ?? {},
        servers: (updated.servers ?? []).map((server) => ({ ...server, password: '', token: '', tags: server.tags ?? [] })),
      })
      setTestResults({})
      setTimeout(() => setSaved(false), 1800)
    },
    onError: (err: unknown) => setError(translateAPIRequestError(err)),
  })

  const invalidServers = form.servers.filter((server) => !adminGenerationToolServerValid(server))
  const canSave = invalidServers.length === 0
  const enabledCount = form.servers.filter((server) => server.enabled).length
  const savedServersById = new Map((settingsQuery.data?.servers ?? []).map((server) => [server.id, server]))

  function patchServer(id: string, patch: Partial<AdminGenerationToolServer>) {
    setForm((current) => ({
      ...current,
      servers: current.servers.map((server) => server.id === id ? { ...server, ...patch } : server),
      default_server_id: patch.enabled === false && current.default_server_id === id ? '' : current.default_server_id,
      default_server_ids: patch.enabled === false ? clearAdminGenerationToolDefaultServerID(current.default_server_ids, id) : current.default_server_ids,
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function removeServer(id: string) {
    setForm((current) => ({
      ...current,
      servers: current.servers.filter((server) => server.id !== id),
      default_server_id: current.default_server_id === id ? '' : current.default_server_id,
      default_server_ids: clearAdminGenerationToolDefaultServerID(current.default_server_ids, id),
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function addServer(type: AdminGenerationToolServer['type']) {
    setForm((current) => ({ ...current, servers: [...current.servers, createAdminGenerationToolServer(type)] }))
  }

  function save() {
    if (!canSave) return
    updateSettings.mutate({
      allow_local: form.allow_local,
      default_server_id: form.default_server_id || '',
      default_server_ids: form.default_server_ids ?? {},
      servers: form.servers.map((server) => ({
        ...server,
        scope: 'admin',
        base_url: server.base_url.trim(),
        name: server.name.trim(),
        username: server.username?.trim() ?? '',
        timeout_ms: Number(server.timeout_ms) || 120000,
        priority: Number(server.priority) || 0,
        tags: normalizeAdminGenerationToolTags(server.tags),
      })),
    })
  }

  async function testSavedServer(server: AdminGenerationToolServer) {
    const savedServer = savedServersById.get(server.id)
    if (!savedServer || !adminGenerationToolServerMatchesSaved(server, savedServer) || !adminGenerationToolServerValid(server) || !server.enabled) {
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
        server_scope: 'admin',
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
    } catch (err: unknown) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: translateAPIRequestError(err) },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">平台全局生成服务器</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            管理平台级 ComfyUI / WebUI 兜底服务。组织可以在工作区设置里配置自己的共享服务器；本机 127.0.0.1 请放在客户端控制台配置。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && <span className="text-xs text-primary">已保存</span>}
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('comfyui')}>添加 ComfyUI</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('webui')}>添加 WebUI</Button>
          <Button type="button" size="sm" onClick={save} disabled={updateSettings.isPending || !canSave}>
            {updateSettings.isPending ? '保存中…' : '保存共享配置'}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={enabledCount > 0 ? 'success' : 'neutral'}>{enabledCount > 0 ? `${enabledCount} 个全局服务器已启用` : '未启用全局服务器'}</Badge>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={form.allow_local}
            onChange={(event) => setForm((current) => ({ ...current, allow_local: event.target.checked }))}
          />
          允许用户使用本地控制台配置覆盖
        </label>
      </div>

      {(settingsQuery.error || error || !canSave) && (
        <AppInlineError className="mt-3">
          {settingsQuery.error
            ? translateAPIRequestError(settingsQuery.error)
            : error || '启用服务器时 Base URL 必须以 http:// 或 https:// 开头，超时范围为 1000 到 600000 ms。'}
        </AppInlineError>
      )}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {form.servers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background p-4 text-xs text-muted-foreground">
            尚未配置平台全局生成服务器。可以先添加一台远程 ComfyUI 或 WebUI。
          </div>
        ) : form.servers.map((server) => {
          const savedServer = savedServersById.get(server.id)
          const canTestSavedServer = server.enabled
            && adminGenerationToolServerValid(server)
            && Boolean(savedServer)
            && adminGenerationToolServerMatchesSaved(server, savedServer)
          return (
            <AdminGenerationToolServerCard
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
              canTest={canTestSavedServer}
              onTest={() => testSavedServer(server)}
            />
          )
        })}
      </div>
    </section>
  )
}

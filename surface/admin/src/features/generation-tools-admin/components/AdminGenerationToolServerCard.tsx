import { cn } from '@admin/lib/utils'
import { AppFeedbackText, AppStatusSurface } from '@movscript/ui/business/app'
import { Badge, Button, Input, Label } from '@movscript/ui/primitives'
import {
  adminGenerationToolServerValid,
  type AdminGenerationToolServer,
  type GenerationToolConnectionTestResult,
} from '../model/generationToolsSettings'

type AdminGenerationToolServerCardProps = {
  server: AdminGenerationToolServer
  isDefault: boolean
  onPatch: (patch: Partial<AdminGenerationToolServer>) => void
  onRemove: () => void
  onDefault: () => void
  testResult?: GenerationToolConnectionTestResult
  testing?: boolean
  canTest: boolean
  onTest: () => void
}

export function AdminGenerationToolServerCard({
  server,
  isDefault,
  onPatch,
  onRemove,
  onDefault,
  testResult,
  testing,
  canTest,
  onTest,
}: AdminGenerationToolServerCardProps) {
  const invalid = !adminGenerationToolServerValid(server)
  return (
    <AppStatusSurface tone={invalid ? 'danger' : 'neutral'} emphasis="outline" className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{server.name || (server.type === 'comfyui' ? 'ComfyUI' : 'WebUI')}</p>
            <Badge variant="outline">{server.type === 'comfyui' ? 'ComfyUI' : 'WebUI'}</Badge>
            {isDefault && <Badge tone="success">默认</Badge>}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{server.base_url}</p>
        </div>
        <input type="checkbox" checked={server.enabled} onChange={(event) => onPatch({ enabled: event.target.checked })} className="mt-1 h-4 w-4" />
      </div>

      <div className={cn('mt-3 space-y-2', !server.enabled && 'opacity-60')}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
          <AdminToolField label="名称" value={server.name} onChange={(value) => onPatch({ name: value })} />
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">类型</Label>
            <select
              value={server.type}
              onChange={(event) => onPatch({
                type: event.target.value as AdminGenerationToolServer['type'],
                base_url: event.target.value === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
              })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="comfyui">ComfyUI</option>
              <option value="webui">WebUI</option>
            </select>
          </div>
        </div>
        <AdminToolField label="Base URL" value={server.base_url} onChange={(value) => onPatch({ base_url: value })} />
        <div className="grid gap-2 sm:grid-cols-[120px_120px_1fr]">
          <AdminToolField label="优先级" value={String(server.priority)} onChange={(value) => onPatch({ priority: Number(value) || 0 })} type="number" />
          <AdminToolField label="超时 ms" value={String(server.timeout_ms || '')} onChange={(value) => onPatch({ timeout_ms: Number(value) || 0 })} type="number" />
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">认证</Label>
            <select
              value={server.auth_kind}
              onChange={(event) => onPatch({ auth_kind: event.target.value as AdminGenerationToolServer['auth_kind'] })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="none">无</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer/API Key</option>
            </select>
          </div>
        </div>
        {server.auth_kind === 'basic' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <AdminToolField label="用户名" value={server.username ?? ''} onChange={(value) => onPatch({ username: value })} />
            <AdminToolField label="密码" value={server.password ?? ''} onChange={(value) => onPatch({ password: value })} type="password" placeholder={server.password_set ? '已保存，留空不修改' : undefined} />
          </div>
        )}
        {server.auth_kind === 'bearer' && (
          <AdminToolField label="Token / API Key" value={server.token ?? ''} onChange={(value) => onPatch({ token: value })} type="password" placeholder={server.token_set ? '已保存，留空不修改' : undefined} />
        )}
        <AdminToolField
          label="标签（逗号分隔）"
          value={(server.tags ?? []).join(', ')}
          onChange={(value) => onPatch({ tags: value.split(',') })}
          placeholder="gpu, sdxl, team-a"
        />
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {testResult && (
            <AppFeedbackText as="span" tone={testResult.success ? 'success' : 'danger'} className="mr-auto self-center">
              {testResult.success ? `连接正常 ${testResult.latency_ms ?? 0}ms` : `连接失败 ${testResult.message ?? ''}`}
            </AppFeedbackText>
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
    </AppStatusSurface>
  )
}

function AdminToolField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

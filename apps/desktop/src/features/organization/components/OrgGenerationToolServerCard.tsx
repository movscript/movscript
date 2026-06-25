import { Badge, Button, CheckboxField, Input, Label, NativeSelect, StatusBadge } from '@movscript/ui/primitives'
import {
  OrganizationConnectionStatus,
  OrganizationGenerationToolServerSurface,
} from './OrganizationUi'
import { organizationDefaultServerRecipe } from '@/features/organization/presentation/organizationSemanticUi'
import {
  orgGenerationToolServerValid,
  type OrgGenerationToolServer,
  type OrgGenerationToolTestResult,
} from '@/features/organization/presentation/organizationGenerationToolsModel'

export function OrgGenerationToolServerCard({ server, isDefault, onPatch, onRemove, onDefault, testResult, testing, canTest, onTest }: {
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

import { cloudFileConfigToggleConfirmKey } from '@admin/lib/adminActionGuards'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { readListPayload } from '@admin/lib/listPayload'
import { cn } from '@admin/lib/utils'
import { AppFeedbackText, AppInlineError, AppRequiredMark, AppStateMessage } from '@movscript/ui/business/app'
import { Button, Input, Label } from '@movscript/ui/primitives'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResourceAccessSettingsPanel } from '../components/ResourceAccessSettingsPanel'
import {
  CONFIG_TYPE_FIELDS,
  CONFIG_TYPE_LABELS,
  missingCloudConfigFields,
  parseMaskedCloudConfig,
  type CloudFileConfig,
  type CloudFileConfigTestResult,
} from '../model/cloudFileConfig'

// ── Cloud file config ────────────────────────────────────────────────────────

export function CloudFileConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formType, setFormType] = useState('s3')
  const [formName, setFormName] = useState('')
  const [formPriority, setFormPriority] = useState(0)
  const [formEnabled, setFormEnabled] = useState(true)
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [cloudFileError, setCloudFileError] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, CloudFileConfigTestResult>>({})

  const { data: configs = [], refetch, error: cloudConfigsQueryError } = useQuery<CloudFileConfig[]>({
    queryKey: ['admin-cloud-file-configs'],
    queryFn: () => api.get('/admin/cloud-file-configs').then(r => readListPayload<CloudFileConfig>(r.data, ['configs', 'items', 'records'])),
  })

  function openCreate(initialType: string = 's3') {
    setEditingId(null)
    setFormType(initialType)
    setFormName('')
    setFormPriority(configs.length)
    setFormEnabled(true)
    setFormFields({})
    setShowForm(true)
  }

  // Deep-link support: `/cloud-files?type=tos` pre-opens the create form with that type.
  // Used by the Volcen credential flow to guide admins directly to TOS setup.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type')
    if (!type || !CONFIG_TYPE_LABELS[type]) return
    openCreate(type)
    params.delete('type')
    const nextSearch = params.toString()
    const nextUrl = window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash
    window.history.replaceState({}, '', nextUrl)
    // Intentionally omit deps: we only want this to fire once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openEdit(cfg: CloudFileConfig) {
    setEditingId(cfg.ID)
    setFormType(cfg.config_type)
    setFormName(cfg.name)
    setFormPriority(cfg.priority)
    setFormEnabled(cfg.is_enabled)
    const masked = parseMaskedCloudConfig(cfg.masked_config)
    const secretKeys = new Set((CONFIG_TYPE_FIELDS[cfg.config_type] ?? []).filter((f) => f.secret).map((f) => f.key))
    const next: Record<string, string> = {}
    Object.entries(masked).forEach(([key, value]) => {
      next[key] = secretKeys.has(key) ? '' : String(value ?? '')
    })
    setFormFields(next)
    setShowForm(true)
  }

  async function save() {
    const missing = missingCloudConfigFields(fields, formFields, editingId)
    if (!formName.trim() || missing.length > 0) {
      setCloudFileError(t('admin.cloudFiles.missingRequired', {
        fields: missing.map((field) => t(`admin.cloudFiles.fields.${field.key}`, { defaultValue: field.label })).join(', '),
      }))
      return
    }
    setSaving(true)
    setCloudFileError('')
    try {
      const payload = { name: formName, config_type: formType, config: formFields, priority: formPriority, is_enabled: formEnabled }
      if (editingId) {
        await api.put(`/admin/cloud-file-configs/${editingId}`, payload)
      } else {
        await api.post('/admin/cloud-file-configs', payload)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
      setShowForm(false)
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(cfg: CloudFileConfig) {
    if (!window.confirm(t(cloudFileConfigToggleConfirmKey(cfg), { name: cfg.name }))) return
    setCloudFileError('')
    try {
      await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { is_enabled: !cfg.is_enabled })
      refetch()
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function deleteCfg(id: number) {
    const cfg = configs.find((item) => item.ID === id)
    if (!window.confirm(t('admin.cloudFiles.confirmDelete', { name: cfg?.name ?? `#${id}` }))) return
    setCloudFileError('')
    try {
      await api.delete(`/admin/cloud-file-configs/${id}`)
      queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function movePriority(cfg: CloudFileConfig, dir: -1 | 1) {
    setCloudFileError('')
    try {
      await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { priority: cfg.priority + dir })
      refetch()
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function testConfig(cfg: CloudFileConfig) {
    setCloudFileError('')
    setTestingId(cfg.ID)
    try {
      const result = await api.post(`/admin/cloud-file-configs/${cfg.ID}/test`).then((r) => r.data as CloudFileConfigTestResult)
      setTestResults((prev) => ({ ...prev, [cfg.ID]: result }))
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    } finally {
      setTestingId(null)
    }
  }

  const fields = CONFIG_TYPE_FIELDS[formType] ?? []
  const missingRequiredFields = missingCloudConfigFields(fields, formFields, editingId)

  return (
    <div className="space-y-6">
      <ResourceAccessSettingsPanel />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.publicObjectRelay')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.publicObjectRelayDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.providerFilesAPI')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.providerFilesAPIDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.internalMinio')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.internalMinioDescription')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.cloudFiles.title')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.cloudFiles.description')}</p>
        </div>
        <Button size="sm" onClick={() => openCreate()}>{t('admin.cloudFiles.addConfig')}</Button>
      </div>

      {(cloudFileError || cloudConfigsQueryError) && (
        <AppInlineError>
          {cloudFileError || translateAPIRequestError(cloudConfigsQueryError)}
        </AppInlineError>
      )}

      {configs.length === 0 && !showForm && !cloudConfigsQueryError && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.cloudFiles.empty')}</p>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => {
          const masked = parseMaskedCloudConfig(cfg.masked_config)
          const testResult = testResults[cfg.ID]
          return (
            <div key={cfg.ID} className={cn('border border-border rounded-lg bg-background overflow-hidden', !cfg.is_enabled && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => movePriority(cfg, -1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▲</button>
                  <span className="text-xs text-muted-foreground text-center tabular-nums">{cfg.priority}</span>
                  <button onClick={() => movePriority(cfg, 1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cfg.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{CONFIG_TYPE_LABELS[cfg.config_type] ?? cfg.config_type}</span>
                    {cfg.is_enabled
                      ? <AppFeedbackText as="span" tone="success">{t('admin.cloudFiles.enabledMark')}</AppFeedbackText>
                      : <span className="text-xs text-muted-foreground">{t('admin.cloudFiles.disabledMark')}</span>
                    }
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {Object.entries(masked).filter(([k]) => !['access_key','secret_key','api_key','access_key_id','access_key_secret'].includes(k)).map(([k,v]) => `${k}=${v}`).join('  ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => testConfig(cfg)}
                    disabled={testingId === cfg.ID}
                    className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {testingId === cfg.ID ? t('admin.cloudFiles.testing') : t('admin.cloudFiles.test')}
                  </button>
                  <button onClick={() => toggleEnabled(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">
                    {cfg.is_enabled ? t('admin.cloudFiles.disable') : t('admin.cloudFiles.enable')}
                  </button>
                  <button onClick={() => openEdit(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">{t('admin.models.edit')}</button>
                  <Button type="button" variant="outline" size="sm" intent="danger" onClick={() => deleteCfg(cfg.ID)} className="h-7 text-xs">{t('common.delete')}</Button>
                </div>
              </div>
              {testResult && (
                <AppStateMessage
                  tone={testResult.success ? 'success' : 'danger'}
                  className="rounded-none border-x-0 border-b-0 px-4 py-2 text-xs"
                >
                  <span className="font-medium">
                    {testResult.success ? t('admin.cloudFiles.testSuccess') : t('admin.cloudFiles.testFailed')}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {t('admin.cloudFiles.testLatency', { latency: testResult.latency_ms })}
                  </span>
                  {testResult.success && testResult.url && (
                    <a href={testResult.url} target="_blank" rel="noreferrer" className="ml-2 break-all underline underline-offset-2">
                      {testResult.url}
                    </a>
                  )}
                  {!testResult.success && <span className="ml-2 break-all">{testResult.message}</span>}
                </AppStateMessage>
              )}
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-4">
          <h4 className="text-sm font-medium">{editingId ? t('admin.cloudFiles.editConfig') : t('admin.cloudFiles.newConfig')}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('forms.name')}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t('admin.cloudFiles.namePlaceholder')} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('forms.type')}</Label>
              <select
                value={formType}
                onChange={e => { setFormType(e.target.value); setFormFields({}) }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!!editingId}
              >
                {Object.entries(CONFIG_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">
                  {t(`admin.cloudFiles.fields.${f.key}`, { defaultValue: f.label })}
                  {f.required && <AppRequiredMark />}
                </Label>
                <Input
                  type={f.secret ? 'password' : 'text'}
                  value={formFields[f.key] ?? ''}
                  onChange={e => setFormFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={editingId && f.secret ? t('admin.models.leaveBlankKeep') : f.placeholder}
                  className="text-sm font-mono"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">{t('admin.cloudFiles.priority')}</Label>
              <Input type="number" value={formPriority} onChange={e => setFormPriority(Number(e.target.value))} className="w-24 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} className="rounded" />
              {t('admin.cloudFiles.enable')}
            </label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !formName.trim() || missingRequiredFields.length > 0}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

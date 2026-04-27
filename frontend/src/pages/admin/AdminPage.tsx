import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AICredential, AIModelConfig, AdapterDef, ModelPreset, UsageLog, FeatureConfig, PublicModel, ParamDef } from '@/types'
import { useUserStore } from '@/store/userStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, ArrowLeft, Pencil, Check, X, Download, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { AgentConfigTab } from './AgentConfigTab'
import { DebugPage } from './DebugPage'
import { useTranslation } from 'react-i18next'
import { translateApiError } from '@/lib/apiError'

// ── helpers ───────────────────────────────────────────────────────────────────

interface TestResult { success: boolean; message: string; latency_ms: number }

function adapterDisplayName(adapter: Pick<AdapterDef, 'adapter_type' | 'display_name'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.name`, { defaultValue: adapter.display_name })
}

function adapterDescription(adapter: Pick<AdapterDef, 'adapter_type' | 'description'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.description`, { defaultValue: adapter.description })
}

function credentialFieldLabel(key: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.credentialFields.${key}`, { defaultValue: fallback })
}

function featureDisplayName(feature: FeatureConfig, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.features.catalog.${feature.feature_key}.name`, { defaultValue: feature.display_name })
}

function featureDescription(feature: FeatureConfig, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.features.catalog.${feature.feature_key}.description`, { defaultValue: feature.description })
}

type ModelEditForm = {
  display_name: string
  model_id_override: string
  priority: string
  capabilities: string[]
  billing_mode: string
  supported_params: string
}

const BILLING_LABEL_KEYS: Record<string, string> = {
  per_token: 'admin.billing.perToken',
  per_image: 'admin.billing.perImage',
  per_second: 'admin.billing.perSecond',
  per_call: 'admin.billing.perCall',
}

type PriceDef = {
  billing_mode: 'per_token' | 'per_image' | 'per_second' | 'per_call' | string
  ref_input_usd_per_1m?: number
  ref_output_usd_per_1m?: number
  ref_usd_per_image?: number
  ref_usd_per_second?: number
}

function refPriceHint(def: PriceDef, t: (key: string, values?: Record<string, unknown>) => string): string {
  switch (def.billing_mode) {
    case 'per_token':
      return def.ref_input_usd_per_1m || def.ref_output_usd_per_1m
        ? t('admin.billing.referenceToken', { input: def.ref_input_usd_per_1m ?? 0, output: def.ref_output_usd_per_1m ?? 0 })
        : ''
    case 'per_image':
      return def.ref_usd_per_image ? t('admin.billing.referenceImage', { price: def.ref_usd_per_image }) : ''
    case 'per_second':
      return def.ref_usd_per_second ? t('admin.billing.referenceSecond', { price: def.ref_usd_per_second }) : ''
    default:
      return ''
  }
}

// ── Step 1: Pick adapter ──────────────────────────────────────────────────────

function AdapterPicker({
  adapters,
  onPick,
  onCancel,
}: {
  adapters: AdapterDef[]
  onPick: (a: AdapterDef) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t('admin.credentials.selectAdapter')}</p>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {adapters.map((a) => (
          <button
            key={a.adapter_type}
            onClick={() => onPick(a)}
            className="text-left border border-border rounded-lg bg-background px-3 py-2.5 hover:border-ring hover:shadow-sm transition-all space-y-0.5"
          >
            <p className="text-sm font-medium text-foreground">{adapterDisplayName(a, t)}</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{adapterDescription(a, t)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Fill credential fields ───────────────────────────────────────────

function CredentialForm({
  adapter,
  onBack,
  onSuccess,
}: {
  adapter: AdapterDef
  onBack: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState(() => adapterDisplayName(adapter, t))
  const [fields, setFields] = useState<Record<string, string>>({})
  const [testState, setTestState] = useState<{ loading: boolean; result: TestResult | null }>({ loading: false, result: null })
  const [filesAPIEnabled, setFilesAPIEnabled] = useState(false)
  const [filesAPIBaseURL, setFilesAPIBaseURL] = useState('')
  const [filesAPIKey, setFilesAPIKey] = useState('')

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/admin/credentials', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      onSuccess()
    },
  })

  function buildPayload() {
    const base: Record<string, unknown> = {
      adapter_type: adapter.adapter_type,
      display_name: displayName,
      credentials: fields,
    }
    if (adapter.supports_files_api) {
      base.files_api_enabled = filesAPIEnabled
      if (filesAPIBaseURL) base.files_api_base_url = filesAPIBaseURL
      if (filesAPIKey) base.files_api_key = filesAPIKey
    }
    return base
  }

  async function handleCreateAndTest() {
    setTestState({ loading: true, result: null })
    try {
      const cred: AICredential = await api.post('/admin/credentials', buildPayload()).then((r) => r.data)
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      const res = await api.post(`/admin/credentials/${cred.ID}/test`, {}).then((r) => r.data)
      setTestState({ loading: false, result: res })
      if (res.success) onSuccess()
    } catch (e: any) {
      setTestState({ loading: false, result: { success: false, message: translateApiError(e?.response?.data), latency_ms: 0 } })
    }
  }

  const keyFields = adapter.cred_fields.filter((f) => f.key !== 'base_url')
  const baseURLField = adapter.cred_fields.find((f) => f.key === 'base_url')

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} />
        </button>
        <p className="text-sm font-medium">{t('admin.credentials.configureAdapter', { name: adapterDisplayName(adapter, t) })}</p>
      </div>

      <Input
        placeholder={t('agents.displayNameOptional')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      {baseURLField && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(baseURLField.key, baseURLField.label, t)}{baseURLField.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            placeholder={adapter.default_base_url || baseURLField.hint || ''}
            value={fields['base_url'] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, base_url: e.target.value }))}
          />
        </div>
      )}

      {keyFields.map((field) => (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(field.key, field.label, t)}{field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            type="password"
            placeholder={field.hint ?? ''}
            value={fields[field.key] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, [field.key]: e.target.value }))}
          />
        </div>
      ))}

      {create.isError && (
        <p className="text-xs text-destructive">{translateApiError((create.error as any)?.response?.data)}</p>
      )}
      {testState.result && (
        <p className={`text-xs ${testState.result.success ? 'text-foreground' : 'text-destructive'}`}>
          {testState.result.success
            ? t('admin.credentials.connectionOk', { latency: testState.result.latency_ms })
            : `✗ ${testState.result.message}`}
        </p>
      )}

      {/* Files API — shown only for adapters that support it */}
      {adapter.supports_files_api && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filesAPIEnabled}
                onChange={(e) => setFilesAPIEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">{t('admin.credentials.enableFilesAPI')}</span>
            </label>
            <span className="text-xs text-muted-foreground">{t('admin.credentials.filesAPIHint')}</span>
          </div>
          {filesAPIEnabled && (
            <div className="space-y-2 pt-1">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIBaseURL')}</Label>
                <Input
                  placeholder={fields['base_url'] || adapter.default_base_url || 'https://api.x.ai/v1'}
                  value={filesAPIBaseURL}
                  onChange={(e) => setFilesAPIBaseURL(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIKey')}</Label>
                <Input
                  type="password"
                  placeholder={t('admin.credentials.filesAPIKeyPlaceholder')}
                  value={filesAPIKey}
                  onChange={(e) => setFilesAPIKey(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCreateAndTest}
          disabled={create.isPending || testState.loading}
          className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {testState.loading ? t('admin.credentials.testing') : t('admin.credentials.createAndTest')}
        </button>
        <Button
          onClick={() => create.mutate(buildPayload())}
          disabled={create.isPending || testState.loading}
        >
          {create.isPending ? '…' : t('admin.credentials.createDirectly')}
        </Button>
        <Button variant="outline" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    </div>
  )
}

// ── Credit price form for activating a model ─────────────────────────────────

interface PriceForm {
  model_id_override: string
  credits_input_per_1m: number
  credits_output_per_1m: number
  credits_per_image: number
  credits_per_second: number
  credits_per_call: number
}

function defaultPriceForm(): PriceForm {
  return { model_id_override: '', credits_input_per_1m: 0, credits_output_per_1m: 0, credits_per_image: 0, credits_per_second: 0, credits_per_call: 0 }
}

function PriceFields({ def, form, onChange }: { def: PriceDef; form: PriceForm; onChange: (f: PriceForm) => void }) {
  const { t } = useTranslation()
  const mode = def.billing_mode
  const hint = refPriceHint(def, t)
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {mode === 'per_token' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.inputCreditsPer1m')}</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_input_per_1m}
              onChange={(e) => onChange({ ...form, credits_input_per_1m: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.outputCreditsPer1m')}</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_output_per_1m}
              onChange={(e) => onChange({ ...form, credits_output_per_1m: Number(e.target.value) })} />
          </div>
        </div>
      )}
      {mode === 'per_image' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerImage')}</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_image}
            onChange={(e) => onChange({ ...form, credits_per_image: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_second' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerSecond')}</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_second}
            onChange={(e) => onChange({ ...form, credits_per_second: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_call' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerCall')}</Label>
          <Input type="number" min="0" step="0.01" className="text-xs"
            value={form.credits_per_call}
            onChange={(e) => onChange({ ...form, credits_per_call: Number(e.target.value) })} />
        </div>
      )}
    </div>
  )
}

function parseParamDefs(value: string): ParamDef[] {
  if (!value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p.key === 'string' && typeof p.label === 'string')
      .map(normalizeParamDefForAdmin)
  } catch {
    return []
  }
}

function normalizeParamDefForAdmin(p: ParamDef): ParamDef {
  const alias: Record<string, string> = {
    ratio: 'aspect_ratio',
    size: 'image_size',
    guidance_scale: 'prompt_strength',
    max_images: 'image_count',
    camera_fixed: 'fixed_camera',
    generate_audio: 'audio',
  }
  const key = alias[p.key] ?? p.key
  const tmpl = PARAM_TEMPLATES[key]
  if (!tmpl) return p
  return {
    ...tmpl,
    ...p,
    key,
    label: p.label || tmpl.label,
  }
}

function serializeParamDefs(params: ParamDef[]): string {
  const normalized = params
    .map((p) => {
      p = normalizeParamDefForAdmin(p)
      const key = p.key.trim()
      if (!key) return null
      const label = (p.label || key).trim()
      const next: ParamDef = { key, label, type: p.type || 'select' }
      if (next.type === 'select') {
        next.options = (p.options ?? []).map(String).map((s) => s.trim()).filter(Boolean)
        if (p.default !== undefined && p.default !== '') next.default = String(p.default)
      }
      if (next.type === 'number') {
        if (p.default !== undefined && p.default !== '') next.default = Number(p.default)
        if (p.min !== undefined && String(p.min) !== '') next.min = Number(p.min)
        if (p.max !== undefined && String(p.max) !== '') next.max = Number(p.max)
        if (p.step !== undefined && String(p.step) !== '') next.step = Number(p.step)
      }
      if (next.type === 'boolean') {
        next.default = Boolean(p.default)
      }
      return next
    })
    .filter(Boolean) as ParamDef[]
  return JSON.stringify(normalized)
}

function splitOptions(value: string): string[] {
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

const PARAM_TEMPLATES: Record<string, ParamDef> = {
  aspect_ratio: { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', options: ['16:9', '9:16', '1:1', '4:3', '3:4'], default: '16:9' },
  duration: { key: 'duration', label: 'Duration (seconds)', type: 'select', options: ['5', '6', '8', '10', '15', '20'], default: '5' },
  image_size: { key: 'image_size', label: 'Image Size', type: 'select', options: ['1024x1024', '1536x1024', '1024x1536', '1280x720', '720x1280'], default: '1024x1024' },
  resolution: { key: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
  quality: { key: 'quality', label: 'Quality', type: 'select', options: ['auto', 'standard', 'hd', 'high', 'medium', 'low'], default: 'auto' },
  style: { key: 'style', label: 'Style', type: 'select', options: ['vivid', 'natural'], default: 'vivid' },
  seed: { key: 'seed', label: 'Seed', type: 'number', default: -1, min: -1, max: 2147483647, step: 1 },
  prompt_strength: { key: 'prompt_strength', label: 'Prompt Strength', type: 'number', default: 2.5, min: 1, max: 10, step: 0.1 },
  watermark: { key: 'watermark', label: 'Watermark', type: 'boolean', default: false },
  image_count: { key: 'image_count', label: 'Image Count', type: 'number', default: 1, min: 1, max: 15, step: 1 },
  output_format: { key: 'output_format', label: 'Output Format', type: 'select', options: ['jpeg', 'png', 'webp'], default: 'jpeg' },
  web_search: { key: 'web_search', label: 'Web Search', type: 'boolean', default: false },
  fixed_camera: { key: 'fixed_camera', label: 'Fixed Camera', type: 'boolean', default: false },
  audio: { key: 'audio', label: 'Generate Audio', type: 'boolean', default: true },
  return_last_frame: { key: 'return_last_frame', label: 'Return Last Frame', type: 'boolean', default: false },
  service_tier: { key: 'service_tier', label: 'Service Tier', type: 'select', options: ['default', 'flex'], default: 'default' },
  frames: { key: 'frames', label: 'Frames', type: 'number', min: 29, max: 289, step: 4 },
  execution_expires_after: { key: 'execution_expires_after', label: 'Expiration (seconds)', type: 'number', min: 1, step: 1 },
  preset: { key: 'preset', label: 'Preset', type: 'select', options: ['normal', 'fun', 'spicy', 'custom'], default: 'normal' },
  draft: { key: 'draft', label: 'Draft Mode', type: 'boolean', default: false },
}

function paramTemplateLabel(key: string, fallback: string, t: (key: string, values?: Record<string, unknown>) => string) {
  return t(`admin.params.templates.${key}`, { defaultValue: fallback })
}

function paramTemplateFor(key: string): ParamDef | null {
  return PARAM_TEMPLATES[key] ?? null
}

function adapterParamsForCapabilities(adapter: AdapterDef | undefined, capabilities: string[]): ParamDef[] {
  if (!adapter?.param_sets?.length) return []
  const caps = new Set(capabilities)
  const seen = new Set<string>()
  const params: ParamDef[] = []
  for (const set of adapter.param_sets) {
    if (!caps.has(set.capability)) continue
    for (const raw of set.params ?? []) {
      const p = normalizeParamDefForAdmin(raw)
      if (!p.key || seen.has(p.key)) continue
      seen.add(p.key)
      params.push({ ...p, options: p.options ? [...p.options] : undefined })
    }
  }
  return params
}

function ParamBuilder({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation()
  const params = parseParamDefs(value)
  const update = (index: number, patch: Partial<ParamDef>) => {
    const next = params.map((p, i) => i === index ? { ...p, ...patch } : p)
    onChange(serializeParamDefs(next))
  }
  const remove = (index: number) => onChange(serializeParamDefs(params.filter((_, i) => i !== index)))
  const add = () => onChange(serializeParamDefs([
    ...params,
    { ...PARAM_TEMPLATES.aspect_ratio, label: paramTemplateLabel('aspect_ratio', PARAM_TEMPLATES.aspect_ratio.label, t) },
  ]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('admin.params.title')}</p>
        <button onClick={add} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Plus size={11} /> {t('admin.params.add')}
        </button>
      </div>
      {params.length === 0 && (
        <p className="text-xs text-muted-foreground/70 rounded border border-dashed border-border px-3 py-2">
          {t('admin.params.empty')}
        </p>
      )}
      {params.map((param, index) => (
        <div key={`${param.key}-${index}`} className="rounded border border-border bg-background p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.abstractParam')}</Label>
              <select
                value={paramTemplateFor(param.key) ? param.key : '__custom'}
                onChange={(e) => {
                  const tmpl = PARAM_TEMPLATES[e.target.value]
                  if (tmpl) update(index, { ...tmpl, label: paramTemplateLabel(tmpl.key, tmpl.label, t) })
                }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {Object.values(PARAM_TEMPLATES).map((tmpl) => (
                  <option key={tmpl.key} value={tmpl.key}>{paramTemplateLabel(tmpl.key, tmpl.label, t)}</option>
                ))}
                {!paramTemplateFor(param.key) && <option value="__custom">{param.label || param.key}</option>}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
              <Input className="text-xs" value={param.label} onChange={(e) => update(index, { label: e.target.value })} placeholder={t('admin.params.displayNamePlaceholder')} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.controlType')}</Label>
              <select
                value={param.type}
                onChange={(e) => update(index, { type: e.target.value as ParamDef['type'], options: e.target.value === 'select' ? (param.options?.length ? param.options : ['16:9', '9:16']) : undefined })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="select">{t('admin.params.controlTypes.select')}</option>
                <option value="number">{t('admin.params.controlTypes.number')}</option>
                <option value="boolean">{t('admin.params.controlTypes.boolean')}</option>
              </select>
            </div>
            {param.type === 'select' && (
              <>
                <div className="flex-1 min-w-48">
                  <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.options')}</Label>
                  <Input
                    className="text-xs font-mono"
                    value={(param.options ?? []).join(', ')}
                    onChange={(e) => update(index, { options: splitOptions(e.target.value) })}
                    placeholder="16:9, 9:16, 1:1"
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.defaultValue')}</Label>
                  <Input className="text-xs font-mono" value={String(param.default ?? '')} onChange={(e) => update(index, { default: e.target.value })} />
                </div>
              </>
            )}
            {param.type === 'number' && (
              <>
                {(['default', 'min', 'max', 'step'] as const).map((key) => (
                  <div key={key} className="w-20">
                    <Label className="text-xs text-muted-foreground block mb-0.5">{key}</Label>
                    <Input
                      type="number"
                      className="text-xs"
                      value={String(param[key] ?? '')}
                      onChange={(e) => update(index, { [key]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<ParamDef>)}
                    />
                  </div>
                ))}
              </>
            )}
            {param.type === 'boolean' && (
              <label className="flex items-center gap-2 text-xs cursor-pointer h-8">
                <input type="checkbox" checked={Boolean(param.default)} onChange={(e) => update(index, { default: e.target.checked })} className="rounded" />
                {t('admin.params.defaultOn')}
              </label>
            )}
            <button onClick={() => remove(index)} className="text-xs text-muted-foreground hover:text-destructive h-8 px-2">
              {t('common.delete')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Model Management Tab ──────────────────────────────────────────────────────

function ModelManagementTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [addStep, setAddStep] = useState<'idle' | 'pick' | 'fill'>('idle')
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterDef | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showKey, setShowKey] = useState<Record<number, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  // Add-model panel state per credential
  const [addingFor, setAddingFor] = useState<number | null>(null)
  const [addModelId, setAddModelId] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addCapabilities, setAddCapabilities] = useState<string[]>(['text'])
  const [addBillingMode, setAddBillingMode] = useState('per_token')
  const [addAcceptsImage, setAddAcceptsImage] = useState(false)
  const [addMaxInputImages, setAddMaxInputImages] = useState(0)
  const [addMaxInputVideos, setAddMaxInputVideos] = useState(0)
  const [addImageEditField, setAddImageEditField] = useState('')
  const [addSupportedParams, setAddSupportedParams] = useState('')
  const [addPriceForm, setAddPriceForm] = useState<PriceForm>(defaultPriceForm())
  const [showPresets, setShowPresets] = useState(false)
  // Remote model fetch state (within add panel)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [remoteFetching, setRemoteFetching] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  // Editing existing model config
  const [editingConfig, setEditingConfig] = useState<AIModelConfig | null>(null)
  const [editForm, setEditForm] = useState<ModelEditForm>({
    display_name: '', model_id_override: '', priority: '0', capabilities: [], billing_mode: 'per_token', supported_params: '',
  })
  // Files API editing state
  const [filesAPIEditFor, setFilesAPIEditFor] = useState<number | null>(null)
  const [filesAPIEditEnabled, setFilesAPIEditEnabled] = useState(false)
  const [filesAPIEditBaseURL, setFilesAPIEditBaseURL] = useState('')
  const [filesAPIEditKey, setFilesAPIEditKey] = useState('')
  const [filesAPIEditSaving, setFilesAPIEditSaving] = useState(false)
  // Credential auth/base URL editing state
  const [credentialEditFor, setCredentialEditFor] = useState<number | null>(null)
  const [credentialEditFields, setCredentialEditFields] = useState<Record<string, string>>({})
  // Inline credential name editing
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  const { data: adapters = [] } = useQuery<AdapterDef[]>({
    queryKey: ['admin', 'adapters'],
    queryFn: () => api.get('/admin/adapters').then((r) => r.data),
  })

  const { data: presets = [] } = useQuery<ModelPreset[]>({
    queryKey: ['admin', 'model-presets'],
    queryFn: () => api.get('/admin/model-presets').then((r) => r.data),
  })

  const { data: credentials = [] } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  const deleteCredential = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/credentials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'credentials'] }),
  })

  const toggleCredential = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      api.put(`/admin/credentials/${id}`, { is_enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'credentials'] }),
  })

  const renameCredential = useMutation({
    mutationFn: ({ id, display_name }: { id: number; display_name: string }) =>
      api.put(`/admin/credentials/${id}`, { display_name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setEditingNameId(null)
    },
  })

  const updateCredentialAuth = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Record<string, string> }) => {
      const credentials: Record<string, string> = { base_url: fields.base_url ?? '' }
      Object.entries(fields).forEach(([key, value]) => {
        if (key !== 'base_url' && value.trim()) credentials[key] = value
      })
      return api.put(`/admin/credentials/${id}`, { credentials })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setCredentialEditFor(null)
      setCredentialEditFields({})
    },
  })

  const addModel = useMutation({
    mutationFn: ({ credId, modelId, displayName, capabilities, billingMode, acceptsImage, maxInputImages, maxInputVideos, imageEditField, supportedParams, data }: {
      credId: number; modelId: string; displayName: string; capabilities: string[]
      billingMode: string; acceptsImage: boolean; maxInputImages: number; maxInputVideos: number
      imageEditField: string; supportedParams: string; data: PriceForm
    }) =>
      api.post(`/admin/credentials/${credId}/models`, {
        model_def_id: modelId,
        custom_display_name: displayName || modelId,
        custom_capabilities: capabilities.join(','),
        custom_billing_mode: billingMode,
        custom_accepts_image: acceptsImage,
        custom_max_input_images: maxInputImages,
        custom_max_input_videos: maxInputVideos,
        custom_image_edit_field: imageEditField,
        custom_supported_params: supportedParams,
        credits_input_per_1m: data.credits_input_per_1m,
        credits_output_per_1m: data.credits_output_per_1m,
        credits_per_image: data.credits_per_image,
        credits_per_second: data.credits_per_second,
        credits_per_call: data.credits_per_call,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      closeAddPanel()
    },
  })

  const updateModelConfig = useMutation({
    mutationFn: ({ modelId, data }: { modelId: number; data: typeof editForm }) =>
      api.patch(`/admin/model-configs/${modelId}`, {
        custom_display_name: data.display_name,
        model_id_override: data.model_id_override,
        priority: parseInt(data.priority, 10) || 0,
        custom_capabilities: data.capabilities.join(','),
        custom_billing_mode: data.billing_mode,
        custom_accepts_image: data.capabilities.includes('image_edit') || data.capabilities.includes('video_i2v') || data.capabilities.includes('video_v2v'),
        custom_supported_params: data.supported_params,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setEditingConfig(null)
    },
  })

  const deleteModelConfig = useMutation({
    mutationFn: ({ credId, modelId }: { credId: number; modelId: number }) =>
      api.delete(`/admin/credentials/${credId}/models/${modelId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'credentials'] }),
  })

  function openAddPanel(credId: number) {
    const cred = credentials.find((c) => c.ID === credId)
    const adapter = adapters.find((a) => a.adapter_type === cred?.adapter_type)
    const defaultCaps = ['text']
    setAddingFor(credId)
    setAddModelId('')
    setAddDisplayName('')
    setAddCapabilities(defaultCaps)
    setAddBillingMode('per_token')
    setAddAcceptsImage(false)
    setAddMaxInputImages(0)
    setAddMaxInputVideos(0)
    setAddImageEditField('')
    setAddSupportedParams(serializeParamDefs(adapterParamsForCapabilities(adapter, defaultCaps)))
    setAddPriceForm(defaultPriceForm())
    setRemoteModels([])
    setRemoteError('')
    setShowPresets(false)
  }

  function closeAddPanel() {
    setAddingFor(null)
    setRemoteModels([])
    setRemoteError('')
    setShowPresets(false)
  }

  async function fetchRemoteModels(credId: number) {
    setRemoteFetching(true)
    setRemoteError('')
    setRemoteModels([])
    try {
      const res = await api.get(`/admin/credentials/${credId}/remote-models`).then((r) => r.data)
      setRemoteModels(res.models ?? [])
    } catch (e: any) {
      setRemoteError(translateApiError(e?.response?.data))
    } finally {
      setRemoteFetching(false)
    }
  }

  async function runTest(key: string, fn: () => Promise<TestResult>) {
    setTestingId(key)
    try {
      const result = await fn()
      setTestResults((r) => ({ ...r, [key]: result }))
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [key]: { success: false, message: translateApiError(e?.response?.data), latency_ms: 0 } }))
    } finally {
      setTestingId(null)
    }
  }
  function getAdapterLabel(adapterType: string): string {
    return adapters.find((a) => a.adapter_type === adapterType)?.display_name ?? adapterType
  }

  function openCredentialAuthEdit(cred: AICredential) {
    const adapter = adapters.find((a) => a.adapter_type === cred.adapter_type)
    const next: Record<string, string> = { base_url: cred.base_url ?? '' }
    adapter?.cred_fields.forEach((field) => {
      if (field.key !== 'base_url') next[field.key] = ''
    })
    setCredentialEditFor(cred.ID)
    setCredentialEditFields(next)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.models.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.models.description')}</p>
        </div>
        {addStep === 'idle' && (
          <Button
            onClick={() => setAddStep('pick')}
          >
            <Plus size={14} className="mr-1.5" /> {t('admin.models.addCredential')}
          </Button>
        )}
      </div>

      {addStep === 'pick' && (
        <AdapterPicker
          adapters={adapters}
          onPick={(a) => { setSelectedAdapter(a); setAddStep('fill') }}
          onCancel={() => setAddStep('idle')}
        />
      )}
      {addStep === 'fill' && selectedAdapter && (
        <CredentialForm
          adapter={selectedAdapter}
          onBack={() => setAddStep('pick')}
          onSuccess={() => { setAddStep('idle'); setSelectedAdapter(null) }}
        />
      )}

      <div className="space-y-3">
        {credentials.map((cred) => {
          const testKey = `cred-${cred.ID}`
          const testRes = testResults[testKey]
          const adapter = adapters.find((a) => a.adapter_type === cred.adapter_type)

          return (
            <div key={cred.ID} className="border border-border rounded-lg bg-background overflow-hidden">
              {/* Credential header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedId(expandedId === cred.ID ? null : cred.ID)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedId === cred.ID ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {editingNameId === cred.ID ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-6 text-sm py-0 px-1.5 w-40"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameCredential.mutate({ id: cred.ID, display_name: editingNameValue })
                            if (e.key === 'Escape') setEditingNameId(null)
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => renameCredential.mutate({ id: cred.ID, display_name: editingNameValue })}
                          disabled={renameCredential.isPending}
                          className="text-foreground hover:text-primary"
                        >
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingNameId(null)} className="text-muted-foreground hover:text-foreground">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium">{cred.display_name}</p>
                        <button
                          onClick={() => { setEditingNameId(cred.ID); setEditingNameValue(cred.display_name) }}
                          className="text-muted-foreground/40 hover:text-muted-foreground"
                          title={t('admin.models.renameCredential')}
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {getAdapterLabel(cred.adapter_type)}
                    </span>
                    {cred.models && cred.models.length > 0 && (
                      <span className="text-xs text-muted-foreground">{t('admin.models.modelsCount', { count: cred.models.length })}</span>
                    )}
                  </div>
                  {cred.base_url && <p className="text-xs text-muted-foreground truncate">{cred.base_url}</p>}
                </div>

                {cred.masked_key && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button onClick={() => setShowKey((s) => ({ ...s, [cred.ID]: !s[cred.ID] }))}>
                      {showKey[cred.ID] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <span className="font-mono">{showKey[cred.ID] ? cred.masked_key : '••••••••'}</span>
                  </div>
                )}

                <button
                  onClick={() => runTest(testKey, () => api.post(`/admin/credentials/${cred.ID}/test`, {}).then((r) => r.data))}
                  disabled={testingId === testKey}
                  className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
                >
                  {testingId === testKey ? t('admin.credentials.testing') : t('admin.models.connectionTest')}
                </button>
                {testRes && (
                  <span className={cn('text-xs', testRes.success ? 'text-foreground' : 'text-destructive')}>
                    {testRes.success ? `✓ ${testRes.latency_ms}ms` : t('admin.models.testFailedMark')}
                  </span>
                )}

                <button
                  onClick={() => toggleCredential.mutate({ id: cred.ID, is_enabled: !cred.is_enabled })}
                  title={cred.is_enabled ? t('admin.models.disableCredentialTitle') : t('admin.models.enableCredentialTitle')}
                  className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors',
                    cred.is_enabled
                      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'border-border bg-muted text-muted-foreground hover:border-ring/50')}
                >
                  {cred.is_enabled ? t('admin.models.enabledMark') : t('admin.models.disabledMark')}
                </button>
                <button onClick={() => deleteCredential.mutate(cred.ID)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded: model configs + add panel */}
              {expandedId === cred.ID && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-card">
                  <div className="border border-border rounded-lg bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">{t('admin.models.credentialAuth')}</p>
                      <button
                        onClick={() => credentialEditFor === cred.ID ? setCredentialEditFor(null) : openCredentialAuthEdit(cred)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {credentialEditFor === cred.ID ? t('admin.models.collapse') : t('admin.models.edit')}
                      </button>
                    </div>

                    {credentialEditFor !== cred.ID ? (
                      <div className="grid gap-1 text-xs text-muted-foreground">
                        <p className="truncate">
                          {t('common.baseUrl')}: <span className="font-mono">{cred.base_url || adapter?.default_base_url || t('canvas.unset')}</span>
                        </p>
                        <p>
                          {t('common.apiKey')}: <span className="font-mono">{cred.masked_key || t('canvas.unset')}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-1">{t('common.baseUrl')}</Label>
                          <Input
                            value={credentialEditFields.base_url ?? ''}
                            onChange={(e) => setCredentialEditFields((f) => ({ ...f, base_url: e.target.value }))}
                            placeholder={adapter?.default_base_url || t('admin.models.useAdapterDefaultUrl')}
                            className="text-xs"
                          />
                        </div>
                        {(adapter?.cred_fields.filter((field) => field.key !== 'base_url') ?? []).map((field) => (
                          <div key={field.key}>
                            <Label className="text-xs text-muted-foreground block mb-1">{credentialFieldLabel(field.key, field.label, t)}</Label>
                            <Input
                              type="password"
                              value={credentialEditFields[field.key] ?? ''}
                              onChange={(e) => setCredentialEditFields((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.key === 'api_key' && cred.masked_key ? t('admin.models.leaveBlankKeepCurrent', { value: cred.masked_key }) : t('admin.models.leaveBlankKeep')}
                              className="text-xs"
                            />
                          </div>
                        ))}
                        {updateCredentialAuth.isError && (
                          <p className="text-xs text-destructive">
                            {translateApiError((updateCredentialAuth.error as any)?.response?.data)}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateCredentialAuth.isPending}
                            onClick={() => updateCredentialAuth.mutate({ id: cred.ID, fields: credentialEditFields })}
                          >
                            {updateCredentialAuth.isPending ? t('common.saving') : t('common.save')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setCredentialEditFor(null); setCredentialEditFields({}) }}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{t('admin.models.enabledModels')}</p>
                    {addingFor !== cred.ID && (
                      <button
                        onClick={() => openAddPanel(cred.ID)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Plus size={12} /> {t('admin.models.addModel')}
                      </button>
                    )}
                  </div>

                  {/* Add model panel */}
                  {addingFor === cred.ID && (() => {
                    const capLabels: Record<string, string> = {
                      text: t('admin.capabilities.text'), reasoning: t('admin.capabilities.reasoning'), image: t('admin.capabilities.image'), image_edit: t('admin.capabilities.imageEdit'),
                      video: t('admin.capabilities.video'), video_i2v: t('admin.capabilities.videoI2V'), video_v2v: t('admin.capabilities.videoV2V'),
                    }
                    const billingOptions = [
                      { value: 'per_token', label: t('admin.billing.perToken') },
                      { value: 'per_image', label: t('admin.billing.perImage') },
                      { value: 'per_second', label: t('admin.billing.perSecond') },
                      { value: 'per_call', label: t('admin.billing.perCall') },
                    ]
                    const inferBilling = (caps: string[]) => {
                      if (caps.some(c => c === 'image' || c === 'image_edit')) return 'per_image'
                      if (caps.some(c => c.startsWith('video'))) return 'per_second'
                      return 'per_token'
                    }
                    // Filter presets to this credential's adapter type.
                    const credAdapter = cred.adapter_type
                    const currentAdapter = adapters.find((a) => a.adapter_type === credAdapter)
                    const filteredPresets = presets.filter(p => p.adapter_type === credAdapter)

                    function applyPreset(preset: ModelPreset) {
                      setAddModelId(preset.model_id)
                      setAddDisplayName(preset.display_name)
                      setAddCapabilities(preset.capabilities)
                      setAddBillingMode(preset.billing_mode)
                      setAddAcceptsImage(preset.accepts_image_input ?? false)
                      setAddMaxInputImages(preset.max_input_images ?? 0)
                      setAddMaxInputVideos(preset.max_input_videos ?? 0)
                      setAddImageEditField(preset.image_edit_field ?? '')
                      setAddSupportedParams(serializeParamDefs(adapterParamsForCapabilities(currentAdapter, preset.capabilities)))
                      setShowPresets(false)
                    }

                    return (
                      <div className="border border-border rounded bg-background p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">{t('admin.models.addModel')}</p>
                          <div className="flex items-center gap-2">
                            {filteredPresets.length > 0 && (
                              <button
                                onClick={() => setShowPresets(!showPresets)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <Sparkles size={11} />
                                {showPresets ? t('admin.models.collapsePresets') : t('admin.models.pickPreset')}
                              </button>
                            )}
                            <button
                              onClick={() => fetchRemoteModels(cred.ID)}
                              disabled={remoteFetching}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                            >
                              <RefreshCw size={11} className={remoteFetching ? 'animate-spin' : ''} />
                              {t('admin.models.fetchFromApi')}
                            </button>
                          </div>
                        </div>

                        {/* Preset list — filtered by adapter type */}
                        {showPresets && filteredPresets.length > 0 && (
                          <div className="border border-border rounded bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
                            <p className="text-[10px] text-muted-foreground mb-1">{t('admin.models.presetHint')}</p>
                            {filteredPresets.map((preset) => (
                              <button
                                key={preset.id}
                                onClick={() => applyPreset(preset)}
                                className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="font-medium truncate">{preset.display_name}</span>
                                <span className="text-muted-foreground font-mono shrink-0">{preset.model_id}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Model ID input with remote list */}
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.modelIdLabel')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                            value={addModelId}
                            onChange={(e) => setAddModelId(e.target.value)}
                            placeholder={t('admin.models.modelIdPlaceholder')}
                          />
                        </div>

                        {remoteError && <p className="text-xs text-destructive">{remoteError}</p>}

                        {remoteModels.length > 0 && (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {remoteModels.map((modelId) => (
                              <button
                                key={modelId}
                                onClick={() => setAddModelId(modelId)}
                                className={cn(
                                  'w-full text-left rounded px-2 py-1 text-xs font-mono transition-colors border',
                                  addModelId === modelId ? 'bg-accent border-border' : 'hover:bg-muted/50 border-transparent'
                                )}
                              >
                                {modelId}
                              </button>
                            ))}
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={addDisplayName}
                            onChange={(e) => setAddDisplayName(e.target.value)}
                            placeholder={addModelId || t('admin.models.displayNamePlaceholder')}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capabilitiesLabel')}</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(capLabels).map(([cap, label]) => (
                              <button
                                key={cap}
                                onClick={() => {
                                  const next = addCapabilities.includes(cap)
                                    ? addCapabilities.filter(c => c !== cap)
                                    : [...addCapabilities, cap]
                                  if (next.length > 0) {
                                    setAddCapabilities(next)
                                    setAddBillingMode(inferBilling(next))
                                    const needsImage = next.some(c => c === 'image_edit' || c === 'video_i2v' || c === 'video_v2v')
                                    setAddAcceptsImage(needsImage)
                                    setAddSupportedParams(serializeParamDefs(adapterParamsForCapabilities(currentAdapter, next)))
                                  }
                                }}
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded border transition-colors',
                                  addCapabilities.includes(cap)
                                    ? 'border-ring bg-accent text-foreground'
                                    : 'border-border text-muted-foreground hover:border-ring/50'
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.billingMode')}</Label>
                          <div className="flex gap-2 flex-wrap">
                            {billingOptions.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => setAddBillingMode(opt.value)}
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded border transition-colors',
                                  addBillingMode === opt.value
                                    ? 'border-ring bg-accent text-foreground'
                                    : 'border-border text-muted-foreground hover:border-ring/50'
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Image/video input config */}
                        <div className="flex flex-wrap gap-3 items-center">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={addAcceptsImage}
                              onChange={e => setAddAcceptsImage(e.target.checked)}
                              className="rounded"
                            />
                            {t('admin.models.acceptsImageInput')}
                          </label>
                          {addAcceptsImage && (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">{t('admin.models.maxImages')}</Label>
                              <input
                                type="number"
                                className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                                value={addMaxInputImages}
                                onChange={e => setAddMaxInputImages(Number(e.target.value))}
                                placeholder="1"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">{t('admin.models.maxVideos')}</Label>
                            <input
                              type="number"
                              className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                              value={addMaxInputVideos}
                              onChange={e => setAddMaxInputVideos(Number(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <ParamBuilder value={addSupportedParams} onChange={setAddSupportedParams} />

                        {(() => {
                          const fakeDef = { billing_mode: addBillingMode }
                          return <PriceFields def={fakeDef} form={addPriceForm} onChange={setAddPriceForm} />
                        })()}

                        {addModel.isError && (
                          <p className="text-xs text-destructive">{translateApiError((addModel.error as any)?.response?.data)}</p>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => addModel.mutate({
                              credId: cred.ID,
                              modelId: addModelId.trim(),
                              displayName: addDisplayName.trim(),
                              capabilities: addCapabilities,
                              billingMode: addBillingMode,
                              acceptsImage: addAcceptsImage,
                              maxInputImages: addMaxInputImages,
                              maxInputVideos: addMaxInputVideos,
                              imageEditField: addImageEditField,
                              supportedParams: addSupportedParams,
                              data: addPriceForm,
                            })}
                            disabled={addModel.isPending || !addModelId.trim() || addCapabilities.length === 0}
                            size="sm"
                            className="flex-1"
                          >
                            {addModel.isPending ? '…' : t('admin.models.add')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={closeAddPanel}>{t('common.cancel')}</Button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Active model config rows */}
                  {(cred.models ?? []).map((cfg) => {
                    const modelTestKey = `model-${cfg.ID}`
                    const modelTestRes = testResults[modelTestKey]
                    const isEditing = editingConfig?.ID === cfg.ID
                    const displayName = cfg.custom_display_name || cfg.model_def_id
                    const caps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                    const billing = cfg.custom_billing_mode

                    return (
                      <div key={cfg.ID} className="border border-border rounded bg-background">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{displayName}</span>
                            {cfg.model_id_override && (
                              <span className="ml-2 font-mono text-muted-foreground text-xs">{cfg.model_id_override}</span>
                            )}
                          </div>
                          {caps.length > 0 && (
                            <span className="text-muted-foreground">{caps.join(',')}</span>
                          )}
                          {billing && (
                            <span className="text-muted-foreground/50">{BILLING_LABEL_KEYS[billing] ? t(BILLING_LABEL_KEYS[billing]) : billing}</span>
                          )}
                          <button
                            onClick={() => runTest(modelTestKey, () =>
                              api.post(`/admin/credentials/${cred.ID}/models/${cfg.ID}/test`, {}).then((r) => r.data)
                            )}
                            disabled={testingId === modelTestKey}
                            className="text-muted-foreground/50 hover:text-foreground border border-border rounded px-1.5 py-0.5"
                          >
                            {testingId === modelTestKey ? '…' : t('admin.models.test')}
                          </button>
                          {modelTestRes && (
                            <span className={cn('text-xs', modelTestRes.success ? 'text-foreground' : 'text-destructive')}>
                              {modelTestRes.success ? '✓' : '✗'}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const nextCaps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                              setEditingConfig(cfg)
                              setEditForm({
                                display_name: cfg.custom_display_name,
                                model_id_override: cfg.model_id_override,
                                priority: String(cfg.priority ?? 0),
                                capabilities: nextCaps,
                                billing_mode: cfg.custom_billing_mode || 'per_token',
                                supported_params: cfg.custom_supported_params || serializeParamDefs(adapterParamsForCapabilities(adapter, nextCaps)),
                              })
                            }}
                            className="text-muted-foreground/50 hover:text-foreground"
                          >
                            {t('admin.models.edit')}
                          </button>
                          <button
                            onClick={() => deleteModelConfig.mutate({ credId: cred.ID, modelId: cfg.ID })}
                            className="text-muted-foreground/50 hover:text-destructive"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {isEditing && (
                          <div className="border-t border-border px-3 py-2 space-y-2 bg-card">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                                <Input
                                  className="text-xs"
                                  value={editForm.display_name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                                  placeholder={cfg.model_def_id}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('common.modelIdOverride')}</Label>
                                <Input
                                  className="text-xs font-mono"
                                  value={editForm.model_id_override}
                                  onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                                  placeholder={t('admin.features.modelIdOverrideShortPlaceholder')}
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capabilitiesLabel')}</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {(['text', 'reasoning', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] as const).map((cap) => {
                                  const labelKey = { text: 'admin.capabilities.text', reasoning: 'admin.capabilities.reasoning', image: 'admin.capabilities.image', image_edit: 'admin.capabilities.imageEdit', video: 'admin.capabilities.video', video_i2v: 'admin.capabilities.videoI2V', video_v2v: 'admin.capabilities.videoV2V' }[cap]
                                  const active = editForm.capabilities.includes(cap)
                                  return (
                                    <button
                                      key={cap}
                                      onClick={() => {
                                        const next = active
                                          ? editForm.capabilities.filter((c) => c !== cap)
                                          : [...editForm.capabilities, cap]
                                        if (next.length > 0) {
                                          setEditForm((f) => ({
                                            ...f,
                                            capabilities: next,
                                            supported_params: serializeParamDefs(adapterParamsForCapabilities(adapter, next)),
                                          }))
                                        }
                                      }}
                                      className={cn(
                                        'text-xs px-2 py-0.5 rounded border transition-colors',
                                        active ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
                                      )}
                                    >
                                      {t(labelKey)}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.billingMode')}</Label>
                              <div className="flex gap-1.5 flex-wrap">
                                {([{ value: 'per_token', label: t('admin.billing.perToken') }, { value: 'per_image', label: t('admin.billing.perImage') }, { value: 'per_second', label: t('admin.billing.perSecond') }, { value: 'per_call', label: t('admin.billing.perCall') }]).map((opt) => (
                                  <button
                                    key={opt.value}
                                    onClick={() => setEditForm((f) => ({ ...f, billing_mode: opt.value }))}
                                    className={cn(
                                      'text-xs px-2 py-0.5 rounded border transition-colors',
                                      editForm.billing_mode === opt.value ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <ParamBuilder
                              value={editForm.supported_params}
                              onChange={(next) => setEditForm((f) => ({ ...f, supported_params: next }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => updateModelConfig.mutate({ modelId: cfg.ID, data: editForm })}
                                disabled={updateModelConfig.isPending}
                                size="sm"
                                className="flex-1"
                              >
                                {t('common.save')}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setEditingConfig(null)}>
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {(!cred.models || cred.models.length === 0) && addingFor !== cred.ID && (
                    <p className="text-xs text-muted-foreground">
                      {t('admin.models.noModelsHint')}
                    </p>
                  )}

                  {/* Files API config — shown only for adapters that support it */}
                  {adapter?.supports_files_api && (() => {
                    const isEditing = filesAPIEditFor === cred.ID
                    return (
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground">{t('admin.credentials.filesAPIPreupload')}</p>
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setFilesAPIEditFor(null)
                              } else {
                                setFilesAPIEditFor(cred.ID)
                                setFilesAPIEditEnabled(cred.files_api_enabled ?? false)
                                setFilesAPIEditBaseURL(cred.files_api_base_url ?? '')
                                setFilesAPIEditKey('')
                              }
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isEditing ? t('admin.models.collapse') : t('admin.credentials.configure')}
                          </button>
                        </div>
                        {!isEditing && (
                          <p className="text-xs text-muted-foreground">
                            {cred.files_api_enabled
                              ? <span className="text-green-600 dark:text-green-400">{t('admin.models.enabledMark')}</span>
                              : <span>{t('admin.credentials.notEnabledMark')}</span>
                            }
                          </p>
                        )}
                        {isEditing && (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filesAPIEditEnabled}
                                onChange={e => setFilesAPIEditEnabled(e.target.checked)}
                                className="rounded"
                              />
                              {t('admin.credentials.enableFilesAPIDetail')}
                            </label>
                            {filesAPIEditEnabled && (
                              <>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIBaseURLCredential')}</Label>
                                  <Input
                                    value={filesAPIEditBaseURL}
                                    onChange={e => setFilesAPIEditBaseURL(e.target.value)}
                                    placeholder={cred.base_url || t('admin.credentials.leaveBlankUseCredentialBaseURL')}
                                    className="text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIKeyCredential')}</Label>
                                  <Input
                                    type="password"
                                    value={filesAPIEditKey}
                                    onChange={e => setFilesAPIEditKey(e.target.value)}
                                    placeholder={t('admin.credentials.leaveBlankUseMainKey')}
                                    className="text-xs"
                                  />
                                </div>
                              </>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={filesAPIEditSaving}
                                onClick={async () => {
                                  setFilesAPIEditSaving(true)
                                  try {
                                    const body: Record<string, unknown> = {
                                      files_api_enabled: filesAPIEditEnabled,
                                      files_api_base_url: filesAPIEditBaseURL,
                                    }
                                    if (filesAPIEditKey) body.files_api_key = filesAPIEditKey
                                    await api.put(`/admin/credentials/${cred.ID}`, body)
                                    qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
                                    setFilesAPIEditFor(null)
                                  } finally {
                                    setFilesAPIEditSaving(false)
                                  }
                                }}
                              >
                                {filesAPIEditSaving ? '…' : t('common.save')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setFilesAPIEditFor(null)}>{t('common.cancel')}</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}

        {credentials.length === 0 && addStep === 'idle' && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('admin.models.noCredentialsHint')}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Tab 2: 用户管理 ────────────────────────────────────────────────────────────

interface UserWithQuota {
  ID: number
  username: string
  system_role: string
  balance: number
}

function UserManagementTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [quotaDialog, setQuotaDialog] = useState<UserWithQuota | null>(null)
  const [newBalance, setNewBalance] = useState('')

  const { data: users = [] } = useQuery<UserWithQuota[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })

  const setQuota = useMutation({
    mutationFn: ({ id, balance }: { id: number; balance: number }) =>
      api.put(`/admin/users/${id}/quota`, { balance }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); setQuotaDialog(null) },
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('admin.users.title')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('admin.users.description')}</p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.users.username')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.users.role')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.users.creditsBalance')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.ID} className="hover:bg-card">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {u.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-sm">
                  {u.balance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => { setQuotaDialog(u); setNewBalance(String(u.balance)) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('admin.users.recharge')}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">{t('admin.users.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {quotaDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-80 p-5 space-y-4">
            <h3 className="text-sm font-semibold">{t('admin.users.setBalanceTitle', { username: quotaDialog.username })}</h3>
            <div>
              <Label className="text-xs text-muted-foreground block mb-1">{t('admin.users.newBalance')}</Label>
              <Input
                type="number" min="0" step="1"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setQuota.mutate({ id: quotaDialog.ID, balance: Number(newBalance) })}
                disabled={setQuota.isPending}
                className="flex-1"
              >
                {t('common.save')}
              </Button>
              <Button variant="outline" onClick={() => setQuotaDialog(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: 用量日志 ────────────────────────────────────────────────────────────

function UsageLogsTab() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const [modelFilter, setModelFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const pageSize = 50

  const { data } = useQuery<{ total: number; items: UsageLog[] }>({
    queryKey: ['admin', 'usage-logs', page, modelFilter, providerFilter, userFilter],
    queryFn: () => api.get('/admin/usage-logs', {
      params: {
        page,
        page_size: pageSize,
        model_config_id: modelFilter || undefined,
        provider_id: providerFilter || undefined,
        user_id: userFilter || undefined,
      },
    }).then((r) => r.data),
  })

  const { data: credentials = [] } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  const { data: users = [] } = useQuery<UserWithQuota[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const models = credentials.flatMap(cred => (cred.models ?? []).map(model => ({ ...model, providerName: cred.display_name })))
  const providerById = new Map(credentials.map(c => [c.ID, c.display_name]))

  function formatDate(s: string) {
    return new Date(s).toLocaleString(i18n.language, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function modelName(log: UsageLog): string {
    const cfg = log.ai_model_config
    if (cfg) return cfg.custom_display_name || cfg.model_def_id
    return String(log.ai_model_config_id)
  }

  function providerName(log: UsageLog): string {
    const credentialId = log.ai_model_config?.credential_id
    return credentialId ? providerById.get(credentialId) ?? String(credentialId) : '—'
  }

  function usageDetail(log: UsageLog): string {
    if (log.input_tokens > 0 || log.output_tokens > 0) {
      return `${log.input_tokens.toLocaleString()} / ${log.output_tokens.toLocaleString()}`
    }
    if (log.duration_sec > 0) return `${log.duration_sec}s`
    if (log.image_count > 0) return `×${log.image_count}`
    return '—'
  }

  const opLabel: Record<string, string> = {
    text: t('admin.logs.operations.text'),
    image: t('admin.logs.operations.image'),
    video: t('admin.logs.operations.video'),
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('admin.logs.title')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('admin.logs.total', { total })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <select
          value={providerFilter}
          onChange={e => { setProviderFilter(e.target.value); setModelFilter(''); setPage(1) }}
          className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('admin.logs.allProviders')}</option>
          {credentials.map(cred => (
            <option key={cred.ID} value={cred.ID}>{cred.display_name}</option>
          ))}
        </select>
        <select
          value={modelFilter}
          onChange={e => { setModelFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('admin.logs.allModels')}</option>
          {models
            .filter(model => !providerFilter || String(model.credential_id) === providerFilter)
            .map(model => (
              <option key={model.ID} value={model.ID}>
                {(model.custom_display_name || model.model_def_id)} · {model.providerName}
              </option>
            ))}
        </select>
        <select
          value={userFilter}
          onChange={e => { setUserFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('admin.logs.allUsers')}</option>
          {users.map(u => (
            <option key={u.ID} value={u.ID}>{u.username}</option>
          ))}
        </select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.time')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.user')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.provider')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.model')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.type')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.logs.usage')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.credits')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((log) => (
              <tr key={log.ID} className="hover:bg-card text-xs">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(log.CreatedAt)}</td>
                <td className="px-4 py-2.5">{log.user?.username ?? log.user_id}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{providerName(log)}</td>
                <td className="px-4 py-2.5 text-foreground">{modelName(log)}</td>
                <td className="px-4 py-2.5">{opLabel[log.operation_type] ?? log.operation_type}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{usageDetail(log)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{log.cost.toFixed(3)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('admin.logs.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('admin.logs.previousPage')}</Button>
        <span className="text-muted-foreground">{page} / {pageCount}</span>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>{t('admin.logs.nextPage')}</Button>
      </div>
    </div>
  )
}

// ── Tab 4: 功能模型配置 ────────────────────────────────────────────────────────

const CAPABILITY_TRANSLATION_KEYS: Record<string, string> = {
  text: 'admin.capabilities.text',
  reasoning: 'admin.capabilities.reasoning',
  image: 'admin.capabilities.image',
  image_edit: 'admin.capabilities.imageEdit',
  video: 'admin.capabilities.video',
  video_i2v: 'admin.capabilities.videoI2V',
  video_v2v: 'admin.capabilities.videoV2V',
}
const CAPABILITY_COLOR: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reasoning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  image_edit: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  video: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

function FeatureRow({
  feature,
  onUpdate,
  onUpdatePrompt,
  onGoToModels,
  isPending,
}: {
  feature: FeatureConfig
  onUpdate: (data: { is_enabled?: boolean; allowed_model_ids?: number[]; default_model_id?: number | null; allowed_roles?: string[] }) => void
  onUpdatePrompt: (data: { system_prompt_override?: string; max_tokens_override?: number }) => void
  onGoToModels: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptOverride, setPromptOverride] = useState(feature.system_prompt_override)
  const [promptSaved, setPromptSaved] = useState(false)
  // Inline model editing state: modelId → edit form open
  const [editingModelId, setEditingModelId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ custom_display_name: string; model_id_override: string; priority: string }>({
    custom_display_name: '', model_id_override: '', priority: '0',
  })

  // Query models for this specific feature — backend decides which capabilities are compatible.
  const { data: availableModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'feature', feature.feature_key],
    queryFn: () => api.get(`/models?feature=${feature.feature_key}`).then((r) => r.data),
  })

  const allowed = new Set(feature.allowed_model_ids)

  const patchModel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/admin/model-configs/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setEditingModelId(null)
    },
  })

  function toggleModel(id: number) {
    const next = new Set(allowed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onUpdate({ allowed_model_ids: Array.from(next) })
  }

  function openEdit(m: PublicModel) {
    setEditingModelId(m.id)
    setEditForm({
      custom_display_name: m.display_name,
      model_id_override: m.model_id_override ?? '',
      priority: '0',
    })
  }

  function saveEdit(id: number) {
    patchModel.mutate({
      id,
      data: {
        custom_display_name: editForm.custom_display_name,
        model_id_override: editForm.model_id_override,
        priority: Number(editForm.priority),
      },
    })
  }

  function savePrompt() {
    onUpdatePrompt({ system_prompt_override: promptOverride })
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
  }

  const effectivePrompt = promptOverride || feature.default_system_prompt
  const hasOverride = promptOverride !== '' && promptOverride !== feature.default_system_prompt
  const isTextCap = feature.capability === 'text' || feature.capability === 'reasoning'

  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{featureDisplayName(feature, t)}</p>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', CAPABILITY_COLOR[feature.capability] ?? 'bg-muted text-muted-foreground')}>
              {CAPABILITY_TRANSLATION_KEYS[feature.capability] ? t(CAPABILITY_TRANSLATION_KEYS[feature.capability]) : feature.capability}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{feature.feature_key}</span>
            {feature.max_tokens > 0 && (
              <span className="text-xs text-muted-foreground/60">max {feature.max_tokens}t</span>
            )}
          </div>
          {feature.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{featureDescription(feature, t)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {isTextCap && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title={t('admin.features.systemPrompt')}
            >
              {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {t('admin.features.prompt')}{hasOverride && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          )}
          <button
            disabled={isPending}
            onClick={() => onUpdate({ is_enabled: !feature.is_enabled })}
            className={cn(
              'text-xs px-2 py-0.5 rounded-full transition-colors',
              feature.is_enabled ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {feature.is_enabled ? t('admin.features.enabled') : t('admin.features.disabled')}
          </button>
        </div>
      </div>

      {/* System prompt section — text features only */}
      {isTextCap && showPrompt && (
        <div className="border-t border-border px-4 py-3 bg-card space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t('admin.features.defaultSystemPrompt')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.defaultSystemPromptHint')}</span>
            </p>
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
              {feature.default_system_prompt || t('admin.features.noSystemPrompt')}
            </pre>
          </div>
          {feature.output_schema && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">{t('admin.features.outputSchema')}</p>
              <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
                {feature.output_schema}
              </pre>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t('admin.features.customOverride')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.customOverrideHint')}</span>
            </p>
            <textarea
              value={promptOverride}
              onChange={(e) => setPromptOverride(e.target.value)}
              placeholder={effectivePrompt}
              rows={3}
              className="w-full text-xs font-mono border border-border rounded p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={savePrompt}
                disabled={isPending}
                className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {promptSaved ? t('admin.features.saved') : t('admin.features.saveOverride')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model selector */}
      <div className="border-t border-border px-4 py-3 bg-card space-y-2">
        <p className="text-xs text-muted-foreground">
          {t('admin.features.availableModels')}
          <span className="ml-1 text-muted-foreground/60">
            {allowed.size === 0 ? t('admin.features.unrestrictedModelsHint') : t('admin.features.selectedModelsHint', { count: allowed.size })}
          </span>
        </p>
        {availableModels.length === 0 ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground/60">{t('admin.features.noConfiguredModels', { capability: CAPABILITY_TRANSLATION_KEYS[feature.capability] ? t(CAPABILITY_TRANSLATION_KEYS[feature.capability]) : feature.capability })}</p>
            <button
              onClick={onGoToModels}
              className="text-xs text-primary hover:underline"
            >
              {t('admin.features.goToModels')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {availableModels.map((m) => (
              <div key={m.id}>
                {/* Model chip row */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={isPending}
                    onClick={() => toggleModel(m.id)}
                    className={cn(
                      'flex-1 text-xs px-2.5 py-1 rounded border transition-colors text-left',
                      allowed.has(m.id)
                        ? 'border-ring bg-accent text-foreground font-medium'
                        : 'border-border bg-background text-muted-foreground hover:border-ring/50 hover:text-foreground'
                    )}
                  >
                    {m.provider_name && <span className="text-muted-foreground/70">{m.provider_name} / </span>}
                    {m.display_name}
                    {m.model_id_override && (
                      <span className="ml-1.5 font-mono text-muted-foreground/50">{m.model_id_override}</span>
                    )}
                    {m.accepts_image_input && (
                      <span className="ml-1.5 text-muted-foreground/50">{t('admin.features.imageInputMark')}</span>
                    )}
                  </button>
                  <button
                    onClick={() => editingModelId === m.id ? setEditingModelId(null) : openEdit(m)}
                    className="text-muted-foreground/40 hover:text-muted-foreground p-1"
                    title={t('admin.features.editModelConfig')}
                  >
                    {editingModelId === m.id ? <X size={12} /> : <Pencil size={12} />}
                  </button>
                </div>

                {/* Inline edit panel */}
                {editingModelId === m.id && (
                  <div className="ml-0 mt-1 border border-border rounded bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                        <Input
                          className="text-xs h-7"
                          value={editForm.custom_display_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, custom_display_name: e.target.value }))}
                          placeholder={t('admin.features.leaveBlankUseModelId')}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('common.modelIdOverride')}</Label>
                        <Input
                          className="text-xs h-7 font-mono"
                          value={editForm.model_id_override}
                          onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                          placeholder={t('admin.features.modelIdOverridePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.features.priority')}</Label>
                        <Input
                          type="number"
                          className="text-xs h-7"
                          value={editForm.priority}
                          onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => saveEdit(m.id)}
                          disabled={patchModel.isPending}
                        >
                          {patchModel.isPending ? '…' : t('common.save')}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingModelId(null)}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                    {patchModel.isError && (
                      <p className="text-xs text-destructive">{translateApiError((patchModel.error as any)?.response?.data)}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Default model selector */}
        {availableModels.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('admin.features.defaultModel')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.defaultModelHint')}</span>
            </p>
            <select
              disabled={isPending}
              value={feature.default_model_id ?? ''}
              onChange={(e) => {
                const val = e.target.value
                onUpdate({ default_model_id: val === '' ? null : Number(val) })
              }}
              className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t('admin.features.autoHighestPriority')}</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider_name ? `${m.provider_name} / ${m.display_name}` : m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Allowed roles */}
        <div className="pt-1 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-1">
            {t('admin.features.accessRoles')}
            <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.accessRolesHint')}</span>
          </p>
          <div className="flex items-center gap-3">
            {(['owner', 'editor', 'viewer'] as const).map((role) => {
              const checked = feature.allowed_roles.includes(role)
              const roleLabel: Record<string, string> = { owner: t('admin.features.roles.owner'), editor: t('admin.features.roles.editor'), viewer: t('admin.features.roles.viewer') }
              return (
                <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isPending}
                    onChange={() => {
                      const next = checked
                        ? feature.allowed_roles.filter((r) => r !== role)
                        : [...feature.allowed_roles, role]
                      onUpdate({ allowed_roles: next })
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-foreground">{roleLabel[role]}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureConfigTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [, setSearchParams] = useSearchParams()

  const { data: features = [] } = useQuery<FeatureConfig[]>({
    queryKey: ['admin', 'features'],
    queryFn: () => api.get('/admin/features').then((r) => r.data),
  })

  const update = useMutation({
    mutationFn: ({ key, data }: { key: string; data: { is_enabled?: boolean; allowed_model_ids?: number[]; default_model_id?: number | null; allowed_roles?: string[] } }) =>
      api.put(`/admin/features/${key}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'features'] })
      qc.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, data }: { key: string; data: { system_prompt_override?: string; max_tokens_override?: number } }) =>
      api.put(`/admin/features/${key}/prompt`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'features'] }),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('admin.features.title')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('admin.features.description')}
        </p>
      </div>

      {features.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('common.loadingShort')}</p>
      )}

      <div className="space-y-3">
        {features.filter((f) => !f.is_internal).map((f) => (
          <FeatureRow
            key={f.feature_key}
            feature={f}
            isPending={update.isPending || updatePrompt.isPending}
            onUpdate={(data) => update.mutate({ key: f.feature_key, data })}
            onUpdatePrompt={(data) => updatePrompt.mutate({ key: f.feature_key, data })}
            onGoToModels={() => setSearchParams({ tab: 'models' })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Tab: 存储配置 ──────────────────────────────────────────────────────────────
function StorageTab() {
  const { t } = useTranslation()
  const { data: backends } = useQuery<{ default: string; backends: { name: string; available: boolean }[] }>({
    queryKey: ['admin-storage-backends'],
    queryFn: () => api.get('/admin/resource-storage/backends').then(r => r.data),
  })

  const { data: stats = [] } = useQuery<{
    user_id: number
    username: string
    storage_backend: string
    count: number
    total_size: number
  }[]>({
    queryKey: ['admin-storage-stats'],
    queryFn: () => api.get('/admin/resource-storage/stats').then(r => r.data),
  })

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  // Group by user
  const byUser: Record<number, { username: string; backends: Record<string, { count: number; size: number }> }> = {}
  for (const row of stats) {
    if (!byUser[row.user_id]) byUser[row.user_id] = { username: row.username, backends: {} }
    byUser[row.user_id].backends[row.storage_backend] = { count: row.count, size: row.total_size }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.internalStorage')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.internalStorageDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.modelInputRelay')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.modelInputRelayDescription')}
          </p>
        </div>
      </div>

      {/* Backend status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.internalBackends')}</h3>
        <div className="flex gap-3 flex-wrap">
          {(backends?.backends ?? []).map(b => (
            <div key={b.name} className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm">
              {b.name === 'local'
                ? <span className="i-lucide-hard-drive text-muted-foreground" />
                : <span className="i-lucide-cloud text-blue-400" />
              }
              <span className="font-medium capitalize">{b.name}</span>
              {b.name === backends?.default && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t('admin.storage.default')}</span>
              )}
              <span className="text-xs text-green-500">{t('admin.storage.available')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.userResourceUsage')}</h3>
        {Object.keys(byUser).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.storage.noResourceData')}</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.logs.user')}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.internalBackend')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.fileCount')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.usedSpace')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byUser).flatMap(([uid, u]) =>
                  Object.entries(u.backends).map(([backend, info], idx) => (
                    <tr key={`${uid}-${backend}`} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-foreground">{idx === 0 ? u.username : ''}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{backend}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{info.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatBytes(info.size)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: 云端文件存储 ──────────────────────────────────────────────────────────

const CONFIG_TYPE_LABELS: Record<string, string> = {
  s3: 'AWS S3',
  oss: 'Alibaba Cloud OSS',
  tos: 'Volcengine TOS',
}

const CONFIG_TYPE_FIELDS: Record<string, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  s3: [
    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
    { key: 'access_key', label: 'Access Key', placeholder: 'AKIA...', secret: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.s3.amazonaws.com' },
  ],
  oss: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'oss-cn-hangzhou.aliyuncs.com' },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '...', secret: true },
    { key: 'access_key_secret', label: 'Access Key Secret', placeholder: '...', secret: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.oss-cn-hangzhou.aliyuncs.com' },
  ],
  tos: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'tos-cn-beijing.volces.com' },
    { key: 'region', label: 'Region', placeholder: 'cn-beijing' },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
    { key: 'access_key', label: 'Access Key', placeholder: '...', secret: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.tos-cn-beijing.volces.com' },
  ],
}

interface CloudFileConfig {
  ID: number
  name: string
  config_type: string
  priority: number
  is_enabled: boolean
  masked_config: string
}

function CloudFileConfigTab() {
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

  const { data: configs = [], refetch } = useQuery<CloudFileConfig[]>({
    queryKey: ['admin-cloud-file-configs'],
    queryFn: () => api.get('/admin/cloud-file-configs').then(r => r.data),
  })

  function openCreate() {
    setEditingId(null)
    setFormType('s3')
    setFormName('')
    setFormPriority(configs.length)
    setFormEnabled(true)
    setFormFields({})
    setShowForm(true)
  }

  function openEdit(cfg: CloudFileConfig) {
    setEditingId(cfg.ID)
    setFormType(cfg.config_type)
    setFormName(cfg.name)
    setFormPriority(cfg.priority)
    setFormEnabled(cfg.is_enabled)
    const masked = cfg.masked_config ? JSON.parse(cfg.masked_config) : {}
    const secretKeys = new Set((CONFIG_TYPE_FIELDS[cfg.config_type] ?? []).filter((f) => f.secret).map((f) => f.key))
    const next: Record<string, string> = {}
    Object.entries(masked).forEach(([key, value]) => {
      next[key] = secretKeys.has(key) ? '' : String(value ?? '')
    })
    setFormFields(next)
    setShowForm(true)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = { name: formName, config_type: formType, config: formFields, priority: formPriority, is_enabled: formEnabled }
      if (editingId) {
        await api.put(`/admin/cloud-file-configs/${editingId}`, payload)
      } else {
        await api.post('/admin/cloud-file-configs', payload)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(cfg: CloudFileConfig) {
    await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { is_enabled: !cfg.is_enabled })
    refetch()
  }

  async function deleteCfg(id: number) {
    if (!confirm(t('admin.cloudFiles.confirmDelete'))) return
    await api.delete(`/admin/cloud-file-configs/${id}`)
    queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
  }

  async function movePriority(cfg: CloudFileConfig, dir: -1 | 1) {
    await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { priority: cfg.priority + dir })
    refetch()
  }

  const fields = CONFIG_TYPE_FIELDS[formType] ?? []

  return (
    <div className="space-y-6">
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
        <Button size="sm" onClick={openCreate}>{t('admin.cloudFiles.addConfig')}</Button>
      </div>

      {configs.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.cloudFiles.empty')}</p>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => {
          const masked = cfg.masked_config ? JSON.parse(cfg.masked_config) : {}
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
                      ? <span className="text-xs text-green-500">{t('admin.cloudFiles.enabledMark')}</span>
                      : <span className="text-xs text-muted-foreground">{t('admin.cloudFiles.disabledMark')}</span>
                    }
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {Object.entries(masked).filter(([k]) => !['access_key','secret_key','api_key','access_key_id','access_key_secret'].includes(k)).map(([k,v]) => `${k}=${v}`).join('  ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggleEnabled(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">
                    {cfg.is_enabled ? t('admin.cloudFiles.disable') : t('admin.cloudFiles.enable')}
                  </button>
                  <button onClick={() => openEdit(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">{t('admin.models.edit')}</button>
                  <button onClick={() => deleteCfg(cfg.ID)} className="text-xs border border-destructive/30 rounded px-2 py-1 text-destructive/70 hover:text-destructive transition-colors">{t('common.delete')}</button>
                </div>
              </div>
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
                <Label className="text-xs">{t(`admin.cloudFiles.fields.${f.key}`, { defaultValue: f.label })}</Label>
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
            <Button size="sm" onClick={save} disabled={saving || !formName}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'models'

  if (currentUser?.system_role !== 'super_admin') {
    navigate('/projects', { replace: true })
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('admin.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.subtitle')}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="models">{t('admin.tabs.models')}</TabsTrigger>
          <TabsTrigger value="agents">{t('admin.tabs.agents')}</TabsTrigger>
          <TabsTrigger value="features">{t('admin.tabs.features')}</TabsTrigger>
          <TabsTrigger value="users">{t('admin.tabs.users')}</TabsTrigger>
          <TabsTrigger value="logs">{t('admin.tabs.logs')}</TabsTrigger>
          <TabsTrigger value="debug">{t('admin.tabs.debug')}</TabsTrigger>
          <TabsTrigger value="storage">{t('admin.tabs.storage')}</TabsTrigger>
          <TabsTrigger value="cloud-files">{t('admin.tabs.cloudFiles')}</TabsTrigger>
        </TabsList>
        <TabsContent value="models" className="mt-6">
          <ModelManagementTab />
        </TabsContent>
        <TabsContent value="agents" className="mt-6">
          <AgentConfigTab />
        </TabsContent>
        <TabsContent value="features" className="mt-6">
          <FeatureConfigTab />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <UsageLogsTab />
        </TabsContent>
        <TabsContent value="debug" className="mt-6">
          <DebugPage />
        </TabsContent>
        <TabsContent value="storage" className="mt-6">
          <StorageTab />
        </TabsContent>
        <TabsContent value="cloud-files" className="mt-6">
          <CloudFileConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

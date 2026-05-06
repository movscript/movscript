import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AICredential, AIModelConfig, AdapterDef, ModelPreset, UsageLog, FeatureConfig, PublicModel, ParamDef, ModelParamProfile, Project, User } from '@/types'
import { useUserStore } from '@/store/userStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, ArrowLeft, Pencil, Check, X, RefreshCw, Sparkles, Copy, UsersRound, Gauge, Coins, ArrowUpRight, Settings2, Route, FolderKanban, ScrollText, HardDrive, CloudUpload, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { translateApiError } from '@/lib/apiError'
import { publicModelLabel } from '@/lib/modelDisplay'

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

function runtimeModelConfigFromAdmin(cred: AICredential, cfg: AIModelConfig, defaultBaseURL?: string) {
  return {
    schema: 'movscript.runtimeModelConfig.v1',
    provider: 'openai-compatible',
    baseURL: cred.base_url || defaultBaseURL || '',
    model: cfg.model_id_override || cfg.model_def_id,
    useForChat: true,
    useForPlanner: true,
    source: {
      credentialId: cred.ID,
      credentialName: cred.display_name,
      adapterType: cred.adapter_type,
      modelConfigId: cfg.ID,
      modelName: cfg.custom_display_name || cfg.short_name || cfg.model_def_id,
    },
    note: 'API key is not included because admin credentials are masked in the browser. Paste this into admin Agent Debug and enter the key there if needed.',
  }
}

type ModelEditForm = {
  display_name: string
  short_name: string
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

function emptyParamProfile(): ModelParamProfile {
  return { deny: [], override: {}, add: [] }
}

function parseModelParamProfile(value: string): ModelParamProfile {
  if (!value.trim()) return emptyParamProfile()
  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return emptyParamProfile()
    const raw = parsed as ModelParamProfile
    const profile: ModelParamProfile = {}
    if (Array.isArray(raw.allow)) profile.allow = raw.allow.map(String).filter(Boolean)
    if (Array.isArray(raw.deny)) profile.deny = raw.deny.map(String).filter(Boolean)
    if (raw.override && typeof raw.override === 'object' && !Array.isArray(raw.override)) {
      profile.override = {}
      Object.entries(raw.override).forEach(([key, param]) => {
        if (param && typeof param === 'object') profile.override![key] = normalizeParamDefForAdmin(param as ParamDef)
      })
    }
    if (Array.isArray(raw.add)) profile.add = raw.add.filter((p) => p && typeof p === 'object').map((p) => normalizeParamDefForAdmin(p as ParamDef))
    return profile
  } catch {
    return emptyParamProfile()
  }
}

function serializeModelParamProfile(profile: ModelParamProfile): string {
  const next: ModelParamProfile = {}
  const allow = (profile.allow ?? []).map(String).map((s) => s.trim()).filter(Boolean)
  const deny = (profile.deny ?? []).map(String).map((s) => s.trim()).filter(Boolean)
  const add = parseParamDefs(serializeParamDefs(profile.add ?? []))
  const overrideEntries = Object.entries(profile.override ?? {})
    .map(([key, param]) => [key.trim(), parseParamDefs(serializeParamDefs([{ ...param, key: param.key || key }]))[0]] as const)
    .filter(([key, param]) => key && param)
  if (allow.length > 0) next.allow = allow
  if (deny.length > 0) next.deny = deny
  if (overrideEntries.length > 0) {
    next.override = {}
    overrideEntries.forEach(([key, param]) => { next.override![key] = param })
  }
  if (add.length > 0) next.add = add
  return JSON.stringify(next)
}

function isProfileParamConfig(value: string): boolean {
  if (!value.trim()) return true
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
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
  max_tokens: { key: 'max_tokens', label: 'Max Tokens', type: 'number', min: 1, max: 1000000, step: 1 },
  temperature: { key: 'temperature', label: 'Temperature', type: 'number', default: -1, min: -1, max: 2, step: 0.1 },
  json_mode: { key: 'json_mode', label: 'JSON Mode', type: 'boolean', default: false },
  sequential_image_generation: { key: 'sequential_image_generation', label: 'Sequential Images', type: 'select', options: ['disabled', 'auto'], default: 'disabled' },
  optimize_prompt_mode: { key: 'optimize_prompt_mode', label: 'Prompt Optimization', type: 'select', options: ['standard', 'fast'], default: 'standard' },
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

function ParamConfigBuilder({
  value,
  onChange,
  adapterParams,
}: {
  value: string
  onChange: (next: string) => void
  adapterParams: ParamDef[]
}) {
  const { t } = useTranslation()
  const mode: 'inherit' | 'profile' | 'override' | 'none' = !value.trim()
    ? 'inherit'
    : value.trim() === '[]'
      ? 'none'
      : isProfileParamConfig(value)
        ? 'profile'
        : 'override'
  const profile = parseModelParamProfile(value)
  const adapterKeys = adapterParams.map((p) => p.key)
  const denied = new Set(profile.deny ?? [])
  const overrideParams = Object.entries(profile.override ?? {}).map(([key, param]) => ({ ...param, key: param.key || key }))

  const setMode = (next: 'inherit' | 'profile' | 'override' | 'none') => {
    if (next === 'inherit') onChange('')
    if (next === 'none') onChange('[]')
    if (next === 'override') onChange(serializeParamDefs(adapterParams))
    if (next === 'profile') onChange(serializeModelParamProfile(emptyParamProfile()))
  }

  const updateProfile = (next: ModelParamProfile) => onChange(serializeModelParamProfile(next))

  const toggleDeny = (key: string) => {
    const next = new Set(profile.deny ?? [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    updateProfile({ ...profile, deny: Array.from(next) })
  }

  const updateOverride = (params: ParamDef[]) => {
    const override: Record<string, ParamDef> = {}
    params.forEach((p) => { if (p.key) override[p.key] = p })
    updateProfile({ ...profile, override })
  }

  const modeButton = (key: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={cn(
        'text-xs px-2 py-1 rounded border transition-colors',
        mode === key ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modeButton('inherit', t('admin.params.modes.inherit'))}
        {modeButton('profile', t('admin.params.modes.profile'))}
        {modeButton('override', t('admin.params.modes.override'))}
        {modeButton('none', t('admin.params.modes.none'))}
      </div>
      {mode === 'inherit' && (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {t('admin.params.inheritSummary', { params: adapterKeys.length ? adapterKeys.join(', ') : t('admin.params.noneValue') })}
        </div>
      )}
      {mode === 'none' && (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {t('admin.params.noneSummary')}
        </div>
      )}
      {mode === 'override' && <ParamBuilder value={value} onChange={onChange} />}
      {mode === 'profile' && (
        <div className="space-y-3 rounded border border-border bg-background p-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('admin.params.profileDeny')}</p>
            <div className="flex flex-wrap gap-1.5">
              {adapterParams.length === 0 && <span className="text-xs text-muted-foreground/70">{t('admin.params.noAdapterDefaults')}</span>}
              {adapterParams.map((param) => (
                <button
                  type="button"
                  key={param.key}
                  onClick={() => toggleDeny(param.key)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded border transition-colors',
                    denied.has(param.key) ? 'border-destructive/60 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:border-ring/50'
                  )}
                >
                  {paramTemplateLabel(param.key, param.label || param.key, t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <ParamBuilder value={serializeParamDefs(overrideParams)} onChange={(next) => updateOverride(parseParamDefs(next))} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('admin.params.profileAdd')}</p>
            <ParamBuilder
              value={serializeParamDefs(profile.add ?? [])}
              onChange={(next) => updateProfile({ ...profile, add: parseParamDefs(next) })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Model Management Tab ──────────────────────────────────────────────────────

export function ModelManagementPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'providers' | 'gateway'>('providers')
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
  const [addShortName, setAddShortName] = useState('')
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
    display_name: '', short_name: '', model_id_override: '', priority: '0', capabilities: [], billing_mode: 'per_token', supported_params: '',
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
    mutationFn: ({ credId, modelId, displayName, shortName, capabilities, billingMode, acceptsImage, maxInputImages, maxInputVideos, imageEditField, supportedParams, data }: {
      credId: number; modelId: string; displayName: string; shortName: string; capabilities: string[]
      billingMode: string; acceptsImage: boolean; maxInputImages: number; maxInputVideos: number
      imageEditField: string; supportedParams: string; data: PriceForm
    }) =>
      api.post(`/admin/credentials/${credId}/models`, {
        model_def_id: modelId,
        custom_display_name: displayName || modelId,
        short_name: shortName,
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
        short_name: data.short_name,
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
    const defaultCaps = ['text']
    setAddingFor(credId)
    setAddModelId('')
    setAddDisplayName('')
    setAddShortName('')
    setAddCapabilities(defaultCaps)
    setAddBillingMode('per_token')
    setAddAcceptsImage(false)
    setAddMaxInputImages(0)
    setAddMaxInputVideos(0)
    setAddImageEditField('')
    setAddSupportedParams('')
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.models.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.models.description')}</p>
        </div>
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'providers' | 'gateway')}>
          <TabsList>
            <TabsTrigger value="providers">{t('admin.models.viewProviders')}</TabsTrigger>
            <TabsTrigger value="gateway">{t('admin.models.viewGateway')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {viewMode === 'providers'
          ? t('admin.models.providersHint')
          : t('admin.models.gatewayHint')}
      </div>

      {viewMode === 'providers' && addStep === 'idle' && (
        <div className="flex justify-end">
          <Button onClick={() => setAddStep('pick')}>
            <Plus size={14} className="mr-1.5" /> {t('admin.models.addCredential')}
          </Button>
        </div>
      )}

      {viewMode === 'providers' && addStep === 'pick' && (
        <AdapterPicker
          adapters={adapters}
          onPick={(a) => { setSelectedAdapter(a); setAddStep('fill') }}
          onCancel={() => setAddStep('idle')}
        />
      )}
      {viewMode === 'providers' && addStep === 'fill' && selectedAdapter && (
        <CredentialForm
          adapter={selectedAdapter}
          onBack={() => setAddStep('pick')}
          onSuccess={() => { setAddStep('idle'); setSelectedAdapter(null) }}
        />
      )}

      {viewMode === 'providers' && (
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
                      setAddShortName('')
                      setAddCapabilities(preset.capabilities)
                      setAddBillingMode(preset.billing_mode)
                      setAddAcceptsImage(preset.accepts_image_input ?? false)
                      setAddMaxInputImages(preset.max_input_images ?? 0)
                      setAddMaxInputVideos(preset.max_input_videos ?? 0)
                      setAddImageEditField(preset.image_edit_field ?? '')
                      setAddSupportedParams('')
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
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={addShortName}
                            onChange={(e) => setAddShortName(e.target.value)}
                            placeholder={t('admin.models.shortNamePlaceholder')}
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
                                    setAddSupportedParams('')
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

                        <ParamConfigBuilder
                          value={addSupportedParams}
                          onChange={setAddSupportedParams}
                          adapterParams={adapterParamsForCapabilities(currentAdapter, addCapabilities)}
                        />

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
                              shortName: addShortName.trim(),
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
                    const selectorName = cfg.short_name || displayName
                    const caps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                    const billing = cfg.custom_billing_mode

                    return (
                      <div key={cfg.ID} className="border border-border rounded bg-background">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{selectorName}</span>
                            {cfg.short_name && cfg.short_name !== displayName && (
                              <span className="ml-2 text-muted-foreground">{displayName}</span>
                            )}
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
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(runtimeModelConfigFromAdmin(cred, cfg, adapter?.default_base_url), null, 2))}
                            className="text-muted-foreground/50 hover:text-foreground"
                            title="Copy runtime model config"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => {
                              const nextCaps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                              setEditingConfig(cfg)
                              setEditForm({
                                display_name: cfg.custom_display_name,
                                short_name: cfg.short_name,
                                model_id_override: cfg.model_id_override,
                                priority: String(cfg.priority ?? 0),
                                capabilities: nextCaps,
                                billing_mode: cfg.custom_billing_mode || 'per_token',
                                supported_params: cfg.custom_supported_params || '',
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
                            <div className="grid grid-cols-3 gap-2">
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
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                                <Input
                                  className="text-xs"
                                  value={editForm.short_name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, short_name: e.target.value }))}
                                  placeholder={t('admin.models.shortNamePlaceholder')}
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
                                            supported_params: '',
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
                            <ParamConfigBuilder
                              value={editForm.supported_params}
                              onChange={(next) => setEditForm((f) => ({ ...f, supported_params: next }))}
                              adapterParams={adapterParamsForCapabilities(adapter, editForm.capabilities)}
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
      )}

      {viewMode === 'gateway' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayRuleTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayRuleBody')}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayPriorityTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayPriorityBody')}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayBudgetTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayBudgetBody')}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayKeyTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayKeyBody')}</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => window.open(adminHref('/debug'), '_blank')}
              >
                {t('admin.models.gatewayOpenDebug')}
              </button>
            </div>
          </div>
        </div>
      )}
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

export function UserManagementPage() {
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

// ── Tab 3: 项目 Owner 管理 ────────────────────────────────────────────────────

interface AdminProjectMember {
  ID: number
  user_id: number
  role: string
  user?: User
}

interface AdminProject extends Project {
  members?: AdminProjectMember[]
}

export function ProjectOwnerManagementPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [ownerDialog, setOwnerDialog] = useState<AdminProject | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState('')

  const { data: projects = [] } = useQuery<AdminProject[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => api.get('/admin/projects').then((r) => r.data),
  })
  const { data: users = [] } = useQuery<UserWithQuota[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })

  const forceSetOwner = useMutation({
    mutationFn: ({ projectId, ownerId }: { projectId: number; ownerId: number }) =>
      api.put(`/admin/projects/${projectId}/owner`, { owner_id: ownerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      setOwnerDialog(null)
      setSelectedOwnerId('')
    },
  })

  const openOwnerDialog = (project: AdminProject) => {
    setOwnerDialog(project)
    setSelectedOwnerId(project.owner_id ? String(project.owner_id) : users[0]?.ID ? String(users[0].ID) : '')
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('admin.projects.title')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('admin.projects.description')}</p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.id')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.owner')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.members')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.updatedAt')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project) => {
              const ownerName = project.owner?.username || (project.owner_id ? `#${project.owner_id}` : t('admin.projects.noOwner'))
              return (
                <tr key={project.ID} className={cn('hover:bg-card', project.owner_id === 0 && 'bg-destructive/5')}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{project.ID}</td>
                  <td className="px-4 py-3 font-medium">{project.name || t('common.emptyTitle')}</td>
                  <td className={cn('px-4 py-3 text-xs', project.owner_id === 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {ownerName}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-sm">{project.members?.length ?? 0}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {project.UpdatedAt ? new Date(project.UpdatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openOwnerDialog(project)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('admin.projects.changeOwner')}
                    </button>
                  </td>
                </tr>
              )
            })}
            {projects.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">{t('admin.projects.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {ownerDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-96 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">{t('admin.projects.changeOwnerTitle', { name: ownerDialog.name })}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.projects.changeOwnerHint')}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.newOwner')}</Label>
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              >
                {users.map((user) => (
                  <option key={user.ID} value={user.ID}>
                    {user.username} #{user.ID}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => forceSetOwner.mutate({ projectId: ownerDialog.ID, ownerId: Number(selectedOwnerId) })}
                disabled={forceSetOwner.isPending || !selectedOwnerId}
                className="flex-1"
              >
                {forceSetOwner.isPending ? t('common.saving') : t('admin.projects.forceChange')}
              </Button>
              <Button variant="outline" onClick={() => setOwnerDialog(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: 用量日志 ────────────────────────────────────────────────────────────

export function UsageLogsPage() {
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
    if (cfg) return cfg.short_name || cfg.custom_display_name || cfg.model_def_id
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
                {(model.short_name || model.custom_display_name || model.model_def_id)} · {model.providerName}
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
  const [editForm, setEditForm] = useState<{ custom_display_name: string; short_name: string; model_id_override: string; priority: string }>({
    custom_display_name: '', short_name: '', model_id_override: '', priority: '0',
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
      short_name: m.short_name ?? '',
      model_id_override: m.model_id_override ?? '',
      priority: '0',
    })
  }

  function saveEdit(id: number) {
    patchModel.mutate({
      id,
      data: {
        custom_display_name: editForm.custom_display_name,
        short_name: editForm.short_name,
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
                    {publicModelLabel(m, true)}
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
                    <div className="grid grid-cols-3 gap-2">
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
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                        <Input
                          className="text-xs h-7"
                          value={editForm.short_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, short_name: e.target.value }))}
                          placeholder={t('admin.models.shortNamePlaceholder')}
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
                  {publicModelLabel(m, true)}
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

export function FeatureConfigPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()

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
        {features.filter((f) => !f.is_internal).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('admin.features.toolFeatures')}</p>
            {features.filter((f) => !f.is_internal).map((f) => (
              <FeatureRow
                key={f.feature_key}
                feature={f}
                isPending={update.isPending || updatePrompt.isPending}
                onUpdate={(data) => update.mutate({ key: f.feature_key, data })}
                onUpdatePrompt={(data) => updatePrompt.mutate({ key: f.feature_key, data })}
                onGoToModels={() => navigateToAdminSection('models')}
              />
            ))}
          </div>
        )}
        {features.filter((f) => !f.is_internal).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">{t('admin.features.empty')}</p>
        )}
      </div>
    </div>
  )
}

// ── Tab: 存储配置 ──────────────────────────────────────────────────────────────
export function StoragePage() {
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

type AdminSectionKey = 'models' | 'features' | 'users' | 'projects' | 'logs' | 'storage' | 'cloud-files'

const adminSectionHref: Record<AdminSectionKey, string> = {
  models: '/models',
  features: '/features',
  users: '/users',
  projects: '/projects',
  logs: '/usage',
  storage: '/storage',
  'cloud-files': '/cloud-files',
}

function navigateToAdminSection(section: AdminSectionKey) {
  window.location.assign(adminHref(adminSectionHref[section]))
}

function adminHref(href: string) {
  const normalized = href.startsWith('/') ? href : `/${href}`
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return `/admin${normalized}`
  }
  return normalized
}

export default function AdminPage() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const navigate = useNavigate()

  const { data: users = [] } = useQuery<UserWithQuota[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })
  const { data: usageData } = useQuery<{ total: number; items: UsageLog[] }>({
    queryKey: ['admin', 'usage-logs', 'overview'],
    queryFn: () => api.get('/admin/usage-logs', { params: { page: 1, page_size: 200 } }).then((r) => r.data),
  })
  const { data: credentials = [] } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })
  const { data: projects = [] } = useQuery<AdminProject[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => api.get('/admin/projects').then((r) => r.data),
  })

  const usageItems = usageData?.items ?? []
  const totalTokens = usageItems.reduce((sum, log) => sum + log.input_tokens + log.output_tokens, 0)
  const totalCost = usageItems.reduce((sum, log) => sum + log.cost, 0)
  const enabledModels = credentials.reduce((sum, cred) => sum + (cred.models ?? []).filter((model) => model.is_enabled).length, 0)
  const now = Date.now()
  const recentUsers = users.filter((user) => {
    const createdAt = (user as UserWithQuota & { CreatedAt?: string }).CreatedAt
    return createdAt ? now - new Date(createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000 : false
  }).length

  const overviewCards = [
    {
      label: '用户增长',
      value: users.length.toLocaleString(),
      detail: `近 30 天新增 ${recentUsers.toLocaleString()}`,
      icon: UsersRound,
      href: '/users',
    },
    {
      label: 'Token 使用',
      value: totalTokens.toLocaleString(),
      detail: `最近 ${usageItems.length.toLocaleString()} 条调用记录`,
      icon: Gauge,
      href: '/usage',
    },
    {
      label: 'Credit 消耗',
      value: totalCost.toFixed(2),
      detail: `${usageData?.total ?? 0} 条总用量日志`,
      icon: Coins,
      href: '/usage',
    },
    {
      label: '启用模型',
      value: enabledModels.toLocaleString(),
      detail: `${credentials.length.toLocaleString()} 个供应商凭证`,
      icon: Settings2,
      href: '/models',
    },
  ]

  const sectionCards = [
    { label: t('admin.tabs.models'), detail: '供应商凭证、模型启用、价格与参数配置。', icon: Settings2, href: '/models' },
    { label: t('admin.tabs.features'), detail: '功能到模型的路由、默认模型和系统提示词。', icon: Route, href: '/features' },
    { label: t('admin.tabs.users'), detail: '用户额度、角色和余额管理。', icon: UsersRound, href: '/users' },
    { label: t('admin.tabs.projects'), detail: `当前 ${projects.length.toLocaleString()} 个项目，可强制调整 Owner。`, icon: FolderKanban, href: '/projects' },
    { label: t('admin.tabs.logs'), detail: '按供应商、模型和用户筛选 AI 用量。', icon: ScrollText, href: '/usage' },
    { label: t('admin.tabs.storage'), detail: '内部资源存储后端状态和用户占用。', icon: HardDrive, href: '/storage' },
    { label: t('admin.tabs.cloudFiles'), detail: '公共对象中转和云文件存储配置。', icon: CloudUpload, href: '/cloud-files' },
    { label: 'Agent 调试', detail: '本地 Agent 运行时、工具、技能和上下文调试。', icon: Bot, href: '/agent-debug' },
  ]

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <Link key={card.label} to={card.href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/70">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <card.icon size={18} />
              </div>
              <ArrowUpRight size={15} className="text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sectionCards.map((card) => (
          <Link key={card.href} to={card.href} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-ring/70 hover:bg-card">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
              <card.icon size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{card.label}</h2>
                <ArrowUpRight size={14} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AICredential, AIModelConfig, AdapterDef, ModelDef, UsageLog, FeatureConfig, PublicModel } from '@/types'
import { useUserStore } from '@/store/userStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, ArrowLeft, Pencil, Check, X, Download, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AgentConfigTab } from './AgentConfigTab'
import { DebugPage } from './DebugPage'

// ── helpers ───────────────────────────────────────────────────────────────────

interface TestResult { success: boolean; message: string; latency_ms: number }

const BILLING_LABELS: Record<string, string> = {
  per_token: '按 token',
  per_image: '按张',
  per_second: '按秒',
  per_call: '按次',
}

function billingDesc(def: ModelDef): string {
  switch (def.BillingMode) {
    case 'per_token': return `输入/输出 token`
    case 'per_image': return `图像`
    case 'per_second': return `视频秒数`
    case 'per_call': return `每次调用`
    default: return def.BillingMode
  }
}

function refPriceHint(def: ModelDef): string {
  switch (def.BillingMode) {
    case 'per_token':
      return `参考: $${def.RefInputUSDPer1M}/$${def.RefOutputUSDPer1M} USD/1M token`
    case 'per_image':
      return `参考: $${def.RefUSDPerImage} USD/张`
    case 'per_second':
      return `参考: $${def.RefUSDPerSecond} USD/秒${def.DefaultDurSec ? `，默认 ${def.DefaultDurSec}s` : ''}`
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
  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">选择适配器</p>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">取消</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {adapters.map((a) => (
          <button
            key={a.adapter_type}
            onClick={() => onPick(a)}
            className="text-left border border-border rounded-lg bg-background px-3 py-2.5 hover:border-ring hover:shadow-sm transition-all space-y-0.5"
          >
            <p className="text-sm font-medium text-foreground">{a.display_name}</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{a.description}</p>
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
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState(adapter.display_name)
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
    } catch (e) {
      setTestState({ loading: false, result: { success: false, message: String(e), latency_ms: 0 } })
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
        <p className="text-sm font-medium">配置 {adapter.display_name}</p>
      </div>

      <Input
        placeholder="显示名称"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      {baseURLField && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">
            {baseURLField.label}{baseURLField.required && <span className="text-destructive ml-0.5">*</span>}
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
            {field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}
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
        <p className="text-xs text-destructive">{String((create.error as Error)?.message)}</p>
      )}
      {testState.result && (
        <p className={`text-xs ${testState.result.success ? 'text-foreground' : 'text-destructive'}`}>
          {testState.result.success
            ? `✓ 连接正常 (${testState.result.latency_ms}ms)`
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
              <span className="font-medium">启用 Files API 预上传</span>
            </label>
            <span className="text-xs text-muted-foreground">（上传图片至服务商 /files，再传 file_id 给模型，避免 multipart 超大体积）</span>
          </div>
          {filesAPIEnabled && (
            <div className="space-y-2 pt-1">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">Files API Base URL（留空则使用上方 Base URL）</Label>
                <Input
                  placeholder={fields['base_url'] || adapter.default_base_url || 'https://api.x.ai/v1'}
                  value={filesAPIBaseURL}
                  onChange={(e) => setFilesAPIBaseURL(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">Files API Key（留空则使用上方 API Key）</Label>
                <Input
                  type="password"
                  placeholder="留空则复用主凭据 API Key"
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
          {testState.loading ? '测试中…' : '接入并测试'}
        </button>
        <Button
          onClick={() => create.mutate(buildPayload())}
          disabled={create.isPending || testState.loading}
        >
          {create.isPending ? '…' : '直接创建'}
        </Button>
        <Button variant="outline" onClick={onBack}>
          返回
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

function PriceFields({ def, form, onChange }: { def: ModelDef; form: PriceForm; onChange: (f: PriceForm) => void }) {
  const mode = def.BillingMode
  const hint = refPriceHint(def)
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {def.AllowModelIDOverride && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">
            Model ID（可选，如 Volcengine ep-xxx 接入点）
          </Label>
          <Input
            className="text-xs"
            placeholder={def.ModelID || '如 gpt-4o、claude-3-5-sonnet-20241022'}
            value={form.model_id_override}
            onChange={(e) => onChange({ ...form, model_id_override: e.target.value })}
          />
        </div>
      )}
      {mode === 'per_token' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">输入 credits/百万 token</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_input_per_1m}
              onChange={(e) => onChange({ ...form, credits_input_per_1m: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">输出 credits/百万 token</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_output_per_1m}
              onChange={(e) => onChange({ ...form, credits_output_per_1m: Number(e.target.value) })} />
          </div>
        </div>
      )}
      {mode === 'per_image' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">credits/张</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_image}
            onChange={(e) => onChange({ ...form, credits_per_image: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_second' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">credits/秒（视频时长计费）</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_second}
            onChange={(e) => onChange({ ...form, credits_per_second: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_call' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">credits/次</Label>
          <Input type="number" min="0" step="0.01" className="text-xs"
            value={form.credits_per_call}
            onChange={(e) => onChange({ ...form, credits_per_call: Number(e.target.value) })} />
        </div>
      )}
    </div>
  )
}

// ── Model Management Tab ──────────────────────────────────────────────────────

function ModelManagementTab() {
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
  const [showSuggestions, setShowSuggestions] = useState(false)
  // Remote model fetch state (within add panel)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [remoteFetching, setRemoteFetching] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  // Editing existing model config
  const [editingConfig, setEditingConfig] = useState<AIModelConfig | null>(null)
  const [editForm, setEditForm] = useState<{ display_name: string; model_id_override: string; priority: string; capabilities: string[]; billing_mode: string }>({
    display_name: '', model_id_override: '', priority: '0', capabilities: [], billing_mode: 'per_token',
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

  const { data: suggestions = [] } = useQuery<ModelDef[]>({
    queryKey: ['admin', 'model-suggestions'],
    queryFn: () => api.get('/admin/model-suggestions').then((r) => r.data),
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
    setAddingFor(credId)
    setAddModelId('')
    setAddDisplayName('')
    setAddCapabilities(['text'])
    setAddBillingMode('per_token')
    setAddAcceptsImage(false)
    setAddMaxInputImages(0)
    setAddMaxInputVideos(0)
    setAddImageEditField('')
    setAddSupportedParams('')
    setAddPriceForm(defaultPriceForm())
    setRemoteModels([])
    setRemoteError('')
    setShowSuggestions(false)
  }

  function closeAddPanel() {
    setAddingFor(null)
    setRemoteModels([])
    setRemoteError('')
    setShowSuggestions(false)
  }

  async function fetchRemoteModels(credId: number) {
    setRemoteFetching(true)
    setRemoteError('')
    setRemoteModels([])
    try {
      const res = await api.get(`/admin/credentials/${credId}/remote-models`).then((r) => r.data)
      setRemoteModels(res.models ?? [])
    } catch (e: any) {
      setRemoteError(e?.response?.data?.error ?? String(e))
    } finally {
      setRemoteFetching(false)
    }
  }

  async function runTest(key: string, fn: () => Promise<TestResult>) {
    setTestingId(key)
    try {
      const result = await fn()
      setTestResults((r) => ({ ...r, [key]: result }))
    } catch (e) {
      setTestResults((r) => ({ ...r, [key]: { success: false, message: String(e), latency_ms: 0 } }))
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
          <h2 className="text-base font-semibold text-foreground">AI 接口配置</h2>
          <p className="text-xs text-muted-foreground mt-0.5">管理凭据、启用模型、配置计费单价</p>
        </div>
        {addStep === 'idle' && (
          <Button
            onClick={() => setAddStep('pick')}
          >
            <Plus size={14} className="mr-1.5" /> 添加凭据
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
                          title="修改名称"
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {getAdapterLabel(cred.adapter_type)}
                    </span>
                    {cred.models && cred.models.length > 0 && (
                      <span className="text-xs text-muted-foreground">{cred.models.length} 个模型</span>
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
                  {testingId === testKey ? '测试中…' : '连接测试'}
                </button>
                {testRes && (
                  <span className={cn('text-xs', testRes.success ? 'text-foreground' : 'text-destructive')}>
                    {testRes.success ? `✓ ${testRes.latency_ms}ms` : `✗ 失败`}
                  </span>
                )}

                <button
                  onClick={() => toggleCredential.mutate({ id: cred.ID, is_enabled: !cred.is_enabled })}
                  title={cred.is_enabled ? '点击禁用此凭据' : '点击启用此凭据'}
                  className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors',
                    cred.is_enabled
                      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'border-border bg-muted text-muted-foreground hover:border-ring/50')}
                >
                  {cred.is_enabled ? '● 已启用' : '○ 已禁用'}
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
                      <p className="text-xs font-medium text-muted-foreground">接口凭据</p>
                      <button
                        onClick={() => credentialEditFor === cred.ID ? setCredentialEditFor(null) : openCredentialAuthEdit(cred)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {credentialEditFor === cred.ID ? '收起' : '编辑'}
                      </button>
                    </div>

                    {credentialEditFor !== cred.ID ? (
                      <div className="grid gap-1 text-xs text-muted-foreground">
                        <p className="truncate">
                          Base URL: <span className="font-mono">{cred.base_url || adapter?.default_base_url || '未设置'}</span>
                        </p>
                        <p>
                          API Key: <span className="font-mono">{cred.masked_key || '未设置'}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-1">Base URL</Label>
                          <Input
                            value={credentialEditFields.base_url ?? ''}
                            onChange={(e) => setCredentialEditFields((f) => ({ ...f, base_url: e.target.value }))}
                            placeholder={adapter?.default_base_url || '留空使用适配器默认地址'}
                            className="text-xs"
                          />
                        </div>
                        {(adapter?.cred_fields.filter((field) => field.key !== 'base_url') ?? []).map((field) => (
                          <div key={field.key}>
                            <Label className="text-xs text-muted-foreground block mb-1">{field.label}</Label>
                            <Input
                              type="password"
                              value={credentialEditFields[field.key] ?? ''}
                              onChange={(e) => setCredentialEditFields((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.key === 'api_key' && cred.masked_key ? `留空不修改（当前 ${cred.masked_key}）` : '留空不修改'}
                              className="text-xs"
                            />
                          </div>
                        ))}
                        {updateCredentialAuth.isError && (
                          <p className="text-xs text-destructive">
                            {String((updateCredentialAuth.error as any)?.response?.data?.error ?? (updateCredentialAuth.error as Error)?.message)}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateCredentialAuth.isPending}
                            onClick={() => updateCredentialAuth.mutate({ id: cred.ID, fields: credentialEditFields })}
                          >
                            {updateCredentialAuth.isPending ? '保存中…' : '保存'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setCredentialEditFor(null); setCredentialEditFields({}) }}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">已启用模型</p>
                    {addingFor !== cred.ID && (
                      <button
                        onClick={() => openAddPanel(cred.ID)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Plus size={12} /> 添加模型
                      </button>
                    )}
                  </div>

                  {/* Add model panel */}
                  {addingFor === cred.ID && (() => {
                    const capLabels: Record<string, string> = {
                      text: '文本', reasoning: '推理', image: '图像', image_edit: '图像编辑',
                      video: '文生视频', video_i2v: '图生视频', video_v2v: '视频转视频',
                    }
                    const billingOptions = [
                      { value: 'per_token', label: '按 token' },
                      { value: 'per_image', label: '按张' },
                      { value: 'per_second', label: '按秒' },
                      { value: 'per_call', label: '按次' },
                    ]
                    const inferBilling = (caps: string[]) => {
                      if (caps.some(c => c === 'image' || c === 'image_edit')) return 'per_image'
                      if (caps.some(c => c.startsWith('video'))) return 'per_second'
                      return 'per_token'
                    }
                    // Filter suggestions to this credential's adapter type
                    const credAdapter = cred.adapter_type
                    const filteredSuggestions = suggestions.filter(s => s.AdapterType === credAdapter)

                    function applySuggestion(def: ModelDef) {
                      setAddModelId(def.ModelID)
                      setAddDisplayName(def.DisplayName)
                      setAddCapabilities(def.Capabilities)
                      setAddBillingMode(def.BillingMode)
                      setAddAcceptsImage(def.AcceptsImageInput ?? false)
                      setAddMaxInputImages(def.MaxInputImages ?? 0)
                      setAddMaxInputVideos(def.MaxInputVideos ?? 0)
                      setAddImageEditField('')
                      setAddSupportedParams(def.SupportedParams ? JSON.stringify(def.SupportedParams) : '')
                      setShowSuggestions(false)
                    }

                    return (
                      <div className="border border-border rounded bg-background p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">添加模型</p>
                          <div className="flex items-center gap-2">
                            {filteredSuggestions.length > 0 && (
                              <button
                                onClick={() => setShowSuggestions(!showSuggestions)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <Sparkles size={11} />
                                {showSuggestions ? '收起建议' : '从建议选'}
                              </button>
                            )}
                            <button
                              onClick={() => fetchRemoteModels(cred.ID)}
                              disabled={remoteFetching}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                            >
                              <RefreshCw size={11} className={remoteFetching ? 'animate-spin' : ''} />
                              从接口获取
                            </button>
                          </div>
                        </div>

                        {/* Suggestion list — filtered by adapter type */}
                        {showSuggestions && filteredSuggestions.length > 0 && (
                          <div className="border border-border rounded bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
                            <p className="text-[10px] text-muted-foreground mb-1">选中后自动填充所有字段，可继续修改</p>
                            {filteredSuggestions.map((def) => (
                              <button
                                key={def.ID}
                                onClick={() => applySuggestion(def)}
                                className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="font-medium truncate">{def.DisplayName}</span>
                                <span className="text-muted-foreground font-mono shrink-0">{def.ModelID}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Model ID input with remote list */}
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">Model ID（发给 API 的模型标识）</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                            value={addModelId}
                            onChange={(e) => setAddModelId(e.target.value)}
                            placeholder="如 gpt-4o、gemini-2.0-flash、doubao-seed-2-0-pro-260215"
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
                          <Label className="text-xs text-muted-foreground block mb-0.5">显示名称</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={addDisplayName}
                            onChange={(e) => setAddDisplayName(e.target.value)}
                            placeholder={addModelId || '可选，留空使用 Model ID'}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">能力类型（必填，可多选）</Label>
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
                          <Label className="text-xs text-muted-foreground block mb-0.5">计费模式</Label>
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
                            接受图像输入
                          </label>
                          {addAcceptsImage && (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">最多图片数</Label>
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
                            <Label className="text-xs text-muted-foreground">最多视频数</Label>
                            <input
                              type="number"
                              className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                              value={addMaxInputVideos}
                              onChange={e => setAddMaxInputVideos(Number(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* Supported params JSON */}
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">
                            生成参数（JSON，可选）
                            <span className="ml-1 text-muted-foreground/50 font-normal">— 控制前端显示哪些参数选项（尺寸、时长等）</span>
                          </Label>
                          <textarea
                            className="w-full text-xs font-mono border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                            rows={3}
                            value={addSupportedParams}
                            onChange={e => setAddSupportedParams(e.target.value)}
                            placeholder='[{"key":"aspect_ratio","label":"画面比例","type":"select","options":["16:9","9:16","1:1"],"default":"16:9"}]'
                          />
                        </div>

                        {(() => {
                          const fakeDef = { BillingMode: addBillingMode, AllowModelIDOverride: false } as any
                          return <PriceFields def={fakeDef} form={addPriceForm} onChange={setAddPriceForm} />
                        })()}

                        {addModel.isError && (
                          <p className="text-xs text-destructive">{String((addModel.error as Error)?.message)}</p>
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
                            {addModel.isPending ? '…' : '添加'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={closeAddPanel}>取消</Button>
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
                            <span className="text-muted-foreground/50">{BILLING_LABELS[billing] ?? billing}</span>
                          )}
                          <button
                            onClick={() => runTest(modelTestKey, () =>
                              api.post(`/admin/credentials/${cred.ID}/models/${cfg.ID}/test`, {}).then((r) => r.data)
                            )}
                            disabled={testingId === modelTestKey}
                            className="text-muted-foreground/50 hover:text-foreground border border-border rounded px-1.5 py-0.5"
                          >
                            {testingId === modelTestKey ? '…' : '测试'}
                          </button>
                          {modelTestRes && (
                            <span className={cn('text-xs', modelTestRes.success ? 'text-foreground' : 'text-destructive')}>
                              {modelTestRes.success ? '✓' : '✗'}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setEditingConfig(cfg)
                              setEditForm({
                                display_name: cfg.custom_display_name,
                                model_id_override: cfg.model_id_override,
                                priority: String(cfg.priority ?? 0),
                                capabilities: cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : [],
                                billing_mode: cfg.custom_billing_mode || 'per_token',
                              })
                            }}
                            className="text-muted-foreground/50 hover:text-foreground"
                          >
                            编辑
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
                                <Label className="text-xs text-muted-foreground block mb-0.5">显示名称</Label>
                                <Input
                                  className="text-xs"
                                  value={editForm.display_name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                                  placeholder={cfg.model_def_id}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">Model ID Override</Label>
                                <Input
                                  className="text-xs font-mono"
                                  value={editForm.model_id_override}
                                  onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                                  placeholder="如 ep-xxx"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">能力类型</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {(['text', 'reasoning', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] as const).map((cap) => {
                                  const label = { text: '文本', reasoning: '推理', image: '图像', image_edit: '图像编辑', video: '文生视频', video_i2v: '图生视频', video_v2v: '视频转视频' }[cap]
                                  const active = editForm.capabilities.includes(cap)
                                  return (
                                    <button
                                      key={cap}
                                      onClick={() => {
                                        const next = active
                                          ? editForm.capabilities.filter((c) => c !== cap)
                                          : [...editForm.capabilities, cap]
                                        if (next.length > 0) setEditForm((f) => ({ ...f, capabilities: next }))
                                      }}
                                      className={cn(
                                        'text-xs px-2 py-0.5 rounded border transition-colors',
                                        active ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
                                      )}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">计费模式</Label>
                              <div className="flex gap-1.5 flex-wrap">
                                {([{ value: 'per_token', label: '按 token' }, { value: 'per_image', label: '按张' }, { value: 'per_second', label: '按秒' }, { value: 'per_call', label: '按次' }]).map((opt) => (
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
                            <div className="flex gap-2">
                              <Button
                                onClick={() => updateModelConfig.mutate({ modelId: cfg.ID, data: editForm })}
                                disabled={updateModelConfig.isPending}
                                size="sm"
                                className="flex-1"
                              >
                                保存
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setEditingConfig(null)}>
                                取消
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {(!cred.models || cred.models.length === 0) && addingFor !== cred.ID && (
                    <p className="text-xs text-muted-foreground">
                      暂无已添加的模型，点击「添加模型」开始配置
                    </p>
                  )}

                  {/* Files API config — shown only for adapters that support it */}
                  {adapter?.supports_files_api && (() => {
                    const isEditing = filesAPIEditFor === cred.ID
                    return (
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground">Files API 预上传</p>
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
                            {isEditing ? '收起' : '配置'}
                          </button>
                        </div>
                        {!isEditing && (
                          <p className="text-xs text-muted-foreground">
                            {cred.files_api_enabled
                              ? <span className="text-green-600 dark:text-green-400">● 已启用</span>
                              : <span>○ 未启用</span>
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
                              启用 Files API 预上传（上传图片至服务商 /files，用 file_id 代替 multipart）
                            </label>
                            {filesAPIEditEnabled && (
                              <>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">Base URL（留空则使用凭据 Base URL）</Label>
                                  <Input
                                    value={filesAPIEditBaseURL}
                                    onChange={e => setFilesAPIEditBaseURL(e.target.value)}
                                    placeholder={cred.base_url || '留空使用凭据 Base URL'}
                                    className="text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">API Key（留空则使用凭据主 Key）</Label>
                                  <Input
                                    type="password"
                                    value={filesAPIEditKey}
                                    onChange={e => setFilesAPIEditKey(e.target.value)}
                                    placeholder="留空使用主凭据 Key"
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
                                {filesAPIEditSaving ? '…' : '保存'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setFilesAPIEditFor(null)}>取消</Button>
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
            暂无凭据配置，点击右上角「添加凭据」开始接入
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
        <h2 className="text-base font-semibold text-foreground">用户管理</h2>
        <p className="text-xs text-muted-foreground mt-0.5">查看用户余额，为用户充值 Credits</p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">用户名</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">角色</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Credits 余额</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.ID} className="hover:bg-card">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {u.system_role === 'super_admin' ? '超级管理员' : '普通用户'}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-sm">
                  {u.balance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => { setQuotaDialog(u); setNewBalance(String(u.balance)) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    充值
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">暂无用户</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {quotaDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-80 p-5 space-y-4">
            <h3 className="text-sm font-semibold">设置余额 — {quotaDialog.username}</h3>
            <div>
              <Label className="text-xs text-muted-foreground block mb-1">新余额（Credits）</Label>
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
                确认
              </Button>
              <Button variant="outline" onClick={() => setQuotaDialog(null)}>
                取消
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
    return new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

  const opLabel: Record<string, string> = { text: '文本', image: '生图', video: '生视频' }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">用量日志</h2>
        <p className="text-xs text-muted-foreground mt-0.5">共 {total} 条记录</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <select
          value={providerFilter}
          onChange={e => { setProviderFilter(e.target.value); setModelFilter(''); setPage(1) }}
          className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">全部服务商</option>
          {credentials.map(cred => (
            <option key={cred.ID} value={cred.ID}>{cred.display_name}</option>
          ))}
        </select>
        <select
          value={modelFilter}
          onChange={e => { setModelFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">全部模型</option>
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
          <option value="">全部用户</option>
          {users.map(u => (
            <option key={u.ID} value={u.ID}>{u.username}</option>
          ))}
        </select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">时间</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">用户</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">服务商</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">模型</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">类型</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">用量</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Credits</th>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">暂无用量记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>上一页</Button>
        <span className="text-muted-foreground">{page} / {pageCount}</span>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>下一页</Button>
      </div>
    </div>
  )
}

// ── Tab 4: 功能模型配置 ────────────────────────────────────────────────────────

const CAPABILITY_LABEL: Record<string, string> = {
  text: '文本',
  reasoning: '推理',
  image: '图像',
  image_edit: '图像编辑',
  video: '视频',
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
            <p className="text-sm font-medium text-foreground">{feature.display_name}</p>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', CAPABILITY_COLOR[feature.capability] ?? 'bg-muted text-muted-foreground')}>
              {CAPABILITY_LABEL[feature.capability] ?? feature.capability}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{feature.feature_key}</span>
            {feature.max_tokens > 0 && (
              <span className="text-xs text-muted-foreground/60">max {feature.max_tokens}t</span>
            )}
          </div>
          {feature.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {isTextCap && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="系统提示词"
            >
              {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              提示词{hasOverride && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
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
            {feature.is_enabled ? '已启用' : '已禁用'}
          </button>
        </div>
      </div>

      {/* System prompt section — text features only */}
      {isTextCap && showPrompt && (
        <div className="border-t border-border px-4 py-3 bg-card space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              默认系统提示词
              <span className="ml-1 text-muted-foreground/50 font-normal">（来自业务层 FeatureDef，只读）</span>
            </p>
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
              {feature.default_system_prompt || '（无系统提示词）'}
            </pre>
          </div>
          {feature.output_schema && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">输出格式（OutputSchema）</p>
              <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
                {feature.output_schema}
              </pre>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              自定义覆盖
              <span className="ml-1 text-muted-foreground/50 font-normal">（留空 = 使用默认）</span>
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
                {promptSaved ? '已保存 ✓' : '保存覆盖'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model selector */}
      <div className="border-t border-border px-4 py-3 bg-card space-y-2">
        <p className="text-xs text-muted-foreground">
          可用模型
          <span className="ml-1 text-muted-foreground/60">
            {allowed.size === 0 ? '（未限制，使用所有该类型下的可用模型）' : `（已选 ${allowed.size} 个）`}
          </span>
        </p>
        {availableModels.length === 0 ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground/60">暂无已配置的{CAPABILITY_LABEL[feature.capability] ?? feature.capability}模型</p>
            <button
              onClick={onGoToModels}
              className="text-xs text-primary hover:underline"
            >
              前往模型管理添加 →
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
                      <span className="ml-1.5 text-muted-foreground/50">·图输入</span>
                    )}
                  </button>
                  <button
                    onClick={() => editingModelId === m.id ? setEditingModelId(null) : openEdit(m)}
                    className="text-muted-foreground/40 hover:text-muted-foreground p-1"
                    title="编辑模型配置"
                  >
                    {editingModelId === m.id ? <X size={12} /> : <Pencil size={12} />}
                  </button>
                </div>

                {/* Inline edit panel */}
                {editingModelId === m.id && (
                  <div className="ml-0 mt-1 border border-border rounded bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">显示名称</Label>
                        <Input
                          className="text-xs h-7"
                          value={editForm.custom_display_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, custom_display_name: e.target.value }))}
                          placeholder="留空使用 model ID"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">Model ID Override</Label>
                        <Input
                          className="text-xs h-7 font-mono"
                          value={editForm.model_id_override}
                          onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                          placeholder="如 ep-xxx 或具体 model ID"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Label className="text-xs text-muted-foreground block mb-0.5">优先级</Label>
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
                          {patchModel.isPending ? '…' : '保存'}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingModelId(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                    {patchModel.isError && (
                      <p className="text-xs text-destructive">{String((patchModel.error as Error)?.message)}</p>
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
              默认模型
              <span className="ml-1 text-muted-foreground/50 font-normal">（用户打开工具时预选）</span>
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
              <option value="">自动（优先级最高）</option>
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
            访问权限
            <span className="ml-1 text-muted-foreground/50 font-normal">（留空 = 所有角色可用）</span>
          </p>
          <div className="flex items-center gap-3">
            {(['owner', 'editor', 'viewer'] as const).map((role) => {
              const checked = feature.allowed_roles.includes(role)
              const roleLabel: Record<string, string> = { owner: '项目所有者', editor: '编辑者', viewer: '查看者' }
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
        <h2 className="text-base font-semibold text-foreground">功能配置</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          为每个工具功能指定可用模型。未限制时使用该类型下所有已启用模型。
        </p>
      </div>

      {features.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">加载中…</p>
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
      {/* Backend status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">存储后端</h3>
        <div className="flex gap-3 flex-wrap">
          {(backends?.backends ?? []).map(b => (
            <div key={b.name} className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm">
              {b.name === 'local'
                ? <span className="i-lucide-hard-drive text-muted-foreground" />
                : <span className="i-lucide-cloud text-blue-400" />
              }
              <span className="font-medium capitalize">{b.name}</span>
              {b.name === backends?.default && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">默认</span>
              )}
              <span className="text-xs text-green-500">● 可用</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">用户存储用量</h3>
        {Object.keys(byUser).length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无资源数据</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">用户</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">存储后端</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">文件数</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">占用空间</th>
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
  oss: '阿里云 OSS',
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
    setFormFields(masked)
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
    if (!confirm('确认删除此云端存储配置？')) return
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">云端文件存储</h3>
          <p className="text-xs text-muted-foreground mt-0.5">配置云端存储后端，Worker 在执行 image_edit 等任务时会按优先级上传文件，避免大文件 multipart 传输失败。</p>
        </div>
        <Button size="sm" onClick={openCreate}>添加配置</Button>
      </div>

      {configs.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">暂无云端存储配置</p>
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
                      ? <span className="text-xs text-green-500">● 启用</span>
                      : <span className="text-xs text-muted-foreground">○ 禁用</span>
                    }
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {Object.entries(masked).filter(([k]) => !['access_key','secret_key','api_key','access_key_id','access_key_secret'].includes(k)).map(([k,v]) => `${k}=${v}`).join('  ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggleEnabled(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">
                    {cfg.is_enabled ? '禁用' : '启用'}
                  </button>
                  <button onClick={() => openEdit(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">编辑</button>
                  <button onClick={() => deleteCfg(cfg.ID)} className="text-xs border border-destructive/30 rounded px-2 py-1 text-destructive/70 hover:text-destructive transition-colors">删除</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-4">
          <h4 className="text-sm font-medium">{editingId ? '编辑配置' : '新建配置'}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">名称</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="xAI Files API" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">类型</Label>
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
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type={f.secret ? 'password' : 'text'}
                  value={formFields[f.key] ?? ''}
                  onChange={e => setFormFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="text-sm font-mono"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">优先级（数字越小越优先）</Label>
              <Input type="number" value={formPriority} onChange={e => setFormPriority(Number(e.target.value))} className="w-24 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} className="rounded" />
              启用
            </label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !formName}>
              {saving ? '保存中…' : '保存'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
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
          <h1 className="text-lg font-semibold text-foreground">管理后台</h1>
          <p className="text-xs text-muted-foreground mt-0.5">AI 模型配置、用户额度与用量统计</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="models">模型管理</TabsTrigger>
          <TabsTrigger value="agents">Agent 管理</TabsTrigger>
          <TabsTrigger value="features">功能配置</TabsTrigger>
          <TabsTrigger value="users">用户管理</TabsTrigger>
          <TabsTrigger value="logs">用量日志</TabsTrigger>
          <TabsTrigger value="debug">调试</TabsTrigger>
          <TabsTrigger value="storage">存储</TabsTrigger>
          <TabsTrigger value="cloud-files">云端文件</TabsTrigger>
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

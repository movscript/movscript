import { runtimeCapabilities } from '@admin-runtime';
import type { AICredential, AIModelCatalogEntry, AIModelCatalogTemplate, AIModelRouteBinding, AIModelRouteDiagnoseRequest, AIProvider, AIProviderTemplate, AdapterDef, ProviderInstance } from '@admin/types';
import type { StatusBadgeProps } from '@movscript/ui/primitives';

export interface TestResult { success: boolean; message: string; latency_ms: number }

export const HIDDEN_ADMIN_PROVIDER_ADAPTERS = new Set(['local'])

export function adapterDisplayName(adapter: Pick<AdapterDef, 'adapter_type' | 'display_name'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.name`, { defaultValue: adapter.display_name })
}

export function adapterDescription(adapter: Pick<AdapterDef, 'adapter_type' | 'description'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.description`, { defaultValue: adapter.description })
}

export function selectableAdminProviderAdapters(adapters: AdapterDef[]): AdapterDef[] {
  return adapters.filter((adapter) => !HIDDEN_ADMIN_PROVIDER_ADAPTERS.has(adapter.adapter_type))
}

export function credentialFieldLabel(key: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.credentialFields.${key}`, { defaultValue: fallback })
}

export type CatalogEntryForm = {
  public_model_id: string
  display_name: string
  short_name: string
  is_enabled: boolean
  capabilities: string[]
  accepts_image: boolean
  max_input_images: number
  max_input_videos: number
  input_image_field: string
  supported_params: string
  model_capabilities_json: string
}

export type CatalogRouteForm = {
  route_group: string
  provider_id: string
  adapter_type: string
  provider_model_id: string
  endpoint_base_url: string
  endpoint_path_prefix: string
  endpoint_mode: string
  is_enabled: boolean
  priority: string
  capacity_weight: string
  max_concurrency: string
}

export type ModelCapabilityDraft = {
  capability: string
  operations: string[]
  rawDomain: Record<string, unknown>
}

export type ModelOperationInputSlot = {
  id: string
  labelKey: string
  mediaTypes: string[]
  min: number
  max: number
  roles: string[]
  ordered?: boolean
  descriptionKey?: string
}

export type ModelCapabilityParseResult = {
  drafts: ModelCapabilityDraft[]
  error: string
}

export type RouteProviderOption = {
  provider_id: string
  display_name: string
  provider_type?: string
  profile?: string
  adapter_key: string
  default_adapter_type?: string
  provider_kind: string
  provider_category: string
  base_url_prefix?: string
  is_enabled: boolean
  legacy_credential_id?: number
}

export type ProviderAssetSettings = {
  ark_openapi_base_url?: string
  ark_region?: string
  ark_access_key_id?: string
  ark_secret_access_key?: string
  ark_secret_key_set: boolean
  gateway_base_url?: string
  gateway_token?: string
  gateway_token_set: boolean
  gateway_poll_interval_ms?: number
  gateway_poll_max_ms?: number
}

export const emptyProviderAssetSettings: ProviderAssetSettings = {
  ark_openapi_base_url: 'https://ark.cn-beijing.volcengineapi.com',
  ark_region: 'cn-beijing',
  ark_access_key_id: '',
  ark_secret_access_key: '',
  ark_secret_key_set: false,
  gateway_base_url: '',
  gateway_token: '',
  gateway_token_set: false,
  gateway_poll_interval_ms: 2000,
  gateway_poll_max_ms: 120000,
}

export type ResourceAccessMode = 'public_tunnel' | 'public_backend' | 'object_relay' | 'provider_files' | 'provider_asset_uri'

export type ResourceAccessProfile = {
  id: string
  name?: string
  enabled: boolean
  mode: ResourceAccessMode
  public_base_url?: string
  internal_base_url?: string
  signing_enabled: boolean
  signing_secret?: string
  signing_secret_set: boolean
  expires_seconds?: number
  health_check_path?: string
}

export type ResourceAccessSettings = {
  profiles: ResourceAccessProfile[]
  default_profile_id?: string
}

export type ResourceAccessCheckResult = {
  resource_id: number
  media_type: string
  transport: string
  profile_id: string
  url: string
  expires_at: string
  reachable: boolean
  status_code?: number
  content_type?: string
  content_length?: number
  error?: string
}

export const emptyResourceAccessProfile = (): ResourceAccessProfile => ({
  id: '',
  name: '',
  enabled: true,
  mode: 'public_tunnel',
  public_base_url: '',
  internal_base_url: 'http://127.0.0.1:8766',
  signing_enabled: true,
  signing_secret: '',
  signing_secret_set: false,
  expires_seconds: 3600,
  health_check_path: '/api/v1/resource-access/health',
})

export type ModelRouteGroup = {
  key: string
  entry: AIModelCatalogEntry
  routeGroup: string
  bindings: AIModelRouteBinding[]
}

export function isValidInputLimit(value: number): boolean {
  return Number.isInteger(value) && value >= -1
}

export function inputLimitErrors(maxInputImages: number, maxInputVideos: number, t: (key: string) => string): string[] {
  const errors: string[] = []
  if (!isValidInputLimit(maxInputImages)) errors.push(t('admin.models.maxImagesInvalid'))
  if (!isValidInputLimit(maxInputVideos)) errors.push(t('admin.models.maxVideosInvalid'))
  return errors
}
export const CAPABILITY_TRANSLATION_KEYS: Record<string, string> = {
  text: 'admin.capabilities.text',
  reasoning: 'admin.capabilities.reasoning',
  image: 'admin.capabilities.image',
  video: 'admin.capabilities.video',
  audio: 'admin.capabilities.audio',
  text_generation: 'admin.capabilities.textGeneration',
  image_generation: 'admin.capabilities.imageGeneration',
  video_generation: 'admin.capabilities.videoGeneration',
  audio_generation: 'admin.capabilities.audioGeneration',
  embedding: 'admin.capabilities.embedding',
  rerank: 'admin.capabilities.rerank',
  moderation: 'admin.capabilities.moderation',
}

export const STRUCTURED_VIDEO_CAPABILITY_SAMPLE = JSON.stringify({
  video_generation: {
    operations: [
      'prompt_to_video',
      'reference_to_video',
    ],
    operation_slots: {
      reference_to_video: [
        {
          id: 'reference_images',
          label: '参考图片',
          min: 1,
          max: -1,
          required: true,
          roles: ['reference_image'],
          media_types: ['image'],
          description: '按顺序上传参考图，例如环境图、主角图、其他参考。',
        },
      ],
    },
  },
}, null, 2)

export const MODEL_CAPABILITIES = [
  'text_generation',
  'image_generation',
  'video_generation',
  'audio_generation',
  'embedding',
  'rerank',
  'moderation',
] as const

export const CAPABILITY_STATUS_INTENT: Record<string, StatusBadgeProps['intent']> = {
  text: 'info',
  reasoning: 'warning',
  image: 'neutral',
  video: 'neutral',
  audio: 'info',
  text_generation: 'info',
  image_generation: 'neutral',
  video_generation: 'neutral',
  audio_generation: 'info',
  embedding: 'neutral',
  rerank: 'neutral',
  moderation: 'warning',
}

export function catalogEntryTemplateForm(patch: Partial<CatalogEntryForm>): CatalogEntryForm {
  return { ...emptyCatalogEntryForm(), ...patch }
}

export function catalogEntryLabel(entry: AIModelCatalogEntry): string {
  return entry.display_name || entry.short_name || entry.public_model_id || `#${entry.ID}`
}

export function catalogEntryDetail(entry: AIModelCatalogEntry): string {
  const capabilities = entry.capabilities.split(',').map((item) => item.trim()).filter(Boolean)
  const routeCount = entry.route_bindings?.length ?? 0
  return [
    entry.public_model_id,
    capabilities.length > 0 ? capabilities.join(', ') : '',
    `${routeCount} route${routeCount === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ')
}

export function providerTemplateDefaultAdapter(template: AIProviderTemplate): string {
  return template.default_adapter_type || template.default_adapter_key || ''
}

export function providerDefaultAdapter(provider: AIProvider | RouteProviderOption): string {
  return provider.default_adapter_type || provider.adapter_key || ''
}

export function providerAccountKey(value: Pick<AIProvider | AIProviderTemplate | RouteProviderOption, 'provider_kind'> & {
  provider_type?: string
  profile?: string
}): string {
  if (value.provider_type) return value.profile ? `${value.provider_type}/${value.profile}` : value.provider_type
  return value.provider_kind
}

export function providerAccountLabel(value: Pick<AIProvider | AIProviderTemplate | RouteProviderOption, 'provider_kind'> & {
  provider_type?: string
  profile?: string
}): string {
  if (value.provider_type) return value.profile ? `${value.provider_type} · ${value.profile}` : value.provider_type
  return value.provider_kind
}

export const ROUTE_DIAGNOSTIC_CAPABILITY_PRESETS = [
  'video_generation',
  'image_generation',
  'audio_generation',
  'text_generation',
]

export const ROUTE_DIAGNOSTIC_OPERATION_PRESETS: Record<string, string[]> = {
  video_generation: [
    'prompt_to_video',
    'image_to_video',
    'first_frame_to_video',
    'first_last_frame_to_video',
    'reference_to_video',
    'edit_video',
    'extend_video',
    'upscale_video',
  ],
  image_generation: [
    'text_to_image',
    'reference_to_image',
    'edit_image',
    'inpaint',
    'outpaint',
    'variation',
    'upscale_image',
  ],
  audio_generation: [
    'text_to_speech',
    'speech_to_text',
    'speech_translate',
    'speech_to_speech',
    'voice_clone',
    'voice_design',
    'dubbing',
    'music_generation',
    'sound_effect_generation',
    'voice_isolation',
    'forced_alignment',
  ],
  text_generation: [
    'chat',
    'responses',
    'agent_task',
  ],
  embedding: [
    'embed',
  ],
  rerank: [
    'rerank',
  ],
  moderation: [
    'moderate',
  ],
}

export function adapterOperationOptions(adapter: AdapterDef | undefined, capability: string): string[] {
  const family = normalizeRouteCapabilityFamily(capability)
  const fromContracts = uniqueStringList((adapter?.operation_contracts ?? [])
    .filter((contract) => normalizeRouteCapabilityFamily(contract.capability) === family)
    .map((contract) => contract.operation))
  if (fromContracts.length > 0) return fromContracts
  const fromParamSets = uniqueStringList((adapter?.operation_param_sets ?? [])
    .filter((set) => normalizeRouteCapabilityFamily(set.capability) === family)
    .map((set) => set.operation))
  return fromParamSets
}

export function adapterOperationContract(adapter: AdapterDef | undefined, capability: string, operation: string) {
  const family = normalizeRouteCapabilityFamily(capability)
  return (adapter?.operation_contracts ?? []).find((contract) =>
    normalizeRouteCapabilityFamily(contract.capability) === family && contract.operation === operation,
  )
}

export function modelOperationInputSlots(operation: string): ModelOperationInputSlot[] {
  switch (operation.trim()) {
    case 'image_to_video':
    case 'first_frame_to_video':
      return [{
        id: 'first_frame',
        labelKey: 'admin.models.inputSlots.firstFrame',
        mediaTypes: ['image'],
        min: 1,
        max: 1,
        roles: ['first_frame', 'reference_image'],
      }]
    case 'first_last_frame_to_video':
      return [
        {
          id: 'first_frame',
          labelKey: 'admin.models.inputSlots.firstFrame',
          mediaTypes: ['image'],
          min: 1,
          max: 1,
          roles: ['first_frame'],
        },
        {
          id: 'last_frame',
          labelKey: 'admin.models.inputSlots.lastFrame',
          mediaTypes: ['image'],
          min: 1,
          max: 1,
          roles: ['last_frame'],
        },
      ]
    case 'reference_to_video':
      return [{
        id: 'reference_images',
        labelKey: 'admin.models.inputSlots.referenceImages',
        mediaTypes: ['image'],
        min: 1,
        max: -1,
        roles: ['reference_image'],
        ordered: true,
        descriptionKey: 'admin.models.inputSlots.referenceImagesHint',
      }]
    case 'edit_video':
      return [{
        id: 'target_video',
        labelKey: 'admin.models.inputSlots.targetVideo',
        mediaTypes: ['video'],
        min: 1,
        max: 1,
        roles: ['target_video'],
      }]
    case 'reference_to_image':
      return [{
        id: 'reference_images',
        labelKey: 'admin.models.inputSlots.referenceImages',
        mediaTypes: ['image'],
        min: 1,
        max: -1,
        roles: ['reference_image'],
        ordered: true,
      }]
    case 'edit_image':
    case 'inpaint':
    case 'outpaint':
    case 'variation':
      return [{
        id: 'target_image',
        labelKey: 'admin.models.inputSlots.targetImage',
        mediaTypes: ['image'],
        min: 1,
        max: 1,
        roles: ['target_image', 'reference_image'],
      }]
    default:
      return []
  }
}

function operationSlotsPayloadForOperations(operations: string[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  operations.forEach((operation) => {
    const slots = modelOperationInputSlots(operation).map((slot) => ({
      id: slot.id,
      label: slot.id,
      min: slot.min,
      max: slot.max,
      required: slot.min > 0,
      roles: slot.roles,
      media_types: slot.mediaTypes,
      ordered: Boolean(slot.ordered),
    }))
    if (slots.length > 0) out[operation] = slots
  })
  return out
}

export function routeDiagnosticStatusIntent(status: string): StatusBadgeProps['intent'] {
  switch (status) {
    case 'selected':
      return 'success'
    case 'accepted':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function routeDiagnosticCapabilityOptions(entry: AIModelCatalogEntry | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (value: string) => {
    const next = value.trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    out.push(next)
  }
  if (entry) modelCatalogCapabilities(entry).forEach(add)
  ROUTE_DIAGNOSTIC_CAPABILITY_PRESETS.forEach(add)
  return out
}

export function routeDiagnosticOperationOptions(entry: AIModelCatalogEntry | null, capability: string): string[] {
  const structured = structuredCapabilityOperations(entry?.model_capabilities_json, capability)
  if (structured.length > 0) return structured
  return ROUTE_DIAGNOSTIC_OPERATION_PRESETS[capability] ?? ['generate']
}

export function defaultRouteDiagnoseOperation(capability: string, operations: string[]): string {
  const preferred = capability === 'video_generation'
    ? ['first_last_frame_to_video', 'image_to_video', 'prompt_to_video']
    : []
  return preferred.find((operation) => operations.includes(operation)) ?? operations[0] ?? ''
}

export function routeDiagnosePayload(input: {
  entry: AIModelCatalogEntry | null
  capability: string
  operation: string
  routeGroup: string
  referenceAssets: string
}): AIModelRouteDiagnoseRequest {
  const referenceAssets = parseRouteDiagnoseReferenceAssets(input.referenceAssets)
  return {
    public_model_id: input.entry?.public_model_id,
    catalog_entry_id: input.entry?.ID,
    route_group: input.routeGroup.trim(),
    capability: input.capability.trim(),
    operation: input.operation.trim(),
    intent: {
      capability: input.capability.trim(),
      operation: input.operation.trim(),
      reference_assets: referenceAssets,
    },
    reference_assets: referenceAssets,
  }
}

export function parseRouteDiagnoseReferenceAssets(raw: string) {
  return raw.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, mediaType] = line.split(/[:\s]+/, 2)
      return { role: role ?? '', media_type: mediaType ?? '' }
    })
    .filter((item) => item.role || item.media_type)
}

export interface RuntimeProviderHealth {
  catalog_entry_id?: number
  route_binding_id?: number
  model_id: string
  model_def_id: string
  provider_name: string
  adapter_type: string
  priority: number
  capacity_weight: number
  max_concurrency: number
  is_enabled: boolean
  in_flight: number
  saturated: boolean
  successes: number
  failures: number
  consecutive_failures: number
  failure_rate: number
  circuit_open: boolean
  open_until?: string
  cooldown_remaining_ms: number
}

export interface RuntimeProviderHealthResponse {
  items: RuntimeProviderHealth[]
  total: number
}

export function emptyCatalogEntryForm(): CatalogEntryForm {
  return {
    public_model_id: '',
    display_name: '',
    short_name: '',
    is_enabled: true,
    capabilities: ['text_generation'],
    accepts_image: false,
    max_input_images: 0,
    max_input_videos: 0,
    input_image_field: '',
    supported_params: '',
    model_capabilities_json: defaultModelCapabilitiesJSONForCapabilities(['text_generation']),
  }
}

export function catalogEntryFormFromEntry(entry: AIModelCatalogEntry): CatalogEntryForm {
  const capabilities = modelCatalogCapabilities(entry)
  return {
    public_model_id: entry.public_model_id,
    display_name: entry.display_name,
    short_name: entry.short_name ?? '',
    is_enabled: entry.is_enabled,
    capabilities,
    accepts_image: Boolean(entry.accepts_image),
    max_input_images: entry.max_input_images ?? 0,
    max_input_videos: entry.max_input_videos ?? 0,
    input_image_field: entry.input_image_field ?? '',
    supported_params: entry.supported_params ?? '',
    model_capabilities_json: entry.model_capabilities_json?.trim()
      ? entry.model_capabilities_json
      : defaultModelCapabilitiesJSONForCapabilities(capabilities, {
        acceptsImage: Boolean(entry.accepts_image),
        maxInputImages: entry.max_input_images ?? 0,
        maxInputVideos: entry.max_input_videos ?? 0,
      }),
  }
}

export function catalogEntryFormFromTemplate(template: AIModelCatalogTemplate): CatalogEntryForm {
  const publicModelID = firstNonEmptyString(template.default_public_model_id, template.model_id, template.id)
  const capabilities = [...template.capabilities]
  return catalogEntryTemplateForm({
    public_model_id: publicModelID,
    display_name: template.display_name || publicModelID,
    short_name: publicModelID,
    capabilities,
    accepts_image: Boolean(template.accepts_image_input),
    max_input_images: template.max_input_images ?? 0,
    max_input_videos: template.max_input_videos ?? 0,
    input_image_field: template.input_image_field ?? '',
    supported_params: catalogTemplateSupportedParamsValue(template),
    model_capabilities_json: defaultModelCapabilitiesJSONForCapabilities(capabilities, {
      acceptsImage: Boolean(template.accepts_image_input),
      maxInputImages: template.max_input_images ?? 0,
      maxInputVideos: template.max_input_videos ?? 0,
    }),
  })
}

export function catalogTemplateSupportedParamsValue(template: AIModelCatalogTemplate): string {
  void template
  return ''
}

export function catalogTemplateIsRuntimeReady(template: AIModelCatalogTemplate): boolean {
  return (template.source_status ?? '').trim() !== 'template_only'
}

export function filterCatalogTemplates(templates: AIModelCatalogTemplate[], search: string, lab: string): AIModelCatalogTemplate[] {
  const needle = search.trim().toLowerCase()
  return templates.filter((template) => {
    if (lab && template.lab !== lab) return false
    if (!needle) return true
    return [
      template.id,
      template.lab,
      template.default_public_model_id,
      template.model_id,
      template.display_name,
      template.source_status,
      ...template.capabilities,
    ].some((value) => (value ?? '').toLowerCase().includes(needle))
  })
}

export function firstNonEmptyString(...values: Array<string | undefined>): string {
  for (const value of values) {
    const next = value?.trim()
    if (next) return next
  }
  return ''
}

export function catalogEntryPayload(form: CatalogEntryForm): Record<string, unknown> {
  return {
    public_model_id: form.public_model_id.trim(),
    display_name: form.display_name.trim() || form.public_model_id.trim(),
    short_name: form.short_name.trim(),
    is_enabled: form.is_enabled,
    capabilities: form.capabilities.join(','),
    accepts_image: form.accepts_image,
    max_input_images: form.max_input_images,
    max_input_videos: form.max_input_videos,
    input_image_field: form.input_image_field.trim(),
    supported_params: form.supported_params.trim(),
    model_capabilities_json: form.model_capabilities_json.trim(),
  }
}

export function emptyCatalogRouteForm(providerID = '', providerModelID = '', routeGroup = '', adapterType = ''): CatalogRouteForm {
  return {
    route_group: routeGroup,
    provider_id: providerID,
    adapter_type: adapterType,
    provider_model_id: providerModelID,
    endpoint_base_url: '',
    endpoint_path_prefix: '',
    endpoint_mode: 'inherit',
    is_enabled: true,
    priority: '0',
    capacity_weight: '1',
    max_concurrency: '0',
  }
}

export function emptyCatalogRouteFormForEntry(
  entry: AIModelCatalogEntry | null | undefined,
  providerID = '',
  providerModelID = '',
  routeGroup = '',
  adapterType = '',
): CatalogRouteForm {
  return emptyCatalogRouteForm(providerID, providerModelID, routeGroup, adapterType)
}

export function catalogRouteFormFromBinding(binding: AIModelRouteBinding): CatalogRouteForm {
  return {
    route_group: binding.route_group || '',
    provider_id: binding.provider_id || '',
    adapter_type: binding.adapter_type || '',
    provider_model_id: binding.provider_model_id || '',
    endpoint_base_url: binding.endpoint_base_url || '',
    endpoint_path_prefix: binding.endpoint_path_prefix || '',
    endpoint_mode: binding.endpoint_mode || 'inherit',
    is_enabled: binding.is_enabled,
    priority: String(binding.priority ?? 0),
    capacity_weight: String(binding.capacity_weight ?? 1),
    max_concurrency: String(binding.max_concurrency ?? 0),
  }
}

export function catalogRoutePayload(form: CatalogRouteForm): Record<string, unknown> {
  return {
    route_group: form.route_group.trim(),
    provider_id: form.provider_id.trim(),
    adapter_type: form.adapter_type.trim(),
    provider_model_id: form.provider_model_id.trim(),
    endpoint_base_url: form.endpoint_base_url.trim(),
    endpoint_path_prefix: form.endpoint_path_prefix.trim(),
    endpoint_mode: form.endpoint_mode.trim() || 'inherit',
    is_enabled: form.is_enabled,
    priority: parseInt(form.priority, 10) || 0,
    capacity_weight: Math.max(1, parseInt(form.capacity_weight, 10) || 1),
    max_concurrency: Math.max(0, parseInt(form.max_concurrency, 10) || 0),
  }
}

export function routeProviderOptionsFromProviders(providers: AIProvider[], credentials: AICredential[]): RouteProviderOption[] {
  if (providers.length > 0) {
    return providers.map((provider) => ({
      provider_id: provider.provider_id,
      display_name: provider.display_name || provider.provider_id,
      provider_type: provider.provider_type,
      profile: provider.profile,
      adapter_key: provider.adapter_key,
      default_adapter_type: provider.default_adapter_type,
      provider_kind: provider.provider_kind,
      provider_category: provider.provider_category,
      base_url_prefix: provider.base_url_prefix,
      is_enabled: provider.is_enabled,
      legacy_credential_id: legacyCredentialIDFromProvider(provider),
    }))
  }
  return credentials.map((credential) => ({
    provider_id: localProviderRouteProviderID(credential.ID),
    display_name: credential.display_name,
    adapter_key: credential.adapter_type,
    provider_kind: credential.adapter_type,
    provider_category: 'legacy_credential',
    base_url_prefix: credential.base_url,
    is_enabled: credential.is_enabled,
    legacy_credential_id: credential.ID,
  }))
}

export function enabledRouteProviderOptions(options: RouteProviderOption[]): RouteProviderOption[] {
  return options.filter((option) => option.is_enabled)
}

export function firstEnabledRouteProviderID(options: RouteProviderOption[]): string {
  return enabledRouteProviderOptions(options)[0]?.provider_id ?? options[0]?.provider_id ?? ''
}

export function providerOptionLabel(option: RouteProviderOption): string {
  const adapter = routeProviderAdapterValue(option)
  const parts = [
    option.display_name || option.provider_id,
    providerAccountLabel(option),
    adapter !== option.provider_kind ? adapter : '',
    option.is_enabled ? '' : 'disabled',
  ].filter(Boolean)
  return parts.join(' · ')
}

export function routeProviderAdapterLabel(option?: RouteProviderOption): string {
  return routeProviderAdapterValue(option) || '-'
}

export function routeProviderAdapterValue(option?: RouteProviderOption): string {
  if (!option) return ''
  return providerDefaultAdapter(option) || option.provider_kind || ''
}

export function legacyCredentialIDFromProvider(provider: AIProvider): number | undefined {
  for (const credential of provider.credentials ?? []) {
    const config = parseJSONRecord(credential.plain_config_json)
    const id = Number(config.legacy_credential_id)
    if (Number.isFinite(id) && id > 0) return id
  }
  const parsed = credentialIDFromProviderID(provider.provider_id)
  return parsed ?? undefined
}

export function parseJSONRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function stringListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
}

export function uniqueStringList(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  values.forEach((item) => {
    const value = item.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push(value)
  })
  return out
}

export function diagnosticCodesFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = recordFromUnknown(item)
    const code = typeof record.code === 'string' ? record.code.trim() : ''
    const severity = typeof record.severity === 'string' ? record.severity.trim() : ''
    return [severity, code].filter(Boolean).join(':')
  }).filter(Boolean)
}

export function localProviderRouteProviderID(credentialID?: number): string {
  return credentialID ? `local_provider:${credentialID}` : ''
}

export function localProviderCredentialIDFromProviderID(providerID: string): number | null {
  const prefix = 'local_provider:'
  if (!providerID.startsWith(prefix)) return null
  const parsed = Number(providerID.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function matchingCatalogTemplateForRoute(
  entry: AIModelCatalogEntry | null | undefined,
  templates: AIModelCatalogTemplate[],
): AIModelCatalogTemplate | null {
  if (!entry) return null
  const publicModelID = entry.public_model_id.trim()
  if (!publicModelID) return null
  const candidates = templates.filter((template) => {
    if (!catalogTemplateIsRuntimeReady(template)) return false
    return template.default_public_model_id === publicModelID || template.model_id === publicModelID
  })
  if (candidates.length === 0) return null
  return candidates[0]
}

export function suggestedProviderModelIDForEntry(
  entry: AIModelCatalogEntry | null | undefined,
  templates: AIModelCatalogTemplate[],
): string {
  return matchingCatalogTemplateForRoute(entry, templates)?.model_id ?? ''
}

export function adapterTypeForRouteProviderID(providerID: string, credentials: AICredential[], routeProviders: RouteProviderOption[]): string {
  const option = routeProviders.find((candidate) => candidate.provider_id === providerID)
  if (option) return routeProviderAdapterValue(option)
  const credentialID = localProviderCredentialIDFromProviderID(providerID)
  if (!credentialID) return providerID === 'relay_gateway' ? 'openai_compat' : ''
  return credentials.find((credential) => credential.ID === credentialID)?.adapter_type ?? ''
}

export function shouldReplaceRouteProviderModelID(current: string, entry: AIModelCatalogEntry | null, templates: AIModelCatalogTemplate[]): boolean {
  const value = current.trim()
  if (!value) return true
  if (entry && value === entry.public_model_id) return true
  return templates.some((template) => template.model_id === value)
}

export function defaultModelCapabilitiesJSONForCapabilities(
  capabilities: string[],
  legacyInput?: { acceptsImage?: boolean; maxInputImages?: number; maxInputVideos?: number },
  adapter?: AdapterDef,
): string {
  const families = modelCapabilityFamiliesFromList(capabilities)
  const drafts = (families.length > 0 ? families : ['text_generation']).map((capability) => defaultModelCapabilityDraft(capability, legacyInput, adapter))
  return modelCapabilityDraftsToJSON(drafts)
}

export function modelCapabilityFamiliesFromList(capabilities: string[]): string[] {
  return uniqueStringList(capabilities.map(normalizeRouteCapabilityFamily))
}

export function defaultModelCapabilityDraft(
  capability: string,
  legacyInput?: { acceptsImage?: boolean; maxInputImages?: number; maxInputVideos?: number },
  adapter?: AdapterDef,
): ModelCapabilityDraft {
  void legacyInput
  const family = normalizeRouteCapabilityFamily(capability)
  const adapterOperations = adapterOperationOptions(adapter, family)
  const operations = adapterOperations.length > 0 ? adapterOperations : ROUTE_DIAGNOSTIC_OPERATION_PRESETS[family] ?? ['generate']
  return {
    capability: family,
    operations,
    rawDomain: {},
  }
}

export function modelCatalogCapabilities(entry: Pick<AIModelCatalogEntry, 'capabilities' | 'model_capabilities_json'>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (capability: string) => {
    const value = capability.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push(value)
  }
  entry.capabilities.split(',').forEach(add)
  structuredCapabilityDomains(entry.model_capabilities_json).forEach(add)
  return out
}

export function normalizeRouteCapabilityFamily(capability: string): string {
  const value = capability.trim()
  if (value === 'text' || value === 'reasoning') return 'text_generation'
  return value
}

export function structuredCapabilityDomains(value?: string): string[] {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.keys(parsed).filter(Boolean)
  } catch {
    return []
  }
}

export function structuredCapabilityOperations(value: string | undefined, capability: string): string[] {
  if (!value?.trim() || !capability.trim()) return []
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const capabilityValue = recordFromUnknown(parsed[capability])
    return structuredCapabilityOperationsFromDomain(capabilityValue)
  } catch {
    return []
  }
}

export function structuredCapabilityOperationsFromDomain(domain: Record<string, unknown>): string[] {
  const operations = operationNamesFromUnknown(domain.operations)
  Object.keys(recordFromUnknown(domain.operation_slots)).forEach((operation) => operations.push(operation))
  return uniqueStringList(operations)
}

export function operationNamesFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStringList(value.map((item) => {
      if (typeof item === 'string') return item
      const record = recordFromUnknown(item)
      return typeof record.id === 'string'
        ? record.id
        : typeof record.operation === 'string'
          ? record.operation
          : ''
    }))
  }
  const record = recordFromUnknown(value)
  return uniqueStringList(Object.entries(record).map(([operation, raw]) => {
    const def = recordFromUnknown(raw)
    if (typeof def.id === 'string' && def.id.trim()) return def.id
    if (typeof def.operation === 'string' && def.operation.trim()) return def.operation
    return operation
  }))
}

export function routeCapabilityOperationOptions(entry: AIModelCatalogEntry | null | undefined, capability: string): string[] {
  const family = normalizeRouteCapabilityFamily(capability)
  const structured = structuredCapabilityOperations(entry?.model_capabilities_json, family)
  if (structured.length > 0) return structured
  return ROUTE_DIAGNOSTIC_OPERATION_PRESETS[family] ?? ['generate']
}

export function parseModelCapabilityDrafts(raw: string): ModelCapabilityParseResult {
  if (!raw.trim()) return { drafts: [], error: '' }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { drafts: [], error: '模型能力配置必须是 JSON object。' }
    }
    return {
      drafts: Object.entries(parsed).map(([capability, domain]) => modelCapabilityDraftFromDomain(capability, recordFromUnknown(domain))),
      error: '',
    }
  } catch {
    return { drafts: [], error: '模型能力配置不是有效 JSON。' }
  }
}

export function modelCapabilityDraftFromDomain(capability: string, domain: Record<string, unknown>): ModelCapabilityDraft {
  return {
    capability: normalizeRouteCapabilityFamily(capability),
    operations: structuredCapabilityOperationsFromDomain(domain),
    rawDomain: domain,
  }
}

export function modelCapabilityDraftsToJSON(drafts: ModelCapabilityDraft[]): string {
  const out: Record<string, unknown> = {}
  drafts.forEach((draft) => {
    const capability = normalizeRouteCapabilityFamily(draft.capability)
    const operations = uniqueStringList(draft.operations)
    if (!capability || operations.length === 0) return
    const domain: Record<string, unknown> = { ...draft.rawDomain, operations }
    const operationSlots = operationSlotsPayloadForOperations(operations)
    if (Object.keys(operationSlots).length > 0) domain.operation_slots = operationSlots
    else delete domain.operation_slots
    delete domain.reference_assets
    delete domain.result_mode
    delete domain.duration
    delete domain.aspect_ratios
    delete domain.resolutions
    out[capability] = domain
  })
  return Object.keys(out).length > 0 ? JSON.stringify(out, null, 2) : ''
}

export type ModelManagementViewMode = 'providers' | 'catalog' | 'routes'
export type ModelProviderStatusFilter = 'all' | 'ready' | 'missing' | 'disabled'
export type ModelCatalogStatusFilter = 'all' | 'enabled' | 'disabled'
export type ModelCatalogRouteFilter = 'all' | 'with-routes' | 'missing-routes'
export type ModelRouteCoverageFilter = 'all' | 'missing-routes' | 'disabled-routes'
export type ModelRouteGroupFilter = 'all' | string

export const MODEL_ADMIN_PAGE_SIZE = 25
export const MODEL_ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export function defaultModelManagementViewMode(): ModelManagementViewMode {
  return runtimeCapabilities.relayGatewayGroup ? 'routes' : 'providers'
}

export function modelManagementRoute(view: ModelManagementViewMode): string {
  switch (view) {
    case 'catalog':
      return '/models/catalog'
    case 'routes':
      return '/models/routes'
    default:
      return '/models/providers'
  }
}

export function normalizeModelAdminSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function modelAdminTextMatches(search: string, values: Array<string | number | undefined | null>): boolean {
  const needle = normalizeModelAdminSearch(search)
  if (!needle) return true
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle))
}

export function modelAdminPaginationSlice<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const normalizedPage = Math.max(1, Math.min(page, pageCount))
  return {
    page: normalizedPage,
    pageCount,
    items: items.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize),
  }
}

export function routeGroupFilterOptions(groups: ModelRouteGroup[]): string[] {
  return uniqueStringList(groups.map((group) => group.routeGroup)).sort((a, b) => {
    if (a === b) return 0
    if (!a) return -1
    if (!b) return 1
    return a.localeCompare(b)
  })
}

export function providerInstanceReady(instance: ProviderInstance): boolean {
  const missingConfig = instance.config_fields.some((field) => field.required && !field.configured)
  const missingSecret = instance.secret_fields.some((field) => field.required && !field.configured)
  return instance.enabled && instance.configured && !missingConfig && !missingSecret
}

export function providerInstanceRef(instance: ProviderInstance): ProviderInstance['ref'] {
  return instance.ref
}

export function buildModelRouteGroups(entries: AIModelCatalogEntry[]): ModelRouteGroup[] {
  return entries.flatMap((entry) => {
    const bindings = entry.route_bindings ?? []
    if (bindings.length === 0) {
      return [{
        key: modelRouteGroupKey(entry.ID, ''),
        entry,
        routeGroup: '',
        bindings: [],
      }]
    }
    const groups = new Map<string, ModelRouteGroup>()
    bindings.forEach((binding) => {
      const routeGroup = (binding.route_group ?? '').trim()
      const key = modelRouteGroupKey(entry.ID, routeGroup)
      const group = groups.get(key) ?? {
        key,
        entry,
        routeGroup,
        bindings: [],
      }
      group.bindings.push(binding)
      groups.set(key, group)
    })
    return [...groups.values()].sort((a, b) => {
      if (a.routeGroup === b.routeGroup) return 0
      if (!a.routeGroup) return -1
      if (!b.routeGroup) return 1
      return a.routeGroup.localeCompare(b.routeGroup)
    })
  })
}

export function modelRouteGroupKey(entryID: number, routeGroup: string): string {
  return `${entryID}:${routeGroup || '__default__'}`
}

export function sortRouteBindings(bindings: AIModelRouteBinding[]): AIModelRouteBinding[] {
  return [...bindings].sort((a, b) => (
    Number(b.is_enabled) - Number(a.is_enabled) ||
    (b.priority ?? 0) - (a.priority ?? 0) ||
    (b.capacity_weight ?? 1) - (a.capacity_weight ?? 1) ||
    routeBindingStableKey(a).localeCompare(routeBindingStableKey(b))
  ))
}

export function routeBindingStableKey(binding: AIModelRouteBinding): string {
  return [
    binding.provider_id || '',
    binding.provider_model_id || '',
    String(binding.ID),
  ].join(':')
}

export function routeGroupDisplayName(routeGroup: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  return routeGroup.trim() || t('admin.modelCatalog.defaultRouteGroup', { defaultValue: '默认分组' })
}

export function credentialIDFromProviderID(providerID?: string): number | null {
  const value = providerID?.trim() ?? ''
  if (!value.startsWith('local_provider:')) return null
  const id = Number(value.slice('local_provider:'.length))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function routeProviderForBinding(binding: AIModelRouteBinding, providerByID: Map<string, RouteProviderOption>): RouteProviderOption | undefined {
  const providerID = binding.provider_id || ''
  return providerID ? providerByID.get(providerID) : undefined
}

export function routeBindingProviderLabel(binding: AIModelRouteBinding, provider: RouteProviderOption | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (binding.source_type === 'relay_gateway') {
    return t('admin.modelCatalog.relayGatewayRoute')
  }
  return provider?.display_name || binding.provider_id || t('admin.modelCatalog.localProviderRoute')
}

export function routeGroupActivePool(bindings: AIModelRouteBinding[]): { priority: number; count: number } | null {
  const enabled = bindings.filter((binding) => binding.is_enabled)
  if (enabled.length === 0) return null
  const priority = Math.max(...enabled.map((binding) => binding.priority ?? 0))
  return {
    priority,
    count: enabled.filter((binding) => (binding.priority ?? 0) === priority).length,
  }
}

export function routeGroupFallbackPriorities(bindings: AIModelRouteBinding[]): number[] {
  const active = routeGroupActivePool(bindings)
  if (!active) return []
  return [...new Set(
    bindings
      .filter((binding) => binding.is_enabled && (binding.priority ?? 0) < active.priority)
      .map((binding) => binding.priority ?? 0),
  )].sort((a, b) => b - a)
}

export function providerSupportsAssetLibrary(provider: AIProvider): boolean {
  return parseJSONRecord(provider.asset_library_state_json).supports_asset_library === true
}

export function providerAssetSettingsFromProviderState(provider: AIProvider): ProviderAssetSettings {
  const settings = recordFromUnknown(parseJSONRecord(provider.asset_library_state_json).settings)
  const source = settings.ark_credentials_source === 'provider' ? 'provider' : 'missing'
  const gatewaySource = settings.gateway_credentials_source === 'provider' || settings.gateway_credentials_source === 'provider_runtime' ? 'provider' : 'missing'
  return {
    ...emptyProviderAssetSettings,
    ark_openapi_base_url: source === 'provider' && typeof settings.ark_openapi_base_url === 'string' && settings.ark_openapi_base_url
      ? settings.ark_openapi_base_url
      : emptyProviderAssetSettings.ark_openapi_base_url,
    ark_region: source === 'provider' && typeof settings.ark_region === 'string' && settings.ark_region
      ? settings.ark_region
      : emptyProviderAssetSettings.ark_region,
    ark_access_key_id: source === 'provider' && typeof settings.ark_access_key_id === 'string' ? settings.ark_access_key_id : '',
    ark_secret_key_set: source === 'provider' && settings.ark_secret_key_set === true,
    gateway_base_url: gatewaySource === 'provider' && typeof settings.gateway_base_url === 'string' ? settings.gateway_base_url : '',
    gateway_token_set: gatewaySource === 'provider' && settings.gateway_token_set === true,
    gateway_poll_interval_ms: typeof settings.gateway_poll_interval_ms === 'number' ? settings.gateway_poll_interval_ms : emptyProviderAssetSettings.gateway_poll_interval_ms,
    gateway_poll_max_ms: typeof settings.gateway_poll_max_ms === 'number' ? settings.gateway_poll_max_ms : emptyProviderAssetSettings.gateway_poll_max_ms,
  }
}

export function runtimeHealthRank(item: RuntimeProviderHealth) {
  if (!item.is_enabled) return 4
  if (item.circuit_open) return 3
  if (item.saturated) return 2
  if (item.failures > 0) return 1
  return 0
}

export function runtimeHealthKey(item: RuntimeProviderHealth) {
  if (item.route_binding_id) return `route:${item.route_binding_id}`
  if (item.catalog_entry_id) return `catalog:${item.catalog_entry_id}:${item.provider_name}:${item.adapter_type}`
  return [item.provider_name, item.adapter_type, item.model_id || item.model_def_id].join(':')
}

export function runtimeHealthState(item: RuntimeProviderHealth, t: (key: string, options?: Record<string, unknown>) => string): {
  label: string
  statusProps: Pick<StatusBadgeProps, 'intent' | 'emphasis'>
} {
  if (!item.is_enabled) {
    return { label: t('admin.models.runtimeHealthDisabled'), statusProps: { intent: 'neutral', emphasis: 'soft' } }
  }
  if (item.circuit_open) {
    return { label: t('admin.models.runtimeHealthCircuitOpen'), statusProps: { intent: 'danger', emphasis: 'soft' } }
  }
  if (item.saturated) {
    return { label: t('admin.models.runtimeHealthSaturated'), statusProps: { intent: 'warning', emphasis: 'soft' } }
  }
  if (item.failures > 0) {
    return { label: t('admin.models.runtimeHealthDegraded'), statusProps: { intent: 'warning', emphasis: 'soft' } }
  }
  return { label: t('admin.models.runtimeHealthHealthy'), statusProps: { intent: 'success', emphasis: 'soft' } }
}

export function formatFailureRate(value: number) {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 1000) / 10}%`
}

export function formatRuntimeCooldown(ms: number) {
  if (ms <= 0) return '0s'
  return `${Math.ceil(ms / 1000)}s`
}

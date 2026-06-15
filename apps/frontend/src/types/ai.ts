// AICredential stores authentication credentials for one adapter type.
export interface AICredential {
  ID: number
  adapter_type: string  // adapter type constant (e.g. "openai_compat", "kling")
  display_name: string
  base_url: string
  masked_key: string
  is_enabled: boolean
  models?: AIModelConfig[]
  files_api_enabled: boolean
  files_api_base_url: string
  files_api_masked_key: string
  CreatedAt: string
  UpdatedAt: string
}

// AIModelConfig registers a model and stores all metadata + admin credit prices.
export interface AIModelConfig {
  ID: number
  credential_id: number
  model_def_id: string           // the API model ID (e.g. "gpt-4o", "gemini-2.0-flash")
  model_id_override: string      // optional override for the API-level model ID (e.g. Volcengine ep-xxx)
  is_enabled: boolean
  priority: number
  capacity_weight: number
  max_concurrency: number
  credits_input_per_1m: number
  credits_output_per_1m: number
  credits_per_image: number
  credits_per_second: number
  credits_per_call: number
  custom_display_name: string
  short_name: string
  custom_capabilities: string    // comma-separated: "text","image","image_edit","video","video_i2v","video_v2v"
  custom_pricing_mode: string    // "per_token"|"per_image"|"per_second"|"per_call"
  custom_accepts_image: boolean
  custom_max_input_images: number
  custom_max_input_videos: number
  custom_image_edit_field: string
  custom_supported_params: string // JSON: ParamDef[] or ModelParamProfile
  CreatedAt: string
  UpdatedAt: string
}

// CredField describes one credential input field for an adapter.
export interface CredField {
  key: string
  label: string
  hint?: string
  required: boolean
}

// AdapterDef describes a supported adapter — one set of credentials + one adapter implementation.
export interface AdapterDef {
  adapter_type: string
  display_name: string
  description: string
  default_base_url: string
  cred_fields: CredField[]
  supports_files_api: boolean  // true = provider has a Files API for pre-uploading media
  param_sets?: AdapterParamSet[]
}

// AdapterParamSet is the adapter-level default generation parameter schema for a capability.
export interface AdapterParamSet {
  capability: string
  params: ParamDef[]
}

// ModelPreset is a read-only admin UI template for quickly adding a model.
// Runtime routing and generation parameters never consult this list.
export interface ModelPreset {
  id: string
  model_id: string
  display_name: string
  capabilities: string[]
  pricing_mode: 'per_token' | 'per_image' | 'per_second' | 'per_call'
  adapter_type: string
  accepts_image_input: boolean
  max_input_images: number
  max_input_videos: number
  image_edit_field?: string
  ref_input_usd_per_1m?: number
  ref_output_usd_per_1m?: number
  ref_usd_per_image?: number
  ref_usd_per_second?: number
}

// ParamDef describes a user-configurable generation parameter for a model.
export interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'boolean' | 'string'
  options?: string[]
  default?: string | number | boolean
  min?: number
  max?: number
  step?: number
  json_schema?: Record<string, unknown>
  conflicts_with?: string[]
  conditional_enum?: ParamConditionalEnum[]
  conditional_const?: ParamConditionalConst[]
  requires_value?: ParamRequiresValue[]
}

export interface ParamConditionalEnum {
  when_param: string
  when_value: string | number | boolean
  options: string[]
}

export interface ParamConditionalConst {
  when_param: string
  when_value: string | number | boolean
  value: string | number | boolean
}

export interface ParamRequiresValue {
  param: string
  value: string | number | boolean
}

export interface ModelParamProfile {
  allow?: string[]
  deny?: string[]
  override?: Record<string, ParamDef>
  add?: ParamDef[]
}

export interface ModelInputRequirement {
  min: number
  max: number
}

export interface ModelInputRequirements {
  image: ModelInputRequirement
  video: ModelInputRequirement
}

// PublicModel is the user-facing model representation.
export interface PublicModel {
  id: number
  credential_id: number        // parent AICredential ID (for admin inline edit)
  model_id: string             // public logical model ID used by callers
  display_name: string
  short_name?: string
  provider_name?: string       // admin/debug only; product UI should not expose providers
  logical_model_id?: string
  provider_variant_count?: number
  capabilities: string[]       // e.g. ["text"], ["image"], ["video"], ["image_edit"]
  accepts_image_input: boolean // true for image_edit and i2v models
  is_default?: boolean         // true when admin-pinned as the default for this capability
  model_def_id?: string
  model_id_override?: string   // actual model ID sent to API if overridden
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
  supported_params?: ParamDef[]
  input_requirements?: ModelInputRequirements
  params_schema?: Record<string, unknown>
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readModelManagementSource() {
  return [
    'src/features/model-management/pages/ModelManagementPage.tsx',
    'src/features/model-management/model/modelManagementModel.ts',
    'src/features/model-management/components/ModelCatalogSection.tsx',
    'src/features/model-management/components/ModelManagementControls.tsx',
    'src/features/model-management/components/ModelRouteDialogs.tsx',
    'src/features/model-management/components/ModelRouteMatrix.tsx',
    'src/features/model-management/components/ModelRoutesSection.tsx',
    'src/features/model-management/components/ProviderOnboarding.tsx',
    'src/features/model-management/components/ProviderRuntimePanels.tsx',
  ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')
}

function readCloudFileConfigSource() {
  return [
    'src/features/cloud-files-admin/pages/CloudFileConfigPage.tsx',
    'src/features/cloud-files-admin/components/ResourceAccessSettingsPanel.tsx',
    'src/features/cloud-files-admin/model/cloudFileConfig.ts',
    'src/features/cloud-files-admin/model/resourceAccess.ts',
  ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')
}

test('model management view is owned by routes instead of query parameter tabs', () => {
  const source = readModelManagementSource()

  assert.match(source, /function defaultModelManagementViewMode\(\): ModelManagementViewMode \{[\s\S]*runtimeCapabilities\.relayGatewayGroup \? 'routes' : 'providers'/)
  assert.match(source, /function modelManagementRoute\(view: ModelManagementViewMode\): string/)
  assert.match(source, /case 'catalog':\s*return '\/models\/catalog'/)
  assert.match(source, /case 'routes':\s*return '\/models\/routes'/)
  assert.match(source, /return '\/models\/providers'/)
  assert.match(source, /export function ModelManagementPage\(\{ view = defaultModelManagementViewMode\(\) \}: \{ view\?: ModelManagementViewMode \} = \{\}\)/)
  assert.match(source, /const viewMode = view/)
  assert.match(source, /navigate\(modelManagementRoute\(nextViewMode\)\)/)
  assert.doesNotMatch(source, /MODEL_MANAGEMENT_VIEW_MODE_ALIASES|modelManagementViewModeFromSearchParams|ModelTopologyNav|externalViewModeSelected/)
  assert.doesNotMatch(source, /searchParams\.get\('tab'\)|nextSearchParams\.set\('tab'/)
})

test('model catalog templates come from backend and keep public id separate from provider model id', () => {
	const source = readModelManagementSource()
	const types = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8')
	const templateType = types.match(/export interface AIModelCatalogTemplate \{[\s\S]*?\n\}/)?.[0] ?? ''

	assert.match(templateType, /default_public_model_id: string[\s\S]*model_id: string/)
	assert.match(templateType, /lab: string/)
	assert.match(templateType, /source_status\?: string/)
	assert.match(templateType, /route_adapter_hint\?: string/)
	assert.doesNotMatch(templateType, /adapter_type/)
  assert.match(source, /api\.get\('\/admin\/model-catalog\/templates'\)/)
  assert.match(source, /templateLabOptions/)
  assert.match(source, /filterCatalogTemplates\(catalogTemplates, templateSearch, templateLab\)/)
  assert.match(source, /function catalogTemplateIsRuntimeReady\(template: AIModelCatalogTemplate\): boolean/)
  assert.match(source, /if \(!catalogTemplateIsRuntimeReady\(template\)\) return false/)
  assert.doesNotMatch(source, /catalogTemplateSourceStatusLabel/)
  assert.doesNotMatch(source, /catalogTemplateSourceStatusIntent/)
  assert.doesNotMatch(source, /可路由/)
  assert.match(source, /public_model_id: publicModelID/)
  assert.match(source, /firstNonEmptyString\(template\.default_public_model_id, template\.model_id, template\.id\)/)
  assert.match(source, /routeTemplateSuggestion\.model_id/)
  assert.match(source, /suggestedProviderModelIDForEntry/)
  assert.match(source, /defaultModelCapabilitiesJSONForCapabilities\([\s\S]*adapter\)/)
  assert.doesNotMatch(source, /public_model_id:\s*template\.id/)
  assert.doesNotMatch(source, /adapter:\s*\{template\.adapter_type\}/)
  assert.doesNotMatch(source, /candidates\.find\(\(template\) => template\.adapter_type === adapterType\)/)
})

test('model catalog dialog uses structured capability config with scoped scroll panes', () => {
  const source = readModelManagementSource()
  const model = readFileSync(resolve(process.cwd(), 'src/features/model-management/model/modelManagementModel.ts'), 'utf8')
  const catalog = readFileSync(resolve(process.cwd(), 'src/features/model-management/components/ModelCatalogSection.tsx'), 'utf8')
  const zh = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.json'), 'utf8')
  const en = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en-US.json'), 'utf8')
  const sample = model.match(/export const STRUCTURED_VIDEO_CAPABILITY_SAMPLE = JSON\.stringify\([\s\S]*?\n\}, null, 2\)/)?.[0] ?? ''

  assert.match(source, /export type ModelCapabilityDraft = \{/)
  assert.match(source, /function parseModelCapabilityDrafts\(raw: string\): ModelCapabilityParseResult/)
  assert.match(source, /function modelCapabilityDraftsToJSON\(drafts: ModelCapabilityDraft\[\]\): string/)
  assert.match(catalog, /function ModelCapabilitiesEditor\(/)
  assert.match(catalog, /parseModelCapabilityDrafts\(value\)/)
  assert.match(catalog, /modelCapabilityDraftsToJSON/)
  assert.match(catalog, /function ModelOperationContractPreview\(/)
  assert.match(catalog, /adapterOperationContract\(adapter, draft\.capability, operation\)/)
  assert.match(catalog, /modelOperationInputSlots\(operation\)/)
  assert.doesNotMatch(catalog, /referenceRoles/)
  assert.doesNotMatch(catalog, /resultOptionsTitle/)
  assert.match(catalog, /flex max-h-\[calc\(100vh-32px\)\][\s\S]*overflow-hidden/)
  assert.match(catalog, /grid min-h-0 flex-1[\s\S]*lg:grid-cols-\[320px_minmax\(0,1fr\)\]/)
  assert.match(catalog, /min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.doesNotMatch(catalog, /catalogForm\.accepts_image/)
  assert.doesNotMatch(catalog, /catalogForm\.max_input_images/)
  assert.doesNotMatch(catalog, /catalogForm\.max_input_videos/)
  assert.doesNotMatch(catalog, /catalogForm\.input_image_field/)
  assert.match(sample, /'image_to_video'/)
  assert.doesNotMatch(sample, /'reference_to_video'/)
  assert.match(model, /case 'image_to_video':[\s\S]*id: 'reference_images'[\s\S]*roles: \['generic', 'reference_image'\][\s\S]*case 'first_frame_to_video':/)
  assert.match(model, /case 'reference_to_video':[\s\S]*id: 'reference_media'[\s\S]*mediaTypes: \['image', 'video', 'audio'\][\s\S]*roles: \['generic', 'reference_image', 'reference_video', 'reference_audio'\]/)
  assert.match(zh, /"reference_to_video": "全能参考生视频"/)
  assert.match(zh, /"referenceMedia": "参考素材"/)
  assert.match(en, /"referenceMedia": "Reference media"/)
  assert.match(zh, /"maxInputImages": "最大图片输入数"/)
  assert.match(en, /"maxInputImages": "Max input images"/)
})

test('route binding view allows adapter override per route binding', () => {
  const source = readModelManagementSource()
  const model = readFileSync(resolve(process.cwd(), 'src/features/model-management/model/modelManagementModel.ts'), 'utf8')

  assert.match(source, /function routeProviderAdapterLabel\(option\?: RouteProviderOption\): string/)
  assert.match(source, /function routeProviderAdapterValue\(option\?: RouteProviderOption\): string/)
  assert.match(source, /function ModelRoutesSection\(\{ credentials, providers, adapters \}/)
  assert.match(source, /adapters=\{routeAdapterOptions\}/)
  assert.match(source, /function NewAPIProtocolProfileSelect\(/)
  assert.match(source, /effectiveRouteFormAdapterType/)
  assert.match(source, /protocol_profile: nextEffectiveAdapterType === NEW_API_ADAPTER_TYPE/)
  assert.match(source, /const selectedProfile = profiles\.find\(\(profile\) => profile\.value === value\)/)
  assert.match(source, /newAPIProtocolProfileCapability/)
  assert.match(source, /newAPIProtocolProfileEndpoint/)
  assert.match(source, /newAPIProtocolProfileInheritsDriver/)
  assert.match(source, /newAPIProtocolProfileOperations/)
  assert.match(source, /newAPIProtocolProfileRecognizedParams/)
  assert.match(source, /selectedProfile\.operations\?\.length[\s\S]*selectedProfile\.operations\.join\(', '\)/)
  assert.match(source, /selectedProfile\.recognized_params\?\.length[\s\S]*selectedProfile\.recognized_params\.join\(', '\)/)
  assert.match(model, /recognized_params: profile\.recognized_params/)
  assert.match(source, /newAPIJimengProviderModelIdHint/)
  assert.match(source, /placeholder=\{formUsesNewAPI && form\.protocol_profile === 'jimeng_action_json' \? 'default req_key' : 'provider model id'\}/)
  assert.match(source, /binding\.protocol_profile && \(/)
  assert.match(source, /<StatusBadge intent="neutral" className="font-mono text-\[11px\]">[\s\S]*\{binding\.protocol_profile\}/)
  assert.match(model, /gemini_image_generate_content_json/)
  assert.match(model, /gemini_audio_generate_content_json/)
  assert.match(model, /const profiles = \(adapter\?\.protocol_profiles \?\? \[\]\)[\s\S]*if \(profiles\.length > 0\) return profiles[\s\S]*return NEW_API_PROTOCOL_PROFILE_OPTIONS\.map/)
  assert.match(source, /adapter: \{binding\.adapter_type \|\| routeProviderAdapterLabel\(provider\)\}/)
})

test('route management exposes operation-based route diagnostics', () => {
  const source = readModelManagementSource()
  const types = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8')

  assert.match(types, /export interface AIModelRouteDiagnosis/)
  assert.match(types, /effective_endpoint\?: AIModelRouteDiagnosticEndpoint/)
  assert.match(types, /resource_access\?: AIModelRouteResourceAccess/)
  assert.match(source, /api\.post\('\/admin\/model-routes\/diagnose', routeDiagnosePayload/)
  assert.match(source, /routeDiagnoseCapability/)
  assert.match(source, /routeDiagnoseOperation/)
  assert.match(source, /Route 测试必须先选择 operation/)
  assert.match(source, /diagnosis\.selected_route_id/)
  assert.match(source, /candidate\.effective_endpoint/)
  assert.match(source, /candidate\.resource_access\?\.required/)
  assert.match(source, /depends_on:\$\{candidate\.resource_access\.depends_on\}/)
  assert.match(source, /candidate\.reasons/)
  assert.match(source, /disabled=\{!canDiagnoseRoute \|\| diagnoseRoute\.isPending\}/)
})

test('resource access panel can verify public raw resource URLs', () => {
  const source = readCloudFileConfigSource()

  assert.match(source, /type ResourceAccessCheckResult = \{[\s\S]*reachable: boolean[\s\S]*status_code\?: number[\s\S]*content_type\?: string[\s\S]*content_length\?: number/)
  assert.match(source, /api\.post\('\/resource-access\/check'/)
  assert.match(source, /resource_id: resourceID/)
  assert.match(source, /Test public URL/)
  assert.match(source, /HTTP \{checkResult\.status_code\}/)
  assert.match(source, /admin\.resourceAccess\.check\.bytes/)
  assert.match(source, /count: checkResult\.content_length/)
})

test('Yunwu model import can start from API key and preserves unmapped routes for diagnosis', () => {
  const source = readModelManagementSource()

  assert.match(source, /const \[importProviderKind, setImportProviderKind\] = useState\('openai_compat_gateway'\)/)
  assert.match(source, /importProviderKind === 'yunwu_gateway' \|\| importProviderKind === 'new_api_gateway'[\s\S]*\? importProviderKind[\s\S]*: providerKindForImportBaseURL\(baseURL\)/)
  assert.match(source, /const importProviderUsesDefaultBaseURL = importProviderKind === 'yunwu_gateway' \|\| importProviderKind === 'new_api_gateway'/)
  assert.match(source, /const canPreview = Boolean\(apiKey\.trim\(\) && \(baseURL\.trim\(\) \|\| importProviderUsesDefaultBaseURL\)\)/)
  assert.match(source, /留空使用 https:\/\/yunwu\.ai\/v1/)
  assert.match(source, /data\.provider_kind === 'yunwu_gateway'[\s\S]*\? model\.status !== 'route_exists'[\s\S]*: model\.recommended && model\.status !== 'route_exists'/)
  assert.match(source, /云雾同步会保留缺映射模型并禁用其 route/)
})

test('New API model import is exposed as an aggregate gateway with capability caution', () => {
  const source = readModelManagementSource()

  assert.match(source, /key: 'new_api_gateway', label: 'New API 中转站'/)
  assert.match(source, /留空使用 https:\/\/api\.newapi\.pro\/v1/)
  assert.match(source, /return 'new_api_gateway'/)
  assert.match(source, /providerKind === 'new_api_gateway'[\s\S]*return 'New API 中转站'/)
  assert.match(source, /New API 是聚合中转站，导入得到的是中转站暴露的模型列表/)
  assert.match(source, /preview\.provider_kind === 'new_api_gateway'[\s\S]*模型能力需按实际上游逐项确认/)
})

test('model management uses API account model route workspaces with filters and pagination', () => {
  const source = readModelManagementSource()
  const zh = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.json'), 'utf8')

  assert.match(source, /label: 'API账号管理'/)
  assert.match(source, /label: '模型管理'/)
  assert.match(source, /label: '路由管理'/)
  assert.match(source, /AI 配置工作台/)
  assert.match(source, /ModelAdminSearchInput/)
  assert.match(source, /ModelAdminPageSizeSelect/)
  assert.match(source, /PaginationControls/)
  assert.match(source, /credentialPagination/)
  assert.match(source, /Provider 能力/)
  assert.match(source, /快速接入/)
  assert.match(source, /filteredEntries/)
  assert.match(source, /filteredRouteEntries/)
  assert.match(source, /导入模型/)
  assert.match(source, /providerRuntimeInstancesTitle/)
  assert.match(source, /template_source_status/)
  assert.match(source, /待适配/)
  assert.doesNotMatch(source, /Provider \/ Catalog \/ Route/)
  assert.doesNotMatch(source, /ModelManagementBoundaryOverview\(/)
  assert.doesNotMatch(source, /ProviderRegistrySummary/)
  assert.doesNotMatch(source, /combo-templates/)
  assert.doesNotMatch(source, /providerAccountRows/)

  assert.match(zh, /"modelProviders": "API账号管理"/)
  assert.match(zh, /"modelCatalog": "模型管理"/)
  assert.match(zh, /"modelRoutes": "路由管理"/)
  assert.doesNotMatch(zh, /"startupAssemblyTitle": "启动组装实例"/)
})

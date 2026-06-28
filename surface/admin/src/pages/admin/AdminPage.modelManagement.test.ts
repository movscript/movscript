import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('model management view is owned by routes instead of query parameter tabs', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')

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
	const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')
	const types = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8')
	const templateType = types.match(/export interface AIModelCatalogTemplate \{[\s\S]*?\n\}/)?.[0] ?? ''

	assert.match(templateType, /default_public_model_id: string[\s\S]*model_id: string/)
	assert.match(templateType, /lab: string/)
	assert.match(templateType, /source_status\?: string/)
	assert.doesNotMatch(templateType, /route_adapter_hint/)
	assert.doesNotMatch(templateType, /adapter_type/)
  assert.match(source, /api\.get\('\/admin\/model-catalog\/templates'\)/)
  assert.match(source, /templateLabOptions/)
  assert.match(source, /filterCatalogTemplates\(catalogTemplates, templateSearch, templateLab\)/)
  assert.match(source, /function catalogTemplateIsRuntimeReady\(template: AIModelCatalogTemplate\): boolean/)
  assert.match(source, /if \(!catalogTemplateIsRuntimeReady\(template\)\) return false/)
  assert.match(source, /catalogTemplateSourceStatusLabel\(template\)/)
  assert.match(source, /public_model_id: publicModelID/)
  assert.match(source, /firstNonEmptyString\(template\.default_public_model_id, template\.model_id, template\.id\)/)
  assert.match(source, /routeTemplateSuggestion\.model_id/)
  assert.match(source, /suggestedProviderModelIDForEntry/)
  assert.doesNotMatch(source, /public_model_id:\s*template\.id/)
  assert.doesNotMatch(source, /templateAdapter/)
  assert.doesNotMatch(source, /adapter:\s*\{template\.adapter_type\}/)
  assert.doesNotMatch(source, /candidates\.find\(\(template\) => template\.adapter_type === adapterType\)/)
})

test('route binding view allows adapter override per route binding', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')

  assert.match(source, /function routeProviderAdapterLabel\(option\?: RouteProviderOption\): string/)
  assert.match(source, /function routeProviderAdapterValue\(option\?: RouteProviderOption\): string/)
  assert.match(source, /function ModelRoutesSection\(\{ credentials, providers, adapters \}/)
  assert.match(source, /adapters=\{routeAdapterOptions\}/)
  assert.match(source, /onChange=\{\(event\) => setRouteForm\(\{ \.\.\.routeForm, adapter_type: event\.target\.value \}\)\}/)
  assert.match(source, /onChange=\{\(event\) => setForm\(\{ \.\.\.form, adapter_type: event\.target\.value \}\)\}/)
  assert.match(source, /adapter: \{binding\.adapter_type \|\| routeProviderAdapterLabel\(provider\)\}/)
})

test('route management exposes operation-based route diagnostics', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')
  const types = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8')

  assert.match(types, /export interface AIModelRouteDiagnosis/)
  assert.match(types, /effective_endpoint\?: AIModelRouteDiagnosticEndpoint/)
  assert.match(source, /api\.post\('\/admin\/model-routes\/diagnose', routeDiagnosePayload/)
  assert.match(source, /routeDiagnoseCapability/)
  assert.match(source, /routeDiagnoseOperation/)
  assert.match(source, /Route 测试必须先选择 operation/)
  assert.match(source, /diagnosis\.selected_route_id/)
  assert.match(source, /candidate\.effective_endpoint/)
  assert.match(source, /candidate\.reasons/)
  assert.match(source, /disabled=\{!canDiagnoseRoute \|\| diagnoseRoute\.isPending\}/)
})

test('Yunwu model import can start from API key and preserves unmapped routes for diagnosis', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')

  assert.match(source, /const \[importProviderKind, setImportProviderKind\] = useState\('openai_compat_gateway'\)/)
  assert.match(source, /importProviderKind === 'yunwu_gateway'[\s\S]*\? 'yunwu_gateway'[\s\S]*: providerKindForImportBaseURL\(baseURL\)/)
  assert.match(source, /const canPreview = Boolean\(apiKey\.trim\(\) && \(baseURL\.trim\(\) \|\| importProviderKind === 'yunwu_gateway'\)\)/)
  assert.match(source, /留空使用 https:\/\/yunwu\.ai\/v1/)
  assert.match(source, /data\.provider_kind === 'yunwu_gateway'[\s\S]*\? model\.status !== 'route_exists'[\s\S]*: model\.recommended && model\.status !== 'route_exists'/)
  assert.match(source, /云雾同步会保留缺映射模型并禁用其 route/)
})

test('model management uses API account model route workspaces with filters and pagination', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')
  const zh = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.json'), 'utf8')

  assert.match(source, /label: 'API账号管理'/)
  assert.match(source, /label: '模型管理'/)
  assert.match(source, /label: '路由管理'/)
  assert.match(source, /AI 配置工作台/)
  assert.match(source, /ModelAdminSearchInput/)
  assert.match(source, /ModelAdminPageSizeSelect/)
  assert.match(source, /PaginationControls/)
  assert.match(source, /providerAccountRows/)
  assert.match(source, /filteredEntries/)
  assert.match(source, /filteredRouteEntries/)
  assert.match(source, /导入模型/)
  assert.match(source, /providerRuntimeInstancesTitle/)
  assert.match(source, /template_source_status/)
  assert.match(source, /待适配/)
  assert.doesNotMatch(source, /Provider \/ Catalog \/ Route/)
  assert.doesNotMatch(source, /ModelManagementBoundaryOverview\(/)

  assert.match(zh, /"modelProviders": "API账号管理"/)
  assert.match(zh, /"modelCatalog": "模型管理"/)
  assert.match(zh, /"modelRoutes": "路由管理"/)
  assert.doesNotMatch(zh, /"startupAssemblyTitle": "启动组装实例"/)
})

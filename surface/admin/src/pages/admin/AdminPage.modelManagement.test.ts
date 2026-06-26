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

  assert.match(types, /export interface AIModelCatalogTemplate \{[\s\S]*default_public_model_id: string[\s\S]*model_id: string/)
  assert.match(types, /export interface AIModelCatalogTemplate \{[\s\S]*lab: string/)
  assert.match(types, /export interface AIModelCatalogTemplate \{[\s\S]*source_status\?: string/)
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

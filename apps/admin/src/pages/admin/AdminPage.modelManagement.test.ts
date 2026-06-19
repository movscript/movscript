import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('model management view is owned by routes instead of query parameter tabs', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/AdminPage.tsx'), 'utf8')

  assert.match(source, /function defaultModelManagementViewMode\(\): ModelManagementViewMode \{[\s\S]*runtimeCapabilities\.gatewayNewAPIGroup \? 'routes' : 'providers'/)
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
  assert.match(source, /api\.get\('\/admin\/model-catalog\/templates'\)/)
  assert.match(source, /public_model_id: publicModelID/)
  assert.match(source, /firstNonEmptyString\(template\.default_public_model_id, template\.model_id, template\.id\)/)
  assert.match(source, /routeTemplateSuggestion\.model_id/)
  assert.match(source, /suggestedProviderModelIDForEntry/)
  assert.doesNotMatch(source, /public_model_id:\s*template\.id/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('community model management uses independent provider catalog route pages', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/runtime/community.tsx'), 'utf8')

  assert.match(source, /const ModelManagementPage = React\.lazy/)
  assert.match(source, /import\('@admin\/features\/model-management\/pages\/ModelManagementPage'\)\.then\(\(module\) => \(\{ default: module\.ModelManagementPage \}\)\)/)
  assert.match(source, /const AdminOverviewPage = React\.lazy\(\(\) => import\('@admin\/pages\/admin\/AdminOverviewPage'\)\)/)
  assert.match(source, /\{ path: '\/models', element: <Navigate to="\/models\/providers" replace \/> \}/)
  assert.match(source, /\{ path: '\/models\/providers', element: <ModelManagementPage view="providers" \/> \}/)
  assert.match(source, /\{ path: '\/models\/catalog', element: <ModelManagementPage view="catalog" \/> \}/)
  assert.match(source, /\{ path: '\/models\/routes', element: <ModelManagementPage view="routes" \/> \}/)
  assert.match(source, /disabledBaseRoutes: \['\/user-management', '\/orgs'\]/)
  assert.doesNotMatch(source, /ModelCatalogManagementRoute|CommunityModelCatalogPage/)
})

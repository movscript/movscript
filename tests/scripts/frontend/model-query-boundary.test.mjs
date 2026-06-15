import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const modelQueryKeysSource = readSource('apps/frontend/src/shared/application/modelQueryKeys.ts')
const agentModelQueryKeysSource = readSource('apps/frontend/src/features/agent/application/agentModelQueryKeys.ts')
const appServerChatShellSource = readSource('apps/frontend/src/features/agent/components/AppServerChatShell.tsx')
const agentSettingsSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
const agentSettingsModelControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts')
const agentChatDataSourcesSource = readSource('apps/frontend/src/features/agent/presentation/useAgentChatDataSources.ts')
const canvasGenerationNodesSource = readSource('apps/frontend/src/features/canvas/ui/canvasGenerationNodes.tsx')
const toolCanvasSource = readSource('apps/frontend/src/features/tools/application/useToolCanvas.ts')
const modelSelectorSource = readSource('apps/frontend/src/shared/ui/ModelSelector.tsx')

test('model query keys are delegated to model key factories', () => {
  assert.match(modelQueryKeysSource, /export const modelKeys/)
  assert.match(modelQueryKeysSource, /capability: \(capability: string \| undefined\) => \['models', capability\] as const/)
  assert.match(agentModelQueryKeysSource, /export const agentModelKeys/)
  assert.match(agentModelQueryKeysSource, /backendCatalog: \(scope = 'default-backend'\) => \['models', 'agent-backend', AGENT_BACKEND_MODEL_CAPABILITY_QUERY, scope\] as const/)

  assert.match(appServerChatShellSource, /agentModelKeys\.backendCatalog\(\)/)
  assert.match(agentSettingsModelControllerSource, /agentModelKeys\.backendCatalog\(baseURLValue \|\| 'default-backend'\)/)
  assert.match(agentChatDataSourcesSource, /agentModelKeys\.backendCatalog\(\)/)
  assert.match(canvasGenerationNodesSource, /modelKeys\.capability\(capability\)/)
  assert.match(toolCanvasSource, /modelKeys\.capability\(capability\)/)
  assert.match(modelSelectorSource, /modelKeys\.capability\(capability\)/)

  for (const source of [
    appServerChatShellSource,
    agentSettingsModelControllerSource,
    agentSettingsSource,
    agentChatDataSourcesSource,
    canvasGenerationNodesSource,
    toolCanvasSource,
    modelSelectorSource,
  ]) {
    assert.doesNotMatch(source, /queryKey: \['models'/)
  }
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

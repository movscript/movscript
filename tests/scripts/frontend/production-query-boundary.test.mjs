import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const canvasKeysSource = readSource('apps/frontend/src/features/canvas/application/canvasQueryKeys.ts')
const workbenchCanvasLauncherSource = readSource('apps/frontend/src/features/canvas/presentation/useWorkbenchCanvasLauncher.ts')
const agentQueryKeysSource = readSource('apps/frontend/src/features/agent/application/agentQueryKeys.ts')
const agentComposerSource = readSource('apps/frontend/src/features/agent/presentation/useAgentComposerController.ts')
const agentControlCenterSource = readSource('apps/frontend/src/features/agent/presentation/useAgentControlCenter.ts')
const providerSessionQueryKeysSource = readSource('apps/frontend/src/features/agent/application/providerSessionQueryKeys.ts')
const providerSessionContextSource = readSource('apps/frontend/src/features/agent/presentation/useProviderSessionContextController.ts')
const providerSessionHealthServiceSource = readSource('apps/frontend/src/features/agent/application/agentProviderSessionHealthService.ts')
const movScriptWorkspaceQueryKeysSource = readSource('apps/frontend/src/features/agent/application/movScriptWorkspaceQueryKeys.ts')

test('production query keys are delegated beyond feature components', () => {
  assert.match(canvasKeysSource, /workbench: \(projectId: number \| undefined, stage: string \| undefined\) => \['workbench-canvas', projectId, stage\] as const/)
  assert.match(workbenchCanvasLauncherSource, /canvasKeys\.workbench\(project\?\.ID, meta\?\.stage\)/)
  assert.match(agentQueryKeysSource, /composerWorkspaceProjects/)
  assert.doesNotMatch(agentQueryKeysSource, /controlAppServerStatus|appServerStatus/)
  assert.match(agentQueryKeysSource, /controlCapabilityHealth/)
  assert.match(agentComposerSource, /agentProviderKeys\.composerWorkspaceProjects/)
  assert.doesNotMatch(agentControlCenterSource, /agentConsoleKeys\.providerModelConfig/)
  assert.doesNotMatch(agentQueryKeysSource, /providerModelConfig/)
  assert.doesNotMatch(agentControlCenterSource, /controlAppServerStatus|appServerStatus/)
  assert.doesNotMatch(agentControlCenterSource, /ProviderSessionClient|providerSessionClient|new ProviderSessionClient/)
  assert.match(agentControlCenterSource, /listAgentControlProviderSessions\(\{ providerProfileKey: activeProviderProfileKey \}\)/)
  assert.match(agentControlCenterSource, /agentConsoleKeys\.controlCapabilityHealth/)
  assert.match(providerSessionQueryKeysSource, /health: \(providerSessionTreeId: string \| null\) => \['provider-session-health', providerSessionTreeId\] as const/)
  assert.match(providerSessionContextSource, /providerSessionKeys\.health\(normalizedProviderSessionTreeId\)/)
  assert.match(providerSessionContextSource, /ensureAgentProviderSessionHealth\(\{ providerSessionTreeId: normalizedProviderSessionTreeId \?\? undefined \}\)/)
  assert.doesNotMatch(providerSessionContextSource, /providerSessionClient|ProviderSessionClient|baseURL/)
  assert.match(providerSessionHealthServiceSource, /agentProviderSessionCompatibilityClient/)
  assert.match(movScriptWorkspaceQueryKeysSource, /filesScope: \['movscript-workspace-files'\] as const/)
  assert.doesNotMatch(movScriptWorkspaceQueryKeysSource, /invalidateQueries\(\{ queryKey: \['movscript-workspace-files'\]/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

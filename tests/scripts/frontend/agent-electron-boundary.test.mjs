import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentConsoleSource = [
  readSource('apps/frontend/src/features/agent/components/AgentConsolePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentConsolePageSections.tsx'),
].join('\n')
const agentTerminalSource = readSource('apps/frontend/src/features/agent/components/AgentTerminalPanel.tsx')
const localTerminalElectronSource = readSource('apps/frontend/src/features/agent/application/localTerminalElectron.ts')
const agentBrowserSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx')
const embeddedBrowserElectronSource = readSource('apps/frontend/src/features/agent/application/embeddedBrowserElectron.ts')
const workspaceFilesSource = readSource('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
const workspaceReviewSource = readSource('apps/frontend/src/features/agent/components/MovScriptWorkspaceReviewPage.tsx')
const movScriptWorkspaceElectronSource = readSource('apps/frontend/src/features/agent/application/movScriptWorkspaceElectron.ts')
const movScriptWorkspaceQueryKeysSource = readSource('apps/frontend/src/features/agent/application/movScriptWorkspaceQueryKeys.ts')
const movScriptWorkspaceMutationSource = readSource('apps/frontend/src/features/agent/application/movScriptWorkspaceMutationInvalidation.ts')
const generationAssertionsSource = readSource('apps/frontend/src/e2e/generationAssertions.ts')

test('agent console does not expose app-server log subscriptions', () => {
  assert.doesNotMatch(agentConsoleSource, /AgentConsoleRealtimeLogPanel|appServerLogElectron|subscribeAppServerLogs/)
  assert.doesNotMatch(agentConsoleSource, /window\.api/)
})

test('MovScript workspace pages delegate Electron file APIs', () => {
  assert.match(workspaceFilesSource, /from '@\/features\/agent\/application\/movScriptWorkspaceElectron'/)
  assert.match(workspaceFilesSource, /from '@\/features\/agent\/application\/movScriptWorkspaceQueryKeys'/)
  assert.match(workspaceFilesSource, /requireWorkspaceFilesAPI\(\)/)
  assert.match(workspaceFilesSource, /requireWorkspaceRootAPI\(\)/)
  assert.match(workspaceFilesSource, /movScriptWorkspaceKeys\.root/)
  assert.match(workspaceFilesSource, /movScriptWorkspaceKeys\.files\(currentPath\)/)
  assert.match(workspaceFilesSource, /movScriptWorkspaceKeys\.file\(selectedPath\)/)
  assert.match(workspaceFilesSource, /invalidateMovScriptWorkspaceMutationResult\(queryClient, workspaceFilesChangedResult\(\{ changedPaths: \[file\.path\] \}\)\)/)
  assert.match(workspaceFilesSource, /invalidateMovScriptWorkspaceMutationResult\(queryClient, workspaceFileChangedResult\(\{ path: file\.path \}\)\)/)
  assert.doesNotMatch(workspaceFilesSource, /window\.api/)
  assert.doesNotMatch(workspaceFilesSource, /queryKey: \['movscript-workspace-/)
  assert.doesNotMatch(workspaceFilesSource, /invalidateQueries\(\{ queryKey: \['movscript-workspace-/)

  assert.match(workspaceReviewSource, /from '@\/features\/agent\/application\/movScriptWorkspaceElectron'/)
  assert.match(workspaceReviewSource, /from '@\/features\/agent\/application\/movScriptWorkspaceQueryKeys'/)
  assert.match(workspaceReviewSource, /requireWorkspaceFileReadAPI\(\)/)
  assert.match(workspaceReviewSource, /movScriptWorkspaceKeys\.reviewFile\(reviewPath\)/)
  assert.doesNotMatch(workspaceReviewSource, /window\.api/)
  assert.doesNotMatch(workspaceReviewSource, /queryKey: \['movscript-workspace-/)

  assert.match(movScriptWorkspaceElectronSource, /readElectronApi\(\)/)
  assert.doesNotMatch(movScriptWorkspaceElectronSource, /window\.api/)
  assert.match(movScriptWorkspaceElectronSource, /listMovScriptWorkspaceFiles/)
  assert.match(movScriptWorkspaceElectronSource, /readMovScriptWorkspaceFile/)
  assert.match(movScriptWorkspaceElectronSource, /writeMovScriptWorkspaceFile/)
  assert.match(movScriptWorkspaceElectronSource, /deleteMovScriptWorkspaceFile/)
  assert.match(movScriptWorkspaceElectronSource, /getMovScriptWorkspaceRoot/)
  assert.match(movScriptWorkspaceQueryKeysSource, /export const movScriptWorkspaceKeys/)
  assert.doesNotMatch(movScriptWorkspaceQueryKeysSource, /export function invalidateMovScriptWorkspaceFiles/)
  assert.doesNotMatch(movScriptWorkspaceQueryKeysSource, /export function invalidateMovScriptWorkspaceFile/)
  assert.match(movScriptWorkspaceMutationSource, /export type MovScriptWorkspaceMutationEvent/)
  assert.match(movScriptWorkspaceMutationSource, /WorkspaceFilesChanged/)
  assert.match(movScriptWorkspaceMutationSource, /WorkspaceFileChanged/)
  assert.match(movScriptWorkspaceMutationSource, /export function invalidateMovScriptWorkspaceMutationResult/)
})

test('MovScript workspace e2e root mocks model the selected directory as MovScript home', () => {
  assert.match(generationAssertionsSource, /movScriptHomeDir: workspaceRoot/)
  assert.match(generationAssertionsSource, /controlDir: workspaceRoot/)
  assert.match(generationAssertionsSource, /manifestPath: `\$\{workspaceRoot\}\/\$\{manifestFileName\}`/)
  assert.doesNotMatch(generationAssertionsSource, /controlDir: `\$\{workspaceRoot\}\/\$\{workspaceDirName\}`/)
})

test('agent browser delegates embedded browser Electron API access', () => {
  assert.match(agentBrowserSource, /from '@\/features\/agent\/application\/embeddedBrowserElectron'/)
  assert.match(agentBrowserSource, /embeddedBrowserAvailable\(\)/)
  assert.match(agentBrowserSource, /navigateEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /activateEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /hideEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /closeEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /goBackEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /goForwardEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /reloadEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /stopEmbeddedBrowser\(/)
  assert.match(agentBrowserSource, /subscribeEmbeddedBrowserState\(/)
  assert.doesNotMatch(agentBrowserSource, /window\.api/)

  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserNavigate/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserActivate/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserHide/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserClose/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserGoBack/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserGoForward/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserReload/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.embeddedBrowserStop/)
  assert.match(embeddedBrowserElectronSource, /readElectronApi\(\)\?\.onEmbeddedBrowserState/)
  assert.doesNotMatch(embeddedBrowserElectronSource, /window\.api/)
})

test('agent terminal delegates local terminal Electron API access', () => {
  assert.match(agentTerminalSource, /from '@\/features\/agent\/application\/localTerminalElectron'/)
  assert.match(agentTerminalSource, /localTerminalAvailable\(\)/)
  assert.match(agentTerminalSource, /createLocalTerminal\(/)
  assert.match(agentTerminalSource, /writeLocalTerminal\(/)
  assert.match(agentTerminalSource, /resizeLocalTerminal\(/)
  assert.match(agentTerminalSource, /killLocalTerminal\(/)
  assert.match(agentTerminalSource, /subscribeLocalTerminalEvents\(/)
  assert.doesNotMatch(agentTerminalSource, /window\.api/)

  assert.match(localTerminalElectronSource, /readElectronApi\(\)\?\.createLocalTerminal/)
  assert.match(localTerminalElectronSource, /readElectronApi\(\)\?\.writeLocalTerminal/)
  assert.match(localTerminalElectronSource, /readElectronApi\(\)\?\.resizeLocalTerminal/)
  assert.match(localTerminalElectronSource, /readElectronApi\(\)\?\.killLocalTerminal/)
  assert.match(localTerminalElectronSource, /readElectronApi\(\)\?\.onLocalTerminalEvent/)
  assert.doesNotMatch(localTerminalElectronSource, /window\.api/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

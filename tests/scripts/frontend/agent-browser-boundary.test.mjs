import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentBrowserUiSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserUi.tsx')
const agentBrowserUiCss = readSource('apps/frontend/src/features/agent/components/AgentBrowserUi.css')
const internalPageUiSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.tsx')
const internalPageUiCss = readCssBundle('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.css')
const blankWebTabSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserBlankWebTab.tsx')
const projectHomePageSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePage.tsx')
const projectHomeSource = [
  projectHomePageSource,
  readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePageParts.tsx'),
  readSource('apps/frontend/src/features/agent/components/useAgentBrowserProjectHomeController.tsx'),
].join('\n')
const projectHomeModelSource = readSource('apps/frontend/src/features/agent/application/agentBrowserProjectHomeModel.ts')
const sessionOutputSource = readSource('apps/frontend/src/features/agent/components/AgentSessionOutputPane.tsx')

test('agent browser internal pages are feature-owned, not package browser UI', () => {
  for (const exportName of [
    'AgentBrowserBlankForm',
    'AgentBrowserNavButton',
    'AgentBrowserProjectEmpty',
    'AgentBrowserContentGroup',
    'AgentBrowserContentItem',
    'AgentBrowserKeyValue',
    'AgentBrowserDataBlock',
  ]) {
    assert.doesNotMatch(agentBrowserUiSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} should not be exported from shell UI`)
    assert.match(internalPageUiSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} should be owned by the agent feature`)
  }

  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/browser')), false, 'agent browser shell UI should be feature-owned, not shipped from packages/ui')
  assert.match(agentBrowserUiSource, /export function AgentBrowserRoot/)
  assert.match(agentBrowserUiSource, /export const AgentBrowserViewport/)
  assert.match(blankWebTabSource, /from '@\/features\/agent\/components\/AgentBrowserInternalPageUi'/)
  assert.match(projectHomeSource, /from '@\/features\/agent\/components\/AgentBrowserInternalPageUi'/)
  assert.match(projectHomePageSource, /useAgentBrowserProjectHomeController/)
  assert.doesNotMatch(projectHomePageSource, /useQuery|useMutation|listSemanticEntities|createWorkspaceScript/)
  assert.match(internalPageUiSource, /import '\.\/AgentBrowserInternalPageUi\.css'/)
  assert.match(agentBrowserUiSource, /import '\.\/AgentBrowserUi\.css'/)
  assert.match(sessionOutputSource, /className="agent-session-output"/)

  for (const selector of [
    '.agent-browser-project-page',
    '.agent-browser-content-nav__summary',
    '.agent-browser-content-item',
    '.agent-session-output',
  ]) {
    assert.doesNotMatch(agentBrowserUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should not live in shell browser CSS`)
    assert.match(internalPageUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should live in feature CSS`)
  }

  assert.match(agentBrowserUiCss, /\.agent-browser-root\s*\{/)
  assert.match(agentBrowserUiCss, /\.agent-browser-viewport\s*\{/)
})

test('agent browser project home record normalization lives in an application model', () => {
  assert.match(projectHomeSource, /from '@\/features\/agent\/application\/agentBrowserProjectHomeModel'/)
  assert.match(projectHomeSource, /visibleAgentBrowserProjectRecords\(/)
  assert.match(projectHomeSource, /agentBrowserProjectRecordTitle\(/)
  assert.match(projectHomeModelSource, /export function visibleAgentBrowserProjectRecords/)
  assert.match(projectHomeModelSource, /isActiveSemanticEntityRecord/)
  assert.match(projectHomeModelSource, /export function agentBrowserProjectRecordStableId/)
  assert.match(projectHomeModelSource, /export function agentBrowserProjectRecordRouteId/)
  assert.doesNotMatch(projectHomeSource, /function visibleRecords/)
  assert.doesNotMatch(projectHomeSource, /function compareRecordOrder/)
  assert.doesNotMatch(projectHomeSource, /function titleOfRecord/)
  assert.doesNotMatch(projectHomeSource, /function recordStableId/)
  assert.doesNotMatch(projectHomeSource, /isActiveSemanticEntityRecord/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

function readCssBundle(path, seen = new Set()) {
  const absolutePath = resolve(path)
  if (seen.has(absolutePath)) return ''
  seen.add(absolutePath)

  const source = readFileSync(absolutePath, 'utf8')
  const importedSources = [...source.matchAll(/@import\s+['"]\.\/([^'"]+)['"];/g)].map((match) =>
    readCssBundle(resolve(absolutePath, '..', match[1]), seen),
  )

  return [source, ...importedSources].join('\n')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

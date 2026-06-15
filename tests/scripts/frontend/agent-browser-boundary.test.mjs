import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentBrowserUiSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserUi.tsx')
const agentBrowserUiCss = readSource('apps/frontend/src/features/agent/components/AgentBrowserUi.css')
const internalPageUiSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.tsx')
const internalPageUiCss = readSource('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.css')
const blankWebTabSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserBlankWebTab.tsx')
const projectHomeSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePage.tsx')
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

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

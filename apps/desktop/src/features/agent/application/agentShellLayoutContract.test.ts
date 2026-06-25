import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent shell context layout is selected by explicit shell data', () => {
  const shellLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/agent/shell/layout/index.tsx'), 'utf8')
  const shellStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/shell/layout/styles.css'), 'utf8')
  const responsiveStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/responsive/styles.css'), 'utf8')

  assert.match(shellLayoutSource, /hasContext\?: boolean/)
  assert.match(shellLayoutSource, /data-has-context=\{hasContext \? "true" : undefined\}/)
  assert.match(shellStyles, /\.ms-agent-shell\[data-has-context="true"\] \{[\s\S]*grid-template-columns: minmax\(220px, 280px\) minmax\(0, 1fr\) minmax\(240px, 320px\);/)
  assert.match(responsiveStyles, /\.ms-agent-shell\[data-has-context="true"\]/)
  assert.doesNotMatch(shellStyles, /\.ms-agent-shell:has\(\.ms-agent-context\)/)
  assert.doesNotMatch(responsiveStyles, /\.ms-agent-shell:has\(\.ms-agent-context\)/)
})

test('agent panel message layout avoids section child selectors', () => {
  const panelMessageStyles = readFileSync(resolve('src/features/agent/components/AgentPanelThreadMessageUi.css'), 'utf8')

  assert.match(panelMessageStyles, /\.ai-agent-panel-shell \.ms-agent-message--assistant \{[\s\S]*padding: 8px 0 6px;/)
  assert.match(panelMessageStyles, /\.ai-agent-panel-shell \.ms-agent-message--assistant::before \{[\s\S]*display: none;/)
  assert.doesNotMatch(panelMessageStyles, /\.ms-agent-message--assistant:has\(\.ms-agent-message-section\)/)
})

test('agent panel message bubbles can opt out of frame chrome', () => {
  const messageUiStyles = readFileSync(resolve('src/shared/ui/AgentMessageUi.css'), 'utf8')
  const panelMessageStyles = readFileSync(resolve('src/features/agent/components/AgentPanelThreadMessageUi.css'), 'utf8')

  assert.match(panelMessageStyles, /--agent-message-content-border: 0;/)
  assert.match(panelMessageStyles, /--agent-message-content-background: transparent;/)
  assert.match(panelMessageStyles, /--agent-message-content-box-shadow: none;/)
  assert.match(messageUiStyles, /\.ms-agent-bubble \{[\s\S]*border: var\(--agent-message-content-border,/)
  assert.match(messageUiStyles, /\.ms-agent-bubble \{[\s\S]*background: var\(--agent-message-content-background,/)
  assert.match(messageUiStyles, /\.ms-agent-bubble \{[\s\S]*box-shadow: var\(--agent-message-content-box-shadow,/)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  agentModePaintDiagnosticRectOutsideViewport,
  agentModePaintDiagnosticSelector,
  compactAgentModePaintDiagnosticRect,
  compactAgentModePaintStyleValue,
} from './agentModePaintDiagnostics'

test('agent mode paint diagnostics format selectors, rects, and long style values', () => {
  assert.equal(
    agentModePaintDiagnosticSelector({
      tagName: 'DIV',
      id: 'root',
      className: 'project-agent-mode active dense extra',
    } as Element),
    'div#root.project-agent-mode.active.dense',
  )

  assert.equal(
    compactAgentModePaintDiagnosticRect({ width: 320.6, height: 240.2, left: 12.4, top: -7.6 }),
    '321x240+12+-8',
  )

  assert.equal(compactAgentModePaintStyleValue('none'), 'none')
  assert.equal(compactAgentModePaintStyleValue('x'.repeat(80), 12), 'xxxxxxxxxxxx...')
})

test('agent mode paint diagnostics detect content-visibility rects outside the viewport', () => {
  const viewport = { width: 800, height: 600 }

  assert.equal(
    agentModePaintDiagnosticRectOutsideViewport(
      { left: 100, right: 320, top: 100, bottom: 240 },
      viewport,
    ),
    false,
  )

  assert.equal(
    agentModePaintDiagnosticRectOutsideViewport(
      { left: 0, right: 100, top: 900, bottom: 980 },
      viewport,
    ),
    true,
  )

  assert.equal(
    agentModePaintDiagnosticRectOutsideViewport(
      { left: -500, right: -300, top: 0, bottom: 80 },
      viewport,
    ),
    true,
  )
})

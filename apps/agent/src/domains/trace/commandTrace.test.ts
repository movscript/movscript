import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAgentCommand } from '../../context/commandRouter.js'
import { summarizeAgentCommandTrace } from './commandTrace.js'

test('summarizeAgentCommandTrace keeps command metadata without payload or contract bodies', () => {
  const command = parseAgentCommand('/memory lens preference details')
  const summary = summarizeAgentCommandTrace(command)

  assert.equal(summary.name, 'memory')
  assert.equal(summary.rawName, '/memory')
  assert.equal(summary.contextProfile, 'minimal')
  assert.equal(summary.payloadChars, 'lens preference details'.length)
  assert.match(String(summary.payloadHash), /^sha256:/)
  assert.equal(summary.payloadMode, 'summary')
  assert.equal(summary.payload, undefined)
  assert.match(String(summary.systemContractHash), /^sha256:/)
  assert.equal(summary.systemContractMode, 'summary')
  assert.equal(summary.systemContract, undefined)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAgentCommand } from './commandRouter.js'

test('parses explicit commands into context profile and output mode', () => {
  const inspect = parseAgentCommand('/inspect_context')
  assert.equal(inspect.name, 'inspect_context')
  assert.equal(inspect.contextProfile, 'minimal')
  assert.equal(inspect.outputMode, 'json')

  const production = parseAgentCommand('/production_plan 第一场')
  assert.equal(production.name, 'production_plan')
  assert.equal(production.contextProfile, 'production_context')
  assert.equal(production.outputMode, 'json')
  assert.ok(production.requiredTools.includes('movscript_read_production_context'))
})

test('infers context profile for natural language production requests', () => {
  const command = parseAgentCommand('帮我梳理这个制作编排')
  assert.equal(command.name, 'chat')
  assert.equal(command.contextProfile, 'production_context')
  assert.equal(command.outputMode, 'natural')
})

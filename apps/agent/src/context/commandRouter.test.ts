import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAgentCommand } from './commandRouter.js'

test('parses explicit agent diagnostic commands', () => {
  const context = parseAgentCommand('/context')
  assert.equal(context.name, 'context')
  assert.equal(context.contextProfile, 'minimal')
  assert.equal(context.outputMode, 'natural')
  assert.equal(context.requiredTools.length, 0)

  const memory = parseAgentCommand('/memory')
  assert.equal(memory.name, 'memory')
  assert.equal(memory.contextProfile, 'minimal')
  assert.equal(memory.outputMode, 'natural')
  assert.equal(memory.requiredTools.length, 0)

  const image = parseAgentCommand('/image 一张雨夜便利店概念图')
  assert.equal(image.name, 'image')
  assert.equal(image.contextProfile, 'minimal')
  assert.equal(image.outputMode, 'natural')
  assert.deepEqual(image.requiredTools, ['movscript_create_generation_job'])

  const video = parseAgentCommand('/video 一段雨夜街头追车镜头')
  assert.equal(video.name, 'video')
  assert.equal(video.contextProfile, 'minimal')
  assert.equal(video.outputMode, 'natural')
  assert.deepEqual(video.requiredTools, ['movscript_create_generation_job'])
})

test('removed business slash commands are parsed as chat text', () => {
  const command = parseAgentCommand('/production_plan 第一场')
  assert.equal(command.name, 'chat')
  assert.equal(command.payload, '/production_plan 第一场')
  assert.equal(command.outputMode, 'natural')
})

test('infers context profile for natural language production requests', () => {
  const command = parseAgentCommand('帮我梳理这个制作编排')
  assert.equal(command.name, 'chat')
  assert.equal(command.contextProfile, 'production_context')
  assert.equal(command.outputMode, 'natural')
})

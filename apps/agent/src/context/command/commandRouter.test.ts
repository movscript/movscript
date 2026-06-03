import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAgentCommand } from './commandRouter.js'

test('parses explicit agent diagnostic commands', () => {
  const context = parseAgentCommand('/context')
  assert.equal(context.name, 'context')
  assert.equal(context.contextMode, 'minimal')
  assert.equal(context.outputMode, 'natural')
  assert.equal(context.requiredTools.length, 0)

  const memory = parseAgentCommand('/memory')
  assert.equal(memory.name, 'memory')
  assert.equal(memory.contextMode, 'minimal')
  assert.equal(memory.outputMode, 'natural')
  assert.equal(memory.requiredTools.length, 0)

  const status = parseAgentCommand('/status')
  assert.equal(status.name, 'status')
  assert.equal(status.contextMode, 'minimal')
  assert.equal(status.outputMode, 'natural')
  assert.equal(status.requiredTools.length, 0)

  const compact = parseAgentCommand('/compact')
  assert.equal(compact.name, 'compact')
  assert.equal(compact.contextMode, 'minimal')
  assert.equal(compact.outputMode, 'natural')
  assert.equal(compact.requiredTools.length, 0)

  const image = parseAgentCommand('/image 一张雨夜便利店概念图')
  assert.equal(image.name, 'chat')
  assert.equal(image.payload, '/image 一张雨夜便利店概念图')

  const video = parseAgentCommand('/video 一段雨夜街头追车镜头')
  assert.equal(video.name, 'chat')
  assert.equal(video.payload, '/video 一段雨夜街头追车镜头')
})

test('removed business slash commands are parsed as chat text', () => {
  const command = parseAgentCommand('/production_taskGraph 第一场')
  assert.equal(command.name, 'chat')
  assert.equal(command.payload, '/production_taskGraph 第一场')
  assert.equal(command.outputMode, 'natural')
})

test('infers context mode for natural language production requests', () => {
  const command = parseAgentCommand('帮我梳理这个制作编排')
  assert.equal(command.name, 'chat')
  assert.equal(command.contextMode, 'production_context')
  assert.equal(command.outputMode, 'natural')
})

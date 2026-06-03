import assert from 'node:assert/strict'
import test from 'node:test'

import { listTools, updateMCPPluginTools } from './server'

test('MCP tool registry exposes generation provider tools supplied by plugins', () => {
  updateMCPPluginTools([
    {
      pluginId: 'com.movscript.image-generator',
      name: 'generation_image_generate',
      description: 'Submit an image generation provider job.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
        },
        required: ['prompt'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'number' },
        },
      },
    },
  ])

  try {
    const tool = listTools().find((item) => item.name === 'generation_image_generate')
    assert.equal(tool?.description, 'Submit an image generation provider job.')
    assert.equal((tool?.inputSchema.properties?.prompt as { type?: string } | undefined)?.type, 'string')
    assert.equal((tool?.outputSchema?.properties?.jobId as { type?: string } | undefined)?.type, 'number')
  } finally {
    updateMCPPluginTools([])
  }
})

test('MCP plugin tool sync deduplicates provider tools by protocol name', () => {
  updateMCPPluginTools([
    {
      pluginId: 'first.provider',
      name: 'generation_video_generate',
      description: 'First registration.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      pluginId: 'second.provider',
      name: 'generation_video_generate',
      description: 'Second registration.',
      inputSchema: { type: 'object', properties: {} },
    },
  ])

  try {
    const tools = listTools().filter((item) => item.name === 'generation_video_generate')
    assert.equal(tools.length, 1)
    assert.equal(tools[0]?.description, 'Second registration.')
  } finally {
    updateMCPPluginTools([])
  }
})

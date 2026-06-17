import assert from 'node:assert/strict'
import test from 'node:test'

import { handleJSONRPC } from '../dist/mcp/node/index.js'
import { setMovScriptBackendAPIBaseURL } from '../dist/backend/node/index.js'

async function callTool(name, args, id = name) {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  })
  assert.equal(response?.error, undefined, response?.error?.message)
  return response.result.data
}

test('P3 generation discovery exposes orthogonal audio and subtitle AI tools', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
  })
  const tools = response?.result?.tools ?? []
  const names = tools.map((tool) => tool.name)

  for (const name of [
    'system_generate_voiceover',
    'system_generate_music',
    'system_generate_sfx',
    'system_generate_subtitle',
    'system_align_subtitle',
    'system_translate_subtitle',
    'generation_voiceover_generate',
    'generation_music_generate',
    'generation_sfx_generate',
    'generation_subtitle_generate',
    'generation_subtitle_align',
    'generation_subtitle_translate',
  ]) {
    assert.ok(names.includes(name), `${name} should be listed`)
  }

  const subtitleSchema = tools.find((tool) => tool.name === 'generation_subtitle_generate')?.inputSchema
  assert.ok(subtitleSchema?.properties?.input_resource_ids)
  assert.ok(subtitleSchema?.properties?.subtitle_format)
  assert.ok(subtitleSchema?.properties?.source_language)
})

test('P3 model list defaults to AI capabilities without primary render_video', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('http://movscript.test/api/v1/models?capability=')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await callTool('system_model_list', {})
    assert.ok(result.queries.includes('capability:audio_music'))
    assert.ok(result.queries.includes('capability:audio_sfx'))
    assert.ok(result.queries.includes('capability:subtitle_translate'))
    assert.equal(result.queries.includes('capability:render_video'), false)
    assert.equal(requests.some((url) => url.includes('capability=render_video')), false)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('P3 model list rejects render_video as a generation capability', async () => {
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input) => {
      throw new Error(`unexpected request: ${String(input)}`)
    }

    const result = await callTool('system_model_list', { capability: 'render_video' })
    assert.equal(result.count, 0)
    assert.deepEqual(result.queries, [])
    assert.deepEqual(result.model_contracts, [])
    assert.deepEqual(result.models, [])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('P3 music and subtitle tools submit distinct backend generation job types', async () => {
  const originalFetch = globalThis.fetch
  const posts = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url === 'http://movscript.test/api/v1/models?capability=audio_music') {
        return new Response(JSON.stringify([
          {
            id: 501,
            model_id: 'audio:music',
            display_name: 'Music Model',
            capabilities: ['audio_music'],
            supported_params: [{ key: 'style', type: 'string' }],
          },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/models?capability=audio_transcribe') {
        return new Response(JSON.stringify([
          {
            id: 502,
            model_id: 'audio:subtitle',
            display_name: 'Subtitle Model',
            capabilities: ['audio_transcribe'],
            supported_params: [
              { key: 'language', type: 'string' },
              { key: 'subtitle_format', type: 'string' },
            ],
          },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs') {
        assert.equal(init?.method, 'POST')
        const body = JSON.parse(init.body)
        posts.push(body)
        return new Response(JSON.stringify({ ID: 700 + posts.length, status: 'pending' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const music = await callTool('system_generate_music', {
      project_id: 7,
      prompt: 'quiet tension bed',
      style: 'minimal strings',
    })
    const subtitle = await callTool('system_generate_subtitle', {
      project_id: 7,
      prompt: 'transcribe the source audio',
      input_resource_ids: [88],
      language: 'zh-CN',
      subtitle_format: 'srt',
    })

    assert.equal(music.job_id, 701)
    assert.equal(subtitle.job_id, 702)
    assert.equal(posts[0].job_type, 'audio_music')
    assert.equal(posts[0].feature_key, 'electron.generation.music')
    assert.deepEqual(JSON.parse(posts[0].extra_params), { style: 'minimal strings' })
    assert.equal(posts[1].job_type, 'audio_transcribe')
    assert.equal(posts[1].feature_key, 'electron.generation.subtitle')
    assert.deepEqual(posts[1].input_resource_ids, [88])
    assert.deepEqual(JSON.parse(posts[1].extra_params), { language: 'zh-CN', subtitle_format: 'srt' })
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

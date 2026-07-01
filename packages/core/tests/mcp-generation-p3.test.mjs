import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { handleJSONRPC } from '../dist/mcp/node/index.js'
import { setMovScriptBackendAPIBaseURL } from '../dist/backend/node/index.js'
import { startProjectService } from '../../../services/project-service/src/server.mjs'

let projectServiceRuntime
let previousProjectServiceURL

function legacyToken(...parts) {
  return parts.join('_')
}

test.before(async () => {
  previousProjectServiceURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  projectServiceRuntime = await startProjectService()
  process.env.MOVSCRIPT_PROJECT_SERVICE_URL = projectServiceRuntime.url
})

test.after(async () => {
  if (projectServiceRuntime) await projectServiceRuntime.close()
  if (previousProjectServiceURL === undefined) {
    delete process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  } else {
    process.env.MOVSCRIPT_PROJECT_SERVICE_URL = previousProjectServiceURL
  }
})

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

test('P3 generation discovery exposes unified audio, subtitle, and voice capabilities', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
  })
  const tools = response?.result?.tools ?? []
  const names = tools.map((tool) => tool.name)

  for (const name of [
    'generation_capability_list',
    'generation_prepare',
    'generation_submit',
    'generation_job_get',
    'generation_job_get_batch',
    'generation_result_register',
  ]) {
    assert.ok(names.includes(name), `${name} should be listed`)
  }

  const submitSchema = tools.find((tool) => tool.name === 'generation_submit')?.inputSchema
  assert.ok(submitSchema?.properties?.capability)
  assert.ok(submitSchema?.properties?.input_resource_ids)
  assert.ok(submitSchema?.properties?.subtitle_format)
  assert.ok(submitSchema?.properties?.source_language)
  assert.ok(submitSchema?.properties?.target_language)
  assert.ok(submitSchema?.properties?.voice)
  assert.ok(submitSchema?.properties?.scope)
  assert.ok(submitSchema?.properties?.candidate_policy)
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
    assert.ok(result.queries.includes('capability:audio_generation'))
    assert.equal(result.queries.some((query) => query.includes(legacyToken('audio', 'music'))), false)
    assert.equal(result.queries.some((query) => query.includes(legacyToken('audio', 'chat'))), false)
    assert.equal(result.queries.some((query) => query.includes(legacyToken('subtitle', 'translate'))), false)
    assert.equal(result.queries.includes('capability:render_video'), false)
    assert.equal(requests.some((url) => url.includes('capability=render_video')), false)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('P3 model list accepts audio_generation speech_to_speech operation for omni speech models', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input) => {
      const url = String(input)
      requests.push(url)
      assert.ok(url.includes('/api/v1/models?capability=audio_generation&operation=speech_to_speech'), `unexpected URL: ${url}`)
      return new Response(JSON.stringify([{
        id: 17,
        model_id: 'qwen3-omni-flash',
        display_name: 'Qwen3 Omni Flash',
        capabilities: ['audio_generation'],
      }]), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const result = await callTool('system_model_list', { capability: 'audio_generation', operation: 'speech_to_speech' })
    assert.equal(result.count, 1)
    assert.deepEqual(result.queries, ['capability:audio_generation:operation:speech_to_speech'])
    assert.equal(result.models[0]?.model_id, 'qwen3-omni-flash')
    assert.equal(requests.length, 1)
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

test('P3 audio operations submit unified backend audio jobs', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = await mkdtemp(join(tmpdir(), 'movscript-core-p3-'))
  const posts = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    await writeFile(join(projectDir, 'project.json'), JSON.stringify({
      project_uid: 'prj_core_p3_generation',
      title: 'Core P3 generation',
    }))
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url === 'http://movscript.test/api/v1/projects/ensure') {
        return new Response(JSON.stringify({ project: { uid: 'prj_core_p3_generation' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://movscript.test/api/v1/project-data/spaces') {
        return new Response(JSON.stringify({ space: { project_uid: 'prj_core_p3_generation' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://movscript.test/api/v1/models?capability=audio_generation&operation=music_generation') {
        return new Response(JSON.stringify([
          {
            id: 501,
            model_id: 'audio:music',
            display_name: 'Music Model',
            capabilities: ['audio_generation'],
            supported_params: [{ key: 'style', type: 'string' }],
          },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/models?capability=audio_generation&operation=speech_to_text') {
        return new Response(JSON.stringify([
          {
            id: 502,
            model_id: 'audio:subtitle',
            display_name: 'Subtitle Model',
            capabilities: ['audio_generation'],
            supported_params: [
              { key: 'language', type: 'string' },
              { key: 'subtitle_format', type: 'string' },
            ],
          },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/models?capability=audio_generation&operation=speech_to_speech') {
        return new Response(JSON.stringify([
          {
            id: 503,
            model_id: 'audio:chat',
            display_name: 'Omni Voice Model',
            capabilities: ['audio_generation'],
            supported_params: [
              { key: 'voice', type: 'string' },
              { key: 'language', type: 'string' },
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

    const music = await callTool('generation_submit', {
      capability: 'audio_generation',
      operation: 'music_generation',
      cwd: projectDir,
      prompt: 'quiet tension bed',
      style: 'minimal strings',
    })
    const subtitle = await callTool('generation_submit', {
      capability: 'audio_generation',
      operation: 'speech_to_text',
      cwd: projectDir,
      prompt: 'transcribe the source audio',
      input_resource_ids: [88],
      language: 'zh-CN',
      subtitle_format: 'srt',
    })
    const speechToSpeech = await callTool('generation_submit', {
      capability: 'audio_generation',
      operation: 'speech_to_speech',
      cwd: projectDir,
      prompt: 'answer the user in a calm voice',
      input_resource_ids: [89],
      voice: 'alloy',
      language: 'zh-CN',
    })

    assert.equal(music.job_id, 701)
    assert.equal(subtitle.job_id, 702)
    assert.equal(speechToSpeech.job_id, 703)
    assert.equal(music.monitor.tool, 'generation_job_get')
    assert.equal(subtitle.monitor.tool, 'generation_job_get')
    assert.equal(speechToSpeech.monitor.tool, 'generation_job_get')
    assert.equal(music.capability, 'audio_generation')
    assert.equal(subtitle.capability, 'audio_generation')
    assert.equal(speechToSpeech.capability, 'audio_generation')
    assert.equal(posts[0].job_type, 'audio')
    assert.equal(posts[0].feature_key, 'electron.generation.music')
    assert.equal(posts[0].generation_intent.operation, 'music_generation')
    assert.deepEqual(JSON.parse(posts[0].extra_params), { style: 'minimal strings' })
    assert.equal(posts[1].job_type, 'audio')
    assert.equal(posts[1].feature_key, 'electron.generation.subtitle')
    assert.equal(posts[1].generation_intent.operation, 'speech_to_text')
    assert.deepEqual(posts[1].input_resource_ids, [88])
    assert.deepEqual(JSON.parse(posts[1].extra_params), { language: 'zh-CN', subtitle_format: 'srt' })
    assert.equal(posts[2].job_type, 'audio')
    assert.equal(posts[2].feature_key, 'electron.generation.speech_to_speech')
    assert.equal(posts[2].generation_intent.operation, 'speech_to_speech')
    assert.deepEqual(posts[2].input_resource_ids, [89])
    assert.deepEqual(JSON.parse(posts[2].extra_params), { voice: 'alloy', language: 'zh-CN' })
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(projectDir, { recursive: true, force: true })
  }
})

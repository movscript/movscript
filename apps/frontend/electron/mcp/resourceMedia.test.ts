import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  annotateResourceImage,
  buildMCPFrameSamplingPlan,
  uploadAgentImageResource,
} from './resourceMedia'
import { setMCPAPIBaseURL } from './backendClient'
import { listTools } from './toolRegistry'

const onePixelPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lgn+9QAAAABJRU5ErkJggg=='

test('MCP video frame sampling supports range and burst budgets', () => {
  const range = buildMCPFrameSamplingPlan({
    mode: 'range',
    startSec: 10,
    endSec: 12,
    fps: 4,
    maxFrames: 5,
  }, { durationSec: 30 })

  assert.equal(range.mode, 'range')
  assert.deepEqual(range.timestampsSec, [10, 10.5, 11, 11.5, 12])
  assert.equal(range.requestedFrameCount, 9)
  assert.equal(range.returnedFrameCount, 5)
  assert.match(range.warnings[0] ?? '', /downsampled/)

  const burst = buildMCPFrameSamplingPlan({
    mode: 'burst',
    centerSec: 5,
    windowSec: 2,
    intervalSec: 0.5,
  }, { durationSec: 10 })

  assert.equal(burst.mode, 'burst')
  assert.deepEqual(burst.timestampsSec, [4, 4.5, 5, 5.5, 6])
  assert.equal(burst.centerSec, 5)
  assert.equal(burst.windowSec, 2)
})

test('MCP image annotation renders an SVG artifact with structured shapes', async () => {
  const outputPath = join(tmpdir(), `movscript-annotation-test-${process.pid}.svg`)
  try {
    const result = await annotateResourceImage({
      data_url: onePixelPNG,
      title: 'shot-note',
      output_path: outputPath,
      annotations: [
        { type: 'rect', x: 10, y: 20, width: 30, height: 40, color: '#ff0000' },
        { type: 'text', x: 12, y: 18, text: 'focus' },
      ],
    })

    const data = result.data as Record<string, unknown>
    assert.equal(data.status, 'annotated')
    assert.equal(data.artifact_path, outputPath)
    assert.equal(data.annotation_count, 2)
    assert.equal(data.mime_type, 'image/svg+xml')

    const svg = await readFile(outputPath, 'utf8')
    assert.match(svg, /<image href="data:image\/png;base64,/)
    assert.match(svg, /<rect x="10" y="20" width="30" height="40"/)
    assert.match(svg, />focus<\/text>/)
  } finally {
    await rm(outputPath, { force: true })
  }
})

test('MCP resource media tools expose annotation and upload capabilities', () => {
  const tools = listTools()
  const names = new Set(tools.map((tool) => tool.name))
  assert.ok(names.has('movscript_resource_video_extract_frames'))
  assert.ok(names.has('movscript_resource_image_annotate'))
  assert.ok(names.has('movscript_resource_upload'))

  const video = tools.find((tool) => tool.name === 'movscript_resource_video_extract_frames')
  assert.ok(video?.inputSchema.properties?.mode)
  assert.ok(video?.inputSchema.properties?.max_frames)
  assert.ok(video?.inputSchema.properties?.center_sec)
})

test('MCP resource upload posts agent image artifacts as multipart RawResources', async () => {
  const inputPath = join(tmpdir(), `movscript-upload-test-${process.pid}.svg`)
  const originalFetch = globalThis.fetch
  setMCPAPIBaseURL('http://movscript.test')
  await writeFile(inputPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'http://movscript.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.equal(form.get('folder_id'), 'root')
      const file = form.get('file')
      assert.ok(file instanceof Blob)
      assert.equal((file as File).name, 'guide.svg')
      assert.equal(file.type, 'image/svg+xml')
      assert.match(await file.text(), /<svg/)
      return new Response(JSON.stringify({
        ID: 321,
        name: 'guide.svg',
        type: 'image',
        mime_type: 'image/svg+xml',
        url: '/api/v1/resources/321/file',
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await uploadAgentImageResource({
      artifact_path: inputPath,
      filename: 'guide.svg',
      mime_type: 'image/svg+xml',
      folder_id: 'root',
    })

    assert.equal(result.status, 'uploaded')
    assert.equal(result.resource_id, 321)
    assert.equal(result.filename, 'guide.svg')
  } finally {
    globalThis.fetch = originalFetch
    setMCPAPIBaseURL('http://localhost:8765')
    await rm(inputPath, { force: true })
  }
})

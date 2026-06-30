import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('timeline backend capability list runs as a frontend-independent CLI command', async () => {
  const result = await runMovscript(['timeline', 'backend', 'capability', 'list', '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'timeline.backend.capability.list')
  assert.equal(result.json.mcpToolName, 'timeline_backend_capability_list')
  assert.deepEqual(result.json.data.backends.map((backend) => backend.execution_project), [
    'MediaEditingProject',
    'RemotionCompositionProject',
    'HyperFramesCompositionProject',
    'ExternalNleProject',
  ])
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'timeline',
    'backend',
    'capability',
    'list',
    '--json',
  ])
})

test('timeline compile manifest create works from CLI JSON inputs without a frontend', async () => {
  const result = await runMovscript([
    'timeline',
    'compile',
    'manifest',
    'create',
    '--backend',
    'media_editing_project',
    '--timeline-assembly',
    JSON.stringify(sampleTimelineAssembly()),
    '--edit-decisions',
    JSON.stringify(sampleEditDecisions()),
    '--asset-manifest',
    JSON.stringify(sampleAssetManifest()),
    '--width',
    '1280',
    '--height',
    '720',
    '--fps',
    '24',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'timeline.compile_manifest.create')
  assert.equal(result.json.mcpToolName, 'timeline_compile_manifest_create')
  assert.equal(result.json.data.status, 'ready')
  assert.equal(result.json.data.compile_manifest.backend.target, 'media_editing_project')
  assert.deepEqual(result.json.data.compile_manifest.inputs.selected_resource_ids, [701, 702])
  assert.equal(result.json.data.conformance_report.status, 'ready')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'timeline',
    'compile',
    'manifest',
    'create',
    '--json',
    '--backend',
    'media_editing_project',
    '--width',
    '1280',
    '--height',
    '720',
    '--fps',
    '24',
    '--timeline-assembly',
    '<json>',
    '--edit-decisions',
    '<json>',
    '--asset-manifest',
    '<json>',
  ])
})

test('timeline CLI reports invalid JSON as a structured command error', async () => {
  const result = await runMovscript([
    'timeline',
    'assembly',
    'get',
    '--timeline-assembly',
    '{',
    '--json',
  ], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.equal(result.json.error.code, 'timeline_command_failed')
  assert.match(result.json.error.message, /--timeline-assembly must be valid JSON/)
})

function runMovscript(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`movscript command timed out: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveResult({
          status,
          stdout,
          stderr,
          json: JSON.parse(stdout),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function sampleTimelineAssembly() {
  return {
    schema: 'movscript.timeline_assembly.v1',
    id: 'assembly_cli',
    target_ref: 'timeline_assembly:production:pilot',
    scope_kind: 'production',
    scope_ref: 'pilot',
    tracks: [{ id: 'video_main', kind: 'video' }],
    clips: [{
      id: 'clip_intro',
      track_id: 'video_main',
      kind: 'visual',
      source: { resource_id: 701 },
    }],
  }
}

function sampleEditDecisions() {
  return {
    version: 1,
    render_runtime: 'ffmpeg',
    cuts: [{
      id: 'cut_intro',
      source: 'clip_intro',
      in_seconds: 0,
      out_seconds: 3,
    }],
    audio: {
      music: {
        asset_id: 'music_bed',
        volume: 0.4,
      },
    },
  }
}

function sampleAssetManifest() {
  return {
    assets: [
      { id: 'clip_intro', type: 'video', resource_id: 701, label: 'Intro' },
      { id: 'music_bed', type: 'audio', resource_id: 702, label: 'Music' },
    ],
  }
}

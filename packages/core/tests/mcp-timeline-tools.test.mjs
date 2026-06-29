import assert from 'node:assert/strict'
import test from 'node:test'

import { handleJSONRPC } from '../dist/mcp/node/index.js'

async function callTool(name, args = {}, id = name) {
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

test('MCP discovery exposes TimelineAssembly compile tools as a layer above editing backend', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'timeline-tools',
    method: 'tools/list',
  })
  const tools = new Set(response.result.tools.map((tool) => tool.name))
  assert.equal(tools.has('timeline_backend_capability_list'), true)
  assert.equal(tools.has('timeline_compile_manifest_create'), true)
  assert.equal(tools.has('timeline_backend_project_create'), true)
  assert.equal(tools.has('timeline_backend_conformance_report'), true)
  assert.equal(tools.has('editing_project_create_from_edit_decisions'), true)
})

test('timeline backend capability list keeps MediaEditingProject, Remotion, HyperFrames, and External NLE as sibling backends', async () => {
  const result = await callTool('timeline_backend_capability_list')
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.backends.map((backend) => backend.execution_project), [
    'MediaEditingProject',
    'RemotionCompositionProject',
    'HyperFramesCompositionProject',
    'ExternalNleProject',
  ])
  assert.equal(result.backends.find((backend) => backend.id === 'media_editing_project')?.implemented, true)
  assert.equal(result.backends.find((backend) => backend.id === 'external_nle')?.implemented, false)
})

test('timeline compile manifest reports ready conformance for selected assets', async () => {
  const result = await callTool('timeline_compile_manifest_create', sampleCompileArgs({ backend: 'media_editing_project' }))
  assert.equal(result.schema, 'movscript.timeline_assembly.compile_manifest_create_result.v1')
  assert.equal(result.status, 'ready')
  assert.equal(result.compile_manifest.schema, 'movscript.timeline_assembly.compile_manifest.v1')
  assert.equal(result.compile_manifest.backend.target, 'media_editing_project')
  assert.equal(result.compile_manifest.target_ref, 'timeline_assembly:production:pilot')
  assert.deepEqual(result.compile_manifest.inputs.selected_resource_ids, [701, 702])
  assert.equal(result.conformance_report.status, 'ready')
  assert.deepEqual(result.conformance_report.blockers, [])
})

test('timeline backend project create can produce Remotion and HyperFrames execution projects without persisting or rendering', async () => {
  const remotion = await callTool('timeline_backend_project_create', sampleCompileArgs({ backend: 'remotion', title: 'Pilot Remotion Cut' }))
  assert.equal(remotion.status, 'ready')
  assert.equal(remotion.backend, 'remotion')
  assert.equal(remotion.backend_project.schema, 'movscript.timeline_assembly.finishing_project.v1')
  assert.equal(remotion.backend_project.backend, 'remotion')
  assert.equal(remotion.backend_project.entrypoint, 'src/Root.tsx')
  assert.equal(remotion.persisted, false)
  assert.equal(remotion.rendered, false)
  assert.ok(remotion.backend_project.files.some((file) => file.path === 'src/MovScriptRoughCut.tsx'))

  const hyperframes = await callTool('timeline_assembly_compile', sampleCompileArgs({ backend: 'hyperframes', title: 'Pilot HyperFrames Cut' }))
  assert.equal(hyperframes.schema, 'movscript.timeline_assembly.compile_result.v1')
  assert.equal(hyperframes.status, 'ready')
  assert.equal(hyperframes.backend_project.backend, 'hyperframes')
  assert.equal(hyperframes.backend_project.entrypoint, 'index.html')
  assert.ok(hyperframes.backend_project.files.some((file) => file.path === 'index.html'))
})

test('timeline backend conformance blocks unsupported External NLE instead of silently falling back', async () => {
  const result = await callTool('timeline_backend_conformance_report', sampleCompileArgs({ backend: 'external_nle' }))
  assert.equal(result.status, 'blocked')
  assert.equal(result.conformance_report.status, 'blocked')
  assert.equal(result.conformance_report.backend, 'external_nle')
  assert.equal(result.conformance_report.blockers.some((diagnostic) => diagnostic.code === 'backend_adapter_not_implemented'), true)
  assert.equal(result.compile_manifest.backend.fallback_policy, 'no_implicit_fallback')
})

function sampleCompileArgs(extra = {}) {
  return {
    timelineAssembly: sampleTimelineAssembly(),
    editDecisions: sampleEditDecisions(),
    assetManifest: sampleAssetManifest(),
    width: 1280,
    height: 720,
    fps: 24,
    ...extra,
  }
}

function sampleTimelineAssembly() {
  return {
    schema: 'movscript.timeline_assembly.v1',
    id: 'assembly_project_tools',
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

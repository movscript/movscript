import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  mergeContentCanvasCommandCandidates,
  mergeContentCanvasCommandRemovedCandidates,
  mergeContentCanvasCommandSelections,
  withLocalContentCanvasCandidates,
} from './contentCanvasWorkspaceCandidateModel'
import {
  contentCanvasCommandFocusState,
  contentUnitNodeForGenerationTask,
} from './contentCanvasWorkspaceCommandModel'
import {
  candidateDecisionForNode,
  selectedCandidateForNode,
} from './contentCanvasWorkspaceNodeModel'

test('content canvas command focus state maps focused node ids to workspace selection state', () => {
  assert.deepEqual(contentCanvasCommandFocusState('setting:hero'), {
    activeCanvasNodeId: 'setting:hero',
    activeSettingId: 'setting:hero',
    selection: { kind: 'setting', nodeId: 'setting:hero' },
  })
  assert.deepEqual(contentCanvasCommandFocusState('scene_moment:intro'), {
    activeCanvasNodeId: 'scene_moment:intro',
    activeProductionId: null,
    activeSceneId: 'scene_moment:intro',
    selection: { kind: 'scene_moment', nodeId: 'scene_moment:intro' },
  })
  assert.deepEqual(contentCanvasCommandFocusState('asset:phone'), {
    activeCanvasNodeId: 'asset:phone',
    selection: { kind: 'asset', nodeId: 'asset:phone' },
  })
  assert.deepEqual(contentCanvasCommandFocusState('candidate:1:2'), {
    selection: { kind: 'other', nodeId: 'candidate:1:2' },
  })
  assert.equal(contentCanvasCommandFocusState(undefined), undefined)
})

test('contentUnitNodeForGenerationTask projects generation tasks into content unit nodes', () => {
  const node = nodeFixture({
    generationTask: {
      id: 'cu_1',
      nodeId: 'content_unit:cu_1',
      contentUnitType: 'expression_unit_ref',
      outputKind: 'video',
      title: 'Hero shot',
      prompt: 'Create the opening shot',
      status: 'needs_candidate',
      sourcePath: 'script.md',
      record: { prompt: 'Create the opening shot' },
      candidates: [
        {
          id: 'cand_1',
          title: 'Candidate',
          source: 'generated',
          selected: true,
          notes: '',
        },
      ],
      selectedCandidate: {
        id: 'cand_1',
        title: 'Candidate',
        source: 'generated',
        selected: true,
        notes: '',
      },
    },
  })

  assert.deepEqual(contentUnitNodeForGenerationTask(node), {
    id: 'content_unit:cu_1',
    entityKey: 'cu_1',
    kind: 'content_unit',
    title: 'Hero shot',
    subtitle: 'video',
    summary: 'Create the opening shot',
    status: 'active',
    metrics: ['创作片段 video', '候选 1', '已选择候选'],
    sourcePath: 'script.md',
    record: { prompt: 'Create the opening shot' },
    domainCategory: 'content_unit',
    domainKind: 'content_unit',
    candidates: node.generationTask?.candidates,
    position: { x: 10, y: 20 },
  })
  assert.equal(contentUnitNodeForGenerationTask(undefined), undefined)
})

test('content canvas command candidates are merged locally before backend reload completes', () => {
  const local = mergeContentCanvasCommandCandidates({}, {
    createdCandidates: [{
      contentUnitId: 'cu_1',
      candidate: {
        id: 'cand_local',
        title: 'Local candidate',
        source: 'resource_library',
        selected: false,
        notes: 'imported',
      },
    }],
  })
  assert.deepEqual(local.cu_1?.map((candidate) => candidate.id), ['cand_local'])

  const project = withLocalContentCanvasCandidates(projectDataFixture({
    contentUnitCandidates: {
      cu_1: [{
        id: 'cand_server',
        title: 'Server candidate',
        source: 'generated',
        selected: false,
        notes: '',
      }],
    },
  }), local)

  assert.deepEqual(project?.contentUnitCandidates.cu_1.map((candidate) => candidate.id), ['cand_local', 'cand_server'])
})

test('content canvas command candidate merge preserves distinct candidates with repeated ids', () => {
  const local = mergeContentCanvasCommandCandidates({}, {
    createdCandidates: [{
      contentUnitId: 'cu_1',
      candidate: {
        id: 'cand_repeat',
        title: 'Local candidate A',
        resourceId: 11,
        source: 'generated',
        selected: false,
        notes: '',
      },
    }],
  })
  const project = withLocalContentCanvasCandidates(projectDataFixture({
    contentUnitCandidates: {
      cu_1: [{
        id: 'cand_repeat',
        title: 'Server candidate B',
        resourceId: 12,
        source: 'generated',
        selected: false,
        notes: '',
      }],
    },
  }), local)

  assert.deepEqual(project?.contentUnitCandidates.cu_1.map((candidate) => candidate.resourceId), [11, 12])
})

test('content canvas backend candidates replace matching local optimistic rows', () => {
  const local = mergeContentCanvasCommandCandidates({}, {
    createdCandidates: [{
      contentUnitId: 'cu_1',
      candidate: {
        id: 'cand_1',
        title: 'Local candidate',
        source: 'resource_library',
        selected: false,
        notes: 'imported',
      },
    }],
  })
  const project = withLocalContentCanvasCandidates(projectDataFixture({
    contentUnitCandidates: {
      cu_1: [{
        id: 'cand_1',
        title: 'Server candidate',
        source: 'resource_library',
        selected: true,
        notes: 'selected',
      }],
    },
  }), local)

  assert.deepEqual(project?.contentUnitCandidates.cu_1, [{
    id: 'cand_1',
    title: 'Server candidate',
    source: 'resource_library',
    selected: true,
    notes: 'selected',
  }])
})

test('content canvas backend terminal candidates replace matching local running rows', () => {
  const local = mergeContentCanvasCommandCandidates({}, {
    createdCandidates: [{
      contentUnitId: 'cu_1',
      candidate: {
        id: 'cand_1',
        title: '候选 1',
        source: 'ai_generate',
        status: 'running',
        producer: { job_id: 91 },
        selected: false,
        notes: 'running',
      },
    }],
  })
  const project = withLocalContentCanvasCandidates(projectDataFixture({
    contentUnitCandidates: {
      cu_1: [{
        id: 'cand_1',
        title: '候选 1',
        resourceId: 42,
        resourceKind: 'image',
        source: 'ai_generate',
        status: 'succeeded',
        producer: { job_id: 91 },
        selected: false,
        notes: 'succeeded',
      }],
    },
  }), local)

  assert.deepEqual(project?.contentUnitCandidates.cu_1, [{
    id: 'cand_1',
    title: '候选 1',
    resourceId: 42,
    resourceKind: 'image',
    source: 'ai_generate',
    status: 'succeeded',
    producer: { job_id: 91 },
    selected: false,
    notes: 'succeeded',
  }])
})

test('content canvas removed candidates are hidden before backend reload completes', () => {
  const removed = mergeContentCanvasCommandRemovedCandidates({}, {
    removedCandidates: [{ contentUnitId: 'cu_1', candidateId: 'cand_remove' }],
  })
  const project = withLocalContentCanvasCandidates(projectDataFixture({
    contentUnitCandidates: {
      cu_1: [
        {
          id: 'cand_keep',
          title: 'Keep',
          source: 'generated',
          selected: false,
          notes: '',
        },
        {
          id: 'cand_remove',
          title: 'Remove',
          source: 'generated',
          selected: false,
          notes: '',
        },
      ],
    },
  }), {}, removed)

  assert.deepEqual(project?.contentUnitCandidates.cu_1.map((candidate) => candidate.id), ['cand_keep'])
})

test('content canvas command selections merge selected candidate ids by content unit', () => {
  assert.deepEqual(mergeContentCanvasCommandSelections({ cu_1: 'old' }, {
    selectedCandidates: [{ contentUnitId: 'cu_1', candidateId: 'new' }],
  }), { cu_1: 'new' })
})

test('content canvas candidate selection resolves content unit id and node id keys', () => {
  const sourceNode = nodeFixture({
    generationTask: {
      id: 'cu_1',
      nodeId: 'content_unit:cu_1',
      contentUnitType: 'asset_ref',
      outputKind: 'image',
      title: 'Hero image',
      prompt: 'Create hero image',
      status: 'needs_candidate',
      sourcePath: 'content_units/cu_1/content_unit.json',
      record: {},
      candidates: [
        {
          id: 'cand_a',
          title: 'Candidate A',
          source: 'generated',
          selected: false,
          notes: '',
        },
        {
          id: 'cand_b',
          title: 'Candidate B',
          source: 'generated',
          selected: false,
          notes: '',
        },
      ],
    },
  })
  const contentUnitNode = contentUnitNodeForGenerationTask(sourceNode)

  assert.equal(selectedCandidateForNode(sourceNode, {}), undefined)
  assert.equal(selectedCandidateForNode(sourceNode, { cu_1: 'cand_b' })?.id, 'cand_b')
  assert.equal(selectedCandidateForNode(sourceNode, { 'content_unit:cu_1': 'cand_b' })?.id, 'cand_b')
  assert.equal(selectedCandidateForNode(contentUnitNode, { cu_1: 'cand_b' })?.id, 'cand_b')
  assert.equal(candidateDecisionForNode(sourceNode, {})?.tone, 'pending')
  assert.equal(candidateDecisionForNode(sourceNode, { cu_1: 'cand_b' })?.tone, 'selected')
})

function nodeFixture(patch: Partial<ContentCanvasNode>): ContentCanvasNode {
  return {
    id: 'asset:hero',
    entityKey: 'asset_hero',
    kind: 'asset',
    title: 'Hero asset',
    subtitle: 'asset',
    summary: '',
    status: 'ready',
    metrics: [],
    sourcePath: 'script.md',
    record: {},
    candidates: [],
    position: { x: 10, y: 20 },
    ...patch,
  }
}

function projectDataFixture(patch: Partial<ReturnType<typeof baseProjectData>>) {
  return {
    ...baseProjectData(),
    ...patch,
  }
}

function baseProjectData() {
  return {
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [],
    keyframes: [],
    assets: [],
    settings: [],
    settingStates: [],
    audioCues: [],
    contentUnitCandidates: {},
  }
}

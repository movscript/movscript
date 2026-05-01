import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { ProductionRuntime } from './runtime.js'
import { FileProductionStore } from './store.js'
import type { ProductionV2FallbackClient } from './v2FallbackClient.js'
import type { ProductionAction, ProductionRun } from './types.js'

test('production runtime executes AnalyzeScriptToSections into candidates', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    sourceObject: { objectType: 'script', objectId: 12, versionId: 'v1' },
    inputContext: {
      source_text: '第一场。主角进入房间。\n\n第二场。灯光熄灭，门外传来脚步声。',
    },
    requestedBy: 'test',
  })

  assert.equal(run.actionType, 'AnalyzeScriptToSections')
  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 2)
  assert.equal(run.candidates[0].type, 'script_section')
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.candidates[0].payload.order, 1)
  assert.equal(runtime.getRun(run.id)?.id, run.id)
  assert.equal(runtime.getCandidate(run.candidates[0].id)?.id, run.candidates[0].id)
  assert.equal(run.warnings.includes('V2 fallback disabled'), true)
})

test('production runtime executes GenerateKeyframeCandidates from storyboard rows', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 2,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].type, 'keyframe')
  assert.equal(run.candidates[0].payload.title, '走廊追逐')
})

test('production runtime fails unsupported deterministic input before candidate write', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {},
  })

  assert.equal(run.status, 'failed')
  assert.match(run.error ?? '', /source_text/)
  assert.equal(run.candidates.length, 0)
})

test('file production store persists runs and candidates across runtime rebuilds', async () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'movscript-production-store-')), 'production-state.json')
  const runtime = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const rebuilt = new ProductionRuntime({ store: new FileProductionStore(filePath) })

  assert.equal(rebuilt.getRun(run.id)?.id, run.id)
  assert.equal(rebuilt.getCandidate(run.candidates[0].id)?.id, run.candidates[0].id)
})

test('production runtime persists rejected candidate lifecycle across runtime rebuilds', async () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'movscript-production-store-')), 'production-state.json')
  const runtime = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const rejected = runtime.rejectCandidate({
    candidateId: run.candidates[0].id,
    reason: 'section split is too coarse',
    actor: 'reviewer',
  })
  const rebuilt = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const restoredCandidate = rebuilt.getCandidate(rejected.id)
  const restoredRun = rebuilt.getRun(run.id)

  assert.equal(restoredCandidate?.status, 'rejected')
  assert.equal(restoredCandidate?.statusReason, 'section split is too coarse')
  assert.equal(restoredCandidate?.lifecycle?.at(-1)?.type, 'rejected')
  assert.equal(restoredRun?.candidates[0].status, 'rejected')
})

test('production runtime revises candidate into a new candidate and updates the original', async () => {
  const runtime = new ProductionRuntime()
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const result = runtime.reviseCandidate({
    candidateId: run.candidates[0].id,
    reason: 'tighten title',
    payload: {
      ...run.candidates[0].payload,
      title: '第一场：进入房间',
    },
  })
  const updatedRun = runtime.getRun(run.id)

  assert.equal(result.original.status, 'revised')
  assert.equal(result.original.revisedByCandidateId, result.revision.id)
  assert.equal(result.revision.status, 'candidate')
  assert.equal(result.revision.revisedFromCandidateId, result.original.id)
  assert.equal(result.revision.payload.title, '第一场：进入房间')
  assert.equal(updatedRun?.candidates.length, 2)
  assert.equal(updatedRun?.candidates.find((candidate) => candidate.id === result.original.id)?.status, 'revised')
  assert.equal(updatedRun?.candidates.find((candidate) => candidate.id === result.revision.id)?.status, 'candidate')
})

test('production runtime lifecycle updates do not call V2 fallback', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(fallback.calls, 1)
  runtime.rejectCandidate({
    candidateId: run.candidates[0].id,
    reason: 'not useful',
  })

  assert.equal(fallback.calls, 1)
})

test('production runtime apply preview blocks accepted candidates before V2 apply', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    sourceObject: { objectType: 'script', objectId: 12, versionId: 'v1' },
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const accepted = runtime.acceptCandidate({
    candidateId: run.candidates[0].id,
    reason: 'section looks correct',
  })
  const preview = runtime.previewCandidateApply(accepted.id)

  assert.equal(preview.status, 'blocked')
  assert.equal(preview.canApply, false)
  assert.equal(preview.candidateStatus, 'accepted')
  assert.equal(preview.approval.approvalPolicy, 'explicit_accept_required')
  assert.equal(preview.approval.requiredAction, 'call_v2_data_action')
  assert.equal(preview.approval.status, 'blocked')
  assert.equal(preview.v2DataOperation, 'UpsertScriptSectionCandidates')
  assert.deepEqual(preview.targetObject, { objectType: 'script', objectId: 12, versionId: 'v1' })
  assert.equal(preview.warnings.some((warning) => warning.includes('no V2 data action was called')), true)
  assert.equal(fallback.calls, 1)
})

test('production runtime apply preview marks rejected revised and superseded candidates not applicable', async () => {
  const runtime = new ProductionRuntime()
  const rejectedRun = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })
  const revisedRun = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第二场。主角离开房间。',
    },
  })
  const supersededRun = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 1,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  const rejected = runtime.rejectCandidate({ candidateId: rejectedRun.candidates[0].id })
  const revised = runtime.reviseCandidate({ candidateId: revisedRun.candidates[0].id }).original
  const superseded = runtime.supersedeCandidate({ candidateId: supersededRun.candidates[0].id })

  for (const candidate of [rejected, revised, superseded]) {
    const preview = runtime.previewCandidateApply(candidate.id)
    assert.equal(preview.status, 'not_applicable')
    assert.equal(preview.canApply, false)
    assert.equal(preview.approval.requiredAction, 'none')
    assert.match(preview.approval.reason, new RegExp(`status ${candidate.status} cannot be applied`))
  }
})

test('production runtime apply preview requires candidate acceptance before apply gate', async () => {
  const runtime = new ProductionRuntime()
  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 2,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  const preview = runtime.previewCandidateApply(run.candidates[0].id)

  assert.equal(preview.status, 'not_applicable')
  assert.equal(preview.canApply, false)
  assert.equal(preview.candidateStatus, 'candidate')
  assert.equal(preview.approval.requiredAction, 'accept_candidate')
  assert.equal(preview.v2DataOperation, 'UpsertKeyframeCandidates')
  assert.equal(preview.requiredContext.includes('targetObject'), true)
})

test('production runtime keeps runtime candidates when V2 fallback fails', async () => {
  const runtime = new ProductionRuntime({
    v2FallbackClient: new FailingFallbackClient(),
  })

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.warnings.some((warning) => warning.includes('simulated V2 fallback failure')), true)
})

test('production runtime records enabled V2 fallback without changing candidate status', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(fallback.calls, 1)
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.warnings.some((warning) => warning.includes('V2 fallback wrote')), true)
})

class FailingFallbackClient implements ProductionV2FallbackClient {
  isEnabled(): boolean {
    return true
  }

  async writeAnalyzeScriptToSections(): Promise<never> {
    throw new Error('simulated V2 fallback failure')
  }
}

class RecordingFallbackClient implements ProductionV2FallbackClient {
  calls = 0

  isEnabled(): boolean {
    return true
  }

  async writeAnalyzeScriptToSections(_action: ProductionAction, _run: ProductionRun) {
    this.calls += 1
    return { performed: true, url: 'http://127.0.0.1/api/v1/projects/1/script-preview/analyze' }
  }
}

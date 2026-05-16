import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const applicationDir = new URL('./', import.meta.url)
const source = readFileSync(new URL('./agentRuntime.ts', import.meta.url), 'utf8')
const bridgeModuleNames = readdirSync(applicationDir)
  .filter((file) => /^runtime.+Bridge\.ts$/.test(file))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort()

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test('AgentRuntime remains a thin facade with a bounded source size', () => {
  const lineCount = source.split('\n').length

  assert.ok(
    lineCount <= 950,
    `AgentRuntime should stay under 950 lines as a composition facade; current line count is ${lineCount}`,
  )
})

test('AgentRuntime imports only approved runtime application modules directly', () => {
  const approvedRuntimeImports = new Set([
    'runtimeCatalogInitialization',
    'runtimeCatalogSnapshot',
    'runtimeDeferredTasks',
    'runtimeEventSubscribers',
    'runtimeIdentity',
    'runtimeManifest',
    'runtimeRunCancellationGuard',
    'runtimeScalarInput',
    'runtimeStoreLookup',
    'runtimeThreadProjection',
    ...bridgeModuleNames,
  ])
  const runtimeImports = [...source.matchAll(/from '\.\/(runtime[^']+)\.js'/g)]
    .map((match) => match[1])
    .sort()

  assert.deepEqual(
    runtimeImports.filter((moduleName) => !approvedRuntimeImports.has(moduleName)),
    [],
  )
})

test('AgentRuntime stays on bridge boundaries for extracted facade areas', () => {
  const forbiddenRuntimeModules = [
    'runtimeAgentPlanTools',
    'runtimeCatalogRead',
    'runtimeCatalogReload',
    'runtimeCapabilities',
    'runtimeDraftOperations',
    'runtimeMemoryOperations',
    'runtimePlanCreation',
    'runtimePlanDispatch',
    'runtimePlanRead',
    'runtimePlanSnapshot',
    'runtimePlanTreeCancellation',
    'runtimePostRunRecords',
    'runtimeReplanPreparation',
    'runtimeRunCancellation',
    'runtimeRunCreation',
    'runtimeRunExecution',
    'runtimeRunExecutionScheduler',
    'runtimeRunPreview',
    'runtimeRunProjection',
    'runtimeRunStepCreation',
    'runtimeRunStepCompletion',
    'runtimeStreamSubscription',
    'runtimeSubagentRead',
    'runtimeSubagentSpawn',
    'runtimeSubagentTaskCancellation',
    'runtimeTaskEvent',
    'runtimeTaskRunSync',
    'runtimeTaskUpdate',
    'runtimeTraceRead',
    'runtimeThreadLifecycle',
    'runtimeThreadRead',
  ]

  for (const moduleName of forbiddenRuntimeModules) {
    assert.equal(
      source.includes(`from './${moduleName}.js'`),
      false,
      `AgentRuntime should depend on ${moduleName} through a bridge instead of importing it directly`,
    )
  }
})

test('AgentRuntime composes the facade through explicit bridge modules', () => {
  assert.notEqual(bridgeModuleNames.length, 0)

  for (const moduleName of bridgeModuleNames) {
    assert.equal(
      source.includes(`from './${moduleName}.js'`),
      true,
      `AgentRuntime should compose ${moduleName}`,
    )
  }
})

test('AgentRuntime public facade methods delegate through bridge fields', () => {
  const facadeDelegates = [
    ['getCapabilities', 'this.catalogOperations.getCapabilities(input)'],
    ['listRegisteredTools', 'this.catalogOperations.listRegisteredTools()'],
    ['listSkillCatalog', 'this.catalogOperations.listSkillCatalog()'],
    ['getDefaultAgentManifest', 'this.catalogOperations.getDefaultAgentManifest()'],
    ['reloadAgentCatalog', 'this.catalogOperations.reloadAgentCatalog()'],
    ['inspectAgentCatalog', 'this.catalogOperations.inspectAgentCatalog(run, input)'],
    ['createAgentPlan', 'this.agentPlanTools.createAgentPlan(run, input)'],
    ['getAgentPlan', 'this.agentPlanTools.getAgentPlan(run, input)'],
    ['replanAgentPlan', 'this.agentPlanTools.replanAgentPlan(run, input)'],
    ['spawnSubagent', 'this.subagentTools.spawnSubagent(run, input)'],
    ['listSubagents', 'this.subagentTools.listSubagents(run, input)'],
    ['waitSubagent', 'this.subagentTools.waitSubagent(run, input)'],
    ['cancelSubagent', 'this.subagentTools.cancelSubagent(run, input)'],
    ['createThread', 'this.threads.createThread(input)'],
    ['listThreads', 'this.threads.listThreads()'],
    ['listThreadSummaries', 'this.threads.listThreadSummaries()'],
    ['getThread', 'this.threads.getThread(id)'],
    ['updateThread', 'this.threads.updateThread(id, input)'],
    ['addMessage', 'this.threads.addMessage(threadId, input)'],
    ['createRun', 'this.runCreation.createRun(input)'],
    ['createToolRun', 'this.runCreation.createToolRun(input)'],
    ['previewRun', 'this.runPreview.previewRun(input)'],
    ['listRuns', 'this.entityReads.listRuns()'],
    ['listRunsByParent', 'this.entityReads.listRunsByParent(parentRunId)'],
    ['getRun', 'this.entityReads.getRun(id)'],
    ['getChildRuns', 'this.entityReads.getChildRuns(parentRunId)'],
    ['createPlan', 'this.planCreation.createPlan(input)'],
    ['listPlans', 'this.entityReads.listPlans()'],
    ['getPlan', 'this.entityReads.getPlan(id)'],
    ['getPlanSnapshot', 'this.entityReads.getPlanSnapshot(planId)'],
    ['getTaskTree', 'this.entityReads.getTaskTree(planId)'],
    ['updateTask', 'this.taskUpdate.updateTask(taskId, input)'],
    ['cancelSubtree', 'this.treeCancellation.cancelSubtree(runId, input)'],
    ['cancelPlanTree', 'this.treeCancellation.cancelPlanTree(runId, input)'],
    ['dispatchPlan', 'this.planDispatch.dispatchPlan(input)'],
    ['replanRun', 'this.replan.replanRun(runId, input)'],
    ['getRunTraceEvents', 'this.traceReads.getRunTraceEvents(runId, query)'],
    ['getRunTracePage', 'this.traceReads.getRunTracePage(runId, query)'],
    ['getRunTraceSummary', 'this.traceReads.getRunTraceSummary(runId)'],
    ['subscribeRunStream', 'this.streamSubscriptions.subscribeRunStream(runId, listener)'],
    ['subscribePlanStream', 'this.streamSubscriptions.subscribePlanStream(planId, listener)'],
    ['approveRun', 'this.runControl.approveRun(runId, input)'],
    ['rejectRun', 'this.runControl.rejectRun(runId, input)'],
    ['cancelRun', 'this.runControl.cancelRun(runId, input)'],
    ['answerRunInputRequest', 'this.runControl.answerRunInputRequest(runId, input)'],
    ['listMemories', 'this.memories.listMemories(query)'],
    ['listMemorySummaries', 'this.memories.listMemorySummaries(query)'],
    ['getMemory', 'this.memories.getMemory(projectId, id)'],
    ['listDrafts', 'this.drafts.listDrafts(query)'],
    ['createLocalDraft', 'this.drafts.createLocalDraft(input)'],
    ['getDraft', 'this.drafts.getDraft(id)'],
    ['updateDraft', 'this.drafts.updateDraft(input)'],
    ['patchDraft', 'this.drafts.patchDraft(input)'],
    ['validateDraft', 'this.drafts.validateDraft(input)'],
    ['previewApplyDraft', 'this.drafts.previewApplyDraft(input)'],
    ['simulateApplyDraft', 'this.drafts.simulateApplyDraft(input)'],
    ['applyDraftFromUI', 'this.drafts.applyDraftFromUI(input)'],
    ['rejectDraft', 'this.drafts.rejectDraft(input)'],
    ['createMemory', 'this.memories.createMemory(input)'],
    ['deleteMemory', 'this.memories.deleteMemory(projectId, id)'],
    ['flushPostRunRecords', 'this.postRunRecords.flush()'],
  ] as const

  for (const [methodName, delegateCall] of facadeDelegates) {
    assert.equal(
      source.includes(delegateCall),
      true,
      `AgentRuntime.${methodName} should delegate through ${delegateCall}`,
    )
  }
})

test('AgentRuntime delegates trace reads without direct trace store access', () => {
  assert.equal(countOccurrences(source, 'this.store.listRunTraceEvents('), 0)
  assert.equal(countOccurrences(source, 'this.store.countRunTraceEvents('), 0)
  assert.equal(countOccurrences(source, 'normalizeTracePageLimit('), 0)
  assert.equal(countOccurrences(source, 'buildRunTracePage('), 0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const applicationDir = new URL('../', import.meta.url)
const source = readFileSync(new URL('./runtimeRouter.ts', import.meta.url), 'utf8')
const applicationFiles = listApplicationFiles(applicationDir)
const bridgeModuleNames = applicationFiles
  .filter((file) => /(^|\/)runtime.+Bridge\.ts$/.test(file))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort()

function listApplicationFiles(dir: URL, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return listApplicationFiles(new URL(`${entry.name}/`, dir), name)
    return [name]
  })
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function publicMethodNames(classSource: string): string[] {
  return [...classSource.matchAll(/^  (?:async )?([a-zA-Z_][a-zA-Z0-9_]*)\(/gm)]
    .map((match) => match[1])
    .filter((name) => name !== 'constructor')
    .sort()
}

const facadeDelegates = [
  ['getCapabilities', 'this.catalogOperations.getCapabilities(input)'],
  ['listRegisteredTools', 'this.catalogOperations.listRegisteredTools()'],
  ['listSkillCatalog', 'this.catalogOperations.listSkillCatalog()'],
  ['listPackCatalog', 'this.catalogOperations.listPackCatalog()'],
  ['listConfigFileCatalog', 'this.catalogOperations.listConfigFileCatalog()'],
  ['setActiveAgentConfigFile', 'this.catalogSettings.setActiveAgentConfigFile(input)'],
  ['saveAgentConfigFile', 'this.catalogSettings.saveAgentConfigFile(input)'],
  ['deleteAgentConfigFile', 'this.catalogSettings.deleteAgentConfigFile(input)'],
  ['saveConfigFileToolPermissions', 'this.catalogSettings.saveConfigFileToolPermissions(input)'],
  ['saveSkillInstructions', 'this.catalogSettings.saveSkillInstructions(input)'],
  ['getActiveAgentManifest', 'this.catalogOperations.getActiveAgentManifest()'],
  ['reloadAgentCatalog', 'this.catalogOperations.reloadAgentCatalog()'],
  ['inspectAgentCatalog', 'this.catalogOperations.inspectAgentCatalog(run, input)'],
  ['updateActiveSkills', 'this.catalogOperations.updateActiveSkills(run, input)'],
  ['updatePlan', 'this.planTools.updatePlan(run, input)'],
  ['startWork', 'this.runtimeWorks.startWork(run, input, options)'],
  ['getWork', 'this.runtimeWorks.getWork(run, input)'],
  ['listWork', 'this.runtimeWorks.listWork(run, input)'],
  ['waitWork', 'this.runtimeWorks.waitWork(run, input, options)'],
  ['cancelWork', 'this.runtimeWorks.cancelWork(run, input, options)'],
  ['createThread', 'this.threads.createThread(input)'],
  ['listSessions', 'this.threads.listSessions()'],
  ['listSessionSummaries', 'this.threads.listSessionSummaries()'],
  ['getSession', 'this.threads.getSession(id)'],
  ['listThreads', 'this.threads.listThreads()'],
  ['listThreadSummaries', 'this.threads.listThreadSummaries()'],
  ['getThread', 'this.threads.getThread(id)'],
  ['getThreadRuntimeSnapshot', 'this.runtimeSnapshots.getThreadRuntimeSnapshot(threadId)'],
  ['getSessionRuntimeSnapshot', 'this.runtimeSnapshots.getSessionRuntimeSnapshot(sessionId)'],
  ['approveInteraction', 'this.runtimeScheduler.approveInteraction(interactionId)'],
  ['rejectInteraction', 'this.runtimeScheduler.rejectInteraction(interactionId)'],
  ['updateThread', 'this.threads.updateThread(id, input)'],
  ['deleteThread', 'this.threads.deleteThread(id)'],
  ['deleteAllThreads', 'this.threads.deleteAllThreads()'],
  ['addMessage', 'this.threads.addMessage(threadId, input)'],
  ['createRun', 'this.runCreation.createRun(input)'],
  ['createToolRun', 'this.runCreation.createToolRun(input)'],
  ['previewRun', 'this.runPreview.previewRun(input)'],
  ['listRuns', 'this.entityReads.listRuns()'],
  ['listRunsByParent', 'this.entityReads.listRunsByParent(parentRunId)'],
  ['listRunsByThread', 'this.entityReads.listRunsByThread(threadId)'],
  ['getRun', 'this.entityReads.getRun(id)'],
  ['getChildRuns', 'this.entityReads.getChildRuns(parentRunId)'],
  ['createTaskGraph', 'this.planCreation.createTaskGraph(input)'],
  ['listTaskGraphs', 'this.entityReads.listTaskGraphs()'],
  ['getTaskGraph', 'this.entityReads.getTaskGraph(id)'],
  ['getTaskGraphSnapshot', 'this.entityReads.getTaskGraphSnapshot(taskGraphId)'],
  ['getTaskTree', 'this.entityReads.getTaskTree(taskGraphId)'],
  ['updateTask', 'this.taskUpdate.updateTask(taskId, input)'],
  ['cancelSubtree', 'this.treeCancellation.cancelSubtree(runId, input)'],
  ['cancelPlanTree', 'this.treeCancellation.cancelPlanTree(runId, input)'],
  ['dispatchTaskGraph', 'this.planDispatch.dispatchTaskGraph(input)'],
  ['replanRun', 'this.updateTaskGraph.replanRun(runId, input)'],
  ['getRunTraceEvents', 'this.traceReads.getRunTraceEvents(runId, query)'],
  ['getRunTracePage', 'this.traceReads.getRunTracePage(runId, query)'],
  ['getRunTraceEventData', 'this.traceReads.getRunTraceEventData(runId, eventId)'],
  ['getRunTraceSummary', 'this.traceReads.getRunTraceSummary(runId)'],
  ['getRunTraceDebugView', 'this.traceReads.getRunTraceDebugView(runId)'],
  ['getRunDebugLedger', 'this.traceReads.getRunDebugLedger(runId)'],
  ['findRunDebugEvidenceRefs', 'this.traceReads.findRunDebugEvidenceRefs(runId, query)'],
  ['getRunDebugEvidence', 'this.traceReads.getRunDebugEvidence(runId, evidenceId)'],
  ['getRunGenerationView', 'this.traceReads.getRunGenerationView(runId)'],
  ['getRunToolResult', 'this.traceReads.getRunToolResult(runId, refKey)'],
  ['findRunToolResults', 'this.traceReads.findRunToolResults(runId, query)'],
  ['subscribeRunStream', 'this.streamSubscriptions.subscribeRunStream(runId, listener)'],
  ['subscribeSessionStream', 'this.streamSubscriptions.subscribeSessionStream(sessionId, listener)'],
  ['subscribeThreadStream', 'this.streamSubscriptions.subscribeThreadStream(threadId, listener)'],
  ['subscribePlanStream', 'this.streamSubscriptions.subscribePlanStream(taskGraphId, listener)'],
  ['cancelRun', 'this.runControl.cancelRun(runId, input)'],
  ['answerRunInputRequest', 'this.runControl.answerRunInputRequest(runId, input)'],
  ['reconcileRuntimeThreads', 'this.recovery.reconcileRuntimeThreads()'],
  ['resumeInterruptedRun', 'this.recovery.resumeInterruptedRun(runId)'],
  ['listMemories', 'this.memories.listMemories(query)'],
  ['listMemorySummaries', 'this.memories.listMemorySummaries(query)'],
  ['getMemory', 'this.memories.getMemory(projectId, id)'],
  ['listWorkspaces', 'this.workspaces.listWorkspaces(query)'],
  ['createLocalWorkspace', 'this.workspaces.createLocalWorkspace(input)'],
  ['getWorkspace', 'this.workspaces.getWorkspace(id)'],
  ['updateWorkspace', 'this.workspaces.updateWorkspace(input)'],
  ['previewApplyWorkspace', 'this.workspaces.previewApplyWorkspace(input)'],
  ['simulateApplyWorkspace', 'this.workspaces.simulateApplyWorkspace(input)'],
  ['applyWorkspaceFromUI', 'this.workspaces.applyWorkspaceFromUI(input)'],
  ['rejectWorkspace', 'this.workspaces.rejectWorkspace(input)'],
  ['createMemory', 'this.memories.createMemory(input)'],
  ['deleteMemory', 'this.memories.deleteMemory(projectId, id)'],
  ['flushPostRunRecords', 'this.postRunRecords.flush()'],
] as const

const expectedPublicMethods = facadeDelegates.map(([methodName]) => methodName).sort()

test('AgentRuntimeRouter remains a thin facade with a bounded source size', () => {
  const lineCount = source.split('\n').length

  assert.ok(
    lineCount <= 1200,
    `AgentRuntimeRouter should stay under 1200 lines as a composition facade; current line count is ${lineCount}`,
  )
})

test('AgentRuntimeRouter imports only approved runtime application modules directly', () => {
  const approvedRuntimeImports = new Set([
    'catalog/operations/initialization/runtimeCatalogInitialization',
    'catalog/snapshot/core/runtimeCatalogSnapshot',
    'work/tasks/runtimeDeferredTasks',
    'stream/subscribers/runtimeEventSubscribers',
    'run/interactions/records/runtimeInteractions',
    'catalog/manifest/runtimeManifest',
    'recovery/runtimeRecoveryBridge',
    'run/control/guard/runtimeRunCancellationGuard',
    'work/scheduler/runtimeScheduler',
    'thread/snapshot/runtimeThreadSnapshot',
    'shared/tools/runtimeToolHandlers',
    ...bridgeModuleNames,
  ])
  const runtimeImports = [...source.matchAll(/from '\.\.\/(?!\.)([^']*runtime[^']+)\.js'/g)]
    .map((match) => match[1])
    .sort()

  assert.deepEqual(
    runtimeImports.filter((moduleName) => !approvedRuntimeImports.has(moduleName)),
    [],
  )
})

test('AgentRuntimeRouter stays on bridge boundaries for extracted facade areas', () => {
  const forbiddenRuntimeModules = [
    'runtimeCatalogRead',
    'runtimeCatalogReload',
    'runtimeCapabilities',
    'runtimeWorkspaceOperations',
    'runtimeMemoryOperations',
    'runtimePlanCreation',
    'runtimePlanDispatch',
    'runtimePlanRead',
    'runtimePlanSnapshot',
    'runtimePlanTreeCancellation',
    'runtimePostRunRecords',
    'runtimePlanTools',
    'runtimeReplanPreparation',
    'runtimeRunCancellation',
    'runtimeRunCreation',
    'runtimeRunExecution',
    'runtimeRunExecutionScheduler',
    'runtimeRunPreview',
    'runtimeRunProjection',
    'runtimeRunVisibility',
    'runtimeRunStepCreation',
    'runtimeRunStepCompletion',
    'runtimeStreamSubscription',
    'runtimeStoreLookup',
    'runtimeTaskEvent',
    'runtimeTaskRunSync',
    'runtimeTaskUpdate',
    'runtimeTraceRead',
    'runtimeThreadLifecycle',
    'runtimeThreadProjection',
    'runtimeThreadRead',
    'runtimeWakeCoordinator',
  ]

  for (const moduleName of forbiddenRuntimeModules) {
    assert.equal(
      new RegExp(`from '\\./[^']*${moduleName}\\\\.js'`).test(source),
      false,
      `AgentRuntimeRouter should depend on ${moduleName} through a bridge instead of importing it directly`,
    )
  }
})

test('AgentRuntimeRouter composes the facade through explicit bridge modules', () => {
  assert.notEqual(bridgeModuleNames.length, 0)

  for (const moduleName of bridgeModuleNames) {
    assert.equal(
      source.includes(`from '../${moduleName}.js'`),
      true,
      `AgentRuntimeRouter should compose ${moduleName}`,
    )
  }
})

test('AgentRuntimeRouter public facade methods delegate through bridge fields', () => {
  for (const [methodName, delegateCall] of facadeDelegates) {
    assert.equal(
      source.includes(delegateCall),
      true,
      `AgentRuntimeRouter.${methodName} should delegate through ${delegateCall}`,
    )
  }
})

test('AgentRuntimeRouter public facade surface stays explicit', () => {
  assert.deepEqual(publicMethodNames(source), expectedPublicMethods)
})

test('AgentRuntimeRouter delegates trace reads without direct trace store access', () => {
  assert.equal(countOccurrences(source, 'this.store.listRunTraceEvents('), 0)
  assert.equal(countOccurrences(source, 'this.store.countRunTraceEvents('), 0)
  assert.equal(countOccurrences(source, 'normalizeTracePageLimit('), 0)
  assert.equal(countOccurrences(source, 'buildRunTracePage('), 0)
})

test('AgentRuntimeRouter delegates thread snapshot run selection', () => {
  assert.equal(
    source.includes('buildRuntimeThreadSnapshotV2({'),
    false,
    'AgentRuntimeRouter should not directly build thread runtime snapshots',
  )
  assert.equal(
    source.includes('buildRuntimeSessionSnapshotV1({'),
    false,
    'AgentRuntimeRouter should not directly build session runtime snapshots',
  )
  assert.equal(
    source.includes('runtimeSnapshotRunsForThread'),
    false,
    'AgentRuntimeRouter should not own thread snapshot run selection',
  )
  assert.equal(
    source.includes('runtimeRunDisplaysOnThread'),
    false,
    'AgentRuntimeRouter should not own runtime run thread visibility rules',
  )
  assert.equal(
    source.includes('selectRuntimeSnapshotRunsForThread({'),
    false,
    'AgentRuntimeRouter should not directly select thread snapshot runs',
  )
  assert.equal(
    source.includes('this.runtimeSnapshots.getThreadRuntimeSnapshot(threadId)'),
    true,
    'AgentRuntimeRouter should delegate thread snapshot assembly',
  )
  assert.equal(
    source.includes('this.runtimeSnapshots.getSessionRuntimeSnapshot(sessionId)'),
    true,
    'AgentRuntimeRouter should delegate session snapshot assembly',
  )
})

test('AgentRuntimeRouter delegates runtime work wake coordination', () => {
  for (const forbidden of [
    'RuntimeWorkManager',
    'RuntimeWakeCoordinator',
    'GenerationJobWorkProvider',
    'SubagentRunWorkProvider',
    'AgentStoreRuntimeWorkStore',
    'observeRuntimeWorkForOpen',
    'handleRuntimeRunSettled',
    'isTerminalRuntimeWorkStatus',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `AgentRuntimeRouter should not own runtime work coordination detail: ${forbidden}`,
    )
  }
  assert.equal(
    source.includes('createRuntimeWorkCoordinatorBridge({'),
    true,
    'AgentRuntimeRouter should compose runtime work coordination through a bridge',
  )
  assert.equal(
    source.includes('this.workCoordinator.runSettled(runId)'),
    true,
    'AgentRuntimeRouter should delegate run-settled wake handling',
  )
  assert.equal(
    source.includes('this.workCoordinator.threadOpened(threadId)'),
    true,
    'AgentRuntimeRouter should delegate thread-open wake handling',
  )
})

test('AgentRuntimeRouter delegates plan updates and thread deletion guards', () => {
  for (const forbidden of [
    'updateRuntimePlan({',
    'isExecutingRunStatus',
    'this.store.listRuns({ threadId: id })',
    'this.store.listRuns().find(',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `AgentRuntimeRouter should not own plan update or thread deletion detail: ${forbidden}`,
    )
  }
  assert.equal(
    source.includes('createRuntimePlanToolsBridge({'),
    true,
    'AgentRuntimeRouter should compose plan tool updates through a bridge',
  )
})

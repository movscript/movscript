#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { AgentRuntime } from './application/agentRuntime.js'
import { normalizeDraftKind, normalizeDraftStatus } from './drafts/draftStore.js'
import {
  createAgentServerContext,
  type AgentServerContext,
  getAgentRuntimeCapabilities,
  logAgentServerStartup,
} from './bootstrap/agentServerContext.js'
import { describeRuntimeModelCapabilities } from './model/modelRouter.js'
import type { JSONValue } from './types.js'
import type { AgentTraceQuery } from './state/store.js'
import type { AgentTraceEventKind } from './state/types.js'

interface AgentRequestListenerOptions {
  onShutdownRequest?: () => void | Promise<void>
}

export function createAgentRequestListener(context: AgentServerContext, options: AgentRequestListenerOptions = {}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const requestStartedAt = Date.now()
    setHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        const healthStartedAt = Date.now()
        writeJSON(res, 200, {
          ...getAgentRuntimeCapabilities(context),
          ok: true,
          draftPath: context.paths.draftPath,
          modelConfigPath: context.paths.modelConfigPath,
          modelConfig: context.modelConfigStore.getPublicConfig(),
          modelCapabilities: describeRuntimeModelCapabilities(context.modelConfigStore.getEffectiveConfig()),
        })
        logSlowRequest(req.method, url.pathname, requestStartedAt, healthStartedAt)
        return
      }

      if (req.method === 'GET' && url.pathname === '/runtime/capabilities') {
        const capabilityStartedAt = Date.now()
        writeJSON(res, 200, getAgentRuntimeCapabilities(context))
        logSlowRequest(req.method, url.pathname, requestStartedAt, capabilityStartedAt)
        return
      }

      if (req.method === 'POST' && url.pathname === '/runtime/shutdown') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime shutdown is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime shutdown rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 202, { ok: true, shuttingDown: true })
        setTimeout(() => {
          void Promise.resolve(options.onShutdownRequest?.()).catch((error) => {
            console.error('[agent] runtime shutdown failed', error)
          })
        }, 0)
        return
      }

      if (req.method === 'GET' && url.pathname === '/model-config') {
        const modelConfigStartedAt = Date.now()
        writeJSON(res, 200, {
          ...context.modelConfigStore.getPublicConfig(),
          capabilities: describeRuntimeModelCapabilities(context.modelConfigStore.getEffectiveConfig()),
        })
        logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigStartedAt)
        return
      }

      if (req.method === 'POST' && url.pathname === '/model-config') {
        const body = await readJSON(req)
        const modelConfigStartedAt = Date.now()
        writeJSON(res, 200, context.modelConfigStore.save(normalizeOptionalObject(body, 'model config body')))
        logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigStartedAt)
        return
      }

      if (req.method === 'POST' && url.pathname === '/model-config/test') {
        const body = await readJSON(req)
        const modelConfigTestStartedAt = Date.now()
        writeJSON(res, 200, await context.modelConfigStore.test(normalizeOptionalObject(body, 'model config test body'), requestAuth(req)))
        logSlowRequest(req.method, url.pathname, requestStartedAt, modelConfigTestStartedAt)
        return
      }

      if (req.method === 'GET' && url.pathname === '/inspect') {
        await context.client.initialize()
        const [resources, tools] = await Promise.all([
          context.client.listResources(),
          context.client.listTools(),
        ])
        writeJSON(res, 200, {
          mcpEndpoint: context.mcpEndpoint,
          resources,
          tools,
          registeredTools: context.agentRuntime.listRegisteredTools(),
          skills: context.agentRuntime.listSkillCatalog(),
          defaultAgentManifest: context.agentRuntime.getDefaultAgentManifest(),
          pluginCatalog: {
            skillsDir: context.pluginCatalog.skillsDir,
            toolsDir: context.pluginCatalog.toolsDir,
            builtinSkillsDir: context.pluginCatalog.builtinSkillsDir,
            builtinToolsDir: context.pluginCatalog.builtinToolsDir,
            skillCount: context.pluginCatalog.layeredSkills.length,
            toolCount: context.pluginCatalog.layeredTools.length,
            warnings: context.pluginCatalog.warnings,
          },
          updates: context.updates,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/capabilities') {
        const projectId = url.searchParams.get('projectId')
        const includeSchemas = url.searchParams.get('includeSchemas') !== 'false'
        writeJSON(res, 200, await context.agentRuntime.getCapabilities({
          ...(projectId !== null && Number.isFinite(Number(projectId)) ? { currentProjectId: Number(projectId) } : {}),
          includeResources: includeSchemas,
        }))
        return
      }

      if (req.method === 'GET' && url.pathname === '/tools') {
        writeJSON(res, 200, { tools: context.agentRuntime.listRegisteredTools() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/skills') {
        writeJSON(res, 200, { skills: context.agentRuntime.listSkillCatalog() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-catalog/reload') {
        writeJSON(res, 200, context.agentRuntime.reloadAgentCatalog())
        return
      }

      if (req.method === 'GET' && url.pathname === '/agent-manifest/default') {
        writeJSON(res, 200, context.agentRuntime.getDefaultAgentManifest())
        return
      }

      if (req.method === 'GET' && url.pathname === '/context') {
        await context.client.initialize()
        writeJSON(res, 200, await context.client.callTool('movscript_get_focus'))
        return
      }

      if (req.method === 'POST' && url.pathname === '/draft') {
        const body = await readJSON(req)
        const result = context.agentRuntime.createLocalDraft(normalizeDraftBody(body))
        writeJSON(res, 200, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/drafts') {
        writeJSON(res, 200, { drafts: context.agentRuntime.listDrafts(normalizeDraftQuery(url)) })
        return
      }

      const draftMatch = url.pathname.match(/^\/drafts\/([^/]+)$/)
      if (draftMatch && req.method === 'GET') {
        const draft = context.agentRuntime.getDraft(draftMatch[1])
        if (!draft) {
          writeJSON(res, 404, { error: 'draft not found' })
          return
        }
        writeJSON(res, 200, draft)
        return
      }
      if (draftMatch && req.method === 'PATCH') {
        const body = normalizeOptionalObject(await readJSON(req), 'draft update body')
        writeJSON(res, 200, context.agentRuntime.updateDraft({
          draftId: draftMatch[1],
          ...body,
        }))
        return
      }

      const draftPatchMatch = url.pathname.match(/^\/drafts\/([^/]+)\/patch$/)
      if (draftPatchMatch && req.method === 'POST') {
        const body = normalizeOptionalObject(await readJSON(req), 'draft patch body')
        writeJSON(res, 200, context.agentRuntime.patchDraft({
          draftId: draftPatchMatch[1],
          ...body,
        }))
        return
      }

      const draftValidateMatch = url.pathname.match(/^\/drafts\/([^/]+)\/validate$/)
      if (draftValidateMatch && req.method === 'POST') {
        writeJSON(res, 200, context.agentRuntime.validateDraft({ draftId: draftValidateMatch[1] }))
        return
      }

      const draftApplyPreviewMatch = url.pathname.match(/^\/drafts\/([^/]+)\/apply-preview$/)
      if (draftApplyPreviewMatch && req.method === 'POST') {
        const body = normalizeOptionalObject(await readJSON(req), 'apply preview body')
        writeJSON(res, 200, context.agentRuntime.previewApplyDraft({
          draftId: draftApplyPreviewMatch[1],
          ...body,
        }))
        return
      }

      const draftApplySimulateMatch = url.pathname.match(/^\/drafts\/([^/]+)\/apply-simulate$/)
      if (draftApplySimulateMatch && req.method === 'POST') {
        const body = normalizeOptionalObject(await readJSON(req), 'apply simulate body')
        writeJSON(res, 200, await context.agentRuntime.simulateApplyDraft({
          draftId: draftApplySimulateMatch[1],
          ...withRequestAuth(body, req),
        }))
        return
      }

      const draftApplyMatch = url.pathname.match(/^\/drafts\/([^/]+)\/apply$/)
      if (draftApplyMatch && req.method === 'POST') {
        const body = normalizeOptionalObject(await readJSON(req), 'draft apply body')
        writeJSON(res, 200, await context.agentRuntime.applyDraftFromUI({
          draftId: draftApplyMatch[1],
          ...withRequestAuth(body, req),
        }))
        return
      }

      const draftRejectMatch = url.pathname.match(/^\/drafts\/([^/]+)\/reject$/)
      if (draftRejectMatch && req.method === 'POST') {
        const body = normalizeOptionalObject(await readJSON(req), 'draft rejection body')
        writeJSON(res, 200, context.agentRuntime.rejectDraft({
          draftId: draftRejectMatch[1],
          reason: body.reason,
        }))
        return
      }

      if (req.method === 'POST' && url.pathname === '/threads') {
        const body = await readJSON(req)
        writeJSON(res, 201, context.agentRuntime.createThread(normalizeOptionalObject(body, 'thread body')))
        return
      }

      if (req.method === 'GET' && url.pathname === '/threads') {
        writeJSON(res, 200, { threads: context.agentRuntime.listThreadSummaries() })
        return
      }

      const threadMatch = url.pathname.match(/^\/threads\/([^/]+)$/)
      if (threadMatch && req.method === 'GET') {
        const thread = context.agentRuntime.getThread(threadMatch[1])
        if (!thread) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, thread)
        return
      }
      if (threadMatch && req.method === 'PATCH') {
        const body = await readJSON(req)
        writeJSON(res, 200, context.agentRuntime.updateThread(threadMatch[1], normalizeOptionalObject(body, 'thread update body')))
        return
      }

      const messagesMatch = url.pathname.match(/^\/threads\/([^/]+)\/messages$/)
      if (messagesMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 201, context.agentRuntime.addMessage(messagesMatch[1], normalizeOptionalObject(body, 'message body')))
        return
      }

      if (req.method === 'POST' && url.pathname === '/runs') {
        const body = await readJSON(req)
        writeJSON(res, 201, context.agentRuntime.createRun(asPlannerUserRun(withRequestAuth(normalizeOptionalObject(body, 'run body'), req))))
        return
      }

      if (req.method === 'POST' && url.pathname === '/runs/tool') {
        const body = await readJSON(req)
        writeJSON(res, 201, context.agentRuntime.createToolRun(asDirectToolRun(withRequestAuth(normalizeOptionalObject(body, 'tool run body'), req))))
        return
      }

      if (req.method === 'POST' && url.pathname === '/runs/preview') {
        const body = await readJSON(req)
        writeJSON(res, 200, await context.agentRuntime.previewRun(withRequestAuth(normalizeOptionalObject(body, 'run preview body'), req)))
        return
      }

      if (req.method === 'POST' && url.pathname === '/plans') {
        const body = await readJSON(req)
        writeJSON(res, 201, await context.agentRuntime.createPlan(withRequestAuth(normalizeOptionalObject(body, 'plan body'), req)))
        return
      }

      if (req.method === 'GET' && url.pathname === '/plans') {
        writeJSON(res, 200, { plans: context.agentRuntime.listPlans() })
        return
      }

      const planMatch = url.pathname.match(/^\/plans\/([^/]+)$/)
      if (planMatch && req.method === 'GET') {
        writeJSON(res, 200, context.agentRuntime.getPlanSnapshot(planMatch[1]))
        return
      }

      const planTasksMatch = url.pathname.match(/^\/plans\/([^/]+)\/tasks$/)
      if (planTasksMatch && req.method === 'GET') {
        writeJSON(res, 200, {
          planId: planTasksMatch[1],
          tasks: context.agentRuntime.getTaskTree(planTasksMatch[1]),
        })
        return
      }

      const planDispatchMatch = url.pathname.match(/^\/plans\/([^/]+)\/dispatch$/)
      if (planDispatchMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 202, context.agentRuntime.dispatchPlan({
          ...withRequestAuth(normalizeOptionalObject(body, 'plan dispatch body'), req),
          planId: planDispatchMatch[1],
        }))
        return
      }

      const planStreamMatch = url.pathname.match(/^\/plans\/([^/]+)\/stream$/)
      if (planStreamMatch && req.method === 'GET') {
        streamPlanEvents(req, res, context.agentRuntime, planStreamMatch[1])
        return
      }

      const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/)
      if (taskMatch && req.method === 'PATCH') {
        const body = await readJSON(req)
        writeJSON(res, 200, context.agentRuntime.updateTask(taskMatch[1], normalizeOptionalObject(body, 'task update body')))
        return
      }

      if (req.method === 'GET' && url.pathname === '/runs') {
        const parentRunId = url.searchParams.get('parentRunId')
        writeJSON(res, 200, {
          runs: parentRunId ? context.agentRuntime.listRunsByParent(parentRunId) : context.agentRuntime.listRuns(),
        })
        return
      }

      const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/)
      if (runMatch && req.method === 'GET') {
        const run = context.agentRuntime.getRun(runMatch[1])
        if (!run) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, run)
        return
      }

      const runTraceSummaryMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace\/summary$/)
      if (runTraceSummaryMatch && req.method === 'GET') {
        writeJSON(res, 200, context.agentRuntime.getRunTraceSummary(runTraceSummaryMatch[1]))
        return
      }

      const runChildrenMatch = url.pathname.match(/^\/runs\/([^/]+)\/children$/)
      if (runChildrenMatch && req.method === 'GET') {
        writeJSON(res, 200, {
          runId: runChildrenMatch[1],
          children: context.agentRuntime.getChildRuns(runChildrenMatch[1]),
        })
        return
      }

      const runTraceMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace$/)
      if (runTraceMatch && req.method === 'GET') {
        const traceQuery = normalizeTraceQuery(url)
        if (!traceQuery.ok) {
          writeJSON(res, 400, { error: traceQuery.error })
          return
        }
        writeJSON(res, 200, context.agentRuntime.getRunTracePage(runTraceMatch[1], traceQuery.query))
        return
      }

      const runStreamMatch = url.pathname.match(/^\/runs\/([^/]+)\/stream$/)
      if (runStreamMatch && req.method === 'GET') {
        streamRunEvents(req, res, context.agentRuntime, runStreamMatch[1])
        return
      }

      const runApproveMatch = url.pathname.match(/^\/runs\/([^/]+)\/approve$/)
      if (runApproveMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 202, context.agentRuntime.approveRun(runApproveMatch[1], withRequestAuth(normalizeOptionalObject(body, 'approval body'), req)))
        return
      }

      const runCancelMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel$/)
      if (runCancelMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 200, context.agentRuntime.cancelRun(runCancelMatch[1], normalizeOptionalObject(body, 'cancel body')))
        return
      }

      const runCancelTreeMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel-tree$/)
      if (runCancelTreeMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 200, context.agentRuntime.cancelPlanTree(runCancelTreeMatch[1], normalizeOptionalObject(body, 'cancel tree body')))
        return
      }

      const runReplanMatch = url.pathname.match(/^\/runs\/([^/]+)\/replan$/)
      if (runReplanMatch && req.method === 'POST') {
        const run = context.agentRuntime.getRun(runReplanMatch[1])
        if (!run?.planId) {
          writeJSON(res, run ? 400 : 404, { error: run ? 'run is not attached to a plan' : 'run not found' })
          return
        }
        const plan = context.agentRuntime.getPlan(run.planId)
        const body = await readJSON(req)
        writeJSON(res, 202, context.agentRuntime.replanRun(runReplanMatch[1], {
          ...withRequestAuth(normalizeOptionalObject(body, 'replan body'), req),
          planId: run.planId,
          plannerRunId: plan?.rootRunId ?? (run.role === 'planner' ? run.id : run.parentRunId),
        }))
        return
      }

      const runRejectMatch = url.pathname.match(/^\/runs\/([^/]+)\/reject$/)
      if (runRejectMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 200, context.agentRuntime.rejectRun(runRejectMatch[1], normalizeOptionalObject(body, 'rejection body')))
        return
      }

      const runInputMatch = url.pathname.match(/^\/runs\/([^/]+)\/input$/)
      if (runInputMatch && req.method === 'POST') {
        const body = await readJSON(req)
        writeJSON(res, 202, context.agentRuntime.answerRunInputRequest(runInputMatch[1], withRequestAuth(normalizeOptionalObject(body, 'input answer body'), req)))
        return
      }

      if (req.method === 'GET' && url.pathname === '/memories') {
        const query = normalizeMemoryQuery(url)
        writeJSON(res, 200, { memories: query ? context.agentRuntime.listMemorySummaries(query) : [] })
        return
      }

      if (req.method === 'POST' && url.pathname === '/memories') {
        const body = normalizeOptionalObject(await readJSON(req), 'memory body')
        writeJSON(res, 201, context.agentRuntime.createMemory(normalizeMemoryBody(body)))
        return
      }

      const memoryMatch = url.pathname.match(/^\/memories\/([^/]+)$/)
      if (memoryMatch && req.method === 'GET') {
        const projectId = normalizeMemoryProjectId(url)
        const memory = typeof projectId === 'number' ? context.agentRuntime.getMemory(projectId, memoryMatch[1]) : undefined
        writeJSON(res, memory ? 200 : 404, memory ? { memory } : { error: 'memory not found' })
        return
      }

      if (memoryMatch && req.method === 'DELETE') {
        const projectId = normalizeMemoryProjectId(url)
        const deleted = typeof projectId === 'number' ? context.agentRuntime.deleteMemory(projectId, memoryMatch[1]) : false
        writeJSON(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'memory not found' })
        return
      }

      writeJSON(res, 404, { error: 'not found' })
    } catch (error) {
      writeJSON(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export function startAgentServer(context = createAgentServerContext()): ReturnType<typeof createServer> {
  let server: ReturnType<typeof createServer>
  server = createServer(createAgentRequestListener(context, {
    onShutdownRequest: () => {
      console.info('[agent] shutdown requested by local desktop runtime')
      const forceExit = setTimeout(() => process.exit(0), 1_000)
      forceExit.unref()
      server.close(() => process.exit(0))
    },
  }))
  server.on('error', (error) => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EADDRINUSE') {
      console.error(`[agent] FATAL: port ${context.port} is already in use (set MOVSCRIPT_AGENT_PORT or stop the conflicting process). 127.0.0.1:${context.port} is taken.`)
    } else if (code === 'EACCES') {
      console.error(`[agent] FATAL: not permitted to bind 127.0.0.1:${context.port} (${code}).`)
    } else {
      console.error('[agent] FATAL: agent HTTP server error', error)
    }
    process.exit(1)
  })
  server.listen(context.port, '127.0.0.1', () => logAgentServerStartup(context))
  return server
}

if (isMainModule()) {
  process.on('uncaughtException', (error) => {
    console.error('[agent] FATAL uncaughtException during startup', error)
    process.exit(1)
  })
  process.on('unhandledRejection', (error) => {
    console.error('[agent] FATAL unhandledRejection during startup', error)
    process.exit(1)
  })
  try {
    startAgentServer()
  } catch (error) {
    console.error('[agent] FATAL: startAgentServer threw before listen', error)
    process.exit(1)
  }
}

function normalizeDraftBody(body: unknown): Record<string, JSONValue> {
  if (!isRecord(body)) throw new Error('draft body must be an object')
  return {
    ...(typeof body.projectId === 'number' ? { projectId: body.projectId } : {}),
    kind: normalizeDraftKind(body.kind),
    title: typeof body.title === 'string' ? body.title : 'Untitled draft',
    content: typeof body.content === 'string' ? body.content : '',
    ...(isRecord(body.source) ? { source: normalizeDraftSource(body.source) } : {}),
    ...(isRecord(body.target) ? { target: body.target as Record<string, JSONValue> } : {}),
    ...(isRecord(body.metadata) ? { metadata: body.metadata as Record<string, JSONValue> } : {}),
  }
}

function normalizeDraftQuery(url: URL): Parameters<AgentRuntime['listDrafts']>[0] {
  const projectId = url.searchParams.get('projectId')
  const kind = normalizeDraftKind(url.searchParams.get('kind'))
  const status = normalizeDraftStatus(url.searchParams.get('status'))
  const statuses = url.searchParams.getAll('status').flatMap((item) => {
    const parsed = normalizeDraftStatus(item)
    return parsed ? [parsed] : []
  })
  const threadId = url.searchParams.get('threadId')
  const runId = url.searchParams.get('runId')
  const sourceEntityType = url.searchParams.get('sourceEntityType')
  const sourceEntityId = url.searchParams.get('sourceEntityId')
  const pageKey = url.searchParams.get('pageKey')
  const pageType = url.searchParams.get('pageType')
  const pageRoute = url.searchParams.get('pageRoute')
  const pageEntityType = url.searchParams.get('pageEntityType')
  const pageEntityId = url.searchParams.get('pageEntityId')
  const limit = url.searchParams.get('limit')
  return {
    ...(projectId !== null && Number.isFinite(Number(projectId)) ? { projectId: Number(projectId) } : {}),
    ...(url.searchParams.has('kind') ? { kind } : {}),
    ...(statuses.length > 1 ? { statuses: Array.from(new Set(statuses)) } : status ? { status } : {}),
    ...(threadId ? { threadId } : {}),
    ...(runId ? { runId } : {}),
    ...(sourceEntityType ? { sourceEntityType } : {}),
    ...(sourceEntityId ? { sourceEntityId } : {}),
    ...(pageKey ? { pageKey } : {}),
    ...(pageType ? { pageType } : {}),
    ...(pageRoute ? { pageRoute } : {}),
    ...(pageEntityType ? { pageEntityType } : {}),
    ...(pageEntityId ? { pageEntityId } : {}),
    ...(limit !== null && Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}),
  }
}

function normalizeOptionalObject(body: unknown, label: string): Record<string, unknown> {
  if (body === undefined || body === null) return {}
  if (!isRecord(body)) throw new Error(`${label} must be an object`)
  return body
}

function normalizeMemoryQuery(url: URL): Parameters<AgentRuntime['listMemories']>[0] | undefined {
  const scope = url.searchParams.get('scope')
  if (scope === 'global' || scope === 'thread') return undefined
  const projectId = normalizeMemoryProjectId(url)
  if (typeof projectId !== 'number') return undefined
  const kind = url.searchParams.get('kind')
  const query = url.searchParams.get('query')
  const limit = url.searchParams.get('limit')
  return {
    projectId,
    ...(kind === 'preference' || kind === 'fact' || kind === 'item_ref' || kind === 'entity_ref' || kind === 'draft' || kind === 'decision' || kind === 'warning' ? { kind } : {}),
    ...(query ? { query } : {}),
    ...(limit !== null && Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}),
  }
}

function normalizeMemoryBody(body: Record<string, unknown>): Parameters<AgentRuntime['createMemory']>[0] {
  const projectId = typeof body.projectId === 'number' && Number.isFinite(body.projectId) ? body.projectId : undefined
  const kind = body.kind === 'preference' || body.kind === 'fact' || body.kind === 'item_ref' || body.kind === 'entity_ref' || body.kind === 'draft' || body.kind === 'decision' || body.kind === 'warning'
    ? body.kind
    : undefined
  if (projectId === undefined) throw new Error('memory projectId is required')
  if (typeof body.title !== 'string' || body.title.trim().length === 0) throw new Error('memory title is required')
  if (!kind) throw new Error('memory kind is required')
  if (typeof body.content !== 'string' || body.content.trim().length === 0) throw new Error('memory content is required')
  return {
    projectId,
    title: body.title,
    kind,
    content: body.content,
    ...(typeof body.sourceThreadId === 'string' ? { sourceThreadId: body.sourceThreadId } : typeof body.threadId === 'string' ? { sourceThreadId: body.threadId } : {}),
    ...(typeof body.sourceRunId === 'string' ? { sourceRunId: body.sourceRunId } : {}),
    ...(typeof body.sourceMessageId === 'string' ? { sourceMessageId: body.sourceMessageId } : {}),
  }
}

function normalizeMemoryProjectId(url: URL): number | undefined {
  const projectId = url.searchParams.get('projectId')
  if (projectId !== null && Number.isFinite(Number(projectId))) return Number(projectId)
  return undefined
}

function normalizeDraftSource(source: Record<string, unknown>): Record<string, JSONValue> {
  return {
    ...(typeof source.entityType === 'string' ? { entityType: source.entityType } : {}),
    ...(typeof source.entityId === 'number' || typeof source.entityId === 'string' ? { entityId: source.entityId } : {}),
    ...(typeof source.pipelineNodeId === 'number' || typeof source.pipelineNodeId === 'string' ? { pipelineNodeId: source.pipelineNodeId } : {}),
    ...(typeof source.runId === 'string' ? { runId: source.runId } : {}),
    ...(typeof source.threadId === 'string' ? { threadId: source.threadId } : {}),
    ...(typeof source.userId === 'number' || typeof source.userId === 'string' ? { userId: source.userId } : {}),
    ...(typeof source.pageKey === 'string' ? { pageKey: source.pageKey } : {}),
    ...(typeof source.pageType === 'string' ? { pageType: source.pageType } : {}),
    ...(typeof source.pageRoute === 'string' ? { pageRoute: source.pageRoute } : {}),
    ...(typeof source.pageEntityType === 'string' ? { pageEntityType: source.pageEntityType } : {}),
    ...(typeof source.pageEntityId === 'number' || typeof source.pageEntityId === 'string' ? { pageEntityId: source.pageEntityId } : {}),
  }
}

function readJSON(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function writeJSON(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function logSlowRequest(method: string | undefined, pathname: string, requestStartedAt: number, handlerStartedAt: number): void {
  const totalMs = Date.now() - requestStartedAt
  if (totalMs <= 100) return
  console.info(`[agent] request slow ${method ?? 'UNKNOWN'} ${pathname} total=${totalMs}ms handler=${Date.now() - handlerStartedAt}ms`)
}

function streamRunEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntime, runId: string): void {
  if (!runtime.getRun(runId)) {
    writeJSON(res, 404, { error: 'run not found' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  let subscribed = false
  let closeAfterSubscribe = false
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  const cleanup = (end: boolean) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    if (end && !res.writableEnded) res.end()
  }

  unsubscribe = runtime.subscribeRunStream(runId, (event) => {
    if (closed || res.writableEnded) return
    writeSSE(res, event.type, event)
    if (event.type === 'done') {
      if (subscribed) cleanup(true)
      else closeAfterSubscribe = true
    }
  })
  subscribed = true
  if (closeAfterSubscribe) cleanup(true)

  req.on('close', () => cleanup(false))
}

function streamPlanEvents(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntime, planId: string): void {
  if (!runtime.getPlan(planId)) {
    writeJSON(res, 404, { error: 'plan not found' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  let closed = false
  let unsubscribe = () => { }
  let subscribed = false
  let closeAfterSubscribe = false
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  const cleanup = (end: boolean) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    if (end && !res.writableEnded) res.end()
  }

  unsubscribe = runtime.subscribePlanStream(planId, (event) => {
    if (closed || res.writableEnded) return
    writeSSE(res, event.type, event)
    if (event.type === 'done') {
      if (subscribed) cleanup(true)
      else closeAfterSubscribe = true
    }
  })
  subscribed = true
  if (closeAfterSubscribe) cleanup(true)

  req.on('close', () => cleanup(false))
}

function writeSSE(res: ServerResponse, eventName: string, value: unknown): void {
  res.write(`event: ${eventName}\n`)
  const data = JSON.stringify(value)
  for (const line of data.split(/\r?\n/)) {
    res.write(`data: ${line}\n`)
  }
  res.write('\n')
}

const AGENT_TRACE_EVENT_KINDS = new Set<AgentTraceEventKind>([
  'run',
  'thread',
  'message',
  'context',
  'memory',
  'manifest',
  'skill',
  'tool_catalog',
  'prompt',
  'policy',
  'reasoning',
  'tool_call',
  'model_call',
  'approval',
  'input',
  'assistant',
  'task',
  'plan',
  'error',
])

export function normalizeTraceQuery(url: URL): { ok: true; query: AgentTraceQuery } | { ok: false; error: string } {
  const cursor = url.searchParams.get('cursor')
  const limitRaw = url.searchParams.get('limit')
  const kind = url.searchParams.get('kind')
  const limit = limitRaw !== null ? Number(limitRaw) : undefined
  if (kind && !AGENT_TRACE_EVENT_KINDS.has(kind as AgentTraceEventKind)) return { ok: false, error: `invalid trace kind: ${kind}` }
  return { ok: true, query: {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(kind ? { kind: kind as AgentTraceEventKind } : {}),
  } }
}

function setHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Movscript-Backend-API-Base-URL')
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket?.remoteAddress
  return !remoteAddress
    || remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1'
}

function isCrossSiteBrowserRequest(req: IncomingMessage): boolean {
  const site = headerValue(req, 'sec-fetch-site')
  return site === 'cross-site'
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}

function requestAuth(req: IncomingMessage): { backendAuthToken?: string; backendAPIBaseURL?: string } {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : ''
  const backendAPIBaseURL = headerValue(req, 'x-movscript-backend-api-base-url')
  const auth: { backendAuthToken?: string; backendAPIBaseURL?: string } = {
    ...(backendAPIBaseURL ? { backendAPIBaseURL } : {}),
  }
  if (!header.toLowerCase().startsWith('bearer ')) return auth
  const token = header.slice('Bearer '.length).trim()
  return token ? { ...auth, backendAuthToken: token } : auth
}

function withRequestAuth<T extends Record<string, unknown>>(body: T, req: IncomingMessage): T & { backendAuthToken?: string; backendAPIBaseURL?: string } {
  const auth = requestAuth(req)
  return Object.keys(auth).length > 0 ? { ...body, ...auth } : body
}

function asPlannerUserRun(body: Record<string, unknown>): Record<string, unknown> & { role: 'planner'; parentRunId?: undefined; taskId?: undefined } {
  const { parentRunId: _parentRunId, taskId: _taskId, ...rest } = body
  return { ...rest, role: 'planner' }
}

function asDirectToolRun(body: Record<string, unknown>): Record<string, unknown> & {
  role: 'worker'
  parentRunId?: undefined
  planId?: undefined
  taskId?: undefined
} {
  const {
    role: _role,
    parentRunId: _parentRunId,
    planId: _planId,
    taskId: _taskId,
    progress: _progress,
    blockedReason: _blockedReason,
    ...rest
  } = body
  return { ...rest, role: 'worker' }
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

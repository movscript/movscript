#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { AgentRuntime } from './runtime/agentRuntime.js'
import { normalizeDraftKind, normalizeDraftStatus } from './runtime/store/draftStore.js'
import {
  createAgentServerContext,
  getAgentRuntimeCapabilities,
  logAgentServerStartup,
} from './bootstrap/agentServerContext.js'
import type { JSONValue } from './types.js'

const context = createAgentServerContext()
const {
  port,
  mcpEndpoint,
  paths,
  client,
  agentRuntime,
  productionRuntime,
  modelConfigStore,
  pluginCatalog,
} = context

const server = createServer(async (req, res) => {
  setHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      writeJSON(res, 200, {
        ...getAgentRuntimeCapabilities(context),
        ok: true,
        draftPath: paths.draftPath,
        productionStatePath: paths.productionStatePath,
        modelConfigPath: paths.modelConfigPath,
        modelConfig: modelConfigStore.getPublicConfig(),
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/runtime/capabilities') {
      writeJSON(res, 200, getAgentRuntimeCapabilities(context))
      return
    }

    if (req.method === 'GET' && url.pathname === '/model-config') {
      writeJSON(res, 200, modelConfigStore.getPublicConfig())
      return
    }

    if (req.method === 'POST' && url.pathname === '/model-config') {
      const body = await readJSON(req)
      writeJSON(res, 200, modelConfigStore.save(normalizeOptionalObject(body, 'model config body')))
      return
    }

    if (req.method === 'POST' && url.pathname === '/model-config/test') {
      const body = await readJSON(req)
      writeJSON(res, 200, await modelConfigStore.test(normalizeOptionalObject(body, 'model config test body'), requestAuth(req)))
      return
    }

    if (req.method === 'GET' && url.pathname === '/inspect') {
      await client.initialize()
      const [resources, tools] = await Promise.all([
        client.listResources(),
        client.listTools(),
      ])
      writeJSON(res, 200, {
        mcpEndpoint,
        resources,
        tools,
        registeredTools: agentRuntime.listRegisteredTools(),
        skills: agentRuntime.listSkillCatalog(),
        defaultAgentManifest: agentRuntime.getDefaultAgentManifest(),
        pluginCatalog: {
          skillsDir: pluginCatalog.skillsDir,
          toolsDir: pluginCatalog.toolsDir,
          builtinSkillsDir: pluginCatalog.builtinSkillsDir,
          builtinToolsDir: pluginCatalog.builtinToolsDir,
          skillCount: pluginCatalog.skills.length,
          toolCount: pluginCatalog.tools.length,
          warnings: pluginCatalog.warnings,
        },
        updates: context.updates,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/capabilities') {
      const projectId = url.searchParams.get('projectId')
      const includeSchemas = url.searchParams.get('includeSchemas') !== 'false'
      writeJSON(res, 200, await agentRuntime.getCapabilities({
        ...(projectId !== null && Number.isFinite(Number(projectId)) ? { currentProjectId: Number(projectId) } : {}),
        includeResources: includeSchemas,
      }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/tools') {
      writeJSON(res, 200, { tools: agentRuntime.listRegisteredTools() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/skills') {
      writeJSON(res, 200, { skills: agentRuntime.listSkillCatalog() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/agent-manifest/default') {
      writeJSON(res, 200, agentRuntime.getDefaultAgentManifest())
      return
    }

    if (req.method === 'GET' && url.pathname === '/context') {
      await client.initialize()
      writeJSON(res, 200, await client.callTool('movscript_get_context_pack'))
      return
    }

    if (req.method === 'POST' && url.pathname === '/draft') {
      const body = await readJSON(req)
      const result = agentRuntime.createLocalDraft(normalizeDraftBody(body))
      writeJSON(res, 200, result)
      return
    }

    if (req.method === 'GET' && url.pathname === '/drafts') {
      writeJSON(res, 200, { drafts: agentRuntime.listDrafts(normalizeDraftQuery(url)) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/production/actions') {
      const body = await readJSON(req)
      writeJSON(res, 201, await productionRuntime.createAction(normalizeOptionalObject(body, 'production action body')))
      return
    }

    if (req.method === 'GET' && url.pathname === '/production/runs') {
      writeJSON(res, 200, { runs: productionRuntime.listRuns() })
      return
    }

    const productionRunMatch = url.pathname.match(/^\/production\/runs\/([^/]+)$/)
    if (productionRunMatch && req.method === 'GET') {
      const run = productionRuntime.getRun(productionRunMatch[1])
      if (!run) {
        writeJSON(res, 404, { error: 'production run not found' })
        return
      }
      writeJSON(res, 200, run)
      return
    }

    if (req.method === 'GET' && url.pathname === '/production/candidates') {
      writeJSON(res, 200, { candidates: productionRuntime.listCandidates() })
      return
    }

    const productionCandidateMatch = url.pathname.match(/^\/production\/candidates\/([^/]+)$/)
    if (productionCandidateMatch && req.method === 'GET') {
      const candidate = productionRuntime.getCandidate(productionCandidateMatch[1])
      if (!candidate) {
        writeJSON(res, 404, { error: 'production candidate not found' })
        return
      }
      writeJSON(res, 200, candidate)
      return
    }

    const productionCandidateApplyPreviewMatch = url.pathname.match(/^\/production\/candidates\/([^/]+)\/apply-preview$/)
    if (productionCandidateApplyPreviewMatch && req.method === 'POST') {
      const candidateId = productionCandidateApplyPreviewMatch[1]
      if (!productionRuntime.getCandidate(candidateId)) {
        writeJSON(res, 404, { error: 'production candidate not found' })
        return
      }
      writeJSON(res, 200, productionRuntime.previewCandidateApply(candidateId))
      return
    }

    const productionCandidateActionMatch = url.pathname.match(/^\/production\/candidates\/([^/]+)\/(accept|reject|revise|supersede)$/)
    if (productionCandidateActionMatch && req.method === 'POST') {
      const body = normalizeOptionalObject(await readJSON(req), 'candidate lifecycle body')
      const candidateId = productionCandidateActionMatch[1]
      if (!productionRuntime.getCandidate(candidateId)) {
        writeJSON(res, 404, { error: 'production candidate not found' })
        return
      }
      const action = productionCandidateActionMatch[2]
      if (action === 'accept') {
        writeJSON(res, 200, productionRuntime.acceptCandidate({ candidateId, ...body }))
        return
      }
      if (action === 'reject') {
        writeJSON(res, 200, productionRuntime.rejectCandidate({ candidateId, ...body }))
        return
      }
      if (action === 'revise') {
        writeJSON(res, 201, productionRuntime.reviseCandidate({ candidateId, ...body }))
        return
      }
      writeJSON(res, 200, productionRuntime.supersedeCandidate({ candidateId, ...body }))
      return
    }

    const draftMatch = url.pathname.match(/^\/drafts\/([^/]+)$/)
    if (draftMatch && req.method === 'GET') {
      const draft = agentRuntime.getDraft(draftMatch[1])
      if (!draft) {
        writeJSON(res, 404, { error: 'draft not found' })
        return
      }
      writeJSON(res, 200, draft)
      return
    }

    const draftApplyPreviewMatch = url.pathname.match(/^\/drafts\/([^/]+)\/apply-preview$/)
    if (draftApplyPreviewMatch && req.method === 'POST') {
      const body = normalizeOptionalObject(await readJSON(req), 'apply preview body')
      writeJSON(res, 200, agentRuntime.previewApplyDraft({
        draftId: draftApplyPreviewMatch[1],
        ...body,
      }))
      return
    }

    const draftRejectMatch = url.pathname.match(/^\/drafts\/([^/]+)\/reject$/)
    if (draftRejectMatch && req.method === 'POST') {
      const body = normalizeOptionalObject(await readJSON(req), 'draft rejection body')
      writeJSON(res, 200, agentRuntime.rejectDraft({
        draftId: draftRejectMatch[1],
        reason: body.reason,
      }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/threads') {
      const body = await readJSON(req)
      writeJSON(res, 201, agentRuntime.createThread(normalizeOptionalObject(body, 'thread body')))
      return
    }

    if (req.method === 'GET' && url.pathname === '/threads') {
      writeJSON(res, 200, { threads: agentRuntime.listThreadSummaries() })
      return
    }

    const threadMatch = url.pathname.match(/^\/threads\/([^/]+)$/)
    if (threadMatch && req.method === 'GET') {
      const thread = agentRuntime.getThread(threadMatch[1])
      if (!thread) {
        writeJSON(res, 404, { error: 'thread not found' })
        return
      }
      writeJSON(res, 200, thread)
      return
    }
    if (threadMatch && req.method === 'PATCH') {
      const body = await readJSON(req)
      writeJSON(res, 200, agentRuntime.updateThread(threadMatch[1], normalizeOptionalObject(body, 'thread update body')))
      return
    }

    const messagesMatch = url.pathname.match(/^\/threads\/([^/]+)\/messages$/)
    if (messagesMatch && req.method === 'POST') {
      const body = await readJSON(req)
      writeJSON(res, 201, agentRuntime.addMessage(messagesMatch[1], normalizeOptionalObject(body, 'message body')))
      return
    }

    if (req.method === 'POST' && url.pathname === '/runs') {
      const body = await readJSON(req)
      writeJSON(res, 201, agentRuntime.createRun(withRequestAuth(normalizeOptionalObject(body, 'run body'), req)))
      return
    }

    if (req.method === 'POST' && url.pathname === '/runs/tool') {
      const body = await readJSON(req)
      writeJSON(res, 201, agentRuntime.createToolRun(withRequestAuth(normalizeOptionalObject(body, 'tool run body'), req)))
      return
    }

    if (req.method === 'POST' && url.pathname === '/runs/preview') {
      const body = await readJSON(req)
      writeJSON(res, 200, await agentRuntime.previewRun(withRequestAuth(normalizeOptionalObject(body, 'run preview body'), req)))
      return
    }

    if (req.method === 'GET' && url.pathname === '/runs') {
      writeJSON(res, 200, { runs: agentRuntime.listRuns() })
      return
    }

    const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/)
    if (runMatch && req.method === 'GET') {
      const run = agentRuntime.getRun(runMatch[1])
      if (!run) {
        writeJSON(res, 404, { error: 'run not found' })
        return
      }
      writeJSON(res, 200, run)
      return
    }

    const runApproveMatch = url.pathname.match(/^\/runs\/([^/]+)\/approve$/)
    if (runApproveMatch && req.method === 'POST') {
      const body = await readJSON(req)
      writeJSON(res, 202, agentRuntime.approveRun(runApproveMatch[1], withRequestAuth(normalizeOptionalObject(body, 'approval body'), req)))
      return
    }

    const runCancelMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel$/)
    if (runCancelMatch && req.method === 'POST') {
      const body = await readJSON(req)
      writeJSON(res, 200, agentRuntime.cancelRun(runCancelMatch[1], normalizeOptionalObject(body, 'cancel body')))
      return
    }

    const runRejectMatch = url.pathname.match(/^\/runs\/([^/]+)\/reject$/)
    if (runRejectMatch && req.method === 'POST') {
      const body = await readJSON(req)
      writeJSON(res, 200, agentRuntime.rejectRun(runRejectMatch[1], normalizeOptionalObject(body, 'rejection body')))
      return
    }

    const runInputMatch = url.pathname.match(/^\/runs\/([^/]+)\/input$/)
    if (runInputMatch && req.method === 'POST') {
      const body = await readJSON(req)
      writeJSON(res, 202, agentRuntime.answerRunInputRequest(runInputMatch[1], withRequestAuth(normalizeOptionalObject(body, 'input answer body'), req)))
      return
    }

    if (req.method === 'GET' && url.pathname === '/memories') {
      writeJSON(res, 200, { memories: agentRuntime.listMemories(normalizeMemoryQuery(url)) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/memories') {
      const body = normalizeOptionalObject(await readJSON(req), 'memory body')
      writeJSON(res, 201, agentRuntime.createMemory(normalizeMemoryBody(body)))
      return
    }

    const memoryMatch = url.pathname.match(/^\/memories\/([^/]+)$/)
    if (memoryMatch && req.method === 'DELETE') {
      const deleted = agentRuntime.deleteMemory(memoryMatch[1])
      writeJSON(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'memory not found' })
      return
    }

    writeJSON(res, 404, { error: 'not found' })
  } catch (error) {
    writeJSON(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, '127.0.0.1', () => logAgentServerStartup(context))

function normalizeDraftBody(body: unknown): Record<string, JSONValue> {
  if (!isRecord(body)) throw new Error('draft body must be an object')
  return {
    ...(typeof body.projectId === 'number' ? { projectId: body.projectId } : {}),
    kind: normalizeDraftKind(body.kind),
    title: typeof body.title === 'string' ? body.title : 'Untitled draft',
    content: typeof body.content === 'string' ? body.content : '',
    ...(isRecord(body.source) ? { source: body.source as Record<string, JSONValue> } : {}),
    ...(isRecord(body.target) ? { target: body.target as Record<string, JSONValue> } : {}),
    ...(isRecord(body.metadata) ? { metadata: body.metadata as Record<string, JSONValue> } : {}),
  }
}

function normalizeDraftQuery(url: URL): Parameters<AgentRuntime['listDrafts']>[0] {
  const projectId = url.searchParams.get('projectId')
  const kind = normalizeDraftKind(url.searchParams.get('kind'))
  const status = normalizeDraftStatus(url.searchParams.get('status'))
  const sourceEntityType = url.searchParams.get('sourceEntityType')
  const sourceEntityId = url.searchParams.get('sourceEntityId')
  const limit = url.searchParams.get('limit')
  return {
    ...(projectId !== null && Number.isFinite(Number(projectId)) ? { projectId: Number(projectId) } : {}),
    ...(url.searchParams.has('kind') ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(sourceEntityType ? { sourceEntityType } : {}),
    ...(sourceEntityId ? { sourceEntityId } : {}),
    ...(limit !== null && Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}),
  }
}

function normalizeOptionalObject(body: unknown, label: string): Record<string, unknown> {
  if (body === undefined || body === null) return {}
  if (!isRecord(body)) throw new Error(`${label} must be an object`)
  return body
}

function normalizeMemoryQuery(url: URL): Parameters<AgentRuntime['listMemories']>[0] {
  const projectId = url.searchParams.get('projectId')
  const scope = url.searchParams.get('scope')
  const threadId = url.searchParams.get('threadId')
  const kind = url.searchParams.get('kind')
  const query = url.searchParams.get('query')
  const limit = url.searchParams.get('limit')
  return {
    ...(scope === 'global' || scope === 'project' || scope === 'thread' ? { scope } : {}),
    ...(projectId !== null && Number.isFinite(Number(projectId)) ? { projectId: Number(projectId) } : {}),
    ...(threadId ? { threadId } : {}),
    ...(kind === 'preference' || kind === 'fact' || kind === 'entity_ref' || kind === 'draft' || kind === 'decision' || kind === 'warning' ? { kind } : {}),
    ...(query ? { query } : {}),
    ...(limit !== null && Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}),
  }
}

function normalizeMemoryBody(body: Record<string, unknown>): Parameters<AgentRuntime['createMemory']>[0] {
  const scope = body.scope === 'global' || body.scope === 'project' || body.scope === 'thread' ? body.scope : undefined
  const kind = body.kind === 'preference' || body.kind === 'fact' || body.kind === 'entity_ref' || body.kind === 'draft' || body.kind === 'decision' || body.kind === 'warning'
    ? body.kind
    : undefined
  if (!scope) throw new Error('memory scope is required')
  if (!kind) throw new Error('memory kind is required')
  if (typeof body.content !== 'string' || body.content.trim().length === 0) throw new Error('memory content is required')
  return {
    scope,
    kind,
    content: body.content,
    ...(typeof body.projectId === 'number' ? { projectId: body.projectId } : {}),
    ...(typeof body.threadId === 'string' ? { threadId: body.threadId } : {}),
    ...(typeof body.sourceRunId === 'string' ? { sourceRunId: body.sourceRunId } : {}),
    ...(typeof body.sourceMessageId === 'string' ? { sourceMessageId: body.sourceMessageId } : {}),
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
  res.end(JSON.stringify(value, null, 2))
}

function setHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Movscript-Backend-API-Base-URL')
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

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

#!/usr/bin/env node
import { IncomingMessage, ServerResponse, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  installAgentCatalogPack,
  resolveAgentCatalogPackStoreDirs,
  touchAgentSessionHeartbeat,
  uninstallAgentCatalogPack,
  writeAgentSessionRuntimeRecord,
  type AgentCatalogPackFile,
} from '@movscript/agent-runtime'
import {
  createAgentServerContext,
  type AgentServerContext,
  getAgentRuntimeCompatibility,
  getAgentServerCapabilities,
  logAgentServerStartup,
} from '../../bootstrap/server/agentServerContext.js'
import { isRecord } from '../../shared/json/jsonValue.js'
import { isActiveRunStatus, isExecutingRunStatus } from '../../state/run/status/lifecycle/runStatus.js'
import { toThreadSummary } from '../../state/store/core/store.js'
import { buildRuntimeInputMessageMetadata } from '../../state/run/input/runtime/runtimeRunInputs.js'
import { isValidMemoryProjectId } from '../../memory/shared/types.js'
import { RuntimeModelConfigInputError } from '../../model/config/modelConfig.js'
import { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'
import {
  sessionRuntimeSnapshotV2,
  threadRuntimeSnapshotV2,
} from '../protocol/runtimeProtocol.js'
import {
  streamPlanEvents,
  streamRunEvents,
  streamSessionEvents,
  streamThreadEvents,
} from '../streams/runtimeStreams.js'
import {
  streamSessionTimelineEvents,
  streamThreadTimelineEvents,
} from '../streams/timelineStreams.js'
import { buildRuntimeTimelinePage } from '../protocol/timelineProjection.js'
import {
  AgentHTTPError,
  isCrossSiteBrowserRequest,
  isLoopbackRequest,
  logSlowRequest,
  normalizeOptionalObject,
  readJSON,
  readOptionalJSONObject,
  requestPathname,
  setHeaders,
  withRequestAuth,
  writeJSON,
  writeText,
} from '../core/http.js'
import { handleModelConfigRoutes } from '../routes/modelConfigRoutes.js'
import { resolveAgentRuntimeServerTransport } from '../transports/runtimeServerTransport.js'
import {
  compileAgentClientPlugin,
  dispatchAgentClientPluginHostCall,
  runAgentClientPlugin,
  type AgentClientPluginManifest,
} from '../../plugins/runtime/clientPluginRuntime.js'
import {
  listClientPluginsFromStore,
  normalizeStoredClientPluginManifest,
  removeClientPluginFromStore,
  saveClientPluginToStore,
} from '../../plugins/store/clientPluginFileStore.js'
import {
  activeAgentConfigFileId,
  asDirectToolRun,
  asPlannerUserRun,
  normalizeDebugEvidenceRefQuery,
  normalizeMemoryBody,
  normalizeMemoryProjectId,
  normalizeMemoryQuery,
  normalizeThreadListQuery,
  normalizeTraceQuery,
  paginatedThreadSummaries,
  parseOptionalProjectIdParam,
} from './server-listener/normalizers.js'

export { normalizeDebugEvidenceRefQuery, normalizeTraceQuery } from './server-listener/normalizers.js'

installAgentLogTimestamps('server')

const SERVER_MODULE_READY_AT = Date.now()
const SERVER_CHILD_STARTED_AT = Number(process.env.MOVSCRIPT_AGENT_SERVER_CHILD_STARTED_AT || 0)
const DESKTOP_SPAWN_STARTED_AT = Number(process.env.MOVSCRIPT_AGENT_DESKTOP_SPAWN_STARTED_AT || 0)
if (SERVER_CHILD_STARTED_AT > 0) {
  console.info(`[agent] server module ready after childStart=${SERVER_MODULE_READY_AT - SERVER_CHILD_STARTED_AT}ms${DESKTOP_SPAWN_STARTED_AT > 0 ? ` desktopSpawn=${SERVER_MODULE_READY_AT - DESKTOP_SPAWN_STARTED_AT}ms` : ''}`)
}

function installAgentLogTimestamps(scope: string): void {
  const key = Symbol.for(`movscript.agent.log-timestamps.${scope}`)
  const globalState = globalThis as typeof globalThis & Record<symbol, true | undefined>
  if (globalState[key]) return
  globalState[key] = true
  const startedAt = Number(process.env.MOVSCRIPT_AGENT_SERVER_CHILD_STARTED_AT || 0) || Date.now()
  for (const method of ['info', 'warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('[agent')) {
        args[0] = `[${new Date().toISOString()} +${Date.now() - startedAt}ms ${scope}] ${args[0]}`
      }
      original(...args)
    }
  }
}

interface AgentRequestListenerOptions {
  onShutdownRequest?: () => void | Promise<void>
  idleShutdownDelayMs?: number
}

export function createAgentRequestListener(context: AgentServerContext, options: AgentRequestListenerOptions = {}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const telemetry = context.telemetry ?? new RuntimeTelemetryRegistry()
  const sessionLifecycle = createAgentSessionLifecycle({
    sessionId: context.sessionRuntime?.paths.sessionId,
    idleShutdownDelayMs: options.idleShutdownDelayMs,
    onShutdownRequest: options.onShutdownRequest,
  })
  return async (req, res) => {
    const requestStartedAt = Date.now()
    setHeaders(res)
    const requestPath = requestPathname(req)
    const requestOperationId = telemetry.beginOperation({
      kind: 'http_request',
      method: req.method,
      requestPath,
    })
    telemetry.markPhase(requestOperationId, 'request_received')
    const onResponseFinish = () => {
      telemetry.finishOperation(requestOperationId, res.statusCode >= 400 ? 'error' : 'success', {
        statusCode: res.statusCode,
        method: req.method ?? 'UNKNOWN',
        requestPath,
      })
    }
    const responseEvents = res as ServerResponse & { once?: (event: string, listener: () => void) => unknown }
    if (typeof responseEvents.once === 'function') {
      responseEvents.once('finish', onResponseFinish)
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

      if (req.method === 'GET' && url.pathname === '/metrics') {
        writeText(res, 200, await telemetry.prometheusTextAsync(), 'text/plain; version=0.0.4; charset=utf-8')
        return
      }

      if (req.method === 'GET' && url.pathname === '/runtime/telemetry') {
        writeJSON(res, 200, telemetry.snapshot())
        return
      }

      if (req.method === 'GET' && url.pathname === '/livez') {
        writeJSON(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/runtime/compat') {
        writeJSON(res, 200, getAgentRuntimeCompatibility(context))
        return
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        const healthStartedAt = Date.now()
        writeJSON(res, 200, {
          ...getAgentRuntimeCompatibility(context),
          paths: context.paths,
          workspacePath: context.paths.workspacePath,
          modelConfigPath: context.paths.modelConfigPath,
        })
        logSlowRequest(req.method, url.pathname, requestStartedAt, healthStartedAt)
        return
      }

      if (req.method === 'GET' && url.pathname === '/runtime/capabilities') {
        const capabilityStartedAt = Date.now()
        writeJSON(res, 200, getAgentServerCapabilities(context))
        logSlowRequest(req.method, url.pathname, requestStartedAt, capabilityStartedAt)
        return
      }

      if (req.method === 'GET' && url.pathname === '/runtime/tool-providers') {
        writeJSON(res, 200, { providers: context.toolProviderRegistry.listProviders() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/runtime/tool-providers') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider registration is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider registration rejects cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'runtime tool provider body')
        writeJSON(res, 200, {
          provider: context.toolProviderRegistry.register(normalizeToolProviderRegistration(body)),
          providers: context.toolProviderRegistry.listProviders(),
        })
        return
      }

      const toolProviderMatch = url.pathname.match(/^\/runtime\/tool-providers\/([^/]+)$/)
      if (toolProviderMatch && req.method === 'DELETE') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider removal is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider removal rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 200, {
          removed: context.toolProviderRegistry.unregister(decodeURIComponent(toolProviderMatch[1] ?? '')),
          providers: context.toolProviderRegistry.listProviders(),
        })
        return
      }

      const toolProviderHeartbeatMatch = url.pathname.match(/^\/runtime\/tool-providers\/([^/]+)\/heartbeat$/)
      if (toolProviderHeartbeatMatch && req.method === 'POST') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider heartbeat is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime tool provider heartbeat rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 200, {
          provider: context.toolProviderRegistry.heartbeat(decodeURIComponent(toolProviderHeartbeatMatch[1] ?? '')),
          providers: context.toolProviderRegistry.listProviders(),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/runtime/recovery/reconcile') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime recovery reconcile is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime recovery reconcile rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.reconcileRuntimeThreads())
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
        sessionLifecycle.shutdownNow('runtime_shutdown')
        return
      }

      if (req.method === 'POST' && url.pathname === '/runtime/session/leases') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime session lease is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime session lease rejects cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'runtime session lease body')
        const lease = sessionLifecycle.acquireLease(normalizeRuntimeSessionLeaseBody(body))
        writeJSON(res, 200, lease)
        return
      }

      const sessionLeaseMatch = url.pathname.match(/^\/runtime\/session\/leases\/([^/]+)$/)
      if (sessionLeaseMatch && req.method === 'DELETE') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'runtime session lease release is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'runtime session lease release rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 200, sessionLifecycle.releaseLease(decodeURIComponent(sessionLeaseMatch[1] ?? '')))
        return
      }

      if (await handleModelConfigRoutes({
        req,
        res,
        url,
        context,
        telemetry,
        requestOperationId,
        requestStartedAt,
      })) return

      if (req.method === 'POST' && url.pathname === '/plugins/run') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin execution is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin execution rejects cross-site browser requests' })
          return
        }
        const body = withRequestAuth(await readOptionalJSONObject(req, 'plugin run body'), req)
        writeJSON(res, 200, await runAgentClientPlugin(normalizeClientPluginRunBody(body)))
        return
      }

      if (req.method === 'POST' && url.pathname === '/plugins/compile') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin compilation is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin compilation rejects cross-site browser requests' })
          return
        }
        const body = withRequestAuth(await readOptionalJSONObject(req, 'plugin compile body'), req)
        writeJSON(res, 200, { result: await compileAgentClientPlugin(normalizeClientPluginRunBody(body)) })
        return
      }

      if (req.method === 'POST' && url.pathname === '/plugins/host-call') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin host calls are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin host calls reject cross-site browser requests' })
          return
        }
        const body = withRequestAuth(await readOptionalJSONObject(req, 'plugin host call body'), req)
        writeJSON(res, 200, { result: await dispatchAgentClientPluginHostCall(normalizeClientPluginHostCallBody(body)) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/inspect') {
        await context.client.initialize()
        const [resources, tools] = await Promise.all([
          context.client.listResources(),
          context.client.listTools(),
        ])
        const activeAgentManifest = context.runtimeRouter.getActiveAgentManifest()
        writeJSON(res, 200, {
          mcpEndpoint: context.mcpEndpoint,
          resources,
          tools,
          registeredTools: context.runtimeRouter.listRegisteredTools(),
          skills: context.runtimeRouter.listSkillCatalog(),
          packs: context.runtimeRouter.listPackCatalog(),
          configFiles: context.runtimeRouter.listConfigFileCatalog(),
          activeConfigFileId: activeAgentConfigFileId(activeAgentManifest),
          activeAgentManifest,
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
        const parsedProjectId = parseOptionalProjectIdParam(projectId)
        const includeSchemas = url.searchParams.get('includeSchemas') !== 'false'
        writeJSON(res, 200, await context.runtimeRouter.getCapabilities({
          ...(parsedProjectId !== undefined ? { currentProjectId: parsedProjectId } : {}),
          includeResources: includeSchemas,
        }))
        return
      }

      if (req.method === 'GET' && url.pathname === '/tools') {
        writeJSON(res, 200, { tools: context.runtimeRouter.listRegisteredTools() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/skills') {
        writeJSON(res, 200, { skills: context.runtimeRouter.listSkillCatalog() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/plugins') {
        writeJSON(res, 200, listClientPluginsFromStore(context.paths.runtimeDataDir))
        return
      }

      if (req.method === 'POST' && url.pathname === '/plugins') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'plugin save body')
        writeJSON(res, 200, saveClientPluginToStore(context.paths.runtimeDataDir, normalizeStoredClientPluginManifest(body.plugin ?? body)))
        return
      }

      if (req.method === 'POST' && url.pathname === '/plugins/install') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'plugin install body')
        const plugin = normalizeStoredClientPluginManifest(body.plugin)
        const files = normalizeAgentCatalogPackFiles(body.agentCatalogFiles)
        const dirs = resolveAgentCatalogPackStoreDirs({ dataDir: context.paths.runtimeDataDir })
        const agentCatalogPackInstall = files.length > 0
          ? installAgentCatalogPack({ pluginId: plugin.id, files, dirs })
          : undefined
        const stored = saveClientPluginToStore(context.paths.runtimeDataDir, {
          ...plugin,
          ...(agentCatalogPackInstall ? { agentCatalogPackInstall } : {}),
        })
        writeJSON(res, 200, {
          ...stored,
          plugin: stored.plugins.find((item) => item.id === plugin.id),
          ...(agentCatalogPackInstall ? { agentCatalogPackInstall } : {}),
        })
        return
      }

      const pluginMatch = url.pathname.match(/^\/plugins\/([^/]+)$/)
      if (pluginMatch && req.method === 'DELETE') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'plugin file changes reject cross-site browser requests' })
          return
        }
        const pluginId = decodeURIComponent(pluginMatch[1] ?? '')
        const dirs = resolveAgentCatalogPackStoreDirs({ dataDir: context.paths.runtimeDataDir })
        const agentCatalogPackUninstall = uninstallAgentCatalogPack({ pluginId, dirs })
        writeJSON(res, 200, {
          ...removeClientPluginFromStore(context.paths.runtimeDataDir, pluginId),
          agentCatalogPackUninstall,
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-catalog/reload') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'agent catalog reload is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'agent catalog reload rejects cross-site browser requests' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.reloadAgentCatalog())
        return
      }

      if (req.method === 'GET' && url.pathname === '/agent-manifest/active') {
        writeJSON(res, 200, context.runtimeRouter.getActiveAgentManifest())
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-config-files/active') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'active agent config file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'active agent config file changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'active agent config file body')
        writeJSON(res, 200, context.runtimeRouter.setActiveAgentConfigFile(body))
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-config-files') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'agent config file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'agent config file changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'agent config file body')
        writeJSON(res, 200, context.runtimeRouter.saveAgentConfigFile(body))
        return
      }

      const configFileDeleteMatch = /^\/agent-config-files\/([^/]+)$/.exec(url.pathname)
      if (req.method === 'DELETE' && configFileDeleteMatch) {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'agent config file changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'agent config file changes reject cross-site browser requests' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.deleteAgentConfigFile({ configFileId: decodeURIComponent(configFileDeleteMatch[1] ?? '') }))
        return
      }

      const configFileToolPermissionsMatch = /^\/agent-config-files\/([^/]+)\/tool-permissions$/.exec(url.pathname)
      if (req.method === 'POST' && configFileToolPermissionsMatch) {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'config file tool permission changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'config file tool permission changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'config file tool permissions body')
        writeJSON(res, 200, context.runtimeRouter.saveConfigFileToolPermissions({
          ...body,
          configFileId: decodeURIComponent(configFileToolPermissionsMatch[1] ?? ''),
        }))
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-skills/instructions') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'skill instruction changes are only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'skill instruction changes reject cross-site browser requests' })
          return
        }
        const body = await readOptionalJSONObject(req, 'skill instructions body')
        writeJSON(res, 200, { skills: Array.from(context.runtimeRouter.saveSkillInstructions(body).skills.values()) })
        return
      }

      if (url.pathname === '/workspace' || url.pathname === '/workspaces' || url.pathname.startsWith('/workspaces/')) {
        writeJSON(res, 410, {
          error: 'agent workspace API has moved to the frontend MCP/file manager boundary',
          replacement: 'Use frontend MCP workspace_file_* tools or Electron agent workspace file APIs.',
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/threads') {
        const body = await readOptionalJSONObject(req, 'thread body')
        writeJSON(res, 201, context.runtimeRouter.createThread(body))
        return
      }

      if (req.method === 'GET' && url.pathname === '/sessions') {
        writeJSON(res, 200, { sessions: context.runtimeRouter.listSessionSummaries() })
        return
      }

      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/)
      if (sessionMatch && req.method === 'GET') {
        const session = context.runtimeRouter.getSession(sessionMatch[1])
        if (!session) {
          writeJSON(res, 404, { error: 'session not found' })
          return
        }
        writeJSON(res, 200, session)
        return
      }

      const sessionRunMatch = url.pathname.match(/^\/sessions\/([^/]+)\/runs$/)
      if (sessionRunMatch && req.method === 'POST') {
        const sessionId = decodeURIComponent(sessionRunMatch[1] ?? '')
        const body = withRequestAuth(await readOptionalJSONObject(req, 'session run body'), req)
        telemetry.markPhase(requestOperationId, 'body_read')
        const session = context.runtimeRouter.getSession(sessionId)
        if (!session) throw new AgentHTTPError(404, 'session not found')
        const targetThread = resolveSessionMessageThread(context, sessionId, body)
        telemetry.markPhase(requestOperationId, 'session_thread_resolved', {
          sessionId,
          threadId: targetThread.id,
          activeThreadId: session.activeThreadId,
          interactiveThreadId: session.interactiveThreadId,
          rootThreadId: session.rootThreadId,
        })
        await writeThreadRunResponse({
          context,
          telemetry,
          requestOperationId,
          res,
          threadId: targetThread.id,
          body,
        })
        return
      }

      const sessionTimelineMatch = url.pathname.match(/^\/sessions\/([^/]+)\/timeline$/)
      if (sessionTimelineMatch && req.method === 'GET') {
        const sessionId = decodeURIComponent(sessionTimelineMatch[1] ?? '')
        const snapshot = await context.runtimeRouter.getSessionRuntimeSnapshot(sessionId)
        if (!snapshot) {
          writeJSON(res, 404, { error: 'session not found' })
          return
        }
        const threadId = url.searchParams.get('threadId')?.trim() || undefined
        if (threadId && !snapshot.threads.some((thread) => thread.id === threadId)) {
          writeJSON(res, 404, { error: 'thread not found in session' })
          return
        }
        writeJSON(res, 200, buildRuntimeTimelinePage({
          threads: snapshot.threads,
          runs: snapshot.runs,
          ...(threadId ? { threadId } : {}),
          before: url.searchParams.get('before') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        }))
        return
      }

      const sessionTimelineStreamMatch = url.pathname.match(/^\/sessions\/([^/]+)\/timeline\/stream$/)
      if (sessionTimelineStreamMatch && req.method === 'GET') {
        await streamSessionTimelineEvents(
          req,
          res,
          context.runtimeRouter,
          decodeURIComponent(sessionTimelineStreamMatch[1] ?? ''),
          url.searchParams.get('threadId')?.trim() || undefined,
          sessionLifecycle.streamHooks(),
        )
        return
      }

      const sessionRuntimeMatch = url.pathname.match(/^\/sessions\/([^/]+)\/runtime$/)
      if (sessionRuntimeMatch && req.method === 'GET') {
        const snapshot = await context.runtimeRouter.getSessionRuntimeSnapshot(sessionRuntimeMatch[1])
        if (!snapshot) {
          writeJSON(res, 404, { error: 'session not found' })
          return
        }
        writeJSON(res, 200, sessionRuntimeSnapshotV2(snapshot))
        return
      }

      const sessionStreamMatch = url.pathname.match(/^\/sessions\/([^/]+)\/stream$/)
      if (sessionStreamMatch && req.method === 'GET') {
        streamSessionEvents(req, res, context.runtimeRouter, sessionStreamMatch[1], sessionLifecycle.streamHooks())
        return
      }

      if (req.method === 'GET' && url.pathname === '/threads') {
        writeJSON(res, 200, paginatedThreadSummaries(context.runtimeRouter.listThreadSummaries(), normalizeThreadListQuery(url)))
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/threads') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'thread history deletion is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'thread history deletion rejects cross-site browser requests' })
          return
        }
        const activeRun = context.runtimeRouter.listRuns().find((run) => isExecutingRunStatus(run.status))
        if (activeRun) {
          writeJSON(res, 409, { error: 'active runs must be cancelled before deleting thread history', runId: activeRun.id })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.deleteAllThreads())
        return
      }

      const threadMatch = url.pathname.match(/^\/threads\/([^/]+)$/)
      if (threadMatch && req.method === 'GET') {
        const thread = context.runtimeRouter.getThread(threadMatch[1])
        if (!thread) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, thread)
        return
      }
      if (threadMatch && req.method === 'PATCH') {
        const body = await readOptionalJSONObject(req, 'thread update body')
        writeJSON(res, 200, context.runtimeRouter.updateThread(threadMatch[1], body))
        return
      }
      if (threadMatch && req.method === 'DELETE') {
        if (!isLoopbackRequest(req)) {
          writeJSON(res, 403, { error: 'thread deletion is only available from loopback clients' })
          return
        }
        if (isCrossSiteBrowserRequest(req)) {
          writeJSON(res, 403, { error: 'thread deletion rejects cross-site browser requests' })
          return
        }
        const threadId = decodeURIComponent(threadMatch[1])
        const thread = context.runtimeRouter.getThread(threadId)
        if (!thread) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        const activeRun = context.runtimeRouter.listRunsByThread(threadId).find((run) => isExecutingRunStatus(run.status))
        if (activeRun) {
          writeJSON(res, 409, { error: 'active runs must be cancelled before deleting thread', runId: activeRun.id })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.deleteThread(threadId))
        return
      }

      const timelineMatch = url.pathname.match(/^\/threads\/([^/]+)\/timeline$/)
      if (timelineMatch && req.method === 'GET') {
        const threadId = decodeURIComponent(timelineMatch[1] ?? '')
        const thread = context.runtimeRouter.getThread(threadId)
        if (!thread) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, buildRuntimeTimelinePage({
          threads: [thread],
          runs: context.runtimeRouter.listRunsByThread(threadId),
          before: url.searchParams.get('before') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        }))
        return
      }
      const messagesMatch = url.pathname.match(/^\/threads\/([^/]+)\/messages$/)
      if (messagesMatch && req.method === 'GET') {
        const page = context.runtimeRouter.listThreadMessagesPage(decodeURIComponent(messagesMatch[1] ?? ''), normalizeThreadMessagesPageQuery(url))
        if (!page) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, page)
        return
      }
      const threadRunMatch = url.pathname.match(/^\/threads\/([^/]+)\/runs$/)
      if (threadRunMatch && req.method === 'GET') {
        const thread = context.runtimeRouter.getThread(threadRunMatch[1])
        if (!thread) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, {
          threadId: threadRunMatch[1],
          runs: context.runtimeRouter.listRunsByThread(threadRunMatch[1]),
        })
        return
      }

      const threadRuntimeMatch = url.pathname.match(/^\/threads\/([^/]+)\/runtime$/)
      if (threadRuntimeMatch && req.method === 'GET') {
        const snapshot = await context.runtimeRouter.getThreadRuntimeSnapshot(threadRuntimeMatch[1])
        if (!snapshot) {
          writeJSON(res, 404, { error: 'thread not found' })
          return
        }
        writeJSON(res, 200, threadRuntimeSnapshotV2(snapshot))
        return
      }

      const threadStreamMatch = url.pathname.match(/^\/threads\/([^/]+)\/stream$/)
      if (threadStreamMatch && req.method === 'GET') {
        streamThreadEvents(req, res, context.runtimeRouter, threadStreamMatch[1], sessionLifecycle.streamHooks())
        return
      }

      const threadTimelineStreamMatch = url.pathname.match(/^\/threads\/([^/]+)\/timeline\/stream$/)
      if (threadTimelineStreamMatch && req.method === 'GET') {
        await streamThreadTimelineEvents(req, res, context.runtimeRouter, decodeURIComponent(threadTimelineStreamMatch[1] ?? ''), sessionLifecycle.streamHooks())
        return
      }

      if (req.method === 'POST' && url.pathname === '/runs/preview') {
        const body = await readOptionalJSONObject(req, 'run preview body')
        writeJSON(res, 200, await context.runtimeRouter.previewRun(withRequestAuth(body, req)))
        return
      }

      if (req.method === 'POST' && url.pathname === '/plans') {
        const body = await readOptionalJSONObject(req, 'taskGraph body')
        writeJSON(res, 201, await context.runtimeRouter.createTaskGraph(withRequestAuth(body, req)))
        return
      }

      if (req.method === 'GET' && url.pathname === '/plans') {
        writeJSON(res, 200, { plans: context.runtimeRouter.listTaskGraphs() })
        return
      }

      const planMatch = url.pathname.match(/^\/plans\/([^/]+)$/)
      if (planMatch && req.method === 'GET') {
        writeJSON(res, 200, context.runtimeRouter.getTaskGraphSnapshot(planMatch[1]))
        return
      }

      const planTasksMatch = url.pathname.match(/^\/plans\/([^/]+)\/tasks$/)
      if (planTasksMatch && req.method === 'GET') {
        writeJSON(res, 200, {
          taskGraphId: planTasksMatch[1],
          tasks: context.runtimeRouter.getTaskTree(planTasksMatch[1]),
        })
        return
      }

      const planDispatchMatch = url.pathname.match(/^\/plans\/([^/]+)\/dispatch$/)
      if (planDispatchMatch && req.method === 'POST') {
        const body = await readOptionalJSONObject(req, 'taskGraph dispatch body')
        writeJSON(res, 202, context.runtimeRouter.dispatchTaskGraph({
          ...withRequestAuth(body, req),
          taskGraphId: planDispatchMatch[1],
        }))
        return
      }

      const planStreamMatch = url.pathname.match(/^\/plans\/([^/]+)\/stream$/)
      if (planStreamMatch && req.method === 'GET') {
        streamPlanEvents(req, res, context.runtimeRouter, planStreamMatch[1], sessionLifecycle.streamHooks())
        return
      }

      const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/)
      if (taskMatch && req.method === 'PATCH') {
        const body = await readOptionalJSONObject(req, 'task update body')
        writeJSON(res, 200, context.runtimeRouter.updateTask(taskMatch[1], body))
        return
      }

      if (req.method === 'GET' && url.pathname === '/runs') {
        const parentRunId = url.searchParams.get('parentRunId')
        writeJSON(res, 200, {
          runs: parentRunId ? context.runtimeRouter.listRunsByParent(parentRunId) : context.runtimeRouter.listRuns(),
        })
        return
      }

      const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/)
      if (runMatch && req.method === 'GET') {
        const run = context.runtimeRouter.getRun(runMatch[1])
        if (!run) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, run)
        return
      }

      const runTraceSummaryMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace\/summary$/)
      if (runTraceSummaryMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runTraceSummaryMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.getRunTraceSummary(runTraceSummaryMatch[1]))
        return
      }

      const runTraceDebugViewMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace\/debug-view$/)
      if (runTraceDebugViewMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runTraceDebugViewMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.getRunTraceDebugView(runTraceDebugViewMatch[1]))
        return
      }

      const runTraceEventDataMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace\/events\/([^/]+)\/data$/)
      if (runTraceEventDataMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runTraceEventDataMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        try {
          writeJSON(res, 200, {
            runId: runTraceEventDataMatch[1],
            eventId: decodeURIComponent(runTraceEventDataMatch[2]),
            data: context.runtimeRouter.getRunTraceEventData(runTraceEventDataMatch[1], decodeURIComponent(runTraceEventDataMatch[2])),
          })
        } catch (error) {
          writeJSON(res, 404, { error: error instanceof Error ? error.message : String(error) })
        }
        return
      }

      const runDebugLedgerMatch = url.pathname.match(/^\/runs\/([^/]+)\/debug-ledger$/)
      if (runDebugLedgerMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runDebugLedgerMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.getRunDebugLedger(runDebugLedgerMatch[1]))
        return
      }

      const runDebugEvidenceRefsMatch = url.pathname.match(/^\/runs\/([^/]+)\/debug-evidence-refs$/)
      if (runDebugEvidenceRefsMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runDebugEvidenceRefsMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        const evidenceQuery = normalizeDebugEvidenceRefQuery(url)
        if (!evidenceQuery.ok) {
          writeJSON(res, 400, { error: evidenceQuery.error })
          return
        }
        writeJSON(res, 200, {
          runId: runDebugEvidenceRefsMatch[1],
          evidenceRefs: context.runtimeRouter.findRunDebugEvidenceRefs(runDebugEvidenceRefsMatch[1], evidenceQuery.query),
        })
        return
      }

      const runDebugEvidenceMatch = url.pathname.match(/^\/runs\/([^/]+)\/debug-evidence\/([^/]+)$/)
      if (runDebugEvidenceMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runDebugEvidenceMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        try {
          writeJSON(res, 200, context.runtimeRouter.getRunDebugEvidence(runDebugEvidenceMatch[1], decodeURIComponent(runDebugEvidenceMatch[2])))
        } catch (error) {
          writeJSON(res, 404, { error: error instanceof Error ? error.message : String(error) })
        }
        return
      }

      const runGenerationViewMatch = url.pathname.match(/^\/runs\/([^/]+)\/generation-view$/)
      if (runGenerationViewMatch && req.method === 'GET') {
        if (!context.runtimeRouter.getRun(runGenerationViewMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.getRunGenerationView(runGenerationViewMatch[1]))
        return
      }

      const runChildrenMatch = url.pathname.match(/^\/runs\/([^/]+)\/children$/)
      if (runChildrenMatch && req.method === 'GET') {
        writeJSON(res, 200, {
          runId: runChildrenMatch[1],
          children: context.runtimeRouter.getChildRuns(runChildrenMatch[1]),
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
        if (!context.runtimeRouter.getRun(runTraceMatch[1])) {
          writeJSON(res, 404, { error: 'run not found' })
          return
        }
        writeJSON(res, 200, context.runtimeRouter.getRunTracePage(runTraceMatch[1], traceQuery.query))
        return
      }

      const runStreamMatch = url.pathname.match(/^\/runs\/([^/]+)\/stream$/)
      if (runStreamMatch && req.method === 'GET') {
        streamRunEvents(req, res, context.runtimeRouter, runStreamMatch[1], telemetry, sessionLifecycle.streamHooks())
        return
      }

      const interactionApproveMatch = url.pathname.match(/^\/interactions\/([^/]+)\/approve$/)
      if (interactionApproveMatch && req.method === 'POST') {
        const operationId = telemetry.beginOperation({ kind: 'interaction_approve', meta: { interactionId: interactionApproveMatch[1] } })
        try {
          const result = context.runtimeRouter.approveInteraction(interactionApproveMatch[1])
          telemetry.markPhase(operationId, 'interaction_resolved', { runId: result.run.id, status: result.run.status })
          telemetry.finishOperation(operationId, 'success', { runId: result.run.id, status: result.run.status })
          writeJSON(res, 202, result)
        } catch (error) {
          telemetry.finishOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
          throw error
        }
        return
      }

      const interactionRejectMatch = url.pathname.match(/^\/interactions\/([^/]+)\/reject$/)
      if (interactionRejectMatch && req.method === 'POST') {
        const operationId = telemetry.beginOperation({ kind: 'interaction_reject', meta: { interactionId: interactionRejectMatch[1] } })
        try {
          const result = context.runtimeRouter.rejectInteraction(interactionRejectMatch[1])
          telemetry.markPhase(operationId, 'interaction_resolved', { runId: result.run.id, status: result.run.status })
          telemetry.finishOperation(operationId, 'success', { runId: result.run.id, status: result.run.status })
          writeJSON(res, 200, result)
        } catch (error) {
          telemetry.finishOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
          throw error
        }
        return
      }

      const runCancelMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel$/)
      if (runCancelMatch && req.method === 'POST') {
        const body = await readOptionalJSONObject(req, 'cancel body')
        const cancelled = context.runtimeRouter.cancelRun(runCancelMatch[1], body)
        sessionLifecycle.allowIdleShutdown('run_cancelled')
        writeJSON(res, 200, cancelled)
        return
      }

      const runResumeMatch = url.pathname.match(/^\/runs\/([^/]+)\/resume$/)
      if (runResumeMatch && req.method === 'POST') {
        writeJSON(res, 202, context.runtimeRouter.resumeInterruptedRun(runResumeMatch[1]))
        return
      }

      const runCancelTreeMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel-tree$/)
      if (runCancelTreeMatch && req.method === 'POST') {
        const body = await readOptionalJSONObject(req, 'cancel tree body')
        const cancelled = context.runtimeRouter.cancelPlanTree(runCancelTreeMatch[1], body)
        sessionLifecycle.allowIdleShutdown('run_tree_cancelled')
        writeJSON(res, 200, cancelled)
        return
      }

      const runReplanMatch = url.pathname.match(/^\/runs\/([^/]+)\/updateTaskGraph$/)
      if (runReplanMatch && req.method === 'POST') {
        const run = context.runtimeRouter.getRun(runReplanMatch[1])
        if (!run?.taskGraphId) {
          writeJSON(res, run ? 400 : 404, { error: run ? 'run is not attached to a task graph' : 'run not found' })
          return
        }
        const taskGraph = context.runtimeRouter.getTaskGraph(run.taskGraphId)
        const body = await readOptionalJSONObject(req, 'updateTaskGraph body')
        writeJSON(res, 202, context.runtimeRouter.replanRun(runReplanMatch[1], {
          ...withRequestAuth(body, req),
          taskGraphId: run.taskGraphId,
          plannerRunId: taskGraph?.rootRunId ?? (run.role === 'planner' ? run.id : run.parentRunId),
        }))
        return
      }

      const runInputMatch = url.pathname.match(/^\/runs\/([^/]+)\/input$/)
      if (runInputMatch && req.method === 'POST') {
        const body = await readOptionalJSONObject(req, 'input answer body')
        writeJSON(res, 202, context.runtimeRouter.answerRunInputRequest(runInputMatch[1], withRequestAuth(body, req)))
        return
      }

      if (req.method === 'GET' && url.pathname === '/memories') {
        const query = normalizeMemoryQuery(url)
        writeJSON(res, 200, { memories: query ? context.runtimeRouter.listMemorySummaries(query) : [] })
        return
      }

      if (req.method === 'POST' && url.pathname === '/memories') {
        const body = await readOptionalJSONObject(req, 'memory body')
        writeJSON(res, 201, context.runtimeRouter.createMemory(normalizeMemoryBody(body)))
        return
      }

      const memoryMatch = url.pathname.match(/^\/memories\/([^/]+)$/)
      if (memoryMatch && req.method === 'GET') {
        const projectId = normalizeMemoryProjectId(url)
        const memory = isValidMemoryProjectId(projectId) ? context.runtimeRouter.getMemory(projectId, memoryMatch[1]) : undefined
        writeJSON(res, memory ? 200 : 404, memory ? { memory } : { error: 'memory not found' })
        return
      }

      if (memoryMatch && req.method === 'DELETE') {
        const projectId = normalizeMemoryProjectId(url)
        const deleted = isValidMemoryProjectId(projectId) ? context.runtimeRouter.deleteMemory(projectId, memoryMatch[1]) : false
        writeJSON(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'memory not found' })
        return
      }

      writeJSON(res, 404, { error: 'not found' })
    } catch (error) {
      if (error instanceof AgentHTTPError) {
        writeJSON(res, error.status, { error: error.message })
        return
      }
      if (error instanceof RuntimeModelConfigInputError) {
        writeJSON(res, 400, { error: error.message })
        return
      }
      writeJSON(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function normalizeToolProviderRegistration(body: Record<string, unknown>): {
  providerId: string
  endpoint: string
  label?: string
} {
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!providerId) throw new AgentHTTPError(400, 'runtime tool provider id is required')
  if (!endpoint) throw new AgentHTTPError(400, 'runtime tool provider endpoint is required')
  return {
    providerId,
    endpoint,
    ...(label ? { label } : {}),
  }
}

function normalizeRuntimeSessionLeaseBody(body: Record<string, unknown>): { leaseId: string; ttlMs?: number; holder?: string } {
  const leaseId = typeof body.leaseId === 'string' ? body.leaseId.trim() : ''
  if (!leaseId) throw new AgentHTTPError(400, 'runtime session lease id is required')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/.test(leaseId)) throw new AgentHTTPError(400, 'runtime session lease id is invalid')
  const ttlMs = typeof body.ttlMs === 'number' && Number.isFinite(body.ttlMs)
    ? Math.max(5_000, Math.min(120_000, Math.trunc(body.ttlMs)))
    : undefined
  const holder = typeof body.holder === 'string' && body.holder.trim() ? body.holder.trim().slice(0, 120) : undefined
  return {
    leaseId,
    ...(ttlMs !== undefined ? { ttlMs } : {}),
    ...(holder ? { holder } : {}),
  }
}

function resolveSessionMessageThread(context: AgentServerContext, sessionId: string, body: Record<string, unknown>) {
  const session = context.runtimeRouter.getSession(sessionId)
  if (!session) throw new AgentHTTPError(404, 'session not found')
  const candidateThreadIds = [
    session.activeThreadId,
    session.interactiveThreadId,
    session.rootThreadId,
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  for (const threadId of candidateThreadIds) {
    const thread = context.runtimeRouter.getThread(threadId)
    if (thread) return thread
  }
  return context.runtimeRouter.createThread({
    sessionId,
    lifecycle: session.lifecycle,
    ...(typeof session.title === 'string' && session.title.trim() ? { title: session.title.trim() } : {}),
    ...(typeof body.title === 'string' && body.title.trim() ? { title: body.title.trim() } : {}),
    ...(typeof body.projectId === 'number' ? { projectId: body.projectId } : typeof session.projectId === 'number' ? { projectId: session.projectId } : {}),
    agentRole: 'root',
  })
}

async function writeThreadRunResponse(input: {
  context: AgentServerContext
  telemetry: RuntimeTelemetryRegistry
  requestOperationId: string
  res: ServerResponse
  threadId: string
  body: Record<string, unknown>
}): Promise<void> {
  const { context, telemetry, requestOperationId, res, threadId, body } = input
  const content = typeof body.message === 'string' && body.message.trim()
    ? body.message
    : typeof body.content === 'string' && body.content.trim()
      ? body.content
      : undefined
  if (!content) throw new AgentHTTPError(400, 'thread run message is required')
  telemetry.markPhase(requestOperationId, 'thread_lookup_start', { threadId })
  const thread = context.runtimeRouter.getThread(threadId)
  if (!thread) throw new AgentHTTPError(404, 'thread not found')
  const threadSummary = toThreadSummary(thread)
  telemetry.markPhase(requestOperationId, 'thread_lookup_done', {
    threadId: thread.id,
    messageCount: threadSummary.messageCount,
    activeRunId: thread.activeRunId,
  })
  telemetry.markPhase(requestOperationId, 'active_run_lookup_start', {
    threadId,
    activeRunId: thread.activeRunId,
  })
  const activeRun = thread.activeRunId ? context.runtimeRouter.getRun(thread.activeRunId) : undefined
  const activeRunMode = body.activeRunMode === 'new_run' ? 'new_run' : 'runtime_input'
  telemetry.markPhase(requestOperationId, 'active_run_lookup_done', {
    activeRunMode,
    activeRunId: activeRun?.id,
    activeRunStatus: activeRun?.status,
  })
  if (activeRun && isActiveRunStatus(activeRun.status) && activeRunMode !== 'new_run') {
    telemetry.markPhase(requestOperationId, 'runtime_input_add_message_start', {
      threadId,
      activeRunId: activeRun.id,
    })
    const message = context.runtimeRouter.addMessage(threadId, {
      ...(typeof body.sourceMessageId === 'string' && body.sourceMessageId.trim() ? { id: body.sourceMessageId.trim() } : {}),
      role: 'user',
      content,
      runId: activeRun.id,
      metadata: buildRuntimeInputMessageMetadata({
        targetRunId: activeRun.id,
        mode: body.runtimeInputMode,
      }),
      ...(body.clientInput !== undefined ? { clientInput: body.clientInput } : {}),
    })
    telemetry.markPhase(requestOperationId, 'runtime_input_add_message_done', {
      threadId,
      activeRunId: activeRun.id,
      messageId: message.id,
    })
    telemetry.markPhase(requestOperationId, 'response_write_start', {
      status: 202,
      threadId,
      runId: activeRun.id,
      messageId: message.id,
    })
    writeJSON(res, 202, {
      run: activeRun,
      message,
      runtimeInput: {
        accepted: true,
        runId: activeRun.id,
        messageId: message.id,
        deliveryStatus: 'accepted',
      },
    })
    telemetry.markPhase(requestOperationId, 'response_write_done', {
      status: 202,
      threadId,
      runId: activeRun.id,
      messageId: message.id,
    })
    return
  }
  if (body.toolCall !== undefined) {
    const toolRunOperationId = telemetry.beginOperation({ kind: 'tool_run_create', threadId })
    const {
      message: _message,
      content: _content,
      sourceMessageId: _sourceMessageId,
      ...runBody
    } = body
    let run
    try {
      run = context.runtimeRouter.createToolRun(asDirectToolRun({
        ...runBody,
        threadId,
        message: content,
      }))
      telemetry.markPhase(toolRunOperationId, 'run_created', { runId: run.id, status: run.status })
      telemetry.finishOperation(toolRunOperationId, 'success', { runId: run.id, status: run.status })
    } catch (error) {
      telemetry.finishOperation(toolRunOperationId, 'error', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    const updatedThread = context.runtimeRouter.getThread(threadId)
    const initialUserMessageId = run.input?.sourceMessageId
      ?? (isRecord(run.metadata) && typeof run.metadata.initialUserMessageId === 'string' ? run.metadata.initialUserMessageId : undefined)
    const message = toolRunResponseMessage(updatedThread, initialUserMessageId)
    telemetry.markPhase(requestOperationId, 'response_write_start', {
      status: 201,
      threadId,
      runId: run.id,
      messageId: message?.id,
    })
    writeJSON(res, 201, message ? { run, message } : { run })
    telemetry.markPhase(requestOperationId, 'response_write_done', {
      status: 201,
      threadId,
      runId: run.id,
      messageId: message?.id,
    })
    return
  }
  telemetry.markPhase(requestOperationId, 'user_message_add_start', { threadId })
  const message = context.runtimeRouter.addMessage(threadId, {
    ...(typeof body.sourceMessageId === 'string' && body.sourceMessageId.trim() ? { id: body.sourceMessageId.trim() } : {}),
    role: 'user',
    content,
    ...(body.clientInput !== undefined ? { clientInput: body.clientInput } : {}),
  })
  telemetry.markPhase(requestOperationId, 'message_created', { threadId, messageId: message.id })
  const {
    message: _message,
    content: _content,
    sourceMessageId: _sourceMessageId,
    ...runBody
  } = body
  const runCreateOperationId = telemetry.beginOperation({ kind: 'run_create', threadId })
  let run
  try {
    run = context.runtimeRouter.createRun(asPlannerUserRun({
      ...runBody,
      threadId,
      sourceMessageId: message.id,
    }))
    telemetry.markPhase(runCreateOperationId, 'run_created', { runId: run.id, status: run.status })
    telemetry.finishOperation(runCreateOperationId, 'success', { runId: run.id, status: run.status })
  } catch (error) {
    telemetry.finishOperation(runCreateOperationId, 'error', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
  telemetry.markPhase(requestOperationId, 'run_created', { runId: run.id, threadId: run.threadId, status: run.status })
  telemetry.recordMetric({
    name: 'movscript_agent_run_create_total',
    value: 1,
    unit: 'count',
    labels: { role: run.role ?? 'unknown', status: run.status },
  })
  telemetry.markPhase(requestOperationId, 'response_write_start', {
    status: 201,
    threadId: run.threadId,
    runId: run.id,
    messageId: message.id,
  })
  writeJSON(res, 201, { run, message })
  telemetry.markPhase(requestOperationId, 'response_write_done', {
    status: 201,
    threadId: run.threadId,
    runId: run.id,
    messageId: message.id,
  })
}

function createAgentSessionLifecycle(input: {
  sessionId?: string
  idleShutdownDelayMs?: number
  onShutdownRequest?: () => void | Promise<void>
}) {
  const idleShutdownDelayMs = Math.max(0, input.idleShutdownDelayMs ?? 500)
  const defaultLeaseTtlMs = 30_000
  let subscribers = 0
  const leases = new Map<string, NodeJS.Timeout>()
  let idleShutdownAllowed = false
  let shutdownRequested = false
  let idleShutdownTimer: NodeJS.Timeout | undefined

  const clearIdleShutdownTimer = () => {
    if (!idleShutdownTimer) return
    clearTimeout(idleShutdownTimer)
    idleShutdownTimer = undefined
  }
  const shutdownNow = (reason: string) => {
    if (shutdownRequested) return
    shutdownRequested = true
    clearIdleShutdownTimer()
    for (const timeout of leases.values()) clearTimeout(timeout)
    leases.clear()
    setTimeout(() => {
      void Promise.resolve(input.onShutdownRequest?.()).catch((error) => {
        console.error(`[agent] runtime shutdown failed reason=${reason}`, error)
      })
    }, 0)
  }
  const activeClientCount = () => subscribers + leases.size
  const maybeScheduleIdleShutdown = (reason: string) => {
    if (!input.sessionId || !idleShutdownAllowed || shutdownRequested || activeClientCount() > 0 || idleShutdownTimer) return
    idleShutdownTimer = setTimeout(() => {
      idleShutdownTimer = undefined
      if (activeClientCount() > 0) return
      console.info(`[agent] session idle shutdown reason=${reason} session=${input.sessionId}`)
      shutdownNow(reason)
    }, idleShutdownDelayMs)
    idleShutdownTimer.unref()
  }
  const releaseLeaseTimer = (leaseId: string) => {
    const current = leases.get(leaseId)
    if (!current) return false
    clearTimeout(current)
    leases.delete(leaseId)
    maybeScheduleIdleShutdown('session_stopped_without_clients')
    return true
  }

  return {
    streamHooks: () => ({
      onSubscribe: () => {
        subscribers += 1
        clearIdleShutdownTimer()
      },
      onUnsubscribe: () => {
        subscribers = Math.max(0, subscribers - 1)
        maybeScheduleIdleShutdown('session_stopped_without_clients')
      },
    }),
    acquireLease: (lease: { leaseId: string; ttlMs?: number; holder?: string }) => {
      if (!input.sessionId) throw new AgentHTTPError(409, 'runtime session lease requires a session runtime')
      releaseLeaseTimer(lease.leaseId)
      clearIdleShutdownTimer()
      const ttlMs = lease.ttlMs ?? defaultLeaseTtlMs
      const expiresAt = new Date(Date.now() + ttlMs).toISOString()
      const timeout = setTimeout(() => {
        leases.delete(lease.leaseId)
        maybeScheduleIdleShutdown('session_lease_expired')
      }, ttlMs)
      timeout.unref()
      leases.set(lease.leaseId, timeout)
      return {
        ok: true,
        sessionId: input.sessionId,
        leaseId: lease.leaseId,
        ttlMs,
        expiresAt,
        activeLeases: leases.size,
        activeStreams: subscribers,
        ...(lease.holder ? { holder: lease.holder } : {}),
      }
    },
    releaseLease: (leaseId: string) => ({
      ok: true,
      released: releaseLeaseTimer(leaseId),
      sessionId: input.sessionId,
      leaseId,
      activeLeases: leases.size,
      activeStreams: subscribers,
    }),
    allowIdleShutdown: (reason: string) => {
      if (!input.sessionId) return
      idleShutdownAllowed = true
      maybeScheduleIdleShutdown(reason)
    },
    shutdownNow,
  }
}

export function startAgentServer(context = createAgentServerContext()): Server {
  const listenStartedAt = Date.now()
  const { transport, endpoint } = resolveAgentRuntimeServerTransport(context.port)
  console.info(`[agent] startup begin ${endpoint.kind}-listen endpoint=${endpoint.label}`)
  let server: Server
  server = transport.createServer(createAgentRequestListener(context, {
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
      console.error(`[agent] FATAL: agent runtime endpoint is already in use (${endpoint.label}). Set MOVSCRIPT_AGENT_PORT/MOVSCRIPT_AGENT_SOCKET_PATH or stop the conflicting process.`)
    } else if (code === 'EACCES') {
      console.error(`[agent] FATAL: not permitted to bind ${endpoint.label} (${code}).`)
    } else {
      console.error('[agent] FATAL: agent HTTP server error', error)
    }
    process.exit(1)
  })
  transport.listen(server, endpoint, () => {
    console.info(`[agent] startup end ${endpoint.kind}-listen elapsed=${Date.now() - listenStartedAt}ms endpoint=${endpoint.label}`)
    const sessionHeartbeat = installSessionRuntimeRecord(context, endpoint)
    server.once('close', () => {
      if (sessionHeartbeat) clearInterval(sessionHeartbeat)
    })
    logAgentServerStartup(context, endpoint)
  })
  return server
}

function installSessionRuntimeRecord(
  context: AgentServerContext,
  endpoint: ReturnType<typeof resolveAgentRuntimeServerTransport>['endpoint'],
): NodeJS.Timeout | undefined {
  if (!context.sessionRuntime) return undefined
  const endpointLabel = endpoint.kind === 'http'
    ? `http://${endpoint.label}`
    : endpoint.label
  writeAgentSessionRuntimeRecord(context.sessionRuntime.paths, {
    pid: process.pid,
    endpoint: endpointLabel,
    transport: endpoint.kind === 'unix-socket' ? 'unix-socket' : 'http',
    startedAt: new Date().toISOString(),
    version: '0.1.0',
    startedBy: normalizeSessionRuntimeStartedBy(process.env.MOVSCRIPT_AGENT_STARTED_BY),
  })
  const heartbeat = setInterval(() => {
    touchAgentSessionHeartbeat(context.sessionRuntime!.paths)
  }, 5_000)
  heartbeat.unref()
  return heartbeat
}

function normalizeSessionRuntimeStartedBy(value: string | undefined): 'desktop' | 'cli' | 'agent' | 'unknown' {
  if (value === 'desktop' || value === 'cli' || value === 'agent') return value
  return 'unknown'
}

function normalizeThreadMessagesPageQuery(url: URL): { afterOrdinal?: number; limit?: number; direction?: 'asc' | 'desc' } {
  const afterOrdinal = Number(url.searchParams.get('afterOrdinal') ?? url.searchParams.get('after') ?? '')
  const limit = Number(url.searchParams.get('limit') ?? '')
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : undefined
  return {
    ...(Number.isFinite(afterOrdinal) && afterOrdinal > 0 ? { afterOrdinal: Math.floor(afterOrdinal) } : {}),
    ...(Number.isFinite(limit) && limit > 0 ? { limit: Math.floor(limit) } : {}),
    ...(direction ? { direction } : {}),
  }
}

function toolRunResponseMessage(thread: { messages: Array<{ id: string; role: string }> } | undefined, initialUserMessageId?: string) {
  if (!thread) return undefined
  if (initialUserMessageId) {
    const explicit = thread.messages.find((message) => message.id === initialUserMessageId)
    if (explicit) return explicit
  }
  return [...thread.messages].reverse().find((message) => message.role === 'user')
}

function normalizeClientPluginRunBody(body: Record<string, unknown>): {
  plugin: AgentClientPluginManifest
  args: Record<string, unknown>
  toolName?: string
  auth: { backendAuthToken?: string; backendAPIBaseURL?: string }
} {
  const plugin = normalizeClientPluginManifest(body.plugin)
  const args = isRecord(body.args) ? body.args : {}
  return {
    plugin,
    args,
    ...(typeof body.toolName === 'string' && body.toolName.trim() ? { toolName: body.toolName.trim() } : {}),
    auth: {
      ...(typeof body.backendAuthToken === 'string' && body.backendAuthToken.trim() ? { backendAuthToken: body.backendAuthToken.trim() } : {}),
      ...(typeof body.backendAPIBaseURL === 'string' && body.backendAPIBaseURL.trim() ? { backendAPIBaseURL: body.backendAPIBaseURL.trim().replace(/\/+$/, '') } : {}),
    },
  }
}

function normalizeClientPluginHostCallBody(body: Record<string, unknown>): {
  method: string
  args: unknown[]
  auth: { backendAuthToken?: string; backendAPIBaseURL?: string }
} {
  const method = typeof body.method === 'string' ? body.method.trim() : ''
  if (!method) throw new AgentHTTPError(400, 'plugin host method is required')
  return {
    method,
    args: Array.isArray(body.args) ? body.args : [],
    auth: {
      ...(typeof body.backendAuthToken === 'string' && body.backendAuthToken.trim() ? { backendAuthToken: body.backendAuthToken.trim() } : {}),
      ...(typeof body.backendAPIBaseURL === 'string' && body.backendAPIBaseURL.trim() ? { backendAPIBaseURL: body.backendAPIBaseURL.trim().replace(/\/+$/, '') } : {}),
    },
  }
}

function normalizeClientPluginManifest(value: unknown): AgentClientPluginManifest {
  if (!isRecord(value)) throw new AgentHTTPError(400, 'plugin must be an object')
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const version = typeof value.version === 'string' ? value.version.trim() : ''
  const bundle = typeof value.bundle === 'string' ? value.bundle : undefined
  const bundleUrl = typeof value.bundleUrl === 'string' ? value.bundleUrl : undefined
  if (!id) throw new AgentHTTPError(400, 'plugin.id is required')
  if (!name) throw new AgentHTTPError(400, 'plugin.name is required')
  if (!version) throw new AgentHTTPError(400, 'plugin.version is required')
  return {
    id,
    name,
    version,
    ...(bundle !== undefined ? { bundle } : {}),
    ...(bundleUrl !== undefined ? { bundleUrl } : {}),
  }
}

function normalizeAgentCatalogPackFiles(value: unknown): AgentCatalogPackFile[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new AgentHTTPError(400, 'agentCatalogFiles must be an array')
  return value.map((item) => {
    if (!isRecord(item)) throw new AgentHTTPError(400, 'agentCatalogFiles entries must be objects')
    if (typeof item.path !== 'string' || !item.path.trim()) throw new AgentHTTPError(400, 'agentCatalogFiles.path is required')
    if (typeof item.content !== 'string') throw new AgentHTTPError(400, 'agentCatalogFiles.content must be a string')
    return {
      path: item.path,
      content: item.content,
    }
  })
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

function isMainModule(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}

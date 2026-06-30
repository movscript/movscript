import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import test from 'node:test'

const root = process.cwd()

const ignoredPathSegments = new Set([
  'dist',
  'out',
  'node_modules',
])

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function walkFiles(relativeRoot) {
  const absoluteRoot = resolve(root, relativeRoot)
  const files = []

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name)
      const relativePath = absolutePath.slice(root.length + 1).split(sep).join('/')
      if (entry.isDirectory()) {
        if (ignoredPathSegments.has(entry.name)) continue
        walk(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.(?:cjs|js|jsx|json|mjs|ts|tsx)$/.test(entry.name)) continue
      if (/(?:^|\/)[^/]+\.test\.[cm]?[jt]sx?$/.test(relativePath)) continue
      files.push(relativePath)
    }
  }

  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) return files
  walk(absoluteRoot)
  return files
}

function scanRule({ roots, patterns, allowedFiles }) {
  const allowed = new Set(allowedFiles)
  const findings = []

  for (const sourceRoot of roots) {
    for (const file of walkFiles(sourceRoot)) {
      const source = read(file)
      const matched = patterns.some((pattern) => pattern.test(source))
      if (matched && !allowed.has(file)) findings.push(file)
    }
  }

  return [...new Set(findings)].sort()
}

function exportedInterfaceBlock(source, name) {
  const match = source.match(new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`))
  assert.ok(match, `missing exported interface ${name}`)
  return match[0]
}

test('local daemon interface plan keeps the acceptance gates explicit', () => {
  const plan = read('docs/local-daemon-interface-refactor-plan.zh-CN.md')
  const rootPackage = JSON.parse(read('package.json'))
  const benchmark = read('scripts/benchmark-project-service-performance.mjs')

  for (const required of [
    'Decision 1：canonical gateway prefix 统一使用 `/v1`',
    'Decision 5：Project source 完全收口到 Project Service',
    'Decision 6：Project Service 性能排查是收口前置项',
    'Decision 7：内容画布归 Project Service，工作流画布归 Canvas Service',
    '### Canvas Boundary 验收',
    '### Raw Resource 验收',
    '### 性能验收',
    '内容画布不能创建时命名、不能重命名',
  ]) {
    assert.ok(plan.includes(required), `plan is missing acceptance text: ${required}`)
  }

  assert.ok(existsSync(resolve(root, 'scripts/benchmark-project-service-performance.mjs')), 'Project Service performance benchmark script is required')
  assert.equal(
    rootPackage.scripts?.['benchmark:project-service'],
    'node scripts/benchmark-project-service-performance.mjs',
    'root package must expose the Project Service performance benchmark',
  )
  assert.match(benchmark, /MOVSCRIPT_PROJECT_UID/, 'benchmark must allow explicit project uid for real ~/.movscript runs')
  assert.match(benchmark, /decisionStore/, 'benchmark must pass a scoped decisionStore for candidate timings')
  assert.match(benchmark, /MOVSCRIPT_PROJECT_RESOURCE_VIEW_KIND/, 'benchmark must let diagnostics select a resource view kind')
})

test('daemon gateway and local surface project paths prefer canonical /v1 routes', () => {
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const localProjectRuntime = read('services/local-surface-host/src/project/localProjectSurfaceRuntime.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')
  const localProjectHostApi = read('services/local-surface-host/src/host-runtime/infrastructure/api/localSurfaceHostApi.ts')
  const semanticEntitiesApi = read('services/local-surface-host/src/host-runtime/infrastructure/api/semanticEntities.ts')

  for (const route of [
    '/v1/project/read-model',
    '/v1/project/source/command',
    '/v1/project/candidates/command',
    '/v1/project/locator/resolve',
    '/v1/canvas',
  ]) {
    assert.match(pluginGateway, new RegExp(route.replaceAll('/', '\\/')), `gateway must expose ${route}`)
  }

  for (const [label, source] of [
    ['local project runtime', localProjectRuntime],
    ['local content api', localContentApi],
    ['local project host api', localProjectHostApi],
    ['semantic entities api', semanticEntitiesApi],
  ]) {
    assert.doesNotMatch(source, /\/local-api\/project/, `${label} must not call /local-api/project`)
  }

  for (const [label, source] of [
    ['local project runtime', localProjectRuntime],
    ['local content api', localContentApi],
    ['semantic entities api', semanticEntitiesApi],
  ]) {
    assert.doesNotMatch(
      source,
      /\b(?:projectServiceBaseURL|projectServiceBaseUrl|projectServiceURL|projectServiceUrl)\b/,
      `${label} must not branch on Project Service URLs`,
    )
  }
})

test('product surfaces do not add new local-api or service-url contract debt', () => {
  const findings = scanRule({
    roots: [
      'apps/desktop/src',
      'packages/core/src/shared',
      'packages/shared/src',
      'services/local-surface-host/src',
      'surface',
    ],
    patterns: [
      /\/local-api/,
      /\b(?:localAPIBaseURL|dataServiceBaseURL|projectServiceBaseURL|canvasServiceBaseURL|canvasServiceV1BaseURL)\b/,
      /movscript\.(?:data|project|canvas)\.service/,
    ],
    allowedFiles: [
      'apps/desktop/src/shared/contracts/electronApiCore.ts',
      'apps/desktop/src/e2e/e2eBootstrapSeed.ts',
      'apps/desktop/src/features/onboarding/components/ModeSelectionPanel.tsx',
      'apps/desktop/src/shared/infrastructure/adminConsole.ts',
      'apps/desktop/src/shared/infrastructure/appSettingsStore.ts',
      'apps/desktop/src/shared/infrastructure/config.ts',
      'apps/desktop/src/shared/infrastructure/session/authRealm.ts',
      'packages/core/src/shared/appSettings.ts',
      'packages/shared/src/appSettings.ts',
      'services/local-surface-host/src/host-runtime/infrastructure/appSettingsStore.ts',
      'services/local-surface-host/src/routes/localRouteLinks.ts',
    ],
  })

  assert.deepEqual(findings, [], `new local-api/service-url debt:\n${findings.join('\n')}`)
})

test('workflow canvas product clients use canonical daemon canvas routes', () => {
  const canvasServiceApi = read('surface/canvas/src/features/application/canvasServiceApi.ts')
  const desktopRecentItems = read('apps/desktop/src/features/app-shell/application/appShortcutRecentItems.ts')
  const desktopCanvasShell = read('apps/desktop/src/features/app-shell/application/AppCanvasEditorShellRoute.tsx')
  const localSurfaceHostApi = read('services/local-surface-host/src/host-runtime/infrastructure/api.ts')
  const electronRuntimeConfig = read('apps/desktop/electron/services/runtimeConfig.ts')

  assert.match(canvasServiceApi, /\/v1\/canvas\/canvases/, 'canvas surface paths must use /v1/canvas')
  for (const [label, source] of [
    ['canvas service api', canvasServiceApi],
    ['desktop recent items', desktopRecentItems],
    ['desktop canvas shell', desktopCanvasShell],
  ]) {
    assert.doesNotMatch(source, /(['"`])\/canvas\/canvases/, `${label} must not use legacy /canvas/canvases paths`)
    assert.doesNotMatch(source, /\/local-api\/canvas/, `${label} must not use legacy /local-api/canvas paths`)
  }
  assert.doesNotMatch(localSurfaceHostApi, /baseURL:\s*['"`]\/local-api['"`]/, 'local surface canvas client must not default to /local-api')
  assert.doesNotMatch(electronRuntimeConfig, /`\$\{gatewayBaseURL\}\/local-api`/, 'Desktop runtime config must not expose gateway canvas routes through /local-api')
  assert.doesNotMatch(electronRuntimeConfig, /`\$\{canvasServiceBaseURL\}\/v1`/, 'Desktop runtime config must let canvas clients own the /v1/canvas path')
})

test('product surface copy does not expose internal service topology', () => {
  const findings = scanRule({
    roots: [
      'apps/desktop/src',
      'services/local-surface-host/src',
      'surface/project/src',
      'surface/canvas/src',
      'surface/editing/src',
    ],
    patterns: [
      /\b(?:Project Service|Data Service|Canvas Service)\b/,
      /\blocal backend\b/i,
      /\blocal API\b/i,
      /(?:服务 API 地址|Service API URL)/,
    ],
    allowedFiles: [],
  })

  assert.deepEqual(findings, [], `internal service topology leaked into product copy:\n${findings.join('\n')}`)
})

test('Desktop renderer runtime config does not expose daemon internal service endpoints', () => {
  const electronApiCore = read('apps/desktop/src/shared/contracts/electronApiCore.ts')
  const sharedContext = read('packages/shared/src/systemContext.ts')
  const desktopRuntimeConfig = read('apps/desktop/electron/services/runtimeConfig.ts')
  const desktopConfig = read('apps/desktop/src/shared/infrastructure/config.ts')
  const desktopApi = read('apps/desktop/src/shared/infrastructure/api.ts')
  const desktopSettingsIpc = read('apps/desktop/electron/ipc/settingsIpc.ts')
  const desktopManagedBootstrap = read('apps/desktop/electron/managedServices/bootstrap.ts')
  const desktopBackendBoot = read('apps/desktop/src/shared/infrastructure/backendBoot.ts')
  const desktopBackendBootBoundary = read('apps/desktop/src/features/app-shell/application/BackendBootBoundary.tsx')
  const desktopAppStartupTasks = read('apps/desktop/src/features/app-shell/application/AppStartupTasks.tsx')
  const desktopLocalWorkspaceAuth = read('apps/desktop/src/shared/infrastructure/session/localWorkspaceAuth.ts')
  const desktopAuthRealm = read('apps/desktop/src/shared/infrastructure/session/authRealm.ts')
  const desktopAdminConsole = read('apps/desktop/src/shared/infrastructure/adminConsole.ts')

  for (const field of [
    'dataServiceBaseURL',
    'projectServiceBaseURL',
    'canvasServiceBaseURL',
    'canvasServiceV1BaseURL',
    'localAPIBaseURL',
  ]) {
    assert.doesNotMatch(electronApiCore, new RegExp(`${field}[?:]`), `ElectronRuntimeConfig must not expose ${field}`)
  }

  assert.match(electronApiCore, /runtime: MovScriptRuntimeDescriptor/, 'ElectronRuntimeConfig must expose a daemon runtime descriptor')
  assert.match(electronApiCore, /dataConnection: MovScriptDataConnectionContext/, 'ElectronRuntimeConfig must expose data connection status as dataConnection')
  assert.match(sharedContext, /export interface MovScriptRuntimeDescriptor/, 'shared contracts must define the daemon runtime descriptor')
  assert.match(sharedContext, /owner: MovScriptDaemonRuntimeOwner/, 'runtime descriptor must name the daemon owner, not internal services')
  assert.match(sharedContext, /canonicalPrefix: '\/v1'/, 'runtime descriptor must publish canonical /v1 prefix')
  assert.match(sharedContext, /dataConnection: MovScriptDataConnectionContext/, 'runtime descriptor must expose data connection summary')

  for (const field of ['projectServiceBaseURL', 'canvasServiceBaseURL', 'canvasServiceV1BaseURL', 'localAPIBaseURL']) {
    assert.doesNotMatch(desktopRuntimeConfig, new RegExp(field), `Electron main runtime config must not return ${field}`)
  }
  assert.match(desktopRuntimeConfig, /createRuntimeDescriptor/, 'Electron main must build a daemon runtime descriptor')
  assert.match(desktopRuntimeConfig, /schema: 'movscript\.runtime-descriptor\.v1'/, 'Electron main descriptor must use the v1 runtime schema')
  assert.match(desktopRuntimeConfig, /owner: LOCAL_NODE_RUNTIME_OWNER/, 'Electron main descriptor must expose movscript.local-node as runtime owner')
  assert.match(desktopRuntimeConfig, /canonicalPrefix: '\/v1'/, 'Electron main descriptor must expose /v1 as canonical gateway prefix')
  assert.match(desktopRuntimeConfig, /resolveRuntimeDataConnection/, 'Electron main must convert launch intent into dataConnection status')
  assert.match(desktopRuntimeConfig, /dataServiceBaseURL/, 'Electron main may use Data Service discovery internally to choose the data plane')
  assert.match(desktopRuntimeConfig, /function resolveRendererAPIGatewayBaseURL/, 'Electron main must resolve renderer API access as a daemon gateway facade')
  assert.match(
    desktopRuntimeConfig,
    /if \(input\.gatewayBaseURL\) \{[\s\S]*?return normalizeDataServiceRootBaseURL\(input\.gatewayBaseURL\)/,
    'Electron main must prefer daemon gateway for renderer API access regardless of data plane',
  )
  assert.doesNotMatch(
    desktopRuntimeConfig,
    /\.\.\.\(dataServiceBaseURL \? \{ dataServiceBaseURL \} : \{\}\)/,
    'Electron main must not return internal Data Service URL to renderer',
  )

  assert.match(desktopConfig, /getCanvasGatewayBaseURL/, 'Desktop canvas client must be named as a gateway capability')
  assert.match(desktopConfig, /getRuntimeDescriptor/, 'Desktop renderer config must expose the descriptor helper')
  assert.match(desktopConfig, /runtimeConfigSnapshot\?\.runtime\.gateway\.baseURL/, 'Desktop renderer must prefer descriptor gateway base URL')
  assert.doesNotMatch(desktopConfig, /getCanvasService(?:V1)?BaseURL/, 'Desktop config must not expose Canvas Service base URL helpers')
  assert.doesNotMatch(desktopApi, /getCanvasService(?:V1)?BaseURL/, 'Desktop API client must not call Canvas Service URL helpers')

  for (const [label, source] of [
    ['Desktop settings IPC', desktopSettingsIpc],
    ['Desktop managed bootstrap', desktopManagedBootstrap],
  ]) {
    assert.doesNotMatch(source, /(?:dataPlaneForAPIBaseURL|localRuntimeDataPlaneForAPIBaseURL|new URL\(apiBaseURL\))/, `${label} must not infer cloud/external data plane from API URL hostname`)
  }
  assert.match(desktopSettingsIpc, /configureDaemonRuntime/, 'Desktop settings IPC must submit runtime configuration to daemon when available')
  assert.match(desktopSettingsIpc, /\/v1\/runtime\/configure/, 'Desktop settings IPC must use daemon runtime configure API')
  assert.match(desktopSettingsIpc, /runtimeDataConnectionFromSettings/, 'Desktop settings IPC must derive a typed dataConnection intent')
  assert.match(desktopManagedBootstrap, /forceRestart: shouldForceRefreshLocalRuntimeDaemon\(\)/, 'Desktop startup must refresh the managed daemon instead of reusing stale runtime records')
  assert.match(desktopManagedBootstrap, /MOVSCRIPT_DESKTOP_FORCE_DAEMON_REFRESH/, 'Desktop daemon refresh must have an explicit diagnostic override')
  assert.match(desktopBackendBoot, /shouldUseLocalDaemonGateway/, 'Desktop backend boot gate must be expressed as daemon gateway dataConnection intent')
  assert.match(desktopBackendBoot, /getLocalDaemonGatewayBaseURL/, 'Desktop backend boot probe target must be a daemon gateway URL')
  assert.match(desktopBackendBootBoundary, /shouldUseLocalDaemonGateway\(settings\)/, 'Desktop boot overlay must branch on dataConnection intent')
  assert.match(desktopBackendBootBoundary, /getLocalDaemonGatewayBaseURL\(settings\)/, 'Desktop boot overlay must probe the daemon gateway URL')
  assert.doesNotMatch(desktopBackendBootBoundary, /settings\.(?:launchMode|apiBaseURL)\b/, 'Desktop boot overlay must not branch on legacy launchMode/apiBaseURL fields')

  for (const [label, source] of [
    ['Desktop startup tasks', desktopAppStartupTasks],
    ['Desktop local workspace auth', desktopLocalWorkspaceAuth],
    ['Desktop auth realm', desktopAuthRealm],
    ['Desktop admin console', desktopAdminConsole],
  ]) {
    assert.match(source, /isLocalDataConnection|dataConnection/, `${label} must use typed dataConnection semantics`)
    assert.doesNotMatch(source, /isLocalLaunchMode|settings\.launchMode\b/, `${label} must not branch on legacy launchMode`)
  }
})

test('AppSettings exposes daemon gateway instead of legacy local API base URL', () => {
  const sharedAppSettings = read('packages/shared/src/appSettings.ts')
  const coreAppSettings = read('packages/core/src/shared/appSettings.ts')
  const desktopAppSettingsStore = read('apps/desktop/src/shared/infrastructure/appSettingsStore.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')
  const desktopAppSettingsPersistence = read('apps/desktop/electron/services/appSettings.ts')

  for (const [label, source] of [
    ['shared app settings', sharedAppSettings],
    ['core app settings', coreAppSettings],
  ]) {
    assert.match(
      exportedInterfaceBlock(source, 'AppSettings'),
      /daemonGatewayBaseURL\?: string/,
      `${label} public settings must expose daemonGatewayBaseURL`,
    )
    assert.match(
      exportedInterfaceBlock(source, 'AppSettings'),
      /dataConnection: AppDataConnectionSettings/,
      `${label} public settings must expose dataConnection intent`,
    )
    assert.doesNotMatch(
      exportedInterfaceBlock(source, 'AppSettings'),
      /localAPIBaseURL/,
      `${label} public settings must not expose legacy localAPIBaseURL`,
    )
    assert.match(source, /export interface AppDataConnectionSettings/, `${label} must define typed dataConnection settings`)
    assert.match(source, /normalizeDataConnectionKind/, `${label} normalizer must derive dataConnection from legacy launch mode`)
    assert.doesNotMatch(
      exportedInterfaceBlock(source, 'NormalizeAppSettingsOptions'),
      /localAPIBaseURL/,
      `${label} normalizer options must not expose legacy localAPIBaseURL`,
    )
    assert.match(source, /type LegacyAppSettings[\s\S]*localAPIBaseURL\?: string/, `${label} may read legacy localAPIBaseURL only through a legacy type`)
    assert.match(source, /settingsWithoutLegacyLocalAPIBaseURL/, `${label} must strip legacy localAPIBaseURL from normalized output`)
  }

  assert.doesNotMatch(desktopAppSettingsStore, /\bsettings\.localAPIBaseURL\b/, 'Desktop app settings store must not read legacy localAPIBaseURL from public settings')
  assert.doesNotMatch(desktopAppSettingsStore, /\blocalAPIBaseURL\s*:/, 'Desktop app settings store must not write legacy localAPIBaseURL')
  assert.doesNotMatch(desktopPreloadSource, /record\.localAPIBaseURL/, 'Desktop preload must not fall back to legacy localAPIBaseURL from runtime config')
  assert.match(desktopAppSettingsPersistence, /settingsWithoutLegacy/, 'Electron app settings persistence must strip legacy localAPIBaseURL before writing settings')
})

test('system context is issued by daemon and consumed by project surfaces', () => {
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const sharedContext = read('packages/shared/src/systemContext.ts')
  const skillMcpPlan = read('docs/skill-mcp-daemon-refactor-target.zh-CN.md')
  const mcpHostHttp = read('packages/mcp-host/src/http.ts')
  const mcpHostIndex = read('packages/mcp-host/src/index.ts')
  const desktopMcpIpc = read('apps/desktop/electron/ipc/mcpIpc.ts')
  const projectSurfaceRuntime = read('surface/project/src/runtime/ProjectSurfaceRuntime.ts')
  const desktopProjectRuntime = read('apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx')
  const localProjectHostRoute = read('services/local-surface-host/src/project/LocalProjectSurfaceHostRoute.tsx')
  const localProjectRuntime = read('services/local-surface-host/src/project/localProjectSurfaceRuntime.ts')

  assert.match(pluginGateway, /DAEMON_RUNTIME_DESCRIPTOR_ENDPOINT = ['"`]\/v1\/runtime\/descriptor['"`]/, 'daemon gateway must expose /v1/runtime/descriptor')
  assert.match(pluginGateway, /DAEMON_RUNTIME_STATUS_ENDPOINT = ['"`]\/v1\/runtime\/status['"`]/, 'daemon gateway must expose /v1/runtime/status')
  assert.match(pluginGateway, /DAEMON_RUNTIME_DIAGNOSTICS_ENDPOINT = ['"`]\/v1\/runtime\/diagnostics['"`]/, 'daemon gateway must expose debug-only /v1/runtime/diagnostics')
  assert.match(pluginGateway, /DAEMON_RUNTIME_CONFIGURE_ENDPOINT = ['"`]\/v1\/runtime\/configure['"`]/, 'daemon gateway must expose /v1/runtime/configure')
  assert.match(pluginGateway, /issueDaemonRuntimeDescriptor/, 'daemon gateway must issue runtime descriptors')
  assert.match(pluginGateway, /schema: 'movscript\.runtime-descriptor\.v1'/, 'daemon runtime descriptor must use the v1 schema')
  assert.match(pluginGateway, /owner: 'movscript\.local-node'/, 'daemon runtime descriptor must expose the local node owner')
  assert.match(pluginGateway, /canonicalPrefix: '\/v1'/, 'daemon runtime descriptor must expose canonical /v1 prefix')
  assert.match(pluginGateway, /daemonRuntimeDiagnosticsEnabled/, 'daemon diagnostics must be gated as debug-only')
  assert.match(pluginGateway, /schema: 'movscript\.runtime-diagnostics\.v1'/, 'daemon diagnostics must use an explicit diagnostics schema')
  assert.match(pluginGateway, /debugOnly: true/, 'daemon diagnostics response must declare debug-only status')
  assert.match(pluginGateway, /handleDaemonRuntimeConfigureRequest/, 'daemon gateway must own runtime configure handling')
  assert.match(pluginGateway, /readDaemonRuntimeConfigureInput/, 'daemon configure must parse typed dataConnection intent')
  assert.match(pluginGateway, /runtime_configure/, 'daemon configure must restart the local node through daemon control state')
  const diagnosticsBlock = pluginGateway.match(/function issueDaemonRuntimeDiagnostics[\s\S]*?function redactedEndpoint/)?.[0] ?? ''
  assert.ok(diagnosticsBlock, 'daemon diagnostics implementation must be present')
  assert.doesNotMatch(diagnosticsBlock, /\b(?:raw|path|url|baseURL|healthURL)\b/, 'daemon diagnostics must not return raw records, filesystem paths, or endpoint URLs')
  assert.match(pluginGateway, /daemonDataConnectionContext/, 'daemon context and runtime descriptor must share dataConnection derivation')
  assert.match(pluginGateway, /DAEMON_CONTEXT_ENDPOINT = ['"`]\/v1\/context['"`]/, 'daemon gateway must expose /v1/context')
  assert.match(pluginGateway, /DAEMON_CONTEXT_SESSIONS_ENDPOINT = ['"`]\/v1\/context\/sessions['"`]/, 'daemon gateway must expose workspace context sessions')
  assert.match(pluginGateway, /schema: 'movscript\.context-envelope\.v1'/, 'daemon context responses must be explicit envelopes')
  assert.match(pluginGateway, /daemonContextSessions = new Map/, 'daemon must maintain session-scoped context instead of one global project')
  assert.match(pluginGateway, /syncMCPContextSnapshotFromDaemonInput/, 'daemon context session writes must sync MCP context from daemon input')
  assert.match(pluginGateway, /mcpContextUpdateFromRecord/, 'daemon context session writes must parse MCP context payloads')

  assert.match(sharedContext, /export interface MovScriptContextEnvelope/, 'shared contract must define the daemon context envelope')
  assert.match(sharedContext, /sessionId: string/, 'context session must include sessionId')
  assert.match(sharedContext, /revision: number/, 'context envelope must include revision')
  assert.match(sharedContext, /projectCwd\?: string/, 'project cwd must live inside workspace session context')

  assert.match(mcpHostHttp, /function daemonContextSessionsEndpoint/, 'MCP host context updates must discover daemon context sessions')
  assert.match(mcpHostHttp, /\/v1\/context\/sessions/, 'MCP host context updates must target daemon context sessions')
  assert.ok(
    mcpHostHttp.indexOf('await postMCPContextSnapshotToDaemon(next)') >= 0
      && mcpHostHttp.indexOf('await postMCPContextSnapshotToDaemon(next)') < mcpHostHttp.indexOf('updateLocalMCPContextSnapshot(next)'),
    'MCP host context updates must post to daemon before local compatibility mirroring',
  )
  assert.match(mcpHostIndex, /updateMCPContextSnapshot,[\s\S]*from '\.\/http\.js'/, 'public MCP host context export must come from the daemon-first HTTP wrapper')
  assert.match(desktopMcpIpc, /from '@movscript\/mcp-host'/, 'Desktop context IPC must update through MCP host wrapper')
  assert.doesNotMatch(desktopMcpIpc, /@movscript\/core\/mcp\/node/, 'Desktop context IPC must not write core MCP memory directly')
  assert.doesNotMatch(skillMcpPlan, /待落地：`packages\/mcp-host\/src\/http\.ts`[\s\S]*context snapshot 写入迁到 daemon context\/session API/, 'skill/MCP plan must not mark daemon context snapshot migration as pending')

  assert.match(projectSurfaceRuntime, /context\?: MovScriptContextEnvelope/, 'Project Surface runtime must accept daemon context')
  assert.match(projectSurfaceRuntime, /projectSurfaceProjectFromContext/, 'Project Surface runtime must derive project context from daemon envelope')
  assert.match(projectSurfaceRuntime, /movScriptContextProjectCwd\(context\)/, 'Project Surface runtime must read cwd from daemon context')

  assert.match(desktopProjectRuntime, /DAEMON_CONTEXT_SESSIONS_ENDPOINT = ['"`]\/v1\/context\/sessions['"`]/, 'Desktop must create daemon workspace sessions')
  assert.match(desktopProjectRuntime, /context: contextEnvelope/, 'Desktop must inject daemon context into Project Surface runtime')
  assert.match(desktopProjectRuntime, /desktopContextCommandEnvelope\(contextEnvelope\)/, 'Desktop Project Service calls must carry context revision')
  assert.match(desktopProjectRuntime, /revision: context\.revision/, 'Desktop Project Service calls must include context revision')
  assert.doesNotMatch(
    desktopProjectRuntime,
    /project:\s*\{[\s\S]*?\.\.\.\(projectDir \? \{ projectDir \} : \{\}\)/,
    'Desktop must not inject store-derived projectDir directly into Project Surface runtime',
  )
  assert.doesNotMatch(
    desktopProjectRuntime,
    /contextProjectDir \?\? input\.projectDir/,
    'Desktop Project Service calls must not let request projectDir override daemon context',
  )

  assert.match(localProjectHostRoute, /fetch\(['"`]\/v1\/context\/sessions['"`]/, 'local surface host must create daemon workspace sessions')
  assert.match(localProjectHostRoute, /context: contextEnvelope/, 'local surface host must inject daemon context into Project Surface runtime')
  assert.match(localProjectRuntime, /context: input\.context/, 'local Project Surface runtime must accept daemon context')
  assert.match(localProjectRuntime, /revision: context\.revision/, 'local Project Service calls must include context revision')
  assert.doesNotMatch(
    localProjectRuntime,
    /movScriptContextProjectCwd\(input\.context\) \?\? input\.projectDir/,
    'local Project Surface runtime must not fall back from daemon cwd to route projectDir',
  )
  assert.doesNotMatch(
    localProjectRuntime,
    /projectDir \?\? request\.projectDir/,
    'local Project Service calls must not let request projectDir override daemon context',
  )
})

test('desktop content canvas preload routes through daemon Project content canvas APIs', () => {
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')

  for (const endpoint of [
    'PROJECT_CONTENT_CANVASES_LIST_ENDPOINT',
    'PROJECT_CONTENT_CANVAS_WRITE_ENDPOINT',
    'PROJECT_CONTENT_CANVAS_RENAME_ENDPOINT',
    'PROJECT_CONTENT_CANVAS_RUN_ENDPOINT',
    'PROJECT_CONTENT_CANVAS_DELETE_ENDPOINT',
  ]) {
    assert.match(desktopPreloadSource, new RegExp(`${endpoint} = ['"\`]\\/v1\\/project\\/content-canvases\\/`), `Desktop content canvas must define ${endpoint}`)
  }
  assert.match(desktopPreloadSource, /daemonProjectContentCanvasRequest\(ipcRenderer, PROJECT_CONTENT_CANVAS_RENAME_ENDPOINT/, 'Desktop rename must call the typed daemon Project content canvas API')
  assert.match(desktopPreloadSource, /daemonProjectContentCanvasRequest\(ipcRenderer, PROJECT_CONTENT_CANVAS_RUN_ENDPOINT/, 'Desktop run must call the typed daemon Project content canvas API')
  assert.doesNotMatch(desktopPreloadSource, /daemonProjectSourceCommand\(ipcRenderer, ['"`](listContentCanvases|writeContentCanvas|renameContentCanvas|runContentCanvas|deleteContentCanvas)['"`]/, 'Desktop content canvas calls must not use generic Project source commands')
  assert.doesNotMatch(desktopPreloadSource, /ipcRenderer\.invoke\(['"`]movscript:engine-/, 'Desktop preload must not invoke local engine IPC for Project source/candidate writes')
})

test('content canvas naming UI and Project Service rename contract stay explicit', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectServiceTests = read('services/project-service/tests/server.test.mjs')
  const contentPanel = read('surface/project/src/features/content/components/ContentPromptCanvasPanel.tsx')
  const contentController = read('surface/project/src/features/content/components/useContentCanvasWorkspaceController.ts')
  const contentDocuments = read('surface/project/src/features/content/application/contentCanvasDocuments.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')

  assert.match(projectTypes, /\|\s*'renameContentCanvas'/, 'Project source command contract must include content canvas rename')
  assert.match(projectTypes, /\|\s*'runContentCanvas'/, 'Project source command contract must include content canvas run')
  assert.match(projectTypes, /PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT = ['"`]\/v1\/project\/content-canvases\/rename['"`]/, 'Project package must expose a typed content canvas rename endpoint')
  assert.match(projectTypes, /PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT = ['"`]\/v1\/project\/content-canvases\/run['"`]/, 'Project package must expose a typed content canvas run endpoint')
  assert.match(projectService, /case ['"`]renameContentCanvas['"`]:/, 'Project Service must own content canvas rename')
  assert.match(projectService, /case ['"`]runContentCanvas['"`]:/, 'Project Service must own content canvas run')
  assert.match(projectService, /PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT/, 'Project Service must serve typed content canvas rename endpoint')
  assert.match(projectService, /PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT/, 'Project Service must serve typed content canvas run endpoint')
  assert.match(projectService, /renameProjectContentCanvas/, 'Project Service must implement content canvas rename')
  assert.match(projectService, /runProjectContentCanvas/, 'Project Service must implement content canvas run')
  assert.match(projectService, /canvasKind: ['"`]content['"`]/, 'Project Service content canvas responses must expose a content discriminator')
  assert.match(projectService, /movscript\.content_canvas_run\.v1/, 'Project Service content canvas run must return a stable schema')
  assert.doesNotMatch(projectService, /project_content_canvas_title_duplicate/, 'Project Service must use content canvas id, not title, as identity')
  assert.match(projectServiceTests, /renameContentCanvas/, 'Project Service tests must cover content canvas rename')
  assert.match(projectServiceTests, /runContentCanvas/, 'Project Service tests must cover content canvas run')

  assert.match(contentPanel, /title=['"`]新建内容画布['"`]/, 'content canvas toolbar must expose a create button')
  assert.match(contentPanel, /title=['"`]重命名内容画布['"`]/, 'content canvas toolbar must expose a rename button')
  assert.match(contentPanel, /<ContentCanvasNameDialog/, 'content canvas naming must use a dialog')
  assert.match(contentPanel, /DialogTitle>\{state\?\.mode === ['"`]rename['"`] \? ['"`]重命名内容画布['"`] : ['"`]新建内容画布['"`]\}/, 'content canvas dialog must switch between create and rename')
  assert.match(contentPanel, /contentCanvasDocumentTitleValidationMessage/, 'content canvas dialog must show title validation')
  assert.match(contentController, /createFreeCreativeCanvasDocument/, 'content controller must provide create canvas flow')
  assert.match(contentController, /renameFreeCreativeCanvasDocument/, 'content controller must provide rename canvas flow')
  assert.match(contentDocuments, /createContentCanvasDocument/, 'content documents must support create with name')
  assert.match(contentDocuments, /renameContentCanvasDocument/, 'content documents must support rename')
  assert.match(contentDocuments, /CONTENT_CANVAS_TITLE_MAX_LENGTH = 80/, 'content document title rules must include max length')

  assert.match(localContentApi, /\/v1\/project\/content-canvases\/rename/, 'local surface host must route rename through the typed daemon Project content canvas API')
  assert.match(localContentApi, /\/v1\/project\/content-canvases\/run/, 'local surface host must route run through the typed daemon Project content canvas API')
  assert.doesNotMatch(localContentApi, /sourceCommand\(['"`](listContentCanvases|writeContentCanvas|renameContentCanvas|runContentCanvas|deleteContentCanvas)['"`]/, 'local surface host content canvas calls must not use generic source commands')
  assert.match(desktopPreloadSource, /daemonProjectContentCanvasRequest\(ipcRenderer, PROJECT_CONTENT_CANVAS_RENAME_ENDPOINT/, 'Desktop preload must route rename through typed daemon Project content canvas API')
  assert.match(desktopPreloadSource, /daemonProjectContentCanvasRequest\(ipcRenderer, PROJECT_CONTENT_CANVAS_RUN_ENDPOINT/, 'Desktop preload must route run through typed daemon Project content canvas API')
})

test('editing surface host capabilities use canonical daemon host routes', () => {
  const localEditingBridge = read('services/local-surface-host/src/editing/localEditingApi.ts')
  const editingHostApi = read('surface/editing/src/service-host-api.ts')
  const localMedia = read('surface/editing/src/features/media/localMedia.ts')

  for (const [label, source] of [
    ['local editing bridge', localEditingBridge],
    ['editing host api', editingHostApi],
    ['local media helper', localMedia],
  ]) {
    assert.doesNotMatch(source, /\/local-api\/editing/, `${label} must not use legacy /local-api/editing routes`)
    assert.doesNotMatch(
      source,
      /\b(?:editingServiceBaseURL|mediaPipelineBaseURL|editingServiceURL|mediaPipelineURL)\b/,
      `${label} must not branch on editing or media-pipeline service URLs`,
    )
  }
  assert.match(editingHostApi, /\/v1\/host\/editing\/import-file/, 'editing import-file must use daemon host route')
  assert.match(localMedia, /\/v1\/host\/editing\/media-file/, 'editing media-file must use daemon host route')
})

test('project source operations do not gain new public bypass files', () => {
  const findings = scanRule({
    roots: [
      'apps/desktop/electron',
      'apps/desktop/src',
      'packages/core/src/mcp/node/tools/domain',
      'packages/core/src/mcp/tools/domain',
      'services/local-surface-host/src',
      'surface/project/src',
    ],
    patterns: [
      /\b(?:readScriptSource|upsertProjectStandards|upsertScript|snapshotScriptVersionFromMarkdown)\b/,
      /\bproject_standards\.json\b/,
    ],
    allowedFiles: [
      'apps/desktop/electron/services/projectEngineRegistry.ts',
      'apps/desktop/electron/preload/api/movscriptEngine.ts',
      'apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx',
      'apps/desktop/src/shared/contracts/electronApi.ts',
      'apps/desktop/src/shared/contracts/electronApiWorkspace.ts',
      'apps/desktop/src/shared/infrastructure/workspaceDomainRepository.ts',
      'packages/core/src/mcp/node/tools/domain/actions.ts',
      'packages/core/src/mcp/node/tools/domain/runtime.ts',
      'packages/core/src/mcp/tools/domain/definitions.ts',
      'services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts',
      'services/local-surface-host/src/host-runtime/infrastructure/workspaceDomainRepository.ts',
      'services/local-surface-host/src/project/localProjectSurfaceRuntime.ts',
      'surface/project/src/components/settings/ProjectSettingsSurface.tsx',
      'surface/project/src/components/scripts/ProjectScriptsSurface.tsx',
      'surface/project/src/components/standards/ProjectStandardsSurface.tsx',
      'surface/project/src/features/project-standards/application/projectStandardsWorkspaceRepository.ts',
      'surface/project/src/features/scripts/application/scriptWorkspaceRepository.ts',
      'surface/project/src/runtime/ProjectSurfaceRuntime.ts',
    ],
  })

  assert.deepEqual(findings, [], `new project source bypass debt:\n${findings.join('\n')}`)
})

test('legacy project source facades use typed daemon project APIs', () => {
  const desktopWorkspaceRepository = read('apps/desktop/src/shared/infrastructure/workspaceDomainRepository.ts')
  const desktopProjectRuntime = read('apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx')
  const localProjectRuntime = read('services/local-surface-host/src/project/localProjectSurfaceRuntime.ts')
  const projectSurfaceRuntime = read('surface/project/src/runtime/ProjectSurfaceRuntime.ts')
  const agentBrowserTab = read('apps/desktop/src/features/agent/components/AgentBrowserTabContent.tsx')
  const scriptWorkspaceRepository = read('surface/project/src/features/scripts/application/scriptWorkspaceRepository.ts')

  assert.doesNotMatch(desktopWorkspaceRepository, /PROJECT_SOURCE_COMMAND_ENDPOINT/, 'Desktop workspace facade must not keep the generic Project source command route')
  assert.doesNotMatch(desktopWorkspaceRepository, /\bdaemonProjectSourceCommand\b/, 'Desktop workspace facade must not keep a generic Project source command helper')
  assert.doesNotMatch(desktopProjectRuntime, /PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT|sourceCommand|upsertSource/, 'Desktop Project Surface runtime must not expose generic Project source command helpers')
  assert.doesNotMatch(localProjectRuntime, /LOCAL_PROJECT_SOURCE_COMMAND_ENDPOINT|sourceCommand|upsertSource/, 'local Project Surface runtime must not expose generic Project source command helpers')
  assert.doesNotMatch(projectSurfaceRuntime, /sourceCommand|upsertSource|ProjectSurfaceSourceCommandInput/, 'Project Surface runtime contract must stay typed')
  assert.match(
    desktopWorkspaceRepository,
    /const PROJECT_STANDARDS_UPSERT_ENDPOINT = ['"`]\/v1\/project\/standards\/upsert['"`]/,
    'Desktop workspace facade must expose the daemon Project standards typed route',
  )
  assert.match(
    desktopWorkspaceRepository,
    /const PROJECT_SCRIPT_UPSERT_ENDPOINT = ['"`]\/v1\/project\/scripts\/upsert['"`]/,
    'Desktop workspace facade must expose the daemon Project script upsert typed route',
  )
  for (const [method, apiMethod] of [
    ['queryEntities', 'queryMovScriptEngineWorkspaceEntities'],
    ['querySettings', 'queryMovScriptEngineWorkspaceSettings'],
    ['queryAssets', 'queryMovScriptEngineWorkspaceAssets'],
  ]) {
    assert.match(
      desktopWorkspaceRepository,
      new RegExp(`async ${method}\\([^)]*\\) \\{[\\s\\S]*?api\\.${apiMethod}\\(\\{ \\.\\.\\.context, query \\}\\)`),
      `${method} must route through the typed preload Project query API`,
    )
  }
  for (const [method, endpoint] of [
    ['upsertScript', 'PROJECT_SCRIPT_UPSERT_ENDPOINT'],
    ['readScriptSource', 'PROJECT_SCRIPT_SOURCE_READ_ENDPOINT'],
    ['upsertProjectStandards', 'PROJECT_STANDARDS_UPSERT_ENDPOINT'],
  ]) {
    assert.match(
      desktopWorkspaceRepository,
      new RegExp(`async ${method}\\([^)]*\\) \\{[\\s\\S]*?daemonProjectSourceOperation\\(context, ${endpoint}`),
      `${method} must route through daemon Project typed APIs`,
    )
  }

  assert.match(agentBrowserTab, /DesktopProjectSurfaceProvider/, 'Agent standards pane must use the Project Surface runtime provider')
  assert.match(agentBrowserTab, /ProjectStandardsSurface/, 'Agent standards pane must render the runtime-backed standards surface')
  assert.doesNotMatch(agentBrowserTab, /ProjectStandardsContent/, 'Agent standards pane must not render the legacy standards content')
  assert.doesNotMatch(scriptWorkspaceRepository, /\/v1\/project\/resources\/view/, 'legacy script repository must not guess relative daemon routes')
  assert.doesNotMatch(scriptWorkspaceRepository, /\bfetch\(/, 'legacy script repository must use the configured workspace domain facade')
})

test('project context snapshots are produced through Project Service', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectResources = read('packages/core/src/mcp/node/tools/project/resources.ts')
  const domainActions = read('packages/core/src/mcp/node/tools/domain/actions.ts')
  const coreContentIndex = read('packages/core/src/content/index.ts')

  assert.match(projectTypes, /\|\s*'project-context'/, 'Project Service resource view kind must include project-context')
  assert.match(projectService, /buildProjectContextSnapshot/, 'Project Service must build project context snapshots')
  assert.match(projectService, /kind === ['"`]project-context['"`]/, 'Project Service must expose project-context as a resource view')
  assert.match(projectResources, /project-context/, 'MCP project resources must publish project-context')
  assert.match(coreContentIndex, /projectContextSnapshot/, 'core content package must export the Project Service snapshot builder')

  assert.match(domainActions, /createProjectServiceClientFromRuntime\(\)\.resourceView/, 'domain context reads must call Project Service')
  assert.match(domainActions, /kind:\s*['"`]project-context['"`]/, 'domain context reads must request the project-context resource view')
  for (const localBuilderSymbol of [
    'PROJECT_CONTEXT_CORE_STANDARDS',
    'parseProjectStyle',
    'buildProjectContextPromptPreview',
    'stableProjectContextHash',
    'extractProjectContextResourceIds',
  ]) {
    assert.doesNotMatch(domainActions, new RegExp(localBuilderSymbol), `MCP domain actions must not keep local context builder symbol ${localBuilderSymbol}`)
  }
})

test('project standards and scripts stay behind typed Project Service APIs', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectServiceTests = read('services/project-service/tests/server.test.mjs')
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')
  const desktopProjectRuntime = read('apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx')
  const localProjectRuntime = read('services/local-surface-host/src/project/localProjectSurfaceRuntime.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')
  const standardsSurface = read('surface/project/src/components/standards/ProjectStandardsSurface.tsx')
  const scriptsSurface = read('surface/project/src/components/scripts/ProjectScriptsSurface.tsx')

  assert.match(projectTypes, /\|\s*'upsertProjectStandards'/, 'Project source command contract must include standards writes')
  assert.match(projectTypes, /PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT = ['"`]\/v1\/project\/standards\/upsert['"`]/, 'Project package must expose a typed standards upsert endpoint')
  assert.match(projectTypes, /PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT = ['"`]\/v1\/project\/scripts\/source\/read['"`]/, 'Project package must expose a typed script read endpoint')
  assert.match(projectTypes, /PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT = ['"`]\/v1\/project\/scripts\/upsert['"`]/, 'Project package must expose a typed script upsert endpoint')
  assert.match(projectTypes, /PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT = ['"`]\/v1\/project\/scripts\/versions\/snapshot['"`]/, 'Project package must expose a typed script version snapshot endpoint')
  assert.match(projectService, /case ['"`]upsertProjectStandards['"`]:/, 'Project Service must own the standards write command')
  assert.match(projectService, /PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT/, 'Project Service must serve the typed standards endpoint')
  assert.match(projectService, /PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT/, 'Project Service must serve the typed script upsert endpoint')
  assert.match(projectService, /PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT/, 'Project Service must serve the typed script snapshot endpoint')
  assert.match(projectService, /workspaceService\.upsertProjectStandards\(projectSourceOperationInput\(context\.body\)\)/, 'Project Service typed endpoint must trigger workspace standards sync')
  assert.match(projectService, /workspaceService\.upsertScript\(projectSourceOperationInput\(context\.body\)\)/, 'Project Service typed endpoint must trigger workspace script sync')
  assert.match(projectService, /workspaceService\.snapshotScriptVersionFromMarkdown\(projectSourceOperationInput\(context\.body\)\)/, 'Project Service typed endpoint must own script version snapshots')
  assert.match(projectServiceTests, /standardSkillFiles/, 'Project Service tests must assert provider skill sync results')
  assert.match(projectServiceTests, /movscript\.project-standards-upsert\.v1/, 'Project Service tests must cover the typed standards endpoint')
  assert.match(projectServiceTests, /movscript\.project-script-upsert\.v1/, 'Project Service tests must cover the typed script upsert endpoint')
  assert.match(projectServiceTests, /movscript\.project-script-version-snapshot\.v1/, 'Project Service tests must cover the typed script snapshot endpoint')
  assert.match(pluginGateway, /\['\/v1\/project\/standards\/upsert', '\/v1\/project\/standards\/upsert'\]/, 'daemon gateway must proxy the typed standards endpoint')
  assert.match(pluginGateway, /\['\/v1\/project\/scripts\/upsert', '\/v1\/project\/scripts\/upsert'\]/, 'daemon gateway must proxy the typed script upsert endpoint')
  assert.match(pluginGateway, /\['\/v1\/project\/scripts\/versions\/snapshot', '\/v1\/project\/scripts\/versions\/snapshot'\]/, 'daemon gateway must proxy the typed script snapshot endpoint')
  assert.match(pluginGateway, /\['\/local-api\/project\/standards\/upsert', '\/v1\/project\/standards\/upsert'\]/, 'daemon gateway must keep legacy local-api standards alias proxied to the typed endpoint')

  assert.match(desktopPreloadSource, /PROJECT_STANDARDS_UPSERT_ENDPOINT = ['"`]\/v1\/project\/standards\/upsert['"`]/, 'Desktop preload must define the typed standards endpoint')
  assert.match(desktopPreloadSource, /PROJECT_SCRIPT_UPSERT_ENDPOINT = ['"`]\/v1\/project\/scripts\/upsert['"`]/, 'Desktop preload must define the typed script upsert endpoint')
  assert.match(desktopPreloadSource, /daemonProjectSourceOperation\(ipcRenderer, PROJECT_STANDARDS_UPSERT_ENDPOINT/, 'Desktop preload standards writes must use typed daemon Project APIs')
  assert.match(desktopPreloadSource, /daemonProjectSourceOperation\(ipcRenderer, PROJECT_SCRIPT_UPSERT_ENDPOINT/, 'Desktop preload script writes must use typed daemon Project APIs')
  assert.doesNotMatch(desktopPreloadSource, /daemonProjectSourceCommand\(ipcRenderer, ['"`](upsertProjectStandards|upsertScript|readScriptSource)['"`]/, 'Desktop preload standards/scripts must not use generic Project source commands')

  assert.match(desktopProjectRuntime, /PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT = ['"`]\/v1\/project\/standards\/upsert['"`]/, 'Desktop Project Surface runtime must define the typed standards endpoint')
  assert.match(desktopProjectRuntime, /upsertProjectStandards: \(input\) => postProjectWorkspaceOperation\(PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT/, 'Desktop Project Surface standards must use typed APIs')
  assert.match(desktopProjectRuntime, /snapshotScriptVersionFromMarkdown: \(input\) => postProjectWorkspaceOperation\(PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT/, 'Desktop Project Surface script snapshots must use typed APIs')
  assert.match(localProjectRuntime, /LOCAL_PROJECT_STANDARDS_UPSERT_ENDPOINT = ['"`]\/v1\/project\/standards\/upsert['"`]/, 'local-surface-host Project runtime must define the typed standards endpoint')
  assert.match(localProjectRuntime, /upsertProjectStandards: \(request\) => postProjectWorkspaceOperation\(LOCAL_PROJECT_STANDARDS_UPSERT_ENDPOINT/, 'local-surface-host standards must use typed APIs')
  assert.match(localProjectRuntime, /snapshotScriptVersionFromMarkdown: \(request\) => postProjectWorkspaceOperation\(LOCAL_PROJECT_SCRIPT_VERSION_SNAPSHOT_ENDPOINT/, 'local-surface-host script snapshots must use typed APIs')
  assert.match(localContentApi, /\/v1\/project\/scripts\/source\/read/, 'local surface content API must route script reads through typed Project APIs')
  assert.match(localContentApi, /\/v1\/project\/scripts\/upsert/, 'local surface content API must route script writes through typed Project APIs')
  assert.doesNotMatch(localContentApi, /sourceCommand\(['"`](readScriptSource|upsertScript)['"`]/, 'local surface content API script reads/writes must not use generic source commands')
  assert.doesNotMatch(standardsSurface, /command:\s*['"`]upsertProjectStandards['"`]/, 'standards surface must not construct generic source commands')
  assert.doesNotMatch(scriptsSurface, /command:\s*['"`](upsertScript|snapshotScriptVersionFromMarkdown)['"`]/, 'scripts surface must not construct generic source commands')

  const findings = scanRule({
    roots: [
      'apps/desktop/src',
      'apps/desktop/electron',
      'packages/core/src/mcp/node/tools/domain',
      'packages/core/src/mcp/tools/domain',
      'services/local-surface-host/src',
      'surface/project/src',
    ],
    patterns: [
      /\bsyncMovScriptProjectStandardSkills\b/,
      /\bMOVSCRIPT_PROJECT_STANDARD_SKILL_PATHS\b/,
      /\.codex\/skills\/plugins\/movscript_project-standards/,
      /\.claude\/skills\/plugins\/movscript_project-standards/,
      /\.mova\/skills\/plugins\/movscript_project-standards/,
    ],
    allowedFiles: [],
  })

  assert.deepEqual(findings, [], `provider skill compilation leaked outside Project Service:\n${findings.join('\n')}`)
})

test('project source write operations prefer typed Project Service APIs over command strings', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectServiceTests = read('services/project-service/tests/server.test.mjs')
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')
  const domainRuntime = read('packages/core/src/mcp/node/tools/domain/runtime.ts')

  for (const endpoint of [
    ['PROJECT_SERVICE_SETTING_CREATE_ENDPOINT', '/v1/project/settings/create'],
    ['PROJECT_SERVICE_ASSET_CREATE_ENDPOINT', '/v1/project/assets/create'],
    ['PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT', '/v1/project/content-units/create'],
    ['PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT', '/v1/project/content-units/ensure'],
    ['PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT', '/v1/project/productions/create'],
    ['PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT', '/v1/project/scene-moments/create'],
    ['PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT', '/v1/project/expression-units/create'],
    ['PROJECT_SERVICE_ENTITY_BASICS_UPDATE_ENDPOINT', '/v1/project/entities/basics/update'],
    ['PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT', '/v1/project/hierarchy/write'],
    ['PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT', '/v1/project/namespaces/write'],
    ['PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT', '/v1/project/workspace-candidates/select'],
    ['PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT', '/v1/project/workspace-candidates/append'],
    ['PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT', '/v1/project/workspace-candidates/asset-slots/create'],
    ['PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT', '/v1/project/workspace-candidates/keyframes/create'],
  ]) {
    assert.match(projectTypes, new RegExp(`${endpoint[0]} = ['"\`]${endpoint[1].replace(/\//g, '\\/')}['"\`]`), `Project package must expose ${endpoint[0]}`)
    assert.match(pluginGateway, new RegExp(`\\['${endpoint[1].replace(/\//g, '\\/')}', '${endpoint[1].replace(/\//g, '\\/')}'\\]`), `daemon gateway must proxy ${endpoint[1]}`)
  }

  assert.match(projectService, /PROJECT_SOURCE_OPERATION_ROUTES = new Map/, 'Project Service must own typed source operation routing')
  assert.match(projectService, /movscript\.project-setting-create\.v1/, 'Project Service typed route map must include setting create')
  assert.match(projectService, /movscript\.project-content-unit-create\.v1/, 'Project Service typed route map must include content unit create')
  assert.match(projectService, /movscript\.project-hierarchy-write\.v1/, 'Project Service typed route map must include hierarchy writes')
  assert.match(projectService, /movscript\.project-workspace-candidate-append\.v1/, 'Project Service typed route map must include workspace candidate append')
  assert.match(projectServiceTests, /movscript\.project-setting-create\.v1/, 'Project Service tests must cover typed setting create')
  assert.match(projectServiceTests, /movscript\.project-content-unit-create\.v1/, 'Project Service tests must cover typed content unit create')
  assert.match(projectServiceTests, /movscript\.project-hierarchy-write\.v1/, 'Project Service tests must cover typed hierarchy write')
  assert.match(projectServiceTests, /movscript\.project-workspace-candidate-append\.v1/, 'Project Service tests must cover typed workspace candidate append')

  const migratedCommands = [
    'upsertSetting',
    'upsertAsset',
    'createSetting',
    'createSettingState',
    'createAsset',
    'deleteEntity',
    'saveProductionSnapshot',
    'upsertContentUnit',
    'createContentUnit',
    'ensureContentUnitForEntity',
    'ensureTimelineAssemblyContentUnit',
    'updateContentUnitEditPrompt',
    'createProduction',
    'createSegment',
    'createSceneMoment',
    'createExpressionUnit',
    'createKeyframe',
    'createStoryboard',
    'updateEntityBasics',
    'connectSceneMomentSetting',
    'updateExpressionUnit',
    'updateAudioCue',
    'updateEntityTransition',
    'updateStoryboardTimeline',
    'writeHierarchyNode',
    'writeNamespaceNode',
    'selectCandidate',
    'appendCandidate',
    'createAssetSlotCandidate',
    'createKeyframeCandidate',
  ]
  const migratedCommandPattern = new RegExp(`(?:daemonProjectSourceCommand\\(ipcRenderer, |sourceCommand\\(|projectService\\.sourceCommand\\()(['"\`])(?:${migratedCommands.join('|')})\\1`)

  assert.doesNotMatch(desktopPreloadSource, migratedCommandPattern, 'Desktop preload must not route migrated source writes through command strings')
  assert.doesNotMatch(localContentApi, migratedCommandPattern, 'local surface host API must not route migrated source writes through command strings')
  assert.doesNotMatch(domainRuntime, migratedCommandPattern, 'MCP/domain runtime must not route migrated source writes through command strings')

  assert.match(desktopPreloadSource, /PROJECT_CONTENT_UNIT_CREATE_ENDPOINT = ['"`]\/v1\/project\/content-units\/create['"`]/, 'Desktop preload must define typed content unit route')
  assert.match(desktopPreloadSource, /PROJECT_HIERARCHY_WRITE_ENDPOINT = ['"`]\/v1\/project\/hierarchy\/write['"`]/, 'Desktop preload must define typed hierarchy route')
  assert.match(localContentApi, /\/v1\/project\/content-units\/ensure/, 'local surface host must call typed content unit ensure route')
  assert.match(localContentApi, /\/v1\/project\/hierarchy\/write/, 'local surface host must call typed hierarchy route')
  assert.match(domainRuntime, /PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT/, 'MCP/domain runtime must use typed content unit route constants')
  assert.match(domainRuntime, /PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT/, 'MCP/domain runtime must use typed hierarchy route constants')
})

test('project source read and prompt operations prefer typed Project Service APIs over command strings', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectServiceTests = read('services/project-service/tests/server.test.mjs')
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')

  for (const endpoint of [
    ['PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT', '/v1/project/entities/query'],
    ['PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT', '/v1/project/settings/query'],
    ['PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT', '/v1/project/assets/query'],
    ['PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT', '/v1/project/content-workspace/snapshot'],
    ['PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT', '/v1/project/content-workspace/read'],
  ]) {
    assert.match(projectTypes, new RegExp(`${endpoint[0]} = ['"\`]${endpoint[1].replace(/\//g, '\\/')}['"\`]`), `Project package must expose ${endpoint[0]}`)
    assert.match(pluginGateway, new RegExp(`\\['${endpoint[1].replace(/\//g, '\\/')}', '${endpoint[1].replace(/\//g, '\\/')}'\\]`), `daemon gateway must proxy ${endpoint[1]}`)
  }

  assert.match(projectService, /movscript\.project-entities-query\.v1/, 'Project Service typed route map must include entity query')
  assert.match(projectService, /movscript\.project-content-workspace-read\.v1/, 'Project Service typed route map must include content workspace read')
  assert.match(projectServiceTests, /movscript\.project-entities-query\.v1/, 'Project Service tests must cover typed entity query')
  assert.match(projectServiceTests, /movscript\.project-content-workspace-read\.v1/, 'Project Service tests must cover typed content workspace read')

  for (const source of [desktopPreloadSource, localContentApi]) {
    assert.doesNotMatch(source, /sourceCommand\(['"`](queryEntities|querySettings|queryAssets|readContentUnitGenerationPrompt|buildContentUnitBackendPrompt|loadContentWorkspaceSnapshot|loadContentWorkspace|syncContentWorkspace)['"`]/, 'surface host APIs must not route migrated reads/prompts through sourceCommand strings')
    assert.doesNotMatch(source, /daemonProjectSourceCommand\(ipcRenderer, ['"`](queryEntities|querySettings|queryAssets|readContentUnitGenerationPrompt|buildContentUnitBackendPrompt|loadContentWorkspaceSnapshot|loadContentWorkspace|syncContentWorkspace)['"`]/, 'Desktop preload must not route migrated reads/prompts through source command strings')
  }
  assert.match(desktopPreloadSource, /PROJECT_PROMPT_CONTEXT_ENDPOINT = ['"`]\/v1\/project\/prompt\/context['"`]/, 'Desktop preload prompt reads must use the typed Project prompt context endpoint')
  assert.match(localContentApi, /\/v1\/project\/prompt\/context/, 'local surface host prompt reads must use the typed Project prompt context endpoint')

  const remainingDesktopSourceCommands = [...desktopPreloadSource.matchAll(/daemonProjectSourceCommand\(ipcRenderer, ['"`]([^'"`]+)['"`]/g)].map(match => match[1]).sort()
  assert.deepEqual(remainingDesktopSourceCommands, [], 'Desktop preload must not keep generic Project source command calls')
  assert.doesNotMatch(desktopPreloadSource, /\bdaemonProjectSourceCommand\b/, 'Desktop preload must not keep a generic Project source command helper')
  assert.doesNotMatch(localContentApi, /\bsourceCommand\b/, 'local surface host content API must not keep a generic sourceCommand helper')
})

test('content candidate actions prefer typed Project Service APIs over command strings', () => {
  const projectTypes = read('packages/project/src/index.ts')
  const projectService = read('services/project-service/src/server.mjs')
  const projectServiceTests = read('services/project-service/tests/server.test.mjs')
  const pluginGateway = read('packages/local-daemon/src/index.ts')
  const desktopPreloadSource = read('apps/desktop/electron/preload/api/movscriptEngine.ts')
  const localContentApi = read('services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts')
  const domainRuntime = read('packages/core/src/mcp/node/tools/domain/runtime.ts')

  for (const endpoint of [
    ['PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT', '/v1/project/content-candidates/create'],
    ['PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT', '/v1/project/content-unit-candidates/select'],
    ['PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT', '/v1/project/content-unit-candidates/decide'],
  ]) {
    assert.match(projectTypes, new RegExp(`${endpoint[0]} = ['"\`]${endpoint[1].replace(/\//g, '\\/')}['"\`]`), `Project package must expose ${endpoint[0]}`)
    assert.match(pluginGateway, new RegExp(`\\['${endpoint[1].replace(/\//g, '\\/')}', '${endpoint[1].replace(/\//g, '\\/')}'\\]`), `daemon gateway must proxy ${endpoint[1]}`)
  }

  assert.match(projectService, /movscript\.project-content-candidate-create\.v1/, 'Project Service must expose typed content candidate create')
  assert.match(projectService, /movscript\.project-content-unit-candidate-select\.v1/, 'Project Service must expose typed content unit candidate select')
  assert.match(projectService, /movscript\.project-content-unit-candidate-decide\.v1/, 'Project Service must expose typed content unit candidate decide')
  assert.match(projectServiceTests, /movscript\.project-content-candidate-create\.v1/, 'Project Service tests must cover typed content candidate create')
  assert.match(desktopPreloadSource, /PROJECT_CONTENT_CANDIDATE_CREATE_ENDPOINT = ['"`]\/v1\/project\/content-candidates\/create['"`]/, 'Desktop preload must define typed content candidate create route')
  assert.match(localContentApi, /\/v1\/project\/content-candidates\/create/, 'local surface host content API must call typed content candidate create route')
  assert.match(domainRuntime, /PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT/, 'MCP\/domain runtime must use typed content candidate route constants')

  for (const source of [desktopPreloadSource, localContentApi, domainRuntime]) {
    assert.doesNotMatch(source, /candidateCommand\(['"`](createContentCandidate|selectContentUnitCandidate|decideContentUnitCandidate)['"`]/, 'content candidate actions must not use command-string helpers')
    assert.doesNotMatch(source, /PROJECT_CANDIDATE_COMMAND_ENDPOINT|PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT|\/v1\/project\/candidates\/command/, 'content candidate product callers must not target the generic candidate command endpoint')
  }
  assert.doesNotMatch(desktopPreloadSource, /\bdaemonProjectCandidateCommand\b/, 'Desktop preload must not keep a generic Project candidate command helper')
})

test('raw resource identity URL debt does not spread beyond resolver and legacy adapters', () => {
  const findings = scanRule({
    roots: [
      'apps/desktop/src/shared/ui',
      'packages/core/src/resources',
      'packages/core/src/shot-library',
      'packages/shot-library/src',
      'surface/resource/src',
      'surface/shot-library/src',
    ],
    patterns: [
      /\bresourceUrl\b/,
      /\bresource_url\b/,
      /\/api\/v1\/resources\/[^'")`]+\/file/,
    ],
    allowedFiles: [
      'apps/desktop/src/shared/ui/resourceFileUrl.ts',
      'packages/core/src/resources/index.ts',
      'packages/core/src/resources/resourceUrl.ts',
      'packages/core/src/shot-library/index.ts',
      'packages/shot-library/src/index.ts',
      'surface/resource/src/features/infrastructure/preview.ts',
      'surface/resource/src/resourceMediaBrowser.ts',
      'surface/resource/src/resourceMediaComponents.tsx',
      'surface/shot-library/src/features/domain/shotLibraryWorkspaceModel.ts',
    ],
  })

  assert.deepEqual(findings, [], `new raw resource URL identity debt:\n${findings.join('\n')}`)
})

test('raw resource file URL construction stays centralized', () => {
  const findings = scanRule({
    roots: [
      'apps/desktop/src/features/agent',
      'surface/canvas/src',
      'surface/project/src/features/content',
      'surface/resource/src',
    ],
    patterns: [
      /\/api\/v1\/resources\/\$\{/,
      /\/api\/v1\/resources\/['"`]\s*\+/,
    ],
    allowedFiles: [],
  })

  assert.deepEqual(findings, [], `raw resource file URLs must use shared helpers:\n${findings.join('\n')}`)
})

test('raw resource public identity has a typed ref boundary', () => {
  const resourcesUrl = read('packages/resources/src/resourceUrl.ts')
  const coreResourcesUrl = read('packages/core/src/resources/resourceUrl.ts')
  const contentGraphReferences = read('surface/project/src/features/content/domain/contentCanvasGraphReferences.ts')

  for (const [label, source] of [
    ['resources package', resourcesUrl],
    ['core resources', coreResourcesUrl],
  ]) {
    assert.match(source, /export interface RawResourceRef/, `${label} must define RawResourceRef`)
    assert.match(source, /kind: 'raw-resource'/, `${label} typed refs must include a stable kind discriminator`)
    assert.match(source, /resourceId: string/, `${label} typed refs must carry resourceId`)
    assert.match(source, /export function normalizeRawResourceRef/, `${label} must expose a normalizer for legacy resource identities`)
    assert.match(source, /isAbsoluteDisplayResourceUrl\(trimmed\)/, `${label} must not normalize display URLs as resource identity`)
    assert.match(source, /export function rawResourceId/, `${label} must expose a typed id reader for URL helpers`)
  }

  assert.match(contentGraphReferences, /normalizeRawResourceRef/, 'content canvas raw resource references must normalize through typed refs')
  assert.doesNotMatch(
    contentGraphReferences,
    /return normalizePromptEntityRef\(ref, 'resource'\)/,
    'content canvas must not keep free-form resource strings as the only identity normalization',
  )
})

test('workflow canvas storage preserves typed refs behind Canvas Service', () => {
  const canvasServiceTests = read('services/canvas-service/tests/server.test.mjs')

  assert.match(canvasServiceTests, /canvas_type: ['"`]workflow['"`]/, 'workflow canvas storage tests must use explicit workflow canvas type')
  assert.match(canvasServiceTests, /metadata: \{ canvasKind: ['"`]workflow['"`] \}/, 'workflow canvas storage tests must preserve workflow discriminator metadata')
  assert.match(canvasServiceTests, /ref: \{ kind: ['"`]raw-resource['"`], resourceId: ['"`]res_123['"`] \}/, 'workflow canvas storage tests must preserve typed raw resource refs')
})

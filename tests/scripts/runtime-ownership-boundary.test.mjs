import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('runtime architecture keeps the local daemon as the local owner', () => {
  const architecture = read('docs/movscript-agent-runtime-architecture.zh-CN.md')
  const supplement = read('docs/movscript-surface-runtime-supplement.zh-CN.md')

  assert.match(architecture, /per-user `movscript\.local-node` daemon/)
  assert.match(architecture, /Desktop App .*不是业务 sidecar owner/)
  assert.match(architecture, /Agent Plugin App .*不是和 Desktop 平级竞争 runtime 的应用/)
  assert.match(architecture, /不存在“Desktop 启动了 Project Service、Plugin 再补一个 Editing Service”/)

  assert.match(supplement, /Desktop 是本机可视化工作台/)
  assert.match(supplement, /本机 full runtime owner 是 per-user `movscript\.local-node` daemon/)
  assert.match(supplement, /Plugin 不接管一组独立 headless runtime/)
  assert.match(supplement, /多个 Agent 会话必须复用同一个 daemon/)
  assert.doesNotMatch(supplement, /Desktop App 的职责是本机 full runtime owner/)
  assert.doesNotMatch(architecture, /Desktop 是本机优先 runtime owner/)
  assert.doesNotMatch(architecture, /Desktop full runtime/)
  assert.doesNotMatch(architecture, /Desktop-owned `movscript\.media\.pipeline` endpoint/)
  assert.doesNotMatch(architecture, /Desktop-owned 模式/)
})

test('plugin full-local means ensure daemon then run a basic MCP session', () => {
  const source = read('apps/plugin/src/agent-mcp.ts')
  const startupManifest = read('apps/plugin/startup.manifest.ts')

  assert.match(source, /pluginDesktopCompatibilityStartupPolicy/)
  assert.match(startupManifest, /export const pluginDesktopCompatibilityStartupPolicy/)
  assert.match(startupManifest, /scenarioId: 'plugin-desktop-compatible'/)
  assert.doesNotMatch(startupManifest, /scenarioId: 'plugin-desktop-owned'/)
  assert.match(source, /requested === 'plugin-desktop-owned'/)
  assert.match(source, /requested === 'plugin-desktop-compatible'/)
  assert.match(source, /if \(startupPolicy\.scenarioId === pluginFullLocalStartupPolicy\.scenarioId\) {[\s\S]*await ensureLocalNode\(homeDir\)[\s\S]*return pluginBasicStartupPolicy[\s\S]*}/)
  assert.match(source, /entrypoint: AGENT_MCP_ENTRYPOINT/)
  assert.match(source, /runArgs: \['daemon', 'run'\]/)
  assert.match(startupManifest, /scenarioId: 'plugin-full-local'/)
  assert.match(startupManifest, /serviceName: 'movscript\.local-node\.control'[\s\S]*profile: 'local-daemon'/)
})

test('local-runtime requires one daemon-owned local service set', () => {
  const source = read('packages/local-runtime/src/index.ts')
  const localDaemonSource = read('packages/local-daemon/src/index.ts')
  const pluginSource = read('apps/plugin/src/agent-mcp.ts')

  for (const serviceName of [
    'movscript.local-node.control',
    'movscript.local-node.gateway',
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.canvas.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ]) {
    assert.match(source, new RegExp(`'${serviceName.replaceAll('.', '\\.')}'`))
  }

  assert.match(source, /const LOCAL_DATA_SERVICE = 'movscript\.data\.service'/)
  assert.match(source, /dataPlane === 'local'/)
  assert.match(source, /export async function runPersistentLocalRuntimeDaemon/)
  assert.match(source, /createScenarioApplicationRunner/)
  assert.match(source, /writeRuntimeAppRecord/)
  assert.match(localDaemonSource, /runPersistentLocalRuntimeDaemon\({/)
  assert.match(localDaemonSource, /export async function runLocalDaemonServicePlane/)
  assert.match(pluginSource, /runLocalDaemonServicePlane\({/)
  assert.doesNotMatch(pluginSource, /async function runPersistentLocalNode\(\): Promise<void> \{[\s\S]*createScenarioApplicationRunner/)
})

test('runtime status prefers daemon ownership and treats desktop ownership as legacy', () => {
  const source = read('packages/cli-commands/src/index.ts')
  const localDaemonIndex = source.indexOf("kind: 'local_daemon'")
  const desktopLegacyIndex = source.indexOf("kind: 'desktop_legacy_owner'")

  assert.notEqual(localDaemonIndex, -1, 'runtime status must report local_daemon ownership')
  assert.notEqual(desktopLegacyIndex, -1, 'runtime status must classify Desktop ownership as legacy')
  assert.ok(localDaemonIndex < desktopLegacyIndex, 'local daemon ownership must be preferred before Desktop legacy records')
  assert.equal(source.includes("kind: 'desktop_owned'"), false)
})

test('remotion studio startup delegates process ownership to visible shell surfaces', () => {
  const daemon = read('packages/local-daemon/src/index.ts')
  const desktopRuntime = read('apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx')
  const desktopRuntimeModel = read('apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntimeModel.ts')
  const localSurfaceRuntime = read('services/local-surface-host/src/project/localProjectSurfaceRuntime.ts')
  const shellIntegrationDoc = read('docs/shell-session-integration.zh-CN.md')
  const shellFrontendDoc = read('docs/shell-frontend-design.zh-CN.md')
  const remotionSessionEntry = daemon.match(/interface RemotionStudioSessionEntry \{[\s\S]*?\n\}/)?.[0] ?? ''
  const stopRemotionStudioSessionBlock = daemon.match(/function stopRemotionStudioSession\([\s\S]*?\n\}/)?.[0] ?? ''

  assert.doesNotMatch(daemon, /remotionStudioExternalShellRequested/, 'Remotion startup should always produce a Shell Intent instead of branching into daemon process ownership')
  assert.doesNotMatch(daemon, /const child = spawn\(command\[0\]!/, 'daemon must not spawn the Remotion Studio dev server')
  assert.ok(remotionSessionEntry, 'Remotion Studio session entry interface must be present')
  assert.ok(stopRemotionStudioSessionBlock, 'Remotion Studio stop function must be present')
  assert.doesNotMatch(remotionSessionEntry, /child\?: ChildProcess/, 'Remotion Studio session must not retain daemon-owned process handles')
  assert.doesNotMatch(remotionSessionEntry, /exitCode\?: number \| null|exit_code\?: number \| null/, 'Remotion Studio session must not retain daemon-owned process exit fields')
  assert.doesNotMatch(stopRemotionStudioSessionBlock, /session\.child/, 'Remotion Studio stop must only update session state; process stop belongs to the Shell Host')
  assert.doesNotMatch(daemon, /function failRemotionStudioSession/, 'Remotion Studio failure state must be derived from shell/readiness state, not daemon child process ownership')
  assert.match(daemon, /schema: 'movscript\.shell_intent\.v1'/)
  assert.match(daemon, /session\.status = 'needs_external_shell'/)
  assert.match(daemon, /session\.shellOwner = 'external_shell'/)
  assert.match(daemon, /已准备外部 Shell 命令/)
  assert.match(daemon, /function remotionStudioShellIntent\(session: RemotionStudioSessionEntry, command: string\[\]\): RemotionStudioShellIntent[\s\S]*intentId,[\s\S]*intent_id: intentId[\s\S]*ownerFeature: 'remotion_studio'[\s\S]*owner_feature: 'remotion_studio'[\s\S]*destructive: false/)
  assert.match(daemon, /function remotionStudioDependencyBlocker\(projectDirectory: string\): RemotionStudioSessionBlocker \| undefined[\s\S]*const shellIntent = remotionStudioInstallShellIntent\(projectDirectory, installCommand, message\)[\s\S]*shellIntent,[\s\S]*shell_intent: shellIntent/)
  assert.match(daemon, /function remotionStudioInstallShellIntent\(projectDirectory: string, command: string\[\], reason: string\): RemotionStudioShellIntent[\s\S]*schema: 'movscript\.shell_intent\.v1'[\s\S]*ownerFeature: 'remotion_studio'[\s\S]*destructive: false/)
  assert.match(daemon, /const port = await reservePort\(\)[\s\S]*const previewUrl = `http:\/\/127\.0\.0\.1:\$\{port\}`[\s\S]*const command = remotionStudioCommand\(input, projectDirectory!, entrypoint, port\)/)
  assert.match(daemon, /function appendRemotionStudioRuntimeFlags\(command: string\[\], port: number\)[\s\S]*next\.push\('--port', String\(port\)\)/)
  assert.match(daemon, /if \(existing && !forceRestart\) \{[\s\S]*await probeRemotionStudioReadiness\(existing\)[\s\S]*return existing[\s\S]*\}/)
  assert.match(daemon, /async function probeRemotionStudioReadiness\(session: RemotionStudioSessionEntry\): Promise<boolean>/)
  assert.doesNotMatch(daemon, /REMOTION_STUDIO_READY_TIMEOUT/)
  assert.match(shellIntegrationDoc, /DesktopShellHost API/)
  assert.match(shellIntegrationDoc, /createDesktopShellHostSession\(input\)/)
  assert.match(shellIntegrationDoc, /runDesktopShellHostCommand\(input\)/)
  assert.match(shellIntegrationDoc, /在 Shell 打开/)
  assert.match(shellFrontendDoc, /状态：实施标准/)
  assert.match(shellFrontendDoc, /Shell Workbench 默认隐藏/)
  for (const source of [shellIntegrationDoc, shellFrontendDoc]) {
    assert.doesNotMatch(source, /legacy wrapper/)
    assert.doesNotMatch(source, /terminal:create/)
    assert.doesNotMatch(source, /在 Terminal 打开/)
  }
  for (const source of [daemon, desktopRuntime, localSurfaceRuntime]) {
    assert.doesNotMatch(source, /60550/, 'Remotion Studio startup must not hard-code the old fixed preview port')
  }

  assert.match(desktopRuntime, /executionOwner: 'external_shell'/)
  assert.match(desktopRuntime, /status === 'starting' \|\| status === 'needs_external_shell'/)
  assert.match(desktopRuntime, /desktopRemotionStudioSessionWithShell/)
  assert.match(desktopRuntime, /from '\.\/desktopProjectSurfaceRuntimeModel'/)
  assert.match(desktopRuntimeModel, /status === 'needs_external_shell' \? \{ status: 'starting' \} : \{\}/)
  assert.match(desktopRuntimeModel, /function remotionStudioShellFinishedBeforeReady\([\s\S]*shellStatus === 'exited' \|\| shellStatus === 'failed'/)
  assert.match(desktopRuntime, /shellGateway\.run\(\{[\s\S]*title: 'Remotion Studio'[\s\S]*scope: 'workspace'/)
  assert.match(desktopRuntime, /shellGateway\.run\(\{[\s\S]*title: 'Remotion Studio'[\s\S]*reveal: 'silent'/)
  assert.match(desktopRuntime, /desktopRemotionStudioShellSessions/)
  assert.match(desktopRuntime, /desktopRemotionStudioShellStartPromises/)
  assert.match(desktopRuntime, /desktopRemotionStudioShellWorkspaceKey/)
  assert.match(desktopRuntimeModel, /export function desktopRemotionStudioShellWorkspaceKey/)
  assert.match(desktopRuntime, /const shellBindingKeys = desktopRemotionStudioShellBindingKeys\(sessionId, workspaceShellKey\)/)
  assert.match(desktopRuntime, /const pendingShellBinding = !forceRestart[\s\S]*firstDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellStartPromises, shellBindingKeys\)/)
  assert.match(desktopRuntime, /setDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellStartPromises, shellBindingKeys, shellBindingPromise\)/)
  assert.match(desktopRuntime, /finally\(\(\) => deleteDesktopRemotionStudioShellMapKeys\(desktopRemotionStudioShellStartPromises, shellBindingKeys\)\)/)
  assert.match(desktopRuntime, /if \(sessionId\) desktopRemotionStudioShellStartPromises\.delete\(sessionId\)/)
  assert.doesNotMatch(desktopRuntime, /REMOTION_STUDIO_PORT_RETRY_LIMIT/)
  assert.doesNotMatch(desktopRuntime, /desktopRemotionStudioPortRetryCounts/)
  assert.doesNotMatch(desktopRuntime, /retryCount < REMOTION_STUDIO_PORT_RETRY_LIMIT/)
  assert.doesNotMatch(desktopRuntime, /function remotionStudioRestartInputFromSession/)

  assert.match(localSurfaceRuntime, /executionOwner: 'external_shell'/)
  assert.match(localSurfaceRuntime, /capabilities: \{[\s\S]*shell: false/, 'Local Surface Host must expose Shell Intent only, not a Shell Host capability')
  assert.doesNotMatch(localSurfaceRuntime, /shell:\s*shellGateway/, 'Local Surface Host must not wire a Desktop Shell gateway')
  assert.match(localSurfaceRuntime, /postRemotionStudioSessionOperation = async <T = unknown>/)
  assert.match(localSurfaceRuntime, /postRemotionStudioSessionOperation<ProjectSurfaceRemotionStudioSession>\(REMOTION_STUDIO_SESSION_OPEN_ENDPOINT/)
  assert.match(localSurfaceRuntime, /postRemotionStudioSessionOperation<ProjectSurfaceRemotionStudioSessionLogs>\(REMOTION_STUDIO_SESSION_LOGS_ENDPOINT/)
  assert.doesNotMatch(localSurfaceRuntime, /spawn\(/)
})

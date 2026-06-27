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
  assert.match(source, /runArgs: \['__movscript_local_node', 'run'\]/)
  assert.match(startupManifest, /scenarioId: 'plugin-full-local'/)
  assert.match(startupManifest, /serviceName: 'movscript\.local-node\.control'[\s\S]*profile: 'local-daemon'/)
})

test('local-runtime requires one daemon-owned local service set', () => {
  const source = read('packages/local-runtime/src/index.ts')

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
})

test('runtime status prefers daemon ownership and treats desktop ownership as legacy', () => {
  const source = read('packages/mcp-host/src/stdio.ts')
  const localDaemonIndex = source.indexOf("kind: 'local_daemon'")
  const desktopLegacyIndex = source.indexOf("kind: 'desktop_legacy_owner'")

  assert.notEqual(localDaemonIndex, -1, 'runtime status must report local_daemon ownership')
  assert.notEqual(desktopLegacyIndex, -1, 'runtime status must classify Desktop ownership as legacy')
  assert.ok(localDaemonIndex < desktopLegacyIndex, 'local daemon ownership must be preferred before Desktop legacy records')
  assert.equal(source.includes("kind: 'desktop_owned'"), false)
})

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('GitHub release publishes Agent Plugin and Desktop as the two public product tracks', () => {
  const releaseWorkflow = read('.github/workflows/release.yml')
  const releaseNotes = read('.github/release-workspace-notes.md')
  const scriptsReadme = read('scripts/README.md')

  assert.match(releaseWorkflow, /package-plugin:/)
  assert.match(releaseWorkflow, /name: Package Agent Plugin/)
  assert.match(releaseWorkflow, /pnpm run release -- package --app plugin/)
  assert.match(releaseWorkflow, /name: movscript-agent-plugin/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-macos-arm64/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-macos-x64/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-windows-x64/)
  assert.match(releaseWorkflow, /needs: \[package, package-plugin\]/)

  assert.match(releaseNotes, /Movscript Agent Plugin And Desktop/)
  assert.match(releaseNotes, /Movscript Agent Plugin/)
  assert.match(releaseNotes, /Movscript Desktop/)
  assert.match(releaseNotes, /movscript-agent-plugin/)
  assert.match(releaseNotes, /movscript\.local-node` daemon/)
  assert.match(releaseNotes, /not a third public download choice/)

  assert.match(scriptsReadme, /Agent Plugin only/)
  assert.match(scriptsReadme, /Desktop App/)
  assert.match(scriptsReadme, /not a third public release track/)
})

test('GitHub Pages install surface keeps plugin-only and Desktop paths separate', () => {
  const installDoc = read('docs/install.md')
  const pagesWorkflow = read('.github/workflows/pages.yml')
  const page = read('site/index.html')

  assert.match(installDoc, /Movscript publishes two app releases/)
  assert.match(installDoc, /Agent Plugin only/)
  assert.match(installDoc, /Desktop App/)
  assert.match(installDoc, /install-plugin\.sh/)
  assert.match(installDoc, /install-desktop\.sh/)
  assert.match(installDoc, /plugin installer .* does not install or launch the Desktop app/s)

  assert.match(pagesWorkflow, /cp install-desktop\.sh public\/install-desktop\.sh/)
  assert.match(pagesWorkflow, /cp install-plugin\.sh public\/install-plugin\.sh/)

  assert.match(page, /Agent plugin only/)
  assert.match(page, /Desktop app/)
  assert.match(page, /data-release-asset="plugin"/)
  assert.match(page, /data-release-asset="macos-arm64"/)
  assert.match(page, /data-release-asset="macos-x64"/)
  assert.match(page, /data-release-asset="windows-x64"/)
  assert.match(page, /Desktop reuses the same local runtime daemon/)
  assert.match(page, /Desktop 与 Agent 插件和 CLI 复用同一个本机 runtime daemon/)
  assert.doesNotMatch(page, /Desktop[^<。]*owner/)
})

test('CLI package exposes movscript as the product command and movcli as the legacy shim', () => {
  const cliPackage = JSON.parse(read('apps/cli/package.json'))
  const cliIndex = read('apps/cli/src/index.ts')
  const movscriptBin = read('apps/cli/bin/movscript')
  const movscriptMjs = read('apps/cli/bin/movscript.mjs')

  assert.equal(cliPackage.bin.movscript, './bin/movscript')
  assert.equal(cliPackage.bin.movcli, './bin/movcli')
  assert.match(cliIndex, /registerDaemonCommands\(program\)/)
  assert.match(cliIndex, /registerContextCommands\(program\)/)
  assert.match(cliIndex, /registerEditingCommands\(program\)/)
  assert.match(cliIndex, /movscript\.mjs/)
  assert.match(movscriptBin, /ENTRY="\$SCRIPT_DIR\/movscript\.mjs"/)
  assert.match(movscriptMjs, /movscript has not been built yet/)
})

test('shared CLI/MCP command manifest exposes product contract metadata', () => {
  const cliCommands = read('packages/cli-commands/src/index.ts')
  const localDaemonMCP = read('packages/local-daemon/src/mcp.ts')
  const localDaemonPackage = JSON.parse(read('packages/local-daemon/package.json'))
  const mcpHostStdio = read('packages/mcp-host/src/stdio.ts')
  const mcpHostPackage = JSON.parse(read('packages/mcp-host/package.json'))
  const plan = read('docs/skill-mcp-daemon-refactor-target.zh-CN.md')

  for (const required of [
    'export interface MovScriptCommandContract',
    'ownerService: string',
    'requiredRuntime: string[]',
    'permissions: string[]',
    'outputSchema: JSONSchemaObject',
    'examples: MovScriptCommandExample[]',
    'function withCommandContract',
    'function commandExecutionContract',
  ]) {
    assert.match(cliCommands, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(cliCommands, /contract: commandExecutionContract\(spec\)/, 'command execution result must carry the shared product contract')
  assert.match(cliCommands, /export const runtimeCommandSpecs/, 'runtime bootstrap/control must be part of the shared command manifest')
  assert.match(cliCommands, /export const contextCommandSpecs/, 'context/session hints must be part of the shared command manifest')
  assert.match(cliCommands, /export const editingCommandSpecs/, 'editing backend diagnostics must be part of the shared command manifest')
  assert.match(cliCommands, /export async function runMovScriptRuntimeCommand/, 'runtime CLI/MCP calls must share the command runner')
  assert.match(cliCommands, /export async function runMovScriptContextCommand/, 'context CLI/MCP calls must share the command runner')
  assert.match(cliCommands, /export async function runMovScriptEditingCommand/, 'editing CLI/MCP calls must share the command runner')
  assert.match(cliCommands, /export function isRuntimeMCPToolName/, 'daemon MCP executor must be able to route runtime tools through the shared manifest')
  assert.match(cliCommands, /export function isContextMCPToolName/, 'daemon MCP executor must be able to route context tools through the shared manifest')
  assert.match(cliCommands, /export function isEditingMCPToolName/, 'daemon MCP executor must be able to route editing tools through the shared manifest')
  assert.match(localDaemonMCP, /export async function handleDaemonMCPJSONRPC/, 'daemon must own the MCP JSON-RPC executor')
  assert.match(localDaemonMCP, /outputSchema: tool\.outputSchema/, 'daemon MCP tool adapter must expose command output schema')
  assert.match(localDaemonMCP, /runMovScriptRuntimeCommand\(name!, args\)/, 'daemon MCP runtime tools must call the shared runtime command runner')
  assert.match(localDaemonMCP, /runMovScriptContextCommand\(name!, args\)/, 'daemon MCP context tools must call the shared context command runner')
  assert.match(localDaemonMCP, /runMovScriptEditingCommand\(name!, args\)/, 'daemon MCP editing tools must call the shared editing command runner')
  assert.match(localDaemonMCP, /export const daemonMCPRuntimeBootstrapToolNames = new Set\(runtimeTools\.map/, 'daemon MCP bootstrap allowlist must come from runtimeCommandSpecs')
  assert.match(mcpHostStdio, /handleDaemonMCPJSONRPC\(req/, 'MCP host local fallback must delegate to daemon MCP executor')
  assert.match(mcpHostStdio, /daemonMCPRuntimeBootstrapToolNames/, 'MCP host bootstrap proxy allowlist must come from daemon MCP runtime tools')
  assert.doesNotMatch(mcpHostStdio, /runMovScriptRuntimeCommand/, 'MCP host must not call command runners directly')
  assert.doesNotMatch(mcpHostStdio, /\bcallTool\(/, 'MCP host must not own direct core tool execution')
  assert.doesNotMatch(mcpHostStdio, /if \(name === 'runtime_daemon_/, 'MCP host must not keep direct runtime fallback branches')
  assert.doesNotMatch(mcpHostStdio, /function runtimeReadinessSchema/, 'MCP host must not keep copied runtime schemas')
  assert.doesNotMatch(mcpHostStdio, /ensureLocalRuntimeDaemon/, 'MCP host must not own daemon startup implementation directly')
  assert.equal(localDaemonPackage.dependencies['@movscript/mcp-host'], undefined, 'local-daemon must not depend on mcp-host')
  assert.equal(localDaemonPackage.dependencies['@movscript/cli-commands'], 'workspace:*', 'local-daemon MCP executor must depend on shared CLI commands')
  assert.equal(mcpHostPackage.dependencies['@movscript/local-daemon'], 'workspace:*', 'mcp-host must depend on daemon MCP executor instead of owning it')
  assert.match(plan, /已落地：`packages\/cli-commands` 的每个稳定 command spec 已包含/, 'Skill/MCP plan must record the explicit command contract landing')
  assert.match(plan, /`context_current_get` 已进入 `packages\/cli-commands` 的 `contextCommandSpecs`/, 'Skill/MCP plan must record context CLI-backed migration')
  assert.match(plan, /`editing_runtime_capabilities_get` 进入 `packages\/cli-commands` 的 `editingCommandSpecs`/, 'Skill/MCP plan must record editing CLI-backed migration')
  assert.match(plan, /`editing_timeline_apply_commands`、`editing_timeline_add_track`/, 'Skill/MCP plan must record editing timeline mutation CLI-backed migration')
  assert.match(plan, /`editing_task_get`、`editing_task_cancel`、`editing_task_logs_get`/, 'Skill/MCP plan must record editing task observe/control CLI-backed migration')
  assert.match(plan, /`editing_video_compose`、`editing_task_render_create`、`editing_task_hls_create`、`editing_task_transcode_create`、`editing_task_reframe_create`/, 'Skill/MCP plan must record editing task create CLI-backed migration')
  assert.match(plan, /`editing_project_create`、`editing_project_create_from_edit_plan`、`editing_project_get`/, 'Skill/MCP plan must record editing project lifecycle CLI-backed migration')
  assert.match(plan, /`editing_project_create_from_edit_decisions` 进入同一 command manifest/, 'Skill/MCP plan must record edit-decision project creation CLI-backed migration')
  assert.match(plan, /runtime bootstrap\/control 命令已纳入同一显式 command contract/, 'Skill/MCP plan must record runtime command contract landing')
  assert.match(plan, /`mcp-host` 已降级为 stdio\/http 协议适配器/, 'Skill/MCP plan must record mcp-host adapter downgrade')
  assert.match(plan, /MCP registry\/executor 已上移到 `packages\/local-daemon\/src\/mcp\.ts`/, 'Skill/MCP plan must record daemon-owned MCP executor landing')
})

test('MovScript plugin skills explain production contract, systems, blockers, review, and output', () => {
  const skillRoot = resolve(root, 'apps/plugin/skills')
  const skillNames = readdirSync(skillRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(skillNames, [
    'admin',
    'domain',
    'editing',
    'generation',
    'planning',
    'project',
    'review',
    'runtime',
    'timeline',
    'workspace',
  ])

  for (const skillName of skillNames) {
    const source = read(`apps/plugin/skills/${skillName}/SKILL.md`)
    assert.match(source, /## Production Contract/, `${skillName} must have a production contract section`)
    for (const required of [
      'Production step:',
      'Systems/config:',
      'Blockers:',
      'Human review:',
      'Output:',
    ]) {
      assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${skillName} production contract must include ${required}`)
    }
    assert.match(source, /runtime|daemon|Project Service|Data Service|Editing Service|Media Pipeline|Admin Service/i, `${skillName} must name the relevant system/runtime dependency`)
  }
})

test('MovScript creative skills describe MCP host only as a thin adapter', () => {
  for (const skillName of ['domain', 'generation', 'planning', 'review', 'timeline', 'editing', 'project', 'workspace']) {
    const source = read(`apps/plugin/skills/${skillName}/SKILL.md`)
    assert.doesNotMatch(source, /MCP host may run/i, `${skillName} must not describe MCP host as a runtime mode`)
    assert.doesNotMatch(source, /MCP host must be running/i, `${skillName} must not make MCP host the business prerequisite`)
    assert.doesNotMatch(source, /MCP host .*Project Service|MCP host .*Data Service|MCP host .*Editing Service|MCP host .*Media Pipeline/i, `${skillName} must not imply MCP host owns business services`)
  }

  const domain = read('apps/plugin/skills/domain/SKILL.md')
  const generation = read('apps/plugin/skills/generation/SKILL.md')
  assert.match(domain, /thin adapter over the daemon MCP endpoint or a cloud\/external runtime gateway/)
  assert.match(generation, /daemon MCP endpoint or a cloud\/external runtime gateway/)
})

test('Desktop package staging uses pnpm 10 injected deploy without legacy mode', () => {
  const releaseWorkflow = read('scripts/release/release-workflow.mjs')

  assert.match(
    releaseWorkflow,
    /spawn\(pnpm, \[\s*'--config\.inject-workspace-packages=true',\s*'--filter',\s*'@movscript\/desktop',\s*'deploy',\s*'--prod',\s*stageDir\s*\]/,
  )
  assert.doesNotMatch(releaseWorkflow, /'deploy',\s*'--legacy'/)
})

test('Local macOS DMG packaged app smoke is opt-in', () => {
  const localDmgPackage = read('scripts/release/package-macos-local-dmg.mjs')

  assert.match(localDmgPackage, /const smokeRequested = args\.includes\('--smoke'\) \|\| env\.MOVSCRIPT_PACKAGE_MAC_DMG_SMOKE\?\.trim\(\) === '1'/)
  assert.match(localDmgPackage, /const runSmoke = smokeRequested && !args\.includes\('--skip-smoke'\)/)
  assert.match(localDmgPackage, /Smoke test skipped by default; pass --smoke or set MOVSCRIPT_PACKAGE_MAC_DMG_SMOKE=1 to run it/)
  assert.doesNotMatch(localDmgPackage, /if \(!skipSmoke\)/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuntimeContext } from '../../catalog/registry/shared/types.js'
import { loadAgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { resolveConfigFile } from '../../configFiles/resolution/resolveConfigFile.js'
import { composePrompt } from './promptComposer.js'

test('active config file prompt composition covers runtime rules and triggered Skills', () => {
  const catalog = loadAgentPluginCatalog()
  const { configFile, warnings } = resolveConfigFile(catalog.layeredRegistry)
  assert.deepEqual(warnings, [])
  assert.equal(configFile.id, 'movscript.config_file.base')

  const skills = [
    catalog.layeredRegistry.skills.get('core.base.default'),
    catalog.layeredRegistry.skills.get('core.rules.runtime'),
    catalog.layeredRegistry.skills.get('movscript.project_standards_workspace'),
    catalog.layeredRegistry.skills.get('kernel.workspace_first'),
  ].flatMap((skill) => skill ? [skill] : [])

  const ctx: RuntimeContext = {
    configFile,
    message: '请帮我做项目规范工作区workspace',
    intents: ['project_standards_workspace'],
    uiContext: { route: '/project-workspace', projectId: 1 },
    conversation: { turnCount: 0, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    skills,
  })

  assert.match(prompt.systemPrompt, /Project Standards Workspace/)
  assert.match(prompt.systemPrompt, /Workspace First/)
  assert.match(prompt.systemPrompt, /movscript_script_locate/)
  assert.match(prompt.systemPrompt, /项目规范必须基于剧本题材/)
  assert.match(prompt.systemPrompt, /定义 agent 对自身运行能力的稳定认知/)
  assert.match(prompt.systemPrompt, /能力发现、上下文读取、记忆、用户输入、catalog、审批状态和 runtime works/)
  assert.match(prompt.systemPrompt, /当前配置文件、active skills、可见工具和工具 schema 是本轮能力边界/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{schema:/)
  assert.ok(prompt.parts.some((part) => part.id === 'core.rules.runtime'))
  assert.equal(prompt.parts.some((part) => part.id === 'workspace.rules.lifecycle'), false)
  assert.ok(prompt.parts.some((part) => part.id === 'movscript.project_standards_workspace'))
})

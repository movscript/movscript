import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuntimeContext } from '../../catalog/registry/shared/types.js'
import { loadAgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { resolveConfigFile } from '../../configFiles/resolution/resolveConfigFile.js'
import { compileSkillInstructions } from './skillInstructionCompiler.js'

test('compileSkillInstructions renders active runtime rules and triggered skill templates', () => {
  const catalog = loadAgentPluginCatalog()
  const { configFile, warnings } = resolveConfigFile(catalog.layeredRegistry)
  configFile.limits = { ...configFile.limits, systemPromptCharLimit: 100_000 }
  assert.deepEqual(warnings, [])
  assert.equal(configFile.id, 'movscript.config_file.base')

  const skills = [
    catalog.layeredRegistry.skills.get('core.base.default'),
    catalog.layeredRegistry.skills.get('core.rules.runtime'),
  ].flatMap((skill) => skill ? [skill] : [])

  const ctx: RuntimeContext = {
    configFile,
    message: '请帮我做项目规范工作区workspace',
    intents: ['project_standards_workspace'],
    uiContext: { route: '/project-workspace', projectId: 1 },
    conversation: { turnCount: 0, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const compiled = compileSkillInstructions({
    registry: catalog.layeredRegistry,
    ctx,
    skills,
  })

  assert.match(compiled.instructionText, /定义 agent 对自身运行能力的稳定认知/)
  assert.match(compiled.instructionText, /能力发现、上下文读取、记忆、用户输入、catalog、审批状态和 runtime works/)
  assert.match(compiled.instructionText, /当前配置文件、active skills、可见工具和工具 schema 是本轮能力边界/)
  assert.doesNotMatch(compiled.instructionText, /\{\{schema:/)
  assert.doesNotMatch(compiled.instructionText, /\{\{tool:/)
  assert.ok(compiled.parts.some((part) => part.id === 'core.rules.runtime'))
  assert.ok(compiled.parts.some((part) => part.id === 'core.base.default'))
})

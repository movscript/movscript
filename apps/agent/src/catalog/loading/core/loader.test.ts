import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { installAgentCatalogPack, resolveAgentCatalogPackStoreDirs } from '@movscript/agent-runtime'
import { loadAgentPluginCatalog, resolveDefaultCodexSkillRoots } from './loader.js'

test('loads target-state tool catalog but only enabled packs grant runtime access', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-plugins-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'configFiles')

  try {
    writePluginFile(skillsDir, 'writer.skill.json', {
      id: 'studio.writer',
      name: 'Writer',
      description: 'Writes scene workspaces',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolGrants: ['studio.script_outline'],
      contextBudget: { maxChars: 2500, reserveRatio: 0.25, strategy: 'fixed' },
      instructionTemplate: 'Write in short scene beats.',
    })
    writePluginFile(toolsDir, 'outline.tool.json', {
      name: 'studio.script_outline',
      description: 'Create a script outline workspace.',
      permission: 'workspace.write',
      risk: 'workspace',
      source: 'plugin',
      pluginId: 'test.writer',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
        },
      },
      projectScoped: true,
      defaults: { grant: 'allow', approval: 'never' },
      execution: {
        readOnly: true,
        destructive: false,
        concurrencySafe: true,
        interruptBehavior: 'cancel',
        maxResultSizeChars: 4096,
        resultRefStrategy: 'summary_ref',
      },
    })
    writePluginFile(packsDir, 'studio.pack.json', {
      id: 'studio.pack.writer',
      name: 'Studio Writer',
      source: 'plugin',
      resources: {
        skills: ['writer.skill.json'],
        tools: ['outline.tool.json'],
      },
      schemas: [],
      tools: ['studio.script_outline'],
      skills: ['studio.writer'],
    })
    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      configFilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinConfigFilesDir: configFilesDir,
    })

    assert.equal(catalog.skillsDir, skillsDir)
    assert.equal(catalog.toolsDir, toolsDir)
    const writerSkill = catalog.layeredSkills.find((skill) => skill.id === 'studio.writer')
    const outlineTool = catalog.layeredTools.find((tool) => tool.name === 'studio.script_outline')
    assert.ok(writerSkill)
    assert.equal(writerSkill?.source, 'plugin')
    assert.deepEqual(writerSkill?.contextBudget, { maxChars: 2500, reserveRatio: 0.25, strategy: 'fixed' })
    assert.equal(outlineTool?.name, 'studio.script_outline')
    assert.equal(outlineTool?.source, 'plugin')
    assert.deepEqual(outlineTool?.inputSchema, {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
      },
    })
    assert.deepEqual(outlineTool?.execution, {
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      interruptBehavior: 'cancel',
      maxResultSizeChars: 4096,
      resultRefStrategy: 'summary_ref',
    })
    assert.deepEqual(catalog.registry.get('studio.script_outline')?.execution, outlineTool?.execution)
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'), false)
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('enabled pack registration activates file-loaded skills and tools without configFile duplication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-enabled-pack-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'configFiles')

  try {
    writePluginFile(skillsDir, 'writer.skill.json', {
      id: 'studio.writer',
      name: 'Writer',
      description: 'Writes scene workspaces',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolGrants: ['studio.script_outline'],
      instructionTemplate: 'Write in short scene beats.',
    })
    writePluginFile(toolsDir, 'outline.tool.json', {
      name: 'studio.script_outline',
      description: 'Create a script outline workspace.',
      permission: 'workspace.write',
      risk: 'workspace',
      source: 'plugin',
      pluginId: 'test.writer',
      inputSchema: { type: 'object', properties: {} },
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writePluginFile(packsDir, 'studio.pack.json', {
      id: 'studio.pack.writer',
      name: 'Studio Writer',
      source: 'plugin',
      resources: {
        skills: ['writer.skill.json'],
        tools: ['outline.tool.json'],
      },
      schemas: [],
      tools: ['studio.script_outline'],
      skills: ['studio.writer'],
    })
    writePluginFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base',
      enabledPackIds: ['studio.pack.writer'],
      skillIds: [],
      approvalDefaults: { workspace: 'on_write' },
      toolGrants: [],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      configFilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinConfigFilesDir: configFilesDir,
    })
    const configFile = catalog.configFiles.find((item) => item.id === 'movscript.config_file.base')

    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'studio.writer'))
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(configFile?.skillIds, ['studio.writer'])
    assert.deepEqual(configFile?.approvalDefaults, { workspace: 'on_write' })
    assert.deepEqual(configFile?.toolGrants, [{ name: 'studio.script_outline', mode: 'allow', approval: 'on_write' }])
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'))
    assert.deepEqual(catalog.catalogIssues, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads built-in generic platform catalog by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-empty-'))
  try {
    const catalog = loadTestAgentPluginCatalog({
      packsDir: join(dir, 'packs'),
      configFilesDir: join(dir, 'configFiles'),
    })

    assert.ok(catalog.builtinSkillsDir.endsWith(join('catalog', 'skills')))
    assert.ok(catalog.builtinToolsDir.endsWith(join('catalog', 'tools')))
    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'workspace.rules.lifecycle'), false)
    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'workspace.lifecycle_support'), false)
    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'core.base.default'))
    assert.ok(catalog.packs.some((pack) => pack.id === 'core.pack.agent'))
    assert.equal(catalog.packs.some((pack) => pack.id === 'workspace.pack.lifecycle'), false)
    assert.equal(catalog.packs.some((pack) => pack.id === 'movscript.pack.workspace'), false)
    assert.ok(catalog.configFiles.some((configFile) => configFile.id === 'movscript.config_file.base'))
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'generation_model_list'))
    assert.equal(catalog.layeredTools.some((tool) => tool.name === 'get_workspace_model'), false)
    assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_open'), false)
    assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_validate'), false)
    assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_apply'), false)
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'core_video_extract_frames'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'core_video_extract_frames'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'generation_model_list'))
    assert.equal(catalog.registry.get('workspace_open'), undefined)
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'workspace_open'), false)
    assert.equal(catalog.registry.get('movscript_project_create'), undefined)
    assert.equal(catalog.registry.get('movscript_focus_get'), undefined)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('does not load MovScript business or workspace lifecycle catalogs by default', () => {
  const catalog = loadTestAgentPluginCatalog()

  const movscriptPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.workspace')
  const workspacePack = catalog.packs.find((pack) => pack.id === 'workspace.pack.lifecycle')

  assert.equal(movscriptPack, undefined)
  assert.equal(workspacePack, undefined)
  assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'movscript.content_unit_workspace'), false)
  assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'workspace.lifecycle_support'), false)
  assert.equal(catalog.layeredTools.some((tool) => tool.name === 'get_workspace_model'), false)
  assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_open'), false)
  assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_validate'), false)
  assert.equal(catalog.layeredTools.some((tool) => tool.name === 'workspace_apply'), false)
  assert.equal(catalog.registry.get('movscript_upsert_workspace_node'), undefined)
  assert.equal(catalog.registry.get('movscript_update_workspace_node'), undefined)
  assert.deepEqual(catalog.warnings, [])
})

test('pack loading ignores unreferenced local catalog files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-categorized-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')

  try {
    writePluginFile(join(skillsDir, 'production'), 'workspace.json', {
      skills: [{
        id: 'studio.production_workspace',
        name: 'Production Workspace',
        description: 'Workspace production workspaces',
        category: 'production_workspace',
        enabled: true,
        instruction: 'Workspace production workspace nodes.',
      }],
    })
    writePluginFile(join(toolsDir, 'production'), 'workspace.tool.json', {
      name: 'studio.read_production',
      description: 'Read production context.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.production',
      inputSchema: {},
      projectScoped: true,
      defaults: { grant: 'allow', approval: 'never' },
    })
    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
    })
    const skill = catalog.layeredSkills.find((item) => item.id === 'studio.production_workspace')
    const tool = catalog.layeredTools.find((item) => item.name === 'studio.read_production')

    assert.equal(skill, undefined)
    assert.equal(tool, undefined)
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'studio.read_production'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads skills and tools only from pack-declared resource paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-resource-paths-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'configFiles')

  try {
    writePluginFile(join(skillsDir, 'included'), 'writer.skill.json', {
      id: 'studio.included',
      name: 'Included',
      description: 'Included by pack resources.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolGrants: ['studio.included_tool'],
      instructionTemplate: 'Included task.',
    })
    writePluginFile(join(skillsDir, 'ignored'), 'ignored.skill.json', {
      id: 'studio.ignored',
      name: 'Ignored',
      description: 'Not included by pack resources.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolGrants: ['studio.ignored_tool'],
      instructionTemplate: 'Ignored task.',
    })
    writePluginFile(join(toolsDir, 'included'), 'included.tool.json', {
      name: 'studio.included_tool',
      description: 'Included tool.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.included',
      inputSchema: { type: 'object', properties: {} },
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writePluginFile(join(toolsDir, 'ignored'), 'ignored.tool.json', {
      name: 'studio.ignored_tool',
      description: 'Ignored tool.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.ignored',
      inputSchema: { type: 'object', properties: {} },
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writePluginFile(packsDir, 'studio.pack.json', {
      id: 'studio.pack.included',
      name: 'Included Pack',
      source: 'plugin',
      resources: {
        skills: ['included'],
        tools: ['included'],
      },
      schemas: [],
      tools: ['studio.included_tool'],
      skills: ['studio.included'],
    })
    writePluginFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base',
      enabledPackIds: ['studio.pack.included'],
    skillIds: [],
      toolGrants: [],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      configFilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinConfigFilesDir: configFilesDir,
    })

    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'studio.included'))
    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'studio.ignored'), false)
    assert.ok(catalog.registry.get('studio.included_tool'))
    assert.equal(catalog.registry.get('studio.ignored_tool'), undefined)
    assert.equal(catalog.resourcePaths.skills['studio.included']?.endsWith(join('included', 'writer.skill.json')), true)
    assert.equal(catalog.resourcePaths.skills['studio.ignored'], undefined)
    assert.equal(catalog.catalogIssues.some((issue) => issue.resourceId === 'studio.pack.included'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads native layered skill instructions from pack-declared markdown files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-md-skill-'))
  const skillsDir = join(dir, 'skills')
  const packsDir = join(dir, 'packs')

  try {
    writePluginFile(skillsDir, 'review.skill.json', {
      id: 'studio.review',
      version: '1.0.0',
      name: 'Review Task',
      description: 'Review from Markdown.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolGrants: [],
      instructionTemplatePath: 'review.instruction.md',
    })
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, 'review.instruction.md'), 'Review from a Markdown instruction body.\n', 'utf8')
    writePluginFile(packsDir, 'review.pack.json', {
      id: 'studio.pack.review',
      name: 'Review Pack',
      source: 'plugin',
      resources: {
        skills: ['review.skill.json'],
      },
      schemas: [],
      tools: [],
      skills: ['studio.review'],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: skillsDir,
      packsDir,
      builtinPacksDir: packsDir,
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'tools'),
    })
    const skill = catalog.layeredRegistry.skills.get('studio.review')

    assert.ok(skill)
    assert.equal(skill?.instructionTemplate, 'Review from a Markdown instruction body.')
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads Codex-style SKILL.md resources declared by packs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-codex-skill-'))
  const skillsDir = join(dir, 'skills')
  const packsDir = join(dir, 'packs')

  try {
    const skillDir = join(skillsDir, 'directors', 'jiangwen')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), `---
id: studio.director.jiangwen
name: 姜文风格导演
description: 当用户需要姜文式黑色幽默、强人物张力和强节奏对白时使用。
tags: [director, style]
aliases: [姜文, 让子弹飞]
useWhen:
  - 姜文风格
  - 黑色幽默
load: on_demand
scope: run
conflicts: [studio.director.marvel]
---

# 姜文风格导演

保持荒诞现实主义、对白压迫感和强人物博弈。
`, 'utf8')
    writePluginFile(packsDir, 'director.pack.json', {
      id: 'studio.pack.directors',
      name: 'Director Skills',
      source: 'plugin',
      resources: {
        skills: ['directors/jiangwen'],
      },
      schemas: [],
      tools: [],
      skills: ['studio.director.jiangwen'],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: join(dir, 'builtin-skills'),
      packsDir,
      builtinPacksDir: join(dir, 'builtin-packs'),
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'builtin-tools'),
    })
    const skill = catalog.layeredRegistry.skills.get('studio.director.jiangwen')

    assert.ok(skill)
    assert.equal(skill?.loadMode, 'on_demand')
    assert.equal(skill?.activationScope, 'run')
    assert.deepEqual(skill?.tags, ['director', 'style'])
    assert.deepEqual(skill?.aliases, ['姜文', '让子弹飞'])
    assert.deepEqual(skill?.useWhen, ['姜文风格', '黑色幽默'])
    assert.deepEqual(skill?.triggers, [{ kind: 'keyword', any: ['姜文风格导演', '姜文', '让子弹飞', '姜文风格', '黑色幽默'] }])
    assert.deepEqual(skill?.conflicts, ['studio.director.marvel'])
    assert.match(skill?.instructionTemplate ?? '', /荒诞现实主义/)
    assert.equal((skill?.metadata as Record<string, unknown> | undefined)?.codexSkill, true)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('indexes standalone local Codex-style SKILL.md files without enabling them by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-standalone-codex-skill-'))
  const skillsDir = join(dir, 'skills')

  try {
    const skillDir = join(skillsDir, 'action-director')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: 武术指导
description: 当动作戏、打斗调度、威亚、节奏和安全边界需要专业设计时使用。
aliases: [武指, 动作指导]
---

# 武术指导

拆解动作节拍、空间关系、危险动作替代方案和镜头可拍性。
`, 'utf8')

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: join(dir, 'builtin-skills'),
      packsDir: join(dir, 'packs'),
      builtinPacksDir: join(dir, 'builtin-packs'),
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'builtin-tools'),
    })
    const skill = catalog.layeredSkills.find((item) => item.name === '武术指导')

    assert.ok(skill)
    assert.equal(skill?.id, 'codex.skill.武术指导')
    assert.equal(skill?.loadMode, 'on_demand')
    assert.equal(catalog.configFiles.some((configFile) => configFile.skillIds.includes(skill!.id)), false)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads Codex-style SKILL.md files from shared Codex skill roots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-shared-codex-skill-'))
  const skillsDir = join(dir, 'agent-catalog-skills')
  const codexSkillRoot = join(dir, 'codex-skills')

  try {
    const skillDir = join(codexSkillRoot, 'story-polish')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: Story Polish
description: Use when the user asks to tighten scene rhythm, clarity, or dialogue.
aliases: [rewrite pass]
useWhen:
  - polish scenes
---

# Story Polish

Tighten scene rhythm while preserving character intent.
`, 'utf8')

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      codexSkillRoots: [codexSkillRoot],
      builtinSkillsDir: join(dir, 'builtin-skills'),
      packsDir: join(dir, 'packs'),
      builtinPacksDir: join(dir, 'builtin-packs'),
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'builtin-tools'),
    })
    const skill = catalog.layeredRegistry.skills.get('codex.skill.story-polish')

    assert.deepEqual(catalog.codexSkillRoots, [codexSkillRoot])
    assert.ok(skill)
    assert.equal(skill?.source, 'local')
    assert.equal(skill?.metadata?.codexSkill, true)
    assert.deepEqual(skill?.triggers, [{ kind: 'keyword', any: ['Story Polish', 'rewrite pass', 'polish scenes'] }])
    assert.equal(catalog.resourcePaths.skills['codex.skill.story-polish'], join(skillDir, 'SKILL.md'))
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolves default Codex skill roots from CODEX_HOME, home, and project .agents directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-default-codex-roots-'))
  const homeDir = join(dir, 'home')
  const codexHome = join(dir, 'codex-home')
  const projectRoot = join(dir, 'project')
  const nestedCwd = join(projectRoot, 'packages', 'agent')

  try {
    for (const root of [
      join(codexHome, 'skills'),
      join(homeDir, '.codex', 'skills'),
      join(homeDir, '.agents', 'skills'),
      join(projectRoot, '.agents', 'skills'),
      join(nestedCwd, '.agents', 'skills'),
    ]) {
      mkdirSync(root, { recursive: true })
    }

    assert.deepEqual(resolveDefaultCodexSkillRoots({
      env: { CODEX_HOME: codexHome },
      homeDir,
      cwd: nestedCwd,
    }), [
      join(codexHome, 'skills'),
      join(homeDir, '.codex', 'skills'),
      join(homeDir, '.agents', 'skills'),
      join(projectRoot, '.agents', 'skills'),
      join(nestedCwd, '.agents', 'skills'),
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('catalog loading does not expose tools outside pack-declared resource paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-target-catalog-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')

  try {
    writePluginFile(skillsDir, 'all.json', {
      skills: [
        {
          id: 'studio.alpha',
          name: 'Alpha',
          description: 'Alpha skill',
          enabled: true,
          instruction: 'Alpha instruction.',
        },
        {
          id: 'studio.beta',
          name: 'Beta',
          description: 'Beta skill',
          enabled: true,
          instruction: 'Beta instruction.',
        },
      ],
    })
    writePluginFile(toolsDir, 'alpha.tool.json', {
      name: 'studio.alpha_tool',
      description: 'Alpha tool.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.alpha',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writePluginFile(toolsDir, 'beta.tool.json', {
      name: 'studio.beta_tool',
      description: 'Beta tool.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.beta',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
    })

    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'studio.alpha'), false)
    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'studio.beta'), false)
    assert.equal(Boolean(catalog.registry.get('studio.alpha_tool')), false)
    assert.equal(Boolean(catalog.registry.get('studio.beta_tool')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('local packs default their tools to local source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-local-tool-source-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const builtinSkillsDir = join(dir, 'builtin-skills')
  const builtinToolsDir = join(dir, 'builtin-tools')
  const builtinPacksDir = join(dir, 'builtin-packs')
  const configFilesDir = join(dir, 'config-files')
  const builtinConfigFilesDir = join(dir, 'builtin-config-files')

  try {
    writePluginFile(toolsDir, 'local.tool.json', {
      name: 'studio.local_preview',
      description: 'Preview local project context.',
      permission: 'project.read',
      risk: 'read',
      inputSchema: {},
      projectScoped: true,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writePluginFile(packsDir, 'local.pack.json', {
      id: 'studio.pack.local',
      name: 'Local Pack',
      source: 'local',
      resources: {
        tools: ['local.tool.json'],
      },
      schemas: [],
      tools: ['studio.local_preview'],
      skills: [],
      reference: ['reference://studio/local-guide'],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      configFilesDir,
      builtinSkillsDir,
      builtinToolsDir,
      builtinPacksDir,
      builtinConfigFilesDir,
    })

    assert.equal(catalog.layeredTools.find((tool) => tool.name === 'studio.local_preview')?.source, 'local')
    assert.equal(catalog.registry.get('studio.local_preview')?.source, 'local')
    assert.deepEqual(catalog.packs.find((pack) => pack.id === 'studio.pack.local')?.reference, ['reference://studio/local-guide'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('indexes plugin pack resources installed by shared agent catalog pack store without auto-granting runtime access', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-store-loader-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir: dir, env: {} })
  const builtinSkillsDir = join(dir, 'builtin-skills')
  const builtinToolsDir = join(dir, 'builtin-tools')
  const builtinPacksDir = join(dir, 'builtin-packs')
  const builtinConfigFilesDir = join(dir, 'builtin-config-files')

  try {
    installAgentCatalogPack({
      pluginId: 'studio/plugin',
      dirs,
      files: [
        {
          path: 'agent-skills/story/SKILL.md',
          content: '---\nid: studio.story\nname: Story Skill\ndescription: Plan story beats.\n---\nUse story beats.',
        },
        {
          path: 'agent-tools/workspace/story.tool.json',
          content: JSON.stringify({
            name: 'studio.story_tool',
            description: 'Read story context.',
            permission: 'workspace.read',
            risk: 'read',
            inputSchema: {},
            projectScoped: false,
            defaults: { grant: 'allow', approval: 'never' },
          }),
        },
        {
          path: 'agent-packs/story.pack.json',
          content: JSON.stringify({
            id: 'studio.pack.story',
            name: 'Story Pack',
            resources: {
              skills: ['story'],
              tools: ['workspace'],
            },
            skills: ['studio.story'],
            tools: ['studio.story_tool'],
          }),
        },
      ],
    })

    const catalog = loadTestAgentPluginCatalog({
      skillsDir: dirs.skillsDir,
      toolsDir: dirs.toolsDir,
      packsDir: dirs.packsDir,
      configFilesDir: dirs.configFilesDir,
      builtinSkillsDir,
      builtinToolsDir,
      builtinPacksDir,
      builtinConfigFilesDir,
    })

    assert.equal(catalog.packs.find((pack) => pack.id === 'studio.pack.story')?.source, 'plugin')
    assert.equal(catalog.packs.find((pack) => pack.id === 'studio.pack.story')?.pluginId, 'studio/plugin')
    assert.equal(catalog.layeredSkills.find((skill) => skill.id === 'studio.story')?.source, 'plugin')
    assert.equal(catalog.layeredTools.find((tool) => tool.name === 'studio.story_tool')?.source, 'plugin')
    assert.equal(catalog.registry.get('studio.story_tool')?.source, 'plugin')
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'studio.story_tool'), false)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writePluginFile(dir: string, filename: string, value: unknown): void {
  const filePath = join(dir, filename)
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function loadTestAgentPluginCatalog(options: Parameters<typeof loadAgentPluginCatalog>[0] = {}) {
  return loadAgentPluginCatalog({
    codexSkillRoots: [],
    ...options,
  })
}

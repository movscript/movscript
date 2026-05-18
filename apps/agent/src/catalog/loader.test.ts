import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadAgentPluginCatalog } from './loader.js'
import { AGENT_KNOWLEDGE_DIR_ENV } from '../knowledge/index.js'

test('loads target-state tool catalog but only enabled packs grant runtime access', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-plugins-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const profilesDir = join(dir, 'profiles')

  try {
    writePluginFile(skillsDir, 'writer.workflow.json', {
      id: 'studio.workflow.writer',
      kind: 'workflow',
      name: 'Writer',
      description: 'Writes scene drafts',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolRefs: ['tool://studio.script_outline'],
      instructionTemplate: 'Write in short scene beats.',
    })
    writePluginFile(toolsDir, 'outline.tool.json', {
      name: 'studio.script_outline',
      description: 'Create a script outline draft.',
      permission: 'draft.write',
      risk: 'draft',
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
    })
    writePluginFile(packsDir, 'studio.pack.json', {
      id: 'studio.pack.writer',
      name: 'Studio Writer',
      source: 'plugin',
      resources: {
        skills: ['writer.workflow.json'],
        tools: ['outline.tool.json'],
      },
      schemas: [],
      tools: ['studio.script_outline'],
      skills: ['studio.workflow.writer'],
    })
    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      profilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinProfilesDir: profilesDir,
    })

    assert.equal(catalog.skillsDir, skillsDir)
    assert.equal(catalog.toolsDir, toolsDir)
    const writerSkill = catalog.layeredSkills.find((skill) => skill.id === 'studio.workflow.writer')
    const outlineTool = catalog.layeredTools.find((tool) => tool.name === 'studio.script_outline')
    assert.equal(writerSkill?.kind, 'workflow')
    assert.equal(outlineTool?.name, 'studio.script_outline')
    assert.equal(outlineTool?.source, 'plugin')
    assert.deepEqual(outlineTool?.inputSchema, {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
      },
    })
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'), false)
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('enabled pack registration activates file-loaded skills and tools without profile duplication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-enabled-pack-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const profilesDir = join(dir, 'profiles')

  try {
    writePluginFile(skillsDir, 'writer.workflow.json', {
      id: 'studio.workflow.writer',
      kind: 'workflow',
      name: 'Writer',
      description: 'Writes scene drafts',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolRefs: ['tool://studio.script_outline'],
      instructionTemplate: 'Write in short scene beats.',
    })
    writePluginFile(toolsDir, 'outline.tool.json', {
      name: 'studio.script_outline',
      description: 'Create a script outline draft.',
      permission: 'draft.write',
      risk: 'draft',
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
        skills: ['writer.workflow.json'],
        tools: ['outline.tool.json'],
      },
      schemas: [],
      tools: ['studio.script_outline'],
      skills: ['studio.workflow.writer'],
    })
    writePluginFile(profilesDir, 'default.profile.json', {
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Default',
      enabledPacks: ['studio.pack.writer'],
      persona: null,
      enabledWorkflows: [],
      enabledPolicies: [],
      toolGrants: [],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      profilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinProfilesDir: profilesDir,
    })
    const profile = catalog.profiles.find((item) => item.id === 'movscript.profile.default')

    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'studio.workflow.writer'))
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(profile?.enabledWorkflows, ['studio.workflow.writer'])
    assert.deepEqual(profile?.toolGrants, [{ name: 'studio.script_outline', mode: 'allow', approval: 'never' }])
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'))
    assert.deepEqual(catalog.catalogIssues, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads built-in MovScript platform catalog by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-empty-'))
  try {
    const catalog = loadAgentPluginCatalog({
      packsDir: join(dir, 'packs'),
      profilesDir: join(dir, 'profiles'),
    })

    assert.ok(catalog.builtinSkillsDir.endsWith(join('catalog', 'skills')))
    assert.ok(catalog.builtinToolsDir.endsWith(join('catalog', 'tools')))
    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'movscript.policy.movscript'))
    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'movscript.policy.drafts'))
    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'movscript.workflow.proposal-first'))
    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'movscript.workflow.project-standards-proposal'))
    assert.ok(catalog.packs.some((pack) => pack.id === 'movscript.pack.agent-core'))
    assert.ok(catalog.packs.some((pack) => pack.id === 'movscript.pack.drafts'))
    assert.ok(catalog.packs.some((pack) => pack.id === 'movscript.pack.movscript'))
    assert.ok(catalog.profiles.some((profile) => profile.id === 'movscript.profile.default'))
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_get_focus'))
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_create_project'))
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_list_models'))
    assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_create_draft'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_get_focus'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_list_models'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_create_project' && grant.approval === 'always'))
    assert.ok(catalog.registry.get('movscript_create_draft'))
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'movscript_create_draft'), true)
    assert.equal(catalog.registry.get('movscript_create_project')?.projectScoped, false)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads built-in content unit proposal catalogs by default', () => {
  const catalog = loadAgentPluginCatalog()

  const movscriptPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.movscript')
  const draftPack = catalog.packs.find((pack) => pack.id === 'movscript.pack.drafts')

  assert.ok(movscriptPack)
  assert.ok(draftPack?.schemas.includes('movscript.content_unit_proposal.v1'))
  assert.equal(draftPack?.schemas.includes('movscript.content_unit_media_proposal.v1'), false)
  assert.ok(movscriptPack?.skills.includes('movscript.workflow.content-unit-proposal'))
  assert.equal(movscriptPack?.skills.includes('movscript.workflow.content-unit-media-proposal'), false)
  assert.ok(movscriptPack?.knowledge?.includes('movscript.knowledge.storyboard'))
  assert.ok(catalog.knowledgeCollections.some((collection) => collection.id === 'movscript.knowledge.storyboard'))
  assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_create_draft'))
  assert.ok(catalog.layeredTools.some((tool) => tool.name === 'movscript_update_draft'))
  assert.equal(catalog.registry.get('movscript_upsert_proposal_node'), undefined)
  assert.equal(catalog.registry.get('movscript_submit_script_split_draft'), undefined)
  assert.equal(catalog.registry.get('movscript_update_proposal_node'), undefined)
  assert.deepEqual(catalog.warnings, [])
})

test('loads local knowledge directory into catalog registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-knowledge-'))
  const previousKnowledgeDir = process.env[AGENT_KNOWLEDGE_DIR_ENV]

  try {
    writeKnowledgeFile(dir, 'index.knowledge.json', {
      id: 'studio.knowledge.catalog',
      version: '1.0.0',
      name: 'Studio Catalog Knowledge',
      domain: 'storyboard',
      resources: ['chunks/catalog.md'],
      tags: ['catalog'],
    })
    mkdirSync(join(dir, 'chunks'), { recursive: true })
    writeFileSync(join(dir, 'chunks', 'catalog.md'), `---
id: studio.catalog.chunk
domain: storyboard
title: Catalog Knowledge
tags:
  - catalog
summary: Local catalog knowledge summary.
version: 1.0.0
---

Local catalog knowledge body.
`, 'utf8')
    process.env[AGENT_KNOWLEDGE_DIR_ENV] = dir

    const catalog = loadAgentPluginCatalog()
    const collection = catalog.layeredRegistry.knowledge.get('studio.knowledge.catalog')

    assert.ok(catalog.knowledgeCollections.some((item) => item.id === 'studio.knowledge.catalog'))
    assert.equal(collection?.name, 'Studio Catalog Knowledge')
    assert.equal(collection?.chunks?.some((chunk) => chunk.id === 'studio.catalog.chunk'), true)
    assert.deepEqual(catalog.catalogIssues.filter((issue) => issue.resourceId === 'studio.knowledge.catalog'), [])
  } finally {
    if (previousKnowledgeDir === undefined) delete process.env[AGENT_KNOWLEDGE_DIR_ENV]
    else process.env[AGENT_KNOWLEDGE_DIR_ENV] = previousKnowledgeDir
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pack loading ignores unreferenced local catalog files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-categorized-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')

  try {
    writePluginFile(join(skillsDir, 'production'), 'proposal.json', {
      skills: [{
        id: 'studio.production_proposal',
        name: 'Production Proposal',
        description: 'Draft production proposals',
        category: 'production_proposal',
        enabled: true,
        instruction: 'Draft production proposal nodes.',
      }],
    })
    writePluginFile(join(toolsDir, 'production'), 'proposal.tool.json', {
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
    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
    })
    const skill = catalog.layeredSkills.find((item) => item.id === 'studio.production_proposal')
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
  const profilesDir = join(dir, 'profiles')

  try {
    writePluginFile(join(skillsDir, 'included'), 'writer.workflow.json', {
      id: 'studio.workflow.included',
      kind: 'workflow',
      name: 'Included',
      description: 'Included by pack resources.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolRefs: ['tool://studio.included_tool'],
      instructionTemplate: 'Included workflow.',
    })
    writePluginFile(join(skillsDir, 'ignored'), 'ignored.workflow.json', {
      id: 'studio.workflow.ignored',
      kind: 'workflow',
      name: 'Ignored',
      description: 'Not included by pack resources.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolRefs: ['tool://studio.ignored_tool'],
      instructionTemplate: 'Ignored workflow.',
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
      skills: ['studio.workflow.included'],
    })
    writePluginFile(profilesDir, 'default.profile.json', {
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Default',
      enabledPacks: ['studio.pack.included'],
      persona: null,
      enabledWorkflows: [],
      enabledPolicies: [],
      toolGrants: [],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      profilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinProfilesDir: profilesDir,
    })

    assert.ok(catalog.layeredSkills.some((skill) => skill.id === 'studio.workflow.included'))
    assert.equal(catalog.layeredSkills.some((skill) => skill.id === 'studio.workflow.ignored'), false)
    assert.ok(catalog.registry.get('studio.included_tool'))
    assert.equal(catalog.registry.get('studio.ignored_tool'), undefined)
    assert.equal(catalog.resourcePaths.skills['studio.workflow.included']?.endsWith(join('included', 'writer.workflow.json')), true)
    assert.equal(catalog.resourcePaths.skills['studio.workflow.ignored'], undefined)
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
    writePluginFile(skillsDir, 'review.workflow.json', {
      id: 'studio.workflow.review',
      kind: 'workflow',
      version: '1.0.0',
      name: 'Review Workflow',
      description: 'Review from Markdown.',
      enabled: true,
      triggers: [{ kind: 'always' }],
      toolRefs: [],
      instructionTemplatePath: 'review.workflow.md',
    })
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, 'review.workflow.md'), 'Review from a Markdown instruction body.\n', 'utf8')
    writePluginFile(packsDir, 'review.pack.json', {
      id: 'studio.pack.review',
      name: 'Review Pack',
      source: 'plugin',
      resources: {
        skills: ['review.workflow.json'],
      },
      schemas: [],
      tools: [],
      skills: ['studio.workflow.review'],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: skillsDir,
      packsDir,
      builtinPacksDir: packsDir,
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'tools'),
    })
    const skill = catalog.layeredRegistry.skills.get('studio.workflow.review')

    assert.equal(skill?.kind, 'workflow')
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
kind: persona
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

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: join(dir, 'builtin-skills'),
      packsDir,
      builtinPacksDir: join(dir, 'builtin-packs'),
      toolsDir: join(dir, 'tools'),
      builtinToolsDir: join(dir, 'builtin-tools'),
    })
    const skill = catalog.layeredRegistry.skills.get('studio.director.jiangwen')

    assert.equal(skill?.kind, 'persona')
    assert.equal(skill?.loadMode, 'on_demand')
    assert.equal(skill?.activationScope, 'run')
    assert.deepEqual(skill?.tags, ['director', 'style'])
    assert.deepEqual(skill?.aliases, ['姜文', '让子弹飞'])
    assert.deepEqual(skill?.useWhen, ['姜文风格', '黑色幽默'])
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
kind: expertise
aliases: [武指, 动作指导]
---

# 武术指导

拆解动作节拍、空间关系、危险动作替代方案和镜头可拍性。
`, 'utf8')

    const catalog = loadAgentPluginCatalog({
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
    assert.equal(skill?.kind, 'expertise')
    assert.equal(skill?.loadMode, 'on_demand')
    assert.equal(catalog.profiles.some((profile) => profile.enabledWorkflows.includes(skill!.id)), false)
    assert.deepEqual(catalog.warnings, [])
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
    const catalog = loadAgentPluginCatalog({
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

function writePluginFile(dir: string, filename: string, value: unknown): void {
  const filePath = join(dir, filename)
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeKnowledgeFile(dir: string, filename: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

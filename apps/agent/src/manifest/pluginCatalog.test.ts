import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadAgentPluginCatalog } from './pluginCatalog.js'

test('loads plugin catalog from json files and merges default grants', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-plugins-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const bundlesDir = join(dir, 'bundles')

  try {
    writePluginFile(skillsDir, 'writer.json', {
      skills: [{
        id: 'studio.writer',
        name: 'Writer',
        description: 'Writes scene drafts',
        enabled: true,
        priority: 20,
        instruction: 'Write in short scene beats.',
        appliesWhen: 'scene',
        toolHints: ['studio.script_outline'],
      }],
    })
    writePluginFile(toolsDir, 'outline.json', {
      tools: [{
        name: 'studio.script_outline',
        description: 'Create a script outline draft.',
        permission: 'draft.write',
        risk: 'draft',
        inputSchema: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
          },
        },
        projectScoped: true,
        requiresApprovalByDefault: false,
        defaultGrant: { name: 'studio.script_outline', mode: 'allow', approval: 'never' },
      }],
    })
    writePluginFile(bundlesDir, 'writer.json', {
      skills: ['studio.writer'],
      tools: ['studio.script_outline'],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      bundlesDir,
      builtinBundlesDir: bundlesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
    })

    assert.equal(catalog.skillsDir, skillsDir)
    assert.equal(catalog.toolsDir, toolsDir)
    const writerSkill = catalog.skills.find((skill) => skill.id === 'studio.writer')
    const outlineTool = catalog.tools.find((tool) => tool.name === 'studio.script_outline')
    assert.equal(writerSkill?.id, 'studio.writer')
    assert.equal(outlineTool?.name, 'studio.script_outline')
    assert.equal(outlineTool?.source, 'plugin')
    assert.deepEqual(outlineTool?.inputSchema, {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
      },
    })
    assert.ok(catalog.manifest.skills.some((skill) => skill.id === 'studio.writer'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'))
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads bundled MovScript platform catalog by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-empty-'))
  try {
    const catalog = loadAgentPluginCatalog({
      bundlesDir: join(dir, 'bundles'),
      builtinBundlesDir: join(dir, 'bundles'),
    })

    assert.ok(catalog.builtinSkillsDir.endsWith(join('catalog', 'skills')))
    assert.ok(catalog.builtinToolsDir.endsWith(join('catalog', 'tools')))
    assert.ok(catalog.skills.some((skill) => skill.id === 'movscript.platform.concepts'))
    assert.ok(catalog.skills.some((skill) => skill.id === 'movscript.drafts.safe-drafts'))
    assert.ok(catalog.skills.some((skill) => skill.id === 'movscript.intent.proposal-first'))
    assert.ok(catalog.skills.some((skill) => skill.id === 'movscript.intent.script-split'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_get_current_context'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_list_productions'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_create_project'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_list_models'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_create_proposal'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_content_unit'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_keyframe'))
    assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_shot'))
    assert.ok(catalog.manifest.skills.some((skill) => skill.id === 'movscript.intent.content-unit-draft-creation'))
    assert.ok(catalog.manifest.skills.some((skill) => skill.id === 'movscript.intent.script-split'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_get_current_context'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_list_productions'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_list_models'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_create_project' && grant.approval === 'always'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'movscript_create_proposal'))
    assert.ok(catalog.registry.get('movscript_create_draft'))
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'movscript_create_draft'), false)
    assert.equal(catalog.registry.get('movscript_create_project')?.projectScoped, false)
    assert.ok(catalog.registry.get('movscript_list_productions'))
    const scriptSplitTool = catalog.registry.get('movscript_submit_script_split_draft')
    const scriptSplitSchema = scriptSplitTool?.inputSchema as Record<string, any> | undefined
    assert.equal(scriptSplitTool?.category, 'script_split')
    assert.ok(scriptSplitSchema)
    assert.ok(scriptSplitSchema?.required.includes('projectId'))
    assert.ok(scriptSplitSchema?.required.includes('lineCount'))
    assert.equal(scriptSplitSchema?.required.includes('sourceSummary'), false)
    assert.equal('sourceSummary' in (scriptSplitSchema?.properties ?? {}), true)
    assert.equal('globalSettings' in (scriptSplitSchema?.properties ?? {}), true)
    const episodeSchema = scriptSplitSchema?.properties?.episodeDrafts?.items as Record<string, any> | undefined
    assert.equal('productionAction' in (episodeSchema?.properties ?? {}), true)
    assert.equal('existingProductionId' in (episodeSchema?.properties ?? {}), true)
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads bundled production workspace catalog by default', () => {
  const catalog = loadAgentPluginCatalog()

  const productionProposalBundle = catalog.bundles.find((bundle) => bundle.id === 'movscript.bundle.production-proposal')
  const productionWorkspaceBundle = catalog.bundles.find((bundle) => bundle.id === 'movscript.bundle.production-workspace')

  assert.ok(productionProposalBundle)
  assert.ok(productionWorkspaceBundle)
  assert.equal(productionProposalBundle?.tools.includes('movscript_upsert_proposal_content_unit'), true)
  assert.equal(productionProposalBundle?.tools.includes('movscript_upsert_proposal_keyframe'), true)
  assert.equal(productionProposalBundle?.tools.includes('movscript_upsert_proposal_shot'), false)
  assert.ok(productionWorkspaceBundle?.tools.includes('movscript_upsert_proposal_content_unit'))
  assert.ok(productionWorkspaceBundle?.tools.includes('movscript_upsert_proposal_keyframe'))
  assert.ok(productionWorkspaceBundle?.tools.includes('movscript_upsert_proposal_shot'))
  assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_content_unit'))
  assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_keyframe'))
  assert.ok(catalog.tools.some((tool) => tool.name === 'movscript_upsert_proposal_shot'))
  assert.deepEqual(catalog.warnings, [])
})

test('loads categorized catalog files recursively and annotates category metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-categorized-'))
  const bundlesDir = join(dir, 'bundles')
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
    writePluginFile(join(toolsDir, 'production'), 'proposal.json', {
      tools: [{
        name: 'studio.read_production',
        description: 'Read production context.',
        permission: 'project.read',
        risk: 'read',
        category: 'production_proposal',
        projectScoped: true,
        requiresApprovalByDefault: false,
        defaultGrant: { name: 'studio.read_production', mode: 'allow', approval: 'never' },
      }],
    })
    writePluginFile(bundlesDir, 'proposal.json', {
      category: 'production_proposal',
      skills: ['studio.production_proposal'],
      tools: ['studio.read_production'],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      bundlesDir,
      builtinBundlesDir: bundlesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
    })
    const skill = catalog.skills.find((item) => item.id === 'studio.production_proposal')
    const tool = catalog.tools.find((item) => item.name === 'studio.read_production')

    assert.equal(skill?.category, 'production_proposal')
    assert.deepEqual(skill?.categories, ['production_proposal'])
    assert.equal(skill?.metadata?.category, 'production_proposal')
    assert.equal(tool?.category, 'production_proposal')
    assert.deepEqual(tool?.categories, ['production_proposal'])
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'studio.read_production'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('can load only explicitly enabled bundles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-enabled-bundles-'))
  const bundlesDir = join(dir, 'bundles')
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
    writePluginFile(toolsDir, 'all.json', {
      tools: [
        {
          name: 'studio.alpha_tool',
          description: 'Alpha tool.',
          permission: 'project.read',
          risk: 'read',
          projectScoped: false,
          requiresApprovalByDefault: false,
          defaultGrant: { name: 'studio.alpha_tool', mode: 'allow', approval: 'never' },
        },
        {
          name: 'studio.beta_tool',
          description: 'Beta tool.',
          permission: 'project.read',
          risk: 'read',
          projectScoped: false,
          requiresApprovalByDefault: false,
          defaultGrant: { name: 'studio.beta_tool', mode: 'allow', approval: 'never' },
        },
      ],
    })
    writePluginFile(bundlesDir, 'alpha.json', {
      id: 'studio.bundle.alpha',
      name: 'Alpha Bundle',
      skills: ['studio.alpha'],
      tools: ['studio.alpha_tool'],
    })
    writePluginFile(bundlesDir, 'beta.json', {
      id: 'studio.bundle.beta',
      name: 'Beta Bundle',
      skills: ['studio.beta'],
      tools: ['studio.beta_tool'],
    })

    const catalog = loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      bundlesDir,
      builtinBundlesDir: bundlesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      enabledBundleIds: ['studio.bundle.beta'],
    })

    assert.deepEqual(catalog.availableBundleIds.sort(), ['studio.bundle.alpha', 'studio.bundle.beta'])
    assert.deepEqual(catalog.activeBundleIds, ['studio.bundle.beta'])
    assert.equal(catalog.bundles.find((bundle) => bundle.id === 'studio.bundle.alpha')?.name, 'Alpha Bundle')
    assert.equal(catalog.skills.some((skill) => skill.id === 'studio.alpha'), false)
    assert.equal(catalog.skills.some((skill) => skill.id === 'studio.beta'), true)
    assert.equal(Boolean(catalog.registry.get('studio.alpha_tool')), false)
    assert.equal(Boolean(catalog.registry.get('studio.beta_tool')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writePluginFile(dir: string, filename: string, value: unknown): void {
  const filePath = join(dir, filename)
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

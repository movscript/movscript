import assert from 'node:assert/strict'
import test from 'node:test'
import {
  codexPluginArchiveContributions,
  extractCodexPluginAgentCatalogFiles,
  readCodexPluginManifestFromArchive,
} from './codexPluginArchive.js'

test('reads Codex plugin manifest and summarizes skills and MCP servers', async () => {
  const archive = fakeArchive({
    '.codex-plugin/plugin.json': JSON.stringify({
      name: 'story-pack',
      version: '1.0.0',
      description: 'Story skills.',
      skills: './skills',
      mcpServers: './mcp.json',
    }),
    'mcp.json': JSON.stringify({
      mcpServers: {
        story: {
          command: 'story-mcp',
          label: 'Story MCP',
          endpointEnv: 'STORY_MCP_ENDPOINT',
          tools: [{ name: 'story_outline', description: 'Outline story.' }],
          resources: [{ uri: 'story://current', description: 'Current story.' }],
        },
      },
    }),
    'skills/story/SKILL.md': '---\nname: Story\ndescription: Story skill.\n---\nUse story.',
  })

  const manifest = await readCodexPluginManifestFromArchive(archive)

  assert.deepEqual(manifest, {
    name: 'story-pack',
    version: '1.0.0',
    description: 'Story skills.',
    skills: './skills',
    mcpServers: './mcp.json',
  })
  assert.deepEqual(await codexPluginArchiveContributions(archive, manifest!), {
    agentSkills: [{ path: './skills' }],
    mcpServers: [{
      id: 'story',
      label: 'Story MCP',
      endpointEnv: 'STORY_MCP_ENDPOINT',
      tools: [{ name: 'story_outline', description: 'Outline story.' }],
      resources: [{ uri: 'story://current', description: 'Current story.' }],
    }],
  })
})

test('maps Codex skills into agent catalog pack files', async () => {
  const archive = fakeArchive({
    '.codex-plugin/plugin.json': JSON.stringify({ name: 'story-pack', skills: './skills' }),
    'skills/README.md': 'Shared notes.',
    'skills/story/SKILL.md': '---\nname: Story\ndescription: Story skill.\n---\nUse story.',
  })

  assert.deepEqual(await extractCodexPluginAgentCatalogFiles(archive, { name: 'story-pack', skills: './skills' }), [
    {
      path: 'agent-skills/README.md',
      content: 'Shared notes.',
    },
    {
      path: 'agent-skills/story/SKILL.md',
      content: '---\nname: Story\ndescription: Story skill.\n---\nUse story.',
    },
  ])
})

function fakeArchive(files: Record<string, string>) {
  return {
    file(path: string) {
      if (!(path in files)) return null
      return fakeEntry(files[path] ?? '')
    },
    forEach(callback: (relativePath: string, file: { dir: boolean; async: (type: 'text' | 'base64') => Promise<string> }) => void) {
      for (const [path, content] of Object.entries(files)) callback(path, fakeEntry(content))
    },
  }
}

function fakeEntry(content: string) {
  return {
    dir: false,
    async: async (type: 'text' | 'base64') => type === 'base64' ? Buffer.from(content).toString('base64') : content,
  }
}

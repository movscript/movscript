import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractMovpkgAgentCatalogFiles,
  readPluginArchiveManifest,
} from './clientPlugins'

test('reads Codex plugin archive manifest without MovScript manifest.json', async () => {
  const zip = fakeZip({
    '.codex-plugin/plugin.json': JSON.stringify({
      name: 'story-pack',
      version: '1.0.0',
      description: 'Codex story skills.',
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
        },
      },
    }),
    'skills/story/SKILL.md': '---\nname: Story\ndescription: Story skill.\n---\nUse story.',
  })

  const manifest = await readPluginArchiveManifest(zip, { name: 'story-pack.zip' })

  assert.deepEqual(manifest, {
    schema: 'movscript.clientPlugin.v1',
    id: 'story-pack',
    name: 'story-pack',
    version: '1.0.0',
    description: 'Codex story skills.',
    contributes: {
      agentSkills: [{ path: './skills' }],
      mcpServers: [{
        id: 'story',
        label: 'Story MCP',
        endpointEnv: 'STORY_MCP_ENDPOINT',
        tools: [{ name: 'story_outline', description: 'Outline story.' }],
      }],
    },
    codex: {
      name: 'story-pack',
      version: '1.0.0',
      description: 'Codex story skills.',
      skills: './skills',
      mcpServers: './mcp.json',
    },
    manifestFormat: 'codex',
    bundle: undefined,
    sourceUrl: 'story-pack.zip',
    installedAt: manifest.installedAt,
  })
})

test('maps Codex plugin skills directory into agent catalog files', async () => {
  const zip = fakeZip({
    '.codex-plugin/plugin.json': JSON.stringify({ name: 'story-pack', skills: './skills' }),
    'skills/story/SKILL.md': '---\nname: Story\ndescription: Story skill.\n---\nUse story.',
    'skills/README.md': 'Shared notes.',
  })

  const files = await extractMovpkgAgentCatalogFiles(zip, {
    name: 'story-pack',
    skills: './skills',
  })

  assert.deepEqual(files, [
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

function fakeZip(files: Record<string, string>) {
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

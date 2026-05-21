import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('agent HTTP server keeps thread run route as the only public run creation path', async () => {
  const source = await readProjectFile('apps/agent/src/server.ts')

  assert.doesNotMatch(source, /url\.pathname === ['"]\/runs['"]\s*&&\s*req\.method === ['"]POST['"]/, 'POST /runs must not be a public execution endpoint')
  assert.doesNotMatch(source, /url\.pathname === ['"]\/runs\/tool['"]/, 'POST /runs/tool must not be a public execution endpoint')
  assert.doesNotMatch(source, /url\.pathname === ['"]\/context['"]/, 'GET /context must not bypass runtime context handling')
  assert.doesNotMatch(source, /\/\^\\\/runs\\\/\(\[\^\/\]\+\)\\\/approve/, 'POST /runs/:id/approve must not be a public runtime control endpoint')
  assert.doesNotMatch(source, /\/\^\\\/runs\\\/\(\[\^\/\]\+\)\\\/reject/, 'POST /runs/:id/reject must not be a public runtime control endpoint')
  assert.match(source, /\/\^\\\/threads\\\/\(\[\^\/\]\+\)\\\/runs/, 'server must expose the thread-scoped run creation route')
})

test('frontend LocalAgentClient does not call removed direct run endpoints', async () => {
  const source = await readProjectFile('apps/frontend/src/lib/localAgentClient.ts')

  assert.doesNotMatch(source, /postJSON\(\s*['"]\/runs['"]/, 'frontend must not create runs through POST /runs')
  assert.doesNotMatch(source, /postJSON\(\s*['"]\/runs\/tool['"]/, 'frontend must not create tool runs through POST /runs/tool')
  assert.doesNotMatch(source, /\bapproveRun\(/, 'frontend must not keep the old run approval method')
  assert.doesNotMatch(source, /\brejectRun\(/, 'frontend must not keep the old run rejection method')
  assert.doesNotMatch(source, /\brunMessage\(/, 'frontend must not keep the old polling runMessage path')
  assert.match(source, /runMessageStream\(/, 'frontend should use the streaming message path')
  assert.match(source, /\/threads\/\$\{encodeURIComponent\(threadId\)\}\/runs/, 'message runs must be created through the thread route')
})

test('debug UI does not use legacy direct tool run client calls', async () => {
  const source = await readProjectFile('apps/frontend/src/pages/agent/AIAgentDebugPage.tsx')

  assert.doesNotMatch(source, /createToolRun\(/, 'debug UI must send diagnostic tool runs through runMessageStream')
})

test('agent documentation does not advertise removed public compatibility endpoints', async () => {
  const agentReadme = await readProjectFile('apps/agent/README.md')
  const rootReadme = await readProjectFile('README.md')

  assert.doesNotMatch(agentReadme, /\|\s*`GET`\s*\|\s*`\/context`\s*\|/, 'agent README must not document GET /context')
  assert.doesNotMatch(agentReadme, /\|\s*`POST`\s*\|\s*`\/runs`\s*\|/, 'agent README must not document POST /runs')
  assert.doesNotMatch(agentReadme, /\/runs\/tool/, 'agent README must not document POST /runs/tool')
  assert.doesNotMatch(agentReadme, /\/runs\/:id\/approve/, 'agent README must not document POST /runs/:id/approve')
  assert.doesNotMatch(agentReadme, /\/runs\/:id\/reject/, 'agent README must not document POST /runs/:id/reject')
  assert.doesNotMatch(rootReadme, /POST \/threads,\s*POST \/runs\b/, 'root README sequence must use the thread run route')
})

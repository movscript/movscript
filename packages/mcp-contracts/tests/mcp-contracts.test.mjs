import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('mcp contracts stay browser safe and independent from runtime hosts', () => {
  const source = readFileSync(resolve('src/index.ts'), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:|from ['"]electron['"]|from ['"]react['"]|from ['"]@movscript\/core/)
  assert.doesNotMatch(source, /createServer|ipcMain|window\.|document\./)
})

test('mcp context project identity separates backend id from workspace keys', () => {
  const source = readFileSync(resolve('src/index.ts'), 'utf8')
  assert.match(source, /id\?: string \| number/, 'legacy project.id must not require a backend numeric id')
  assert.match(source, /backendProjectId\?: number/, 'backend numeric project id must be explicit')
  assert.match(source, /projectUid\?: string/, 'project uid must be preserved for backend decision metadata')
  assert.match(source, /projectKey\?: string/, 'surface or local route key must be explicit')
  assert.match(source, /projectDir\?: string/, 'source workspace directory must remain available as the project locator')
})

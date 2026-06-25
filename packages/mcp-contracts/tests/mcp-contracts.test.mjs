import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('mcp contracts stay browser safe and independent from runtime hosts', () => {
  const source = readFileSync(resolve('src/index.ts'), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:|from ['"]electron['"]|from ['"]react['"]|from ['"]@movscript\/core/)
  assert.doesNotMatch(source, /createServer|ipcMain|window\.|document\./)
})

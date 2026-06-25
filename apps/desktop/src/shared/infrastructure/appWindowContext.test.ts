import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('project window context merges projectDir into the current Desktop project', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/appWindowContext.ts'), 'utf8')

  assert.match(source, /projectWithWindowProjectDir\(context\.project as unknown as Project, context\.projectDir\)/)
  assert.match(source, /workspace_path: normalizedProjectDir/)
  assert.match(source, /project_path: normalizedProjectDir/)
  assert.match(source, /local: true/)
})

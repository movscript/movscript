import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npmCache = mkdtempSync(resolve(tmpdir(), 'editable-projections-npm-cache-'))

function parseNpmPackJson(output) {
  const jsonStart = output.lastIndexOf('\n[')
  return JSON.parse(jsonStart === -1 ? output : output.slice(jsonStart + 1))
}

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_cache: npmCache,
  },
})
const [pack] = parseNpmPackJson(output)
assert.equal(pack.name, '@movscript/editable-projections')
assert.equal(pack.version, '0.1.0')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
assert.equal(packageJson.license, 'Apache-2.0')
assert.equal(packageJson.sideEffects, false)
assert.deepEqual(packageJson.engines, { node: '>=20' })
assert.deepEqual(packageJson.publishConfig, { access: 'public' })
assert.equal(packageJson.scripts.prepack, 'npm run build')
assert.deepEqual(packageJson.repository, {
  type: 'git',
  url: 'git+https://github.com/movscript/movscript.git',
  directory: 'packages/editable-projections',
})
assert.deepEqual(packageJson.exports['./testing'], {
  types: './dist/testing.d.ts',
  import: './dist/testing.js',
  require: './dist/testing.cjs',
})
assert.deepEqual(packageJson.exports['./examples/note'], {
  types: './dist/examples/note.d.ts',
  import: './dist/examples/note.js',
  require: './dist/examples/note.cjs',
})
assert.deepEqual(packageJson.exports['./examples/movscript-asset-slot'], {
  types: './dist/examples/movscriptAssetSlot.d.ts',
  import: './dist/examples/movscriptAssetSlot.js',
  require: './dist/examples/movscriptAssetSlot.cjs',
})
assert.deepEqual(packageJson.exports['./examples/movscript-project'], {
  types: './dist/examples/movscriptProject.d.ts',
  import: './dist/examples/movscriptProject.js',
  require: './dist/examples/movscriptProject.cjs',
})
assert.equal(packageJson.exports['./package.json'], './package.json')
assert.equal(packageJson.keywords.includes('editable-projections'), true)
assert.equal(packageJson.keywords.includes('local-first'), true)
const files = new Set(pack.files.map((file) => file.path))

for (const requiredFile of [
  'LICENSE',
  'package.json',
  'README.md',
  'docs/compatibility.md',
  'docs/design.md',
  'docs/first-adapter.md',
  'docs/first-adapter.example.ts',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/node.js',
  'dist/node.cjs',
  'dist/node.d.ts',
  'dist/testing.js',
  'dist/testing.cjs',
  'dist/testing.d.ts',
  'dist/examples/note.js',
  'dist/examples/note.cjs',
  'dist/examples/note.d.ts',
  'dist/examples/movscriptAssetSlot.js',
  'dist/examples/movscriptAssetSlot.cjs',
  'dist/examples/movscriptAssetSlot.d.ts',
  'dist/examples/movscriptProject.js',
  'dist/examples/movscriptProject.cjs',
  'dist/examples/movscriptProject.d.ts',
]) {
  assert.equal(files.has(requiredFile), true, `pack output must include ${requiredFile}`)
}

for (const file of files) {
  assert.equal(file.startsWith('src/'), false, `pack output must not include source file ${file}`)
  assert.equal(file.startsWith('tests/'), false, `pack output must not include test file ${file}`)
  assert.equal(
    file.startsWith('dist/')
      || file.startsWith('docs/')
      || file === 'LICENSE'
      || file === 'package.json'
      || file === 'README.md',
    true,
    `unexpected packed file ${file}`,
  )
}

for (const blockedFile of [
  'tsconfig.json',
  'tsconfig.consumer.json',
]) {
  assert.equal(files.has(blockedFile), false, `pack output must not include ${blockedFile}`)
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRuntimePackageJson,
  createRuntimeReadme,
} from '../../../apps/frontend/scripts/prepare-agent-deploy.mjs'

test('prepare-agent-deploy writes a runtime-only agent package manifest', () => {
  const runtimePackage = createRuntimePackageJson({
    name: 'movscript-agent',
    version: '0.1.0',
    private: true,
    type: 'module',
    bin: {
      'movscript-agent': './dist/cli.js',
    },
    scripts: {
      dev: 'node scripts/dev-watch.mjs',
      test: 'node ../../scripts/run-node-tests.mjs "src/**/*.test.ts"',
    },
    testSuites: {
      agent: ['src/**/*.test.ts'],
    },
    dependencies: {
      openai: '^6.38.0',
    },
    devDependencies: {
      tsx: '^4.19.2',
    },
  })

  assert.deepEqual(runtimePackage, {
    name: 'movscript-agent',
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './dist/server.bundle.js',
    bin: {
      'movscript-agent': './dist/cli.js',
    },
  })
})

test('prepare-agent-deploy writes a generated artifact readme', () => {
  const readme = createRuntimeReadme()

  assert.match(readme, /packaged runtime artifact/)
  assert.match(readme, /canonical agent implementation lives in `apps\/agent`/)
  assert.match(readme, /Do not edit files here as source/)
})

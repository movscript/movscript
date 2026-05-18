import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const runnerPath = path.resolve('scripts/run-node-tests.mjs')

test('run-node-tests loads named suites from the current package', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-'))
  try {
    await writePackageJson(root, {
      testSuites: {
        smoke: ['tests/smoke.test.mjs'],
      },
    })
    await mkdir(path.join(root, 'tests'), { recursive: true })
    await writeFile(path.join(root, 'tests/smoke.test.mjs'), [
      "import test from 'node:test'",
      "import assert from 'node:assert/strict'",
      "test('suite-selected test runs', () => assert.equal(1 + 1, 2))",
      '',
    ].join('\n'))

    const { stdout, stderr } = await execFileAsync(process.execPath, [runnerPath, '--suite', 'smoke'], {
      cwd: root,
      env: childProcessEnv(),
    })

    assert.match(`${stdout}\n${stderr}`, /suite-selected test runs/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('run-node-tests applies suite test name patterns', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-pattern-'))
  try {
    await writePackageJson(root, {
      testSuites: {
        contract: {
          patterns: ['tests/contract.test.mjs'],
          testNamePattern: 'chosen contract',
        },
      },
    })
    await mkdir(path.join(root, 'tests'), { recursive: true })
    await writeFile(path.join(root, 'tests/contract.test.mjs'), [
      "import test from 'node:test'",
      "import assert from 'node:assert/strict'",
      "test('chosen contract', () => assert.equal('ok', 'ok'))",
      "test('other contract', () => assert.fail('testNamePattern did not filter this test'))",
      '',
    ].join('\n'))

    const { stdout, stderr } = await execFileAsync(process.execPath, [runnerPath, '--suite', 'contract'], {
      cwd: root,
      env: childProcessEnv(),
    })
    const output = `${stdout}\n${stderr}`

    assert.match(output, /chosen contract/)
    assert.doesNotMatch(output, /not ok/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('run-node-tests rejects unknown suites', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-missing-'))
  try {
    await writePackageJson(root, { testSuites: {} })

    await assert.rejects(
      execFileAsync(process.execPath, [runnerPath, '--suite', 'missing'], {
        cwd: root,
        env: childProcessEnv(),
      }),
      (error) => {
        assert.match(String(error.stderr), /Unknown or invalid test suite missing/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('run-node-tests reports missing tsx once for TypeScript tests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-no-tsx-'))
  try {
    await writePackageJson(root, {
      testSuites: {
        ts: ['tests/typescript.test.ts'],
      },
    })
    await mkdir(path.join(root, 'tests'), { recursive: true })
    await writeFile(path.join(root, 'tests/typescript.test.ts'), [
      "import test from 'node:test'",
      "test('typescript test', () => {})",
      '',
    ].join('\n'))

    await assert.rejects(
      execFileAsync(process.execPath, [runnerPath, '--suite', 'ts'], {
        cwd: root,
        env: childProcessEnv(),
      }),
      (error) => {
        assert.match(String(error.stderr), /Unable to run TypeScript tests because package 'tsx' is not installed/)
        assert.match(String(error.stderr), /package\.json does not declare tsx for this workspace/)
        assert.match(String(error.stderr), /resolver: .*package\.json/)
        assert.doesNotMatch(String(error.stderr), /ERR_MODULE_NOT_FOUND/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('run-node-tests reports declared but unresolved tsx dependency', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-unlinked-tsx-'))
  try {
    await writePackageJson(root, {
      devDependencies: {
        tsx: '^4.0.0',
      },
      testSuites: {
        ts: ['tests/typescript.test.ts'],
      },
    })
    await mkdir(path.join(root, 'tests'), { recursive: true })
    await writeFile(path.join(root, 'tests/typescript.test.ts'), [
      "import test from 'node:test'",
      "test('typescript test', () => {})",
      '',
    ].join('\n'))

    await assert.rejects(
      execFileAsync(process.execPath, [runnerPath, '--suite', 'ts'], {
        cwd: root,
        env: childProcessEnv(),
      }),
      (error) => {
        assert.match(String(error.stderr), /package\.json declares tsx \(devDependencies \^4\.0\.0\), but Node cannot resolve it/)
        assert.match(String(error.stderr), /Run the workspace install step/)
        assert.doesNotMatch(String(error.stderr), /ERR_MODULE_NOT_FOUND/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('run-node-tests diagnoses incomplete pnpm workspace links for unresolved tsx', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-node-suite-incomplete-pnpm-'))
  try {
    await writePackageJson(root, {
      devDependencies: {
        tsx: '^4.0.0',
      },
      testSuites: {
        ts: ['tests/typescript.test.ts'],
      },
    })
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await mkdir(path.join(root, 'node_modules/.pnpm/tsx@4.0.0/node_modules'), { recursive: true })
    await mkdir(path.join(root, 'tests'), { recursive: true })
    await writeFile(path.join(root, 'tests/typescript.test.ts'), [
      "import test from 'node:test'",
      "test('typescript test', () => {})",
      '',
    ].join('\n'))

    await assert.rejects(
      execFileAsync(process.execPath, [runnerPath, '--suite', 'ts'], {
        cwd: root,
        env: childProcessEnv(),
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /pnpm store candidates: tsx@4\.0\.0 \(missing package directory\)/)
        assert.match(stderr, /workspace command shims are missing/)
        assert.match(stderr, /workspace package link is missing/)
        assert.match(stderr, /pnpm store entry tsx@4\.0\.0 is incomplete/)
        assert.match(stderr, /hydrate the pnpm store/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writePackageJson(root, value) {
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ type: 'module', ...value }, null, 2)}\n`)
}

function childProcessEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key]
  }
  return env
}

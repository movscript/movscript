import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { deflateSync } from 'node:zlib'
import test from 'node:test'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)
const artifactCommand = [path.resolve('tests/agent-run-debugging/verify-artifacts.mjs')]
const cleanCommand = [path.resolve('tests/agent-run-debugging/clean-artifacts.mjs')]
const e2eCommand = [path.resolve('tests/agent-run-debugging/run-e2e.mjs')]
const summaryCommand = [path.resolve('tests/agent-run-debugging/verify-acceptance-summary.mjs')]
const screenshotNames = [
  'agent-run-debug-overview.png',
  'agent-run-model-call-expanded.png',
  'agent-run-http-request-detail.png',
  'agent-run-http-response-detail.png',
  'agent-run-attention-events.png',
  'agent-run-missing-data.png',
]

test('AgentRun debugging artifact verifier passes when required screenshots exist', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-ok-'))
  try {
    await writeScreenshots(root, screenshotNames)
    const { stdout } = await execFileAsync(process.execPath, [...artifactCommand, root])
    assert.match(stdout, /AgentRun debugging artifact verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier fails when screenshots are missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-missing-'))
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, root]),
      (error) => {
        assert.match(String(error.stderr), /missing screenshot artifact: agent-run-debug-overview\.png/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier reports required screenshots when root is missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-missing-root-'))
  const missingRoot = path.join(root, 'test-results')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, missingRoot]),
      (error) => {
        assert.match(String(error.stderr), /artifact root does not exist:/)
        assert.match(String(error.stderr), /missing screenshot artifact: agent-run-debug-overview\.png/)
        assert.match(String(error.stderr), /missing screenshot artifact: agent-run-missing-data\.png/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects non-PNG screenshot placeholders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-invalid-'))
  try {
    await writePlaceholderScreenshots(root, screenshotNames)
    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, root]),
      (error) => {
        assert.match(String(error.stderr), /invalid screenshot artifact: agent-run-debug-overview\.png/)
        assert.match(String(error.stderr), /file does not have a PNG signature/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier writes a machine-readable screenshot report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-report-'))
  const artifactDir = path.join(root, 'agent-run-acceptance')
  const reportPath = path.join(root, 'artifact-report.json')
  try {
    await mkdir(artifactDir, { recursive: true })
    await writeFile(path.join(artifactDir, 'agent-run-debug-overview.png'), createPng(640, 480))
    await writeFile(path.join(artifactDir, 'agent-run-model-call-expanded.png'), Buffer.alloc(2048, 1))

    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, root], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_ARTIFACT_REPORT_PATH: reportPath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /invalid screenshot artifact: agent-run-model-call-expanded\.png/)
        assert.match(String(error.stderr), /missing screenshot artifact: agent-run-http-request-detail\.png/)
        return true
      },
    )

    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(report.artifactRoot, root)
    assert.deepEqual(report.requiredScreenshots, screenshotNames)
    assert.deepEqual(report.presentScreenshots, [
      'agent-run-debug-overview.png',
      'agent-run-model-call-expanded.png',
    ])
    assert.deepEqual(report.missingScreenshots, screenshotNames.filter((name) => ![
      'agent-run-debug-overview.png',
      'agent-run-model-call-expanded.png',
    ].includes(name)))
    assert.deepEqual(report.invalidScreenshots.map((item) => item.name), ['agent-run-model-call-expanded.png'])
    assert.match(report.invalidScreenshots[0].reasons[0], /file does not have a PNG signature/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects screenshots below minimum dimensions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-small-'))
  try {
    await writeScreenshots(root, screenshotNames, { width: 160, height: 120 })
    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, root]),
      (error) => {
        assert.match(String(error.stderr), /dimensions too small \(160x120 < 320x240\)/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects screenshots with corrupt PNG checksums', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-corrupt-'))
  try {
    await writeScreenshots(root, screenshotNames, { corruptCrc: true })
    await assert.rejects(
      execFileAsync(process.execPath, [...artifactCommand, root]),
      (error) => {
        assert.match(String(error.stderr), /PNG IEND chunk CRC mismatch/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact cleaner removes stale result directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-clean-'))
  const testResults = path.join(root, 'test-results')
  const playwrightReport = path.join(root, 'playwright-report')
  try {
    await mkdir(testResults, { recursive: true })
    await mkdir(playwrightReport, { recursive: true })
    await writeFile(path.join(testResults, 'stale.txt'), 'stale')
    await writeFile(path.join(playwrightReport, 'index.html'), '<html></html>')

    const { stdout } = await execFileAsync(process.execPath, [...cleanCommand, testResults, playwrightReport])
    assert.match(stdout, /AgentRun debugging artifacts cleaned/)
    assert.equal(existsSync(testResults), false)
    assert.equal(existsSync(playwrightReport), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner verifies screenshots even after browser failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-summary-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([
            process.execPath,
            '-e',
            "require('node:fs').mkdirSync(process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT, { recursive: true }); process.exit(7)",
          ]),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /AgentRun debugging artifact verification failed/)
        assert.match(stderr, /missing screenshot artifact: agent-run-debug-overview\.png/)
        assert.match(stderr, /browser acceptance exited with 7/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.schema, 'movscript.agent-run-debugging-acceptance-summary.v1')
    assert.equal(summary.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json')
    assert.equal(summary.passed, false)
    assert.deepEqual(summary.requiredScreenshots, screenshotNames)
    assert.equal(summary.browser.status, 7)
    assert.equal(summary.browser.failure, 'exited with 7')
    assert.equal(summary.cleanArtifacts.status, 0)
    assert.equal(summary.cleanArtifacts.failure, null)
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.equal(summary.screenshotArtifacts.failure, 'exited with 1')
    assert.equal(summary.artifactRoot, artifactRoot)
    assert.deepEqual(summary.screenshotDiagnostics, {
      presentScreenshots: [],
      missingScreenshots: screenshotNames,
      invalidScreenshots: [],
    })
    assert.deepEqual(summary.environment, {
      usesExternalBaseURL: false,
      baseURLOrigin: null,
      preflightPort: 4179,
      artifactRootOverride: true,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging acceptance summary verifier passes valid passing summaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-summary-ok-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    await writeFile(summaryPath, `${JSON.stringify(passingAcceptanceSummary(), null, 2)}\n`)
    const { stdout } = await execFileAsync(process.execPath, [...summaryCommand, summaryPath])
    assert.match(stdout, /AgentRun debugging acceptance summary verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging acceptance summary verifier rejects failed acceptance by default', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-summary-failed-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    await writeFile(summaryPath, `${JSON.stringify(failedAcceptanceSummary(), null, 2)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [...summaryCommand, summaryPath]),
      (error) => {
        assert.match(String(error.stderr), /acceptance summary passed must be true/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging acceptance summary verifier can allow failed summaries for contract-only diagnostics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-summary-allow-failed-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    await writeFile(summaryPath, `${JSON.stringify(failedAcceptanceSummary(), null, 2)}\n`)
    const { stdout } = await execFileAsync(process.execPath, [...summaryCommand, summaryPath, '--allow-failed'])
    assert.match(stdout, /AgentRun debugging acceptance summary verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging acceptance summary verifier rejects contract drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-summary-drift-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    const summary = passingAcceptanceSummary({
      extraTopLevelField: true,
      screenshotDiagnostics: {
        presentScreenshots: screenshotNames.slice(0, 5),
        missingScreenshots: [],
        invalidScreenshots: [{ name: screenshotNames[5], reasons: ['PNG signature missing'] }],
      },
    })
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [...summaryCommand, summaryPath]),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /extraTopLevelField is not allowed/)
        assert.match(stderr, /screenshotDiagnostics must partition the runner screenshot list/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner writes a summary when artifact cleanup fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-clean-failure-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_CLEAN_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(6)']),
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(0)']),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /artifact cleanup exited with 6/)
        assert.doesNotMatch(stderr, /browser acceptance exited/)
        assert.doesNotMatch(stderr, /screenshot artifact verification exited/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.passed, false)
    assert.equal(summary.cleanArtifacts.status, 6)
    assert.equal(summary.cleanArtifacts.failure, 'exited with 6')
    assert.equal(summary.browser.status, 1)
    assert.equal(summary.browser.failure, 'skipped because artifact cleanup exited with 6')
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.equal(summary.screenshotArtifacts.failure, 'skipped because artifact cleanup exited with 6')
    assert.deepEqual(summary.screenshotDiagnostics, {
      presentScreenshots: [],
      missingScreenshots: screenshotNames,
      invalidScreenshots: [],
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner writes passing summary when screenshots are verified', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-success-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  const screenshotPath = path.join(root, 'screenshot.png')
  const writerPath = path.join(root, 'write-screenshots.mjs')
  try {
    await writeFile(screenshotPath, createPng(640, 480))
    await writeFile(writerPath, `
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const screenshotNames = ${JSON.stringify(screenshotNames)}
const source = ${JSON.stringify(screenshotPath)}
const target = path.resolve(process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT, 'agent-run-acceptance')
mkdirSync(target, { recursive: true })
for (const name of screenshotNames) copyFileSync(source, path.join(target, name))
`)

    const { stdout } = await execFileAsync(process.execPath, [...e2eCommand], {
      env: {
        ...process.env,
        AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
        AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
        AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, writerPath]),
      },
    })
    assert.match(stdout, /AgentRun debugging E2E acceptance passed/)
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.schema, 'movscript.agent-run-debugging-acceptance-summary.v1')
    assert.equal(summary.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json')
    assert.equal(summary.passed, true)
    assert.deepEqual(summary.requiredScreenshots, screenshotNames)
    assert.equal(summary.browser.status, 0)
    assert.equal(summary.browser.failure, null)
    assert.equal(summary.cleanArtifacts.status, 0)
    assert.equal(summary.cleanArtifacts.failure, null)
    assert.equal(summary.screenshotArtifacts.status, 0)
    assert.equal(summary.screenshotArtifacts.failure, null)
    assert.equal(summary.artifactRoot, artifactRoot)
    assert.deepEqual(summary.screenshotDiagnostics, {
      presentScreenshots: screenshotNames,
      missingScreenshots: [],
      invalidScreenshots: [],
    })
    assert.deepEqual(summary.environment, {
      usesExternalBaseURL: false,
      baseURLOrigin: null,
      preflightPort: 4179,
      artifactRootOverride: true,
    })
    const verification = await execFileAsync(process.execPath, [...summaryCommand, summaryPath])
    assert.match(verification.stdout, /AgentRun debugging acceptance summary verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports partial screenshot diagnostics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-partial-screenshots-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  const screenshotPath = path.join(root, 'screenshot.png')
  const writerPath = path.join(root, 'write-partial-screenshots.mjs')
  const presentScreenshots = [
    'agent-run-debug-overview.png',
    'agent-run-model-call-expanded.png',
  ]
  try {
    await writeFile(screenshotPath, createPng(640, 480))
    await writeFile(writerPath, `
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const presentScreenshots = ${JSON.stringify(presentScreenshots)}
const source = ${JSON.stringify(screenshotPath)}
const target = path.resolve(process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT, 'agent-run-acceptance')
mkdirSync(target, { recursive: true })
for (const name of presentScreenshots) copyFileSync(source, path.join(target, name))
`)

    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, writerPath]),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        assert.match(stderr, /missing screenshot artifact: agent-run-http-request-detail\.png/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.passed, false)
    assert.equal(summary.browser.status, 0)
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.deepEqual(summary.screenshotDiagnostics, {
      presentScreenshots,
      missingScreenshots: screenshotNames.filter((name) => !presentScreenshots.includes(name)),
      invalidScreenshots: [],
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports invalid screenshot diagnostics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-invalid-screenshots-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  const writerPath = path.join(root, 'write-invalid-screenshots.mjs')
  try {
    await writeFile(writerPath, `
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const screenshotNames = ${JSON.stringify(screenshotNames)}
const target = path.resolve(process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT, 'agent-run-acceptance')
mkdirSync(target, { recursive: true })
for (const name of screenshotNames) writeFileSync(path.join(target, name), Buffer.alloc(2048, 1))
`)

    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, writerPath]),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        assert.match(stderr, /invalid screenshot artifact: agent-run-debug-overview\.png/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.passed, false)
    assert.equal(summary.browser.status, 0)
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.deepEqual(summary.screenshotDiagnostics.presentScreenshots, screenshotNames)
    assert.deepEqual(summary.screenshotDiagnostics.missingScreenshots, [])
    assert.deepEqual(summary.screenshotDiagnostics.invalidScreenshots.map((item) => item.name), screenshotNames)
    assert.match(summary.screenshotDiagnostics.invalidScreenshots[0].reasons[0], /file does not have a PNG signature/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner redacts external base URL details in the summary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-external-url-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          MOVSCRIPT_E2E_BASE_URL: 'http://user:secret@127.0.0.1:4179/path?token=secret',
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(7)']),
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /browser acceptance exited with 7/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.deepEqual(summary.environment, {
      usesExternalBaseURL: true,
      baseURLOrigin: 'http://127.0.0.1:4179',
      preflightPort: null,
      artifactRootOverride: true,
    })
    assert.doesNotMatch(JSON.stringify(summary.environment), /user|secret|token|path/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner keeps default artifacts when override root is used', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-isolated-'))
  const defaultRoot = path.resolve('apps/frontend/test-results')
  const sentinelPath = path.join(defaultRoot, 'agent-run-debugging-default-sentinel.txt')
  try {
    await mkdir(defaultRoot, { recursive: true })
    await writeFile(sentinelPath, 'keep')

    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: path.join(root, 'test-results'),
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(7)']),
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /browser acceptance exited with 7/)
        assert.equal(existsSync(sentinelPath), true)
        return true
      },
    )
  } finally {
    await rm(sentinelPath, { force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner resolves relative override roots from the repository root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-relative-root-'))
  const relativeRoot = path.relative(process.cwd(), path.join(root, 'relative-results'))
  const summaryPath = path.join(root, 'summary.json')
  const screenshotPath = path.join(root, 'screenshot.png')
  const writerPath = path.join(root, 'write-relative-screenshots.mjs')
  try {
    await writeFile(screenshotPath, createPng(640, 480))
    await writeFile(writerPath, `
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const screenshotNames = ${JSON.stringify(screenshotNames)}
const targetRoot = process.env.AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT
if (!path.isAbsolute(targetRoot)) throw new Error('artifact root override must be absolute in the browser process')
const target = path.join(targetRoot, 'agent-run-acceptance')
mkdirSync(target, { recursive: true })
for (const name of screenshotNames) copyFileSync(${JSON.stringify(screenshotPath)}, path.join(target, name))
writeFileSync(path.join(targetRoot, 'resolved-root.txt'), targetRoot)
`)

    await execFileAsync(process.execPath, [...e2eCommand], {
      env: {
        ...process.env,
        AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: relativeRoot,
        AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
        AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, writerPath]),
      },
    })
    const expectedRoot = path.resolve(process.cwd(), relativeRoot)
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.artifactRoot, expectedRoot)
    assert.equal(await readFile(path.join(expectedRoot, 'resolved-root.txt'), 'utf8'), expectedRoot)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports browser command startup failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-spawn-'))
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: path.join(root, 'test-results'),
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify(['movscript-missing-browser-command']),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /browser acceptance failed to start: spawnSync movscript-missing-browser-command ENOENT/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports local web server preflight failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-preflight-'))
  const artifactRoot = path.join(root, 'test-results')
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          MOVSCRIPT_E2E_PORT: '-1',
          AGENT_RUN_DEBUG_E2E_FORCE_PREFLIGHT: '1',
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(0)']),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /browser acceptance local web server preflight failed/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.passed, false)
    assert.deepEqual(summary.requiredScreenshots, screenshotNames)
    assert.match(summary.browser.failure, /local web server preflight failed/)
    assert.match(summary.browser.failure, /MOVSCRIPT_E2E_BASE_URL|already running frontend/)
    assert.equal(summary.cleanArtifacts.status, 0)
    assert.equal(summary.cleanArtifacts.failure, null)
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.deepEqual(summary.screenshotDiagnostics, {
      presentScreenshots: [],
      missingScreenshots: screenshotNames,
      invalidScreenshots: [],
    })
    assert.deepEqual(summary.environment, {
      usesExternalBaseURL: false,
      baseURLOrigin: null,
      preflightPort: null,
      artifactRootOverride: true,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports browser signal terminations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-signal-'))
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [...e2eCommand], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: path.join(root, 'test-results'),
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([
            process.execPath,
            '-e',
            "process.kill(process.pid, 'SIGTERM')",
          ]),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /browser acceptance terminated by signal SIGTERM/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeScreenshots(root, names, options = {}) {
  const artifactDir = path.join(root, 'agent-run-acceptance')
  await mkdir(artifactDir, { recursive: true })
  const body = createPng(options.width ?? 640, options.height ?? 480)
  if (options.corruptCrc) body[body.length - 1] = body[body.length - 1] ^ 0xff
  for (const name of names) await writeFile(path.join(artifactDir, name), body)
}

async function writePlaceholderScreenshots(root, names) {
  const artifactDir = path.join(root, 'agent-run-acceptance')
  await mkdir(artifactDir, { recursive: true })
  const body = Buffer.alloc(2048, 1)
  for (const name of names) await writeFile(path.join(artifactDir, name), body)
}

function passingAcceptanceSummary(overrides = {}) {
  return {
    schema: 'movscript.agent-run-debugging-acceptance-summary.v1',
    schemaUrl: 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json',
    generatedAt: '2026-05-16T00:00:00.000Z',
    artifactRoot: 'apps/frontend/test-results',
    environment: {
      usesExternalBaseURL: false,
      baseURLOrigin: null,
      preflightPort: 4179,
      artifactRootOverride: false,
    },
    requiredScreenshots: screenshotNames,
    screenshotDiagnostics: {
      presentScreenshots: screenshotNames,
      missingScreenshots: [],
      invalidScreenshots: [],
    },
    cleanArtifacts: passingStep(),
    browser: passingStep(),
    screenshotArtifacts: passingStep(),
    passed: true,
    ...overrides,
  }
}

function failedAcceptanceSummary() {
  return passingAcceptanceSummary({
    screenshotDiagnostics: {
      presentScreenshots: [],
      missingScreenshots: screenshotNames,
      invalidScreenshots: [],
    },
    browser: {
      status: 1,
      signal: null,
      error: null,
      failure: 'local web server listen blocked by environment on 127.0.0.1:4179 (EPERM)',
    },
    screenshotArtifacts: {
      status: 1,
      signal: null,
      error: null,
      failure: 'exited with 1',
    },
    passed: false,
  })
}

function passingStep() {
  return {
    status: 0,
    signal: null,
    error: null,
    failure: null,
  }
}

function createPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  const rowSize = 1 + width * 3
  const pixels = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize
    pixels[rowOffset] = 0
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3
      pixels[pixelOffset] = x % 256
      pixels[pixelOffset + 1] = y % 256
      pixels[pixelOffset + 2] = (x + y) % 256
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from(`comment\0${'agent-run-debugging-artifact'.repeat(96)}`, 'utf8')),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

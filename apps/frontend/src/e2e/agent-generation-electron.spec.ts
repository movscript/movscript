import { _electron as electron, expect, test } from '@playwright/test'
import electronPath from 'electron'
import { resolve } from 'node:path'

import { mockGenerationAppShell } from './generationAppShell'
import { buildGenerationAppBootstrap, buildGenerationAppBootstrapScenario } from './generationAppSeed'
import {
  assertGenerationLifecycle,
  assertGenerationFailureLifecycle,
  assertGenerationSuccessLifecycle,
  assertGenerationTimeoutLifecycle,
  attachGeneratedResourceCandidate,
  mockGenerationCandidateAttachSuccess,
  mockGenerationCandidateTargets,
} from './generationAssertions'

test('electron renderer smoke renders generation lifecycle and candidate flow', async () => {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('electron generation E2E requires a baseURL')
  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildGenerationAppBootstrap(baseURL)),
    },
  })

  try {
    const page = await app.firstWindow()
    await mockGenerationAppShell(page)
    await mockGenerationCandidateTargets(page)
    await mockGenerationCandidateAttachSuccess(page)
    await page.goto(`${baseURL}/projects`)

    await assertGenerationLifecycle(page)
    const candidateControl = await attachGeneratedResourceCandidate(page, '77')
    await expect(candidateControl).toContainText('已加入候选 #601')
  } finally {
    await app.close()
  }
})

test('electron renderer smoke surfaces generation failures without a generated result card', async () => {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('electron generation E2E requires a baseURL')
  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildGenerationAppBootstrapScenario(baseURL, 'failed')),
    },
  })

  try {
    const page = await app.firstWindow()
    await mockGenerationAppShell(page)
    await page.goto(`${baseURL}/projects`)

    await assertGenerationFailureLifecycle(page)
  } finally {
    await app.close()
  }
})

test('electron renderer smoke surfaces generation monitor timeouts without a generated result card', async () => {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('electron generation E2E requires a baseURL')
  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildGenerationAppBootstrapScenario(baseURL, 'timeout')),
    },
  })

  try {
    const page = await app.firstWindow()
    await mockGenerationAppShell(page)
    await page.goto(`${baseURL}/projects`)

    await assertGenerationTimeoutLifecycle(page)
  } finally {
    await app.close()
  }
})

test('electron renderer smoke renders video generation lifecycle and candidate flow', async () => {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('electron generation E2E requires a baseURL')
  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildGenerationAppBootstrapScenario(baseURL, 'success', 'video')),
    },
  })

  try {
    const page = await app.firstWindow()
    await mockGenerationAppShell(page, 'video')
    await mockGenerationCandidateTargets(page)
    await mockGenerationCandidateAttachSuccess(page, 9102)
    await page.goto(`${baseURL}/projects`)

    await assertGenerationSuccessLifecycle(page, {
      resultName: 'provider-video-redacted.mp4',
      resourceId: 9102,
      providerName: 'Sanitized Video Provider',
      mimeType: 'video/mp4',
    })
    const candidateControl = await attachGeneratedResourceCandidate(page, '77')
    await expect(candidateControl).toContainText('已加入候选 #601')
  } finally {
    await app.close()
  }
})

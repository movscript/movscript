import { defineConfig, devices } from '@playwright/test'

const e2ePort = Number(process.env.MOVSCRIPT_E2E_PORT ?? 4179)
const externalBaseURL = process.env.MOVSCRIPT_E2E_BASE_URL?.trim()
const e2eBrowserChannel = process.env.MOVSCRIPT_E2E_BROWSER_CHANNEL?.trim()
const e2eBaseURL = externalBaseURL || `http://127.0.0.1:${e2ePort}`
const reporter = process.env.CI
  ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
  : 'list'
const webServer = externalBaseURL
  ? undefined
  : {
      command: `pnpm exec vite --config vite.e2e.config.ts --host 127.0.0.1 --port ${e2ePort} --strictPort`,
      url: e2eBaseURL,
      reuseExistingServer: false,
      timeout: 60_000,
    }

export default defineConfig({
  testDir: './src/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter,
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry',
  },
  webServer,
  projects: [
    {
      name: 'chromium',
      testMatch: /(agent-generation|agent-planner|content-workbench|jobs-page|project-workspace|production-orchestrate)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...(e2eBrowserChannel ? { channel: e2eBrowserChannel } : {}),
      },
    },
    {
      name: 'electron',
      testMatch: /(agent-generation-electron|project-workspace-electron|production-orchestrate-electron)\.spec\.ts/,
    },
  ],
})

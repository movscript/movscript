import { defineConfig, devices } from '@playwright/test'

const e2ePort = Number(process.env.MOVSCRIPT_E2E_PORT ?? 4179)
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './src/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --config vite.e2e.config.ts --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /(agent-generation|jobs-page|project-workspace|production-orchestrate)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
    {
      name: 'electron',
      testMatch: /(agent-generation-electron|project-workspace-electron|production-orchestrate-electron)\.spec\.ts/,
    },
  ],
})

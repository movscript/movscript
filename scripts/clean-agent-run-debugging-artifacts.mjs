import { rmSync } from 'node:fs'
import path from 'node:path'

const targets = process.argv.slice(2)
const artifactTargets = targets.length > 0
  ? targets
  : ['apps/frontend/test-results', 'apps/frontend/playwright-report']

for (const target of artifactTargets) {
  const resolved = path.resolve(target)
  rmSync(resolved, { recursive: true, force: true })
}

console.log('AgentRun debugging artifacts cleaned.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('BackendBootBoundary checks local runtime status before showing startup chrome', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'BackendBootBoundary.tsx'), 'utf8')

  assert.match(source, /const \[checkingInitialStatus, setCheckingInitialStatus\] = useState\(false\)/)
  assert.match(source, /if \(checkingInitialStatus\) return null/)
  assert.match(
    source,
    /probeLocalBackendStatus\(targetBaseURL\)[\s\S]*if \(probed\.state === 'ready'\)[\s\S]*ensureLocalRuntime\(targetBaseURL\)/,
  )
  assert.doesNotMatch(source, /updateIfLive\(\{ state: 'starting'[\s\S]*probeLocalBackendStatus\(targetBaseURL\)/)
})

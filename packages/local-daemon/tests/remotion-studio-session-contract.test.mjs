import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve('src/index.ts'), 'utf8')

function sourceBetween(start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('Remotion Studio sessions reserve ports without reusing active suggested ports', () => {
  const openSessionSource = sourceBetween(
    'async function openRemotionStudioSession',
    '\nfunction remotionStudioOpenInput',
  )
  const nodeServiceSource = sourceBetween(
    'async function startNodeHTTPServiceProgram',
    '\nfunction resolveFirstExisting',
  )

  assert.match(openSessionSource, /const port = await reserveRemotionStudioPort\(\)/)
  assert.doesNotMatch(openSessionSource, /const port = await reservePort\(\)/)
  assert.match(nodeServiceSource, /const port = await reservePort\(\)/)
  assert.doesNotMatch(nodeServiceSource, /const port = await reserveRemotionStudioPort\(\)/)
  assert.match(source, /async function reserveRemotionStudioPort\(\): Promise<number> \{[\s\S]*const reservedPorts = remotionStudioReservedPorts\(\)[\s\S]*for \(let attempt = 0; attempt < 10; attempt \+= 1\)[\s\S]*const port = await reservePort\(\)[\s\S]*if \(!reservedPorts\.has\(port\)\) return port/)
  assert.match(source, /throw new Error\('failed to reserve unique Remotion Studio port'\)/)
  assert.match(source, /function remotionStudioReservedPorts\(\): Set<number> \{[\s\S]*for \(const session of remotionStudioSessions\.values\(\)\)[\s\S]*remotionStudioSessionReservesPort\(session\)[\s\S]*ports\.add\(session\.port as number\)/)
  assert.match(source, /function remotionStudioSessionReservesPort\(session: RemotionStudioSessionEntry\): boolean \{[\s\S]*session\.status === 'checking'[\s\S]*session\.status === 'starting'[\s\S]*session\.status === 'ready'[\s\S]*session\.status === 'needs_external_shell'/)
})

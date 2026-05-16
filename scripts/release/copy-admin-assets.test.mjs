import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { copyAdminAssets } from './copy-admin-assets.mjs'

test('copyAdminAssets fails when admin dist is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-copy-admin-'))
  try {
    assert.throws(() => copyAdminAssets(root), /admin build output does not exist/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('copyAdminAssets replaces backend admin bundle with built admin dist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-copy-admin-'))
  const source = join(root, 'apps/admin/dist')
  const target = join(root, 'apps/backend/bin/admin')
  try {
    await mkdir(source, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(join(source, 'index.html'), '<html>admin</html>', 'utf8')
    await writeFile(join(target, 'stale.txt'), 'stale', 'utf8')

    copyAdminAssets(root)

    assert.equal(await readFile(join(target, 'index.html'), 'utf8'), '<html>admin</html>')
    await assert.rejects(readFile(join(target, 'stale.txt'), 'utf8'), /ENOENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(dirname(filePath), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  try {
    await writeFile(tmpPath, content, 'utf8')
    await rename(tmpPath, filePath)
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    throw error
  }
}

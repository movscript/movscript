import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const resourcesPageSource = readSource('apps/frontend/src/features/resources/components/ResourcesPage.tsx')
const resourcesPageDialogsSource = readSource('apps/frontend/src/features/resources/components/ResourcesPageDialogs.tsx')
const resourcesPageItemsSource = readSource('apps/frontend/src/features/resources/components/ResourcesPageItems.tsx')
const contextMenuDismissSource = readSource('apps/frontend/src/features/resources/application/useResourceContextMenuDismiss.ts')
const videoClipElectronSource = readSource('apps/frontend/src/features/resources/application/resourceVideoClipElectron.ts')
const videoClipDialogSource = readSource('apps/frontend/src/features/resources/components/ResourcesPageVideoClipDialog.tsx')
const genResultCardSource = readSource('apps/frontend/src/shared/ui/GenResultCard.tsx')
const resourceQueryCacheSource = readSource('apps/frontend/src/features/resources/application/resourceQueryCache.ts')

test('resources page delegates context menu global dismiss listeners', () => {
  assert.match(resourcesPageSource, /from '@\/features\/resources\/components\/ResourcesPageItems'/)
  assert.doesNotMatch(resourcesPageSource, /from '@\/features\/resources\/application\/useResourceContextMenuDismiss'/)
  assert.doesNotMatch(resourcesPageSource, /window\.addEventListener/)
  assert.doesNotMatch(resourcesPageSource, /window\.removeEventListener/)
  assert.match(resourcesPageItemsSource, /from '@\/features\/resources\/application\/useResourceContextMenuDismiss'/)
  assert.match(resourcesPageItemsSource, /useResourceContextMenuDismiss\(onClose\)/)

  assert.match(contextMenuDismissSource, /export function useResourceContextMenuDismiss/)
  assert.match(contextMenuDismissSource, /from '@\/shared\/infrastructure\/windowEvents'/)
  assert.match(contextMenuDismissSource, /listenToWindowEvent\('click', close\)/)
  assert.match(contextMenuDismissSource, /listenToWindowEvent\('keydown', close\)/)
  assert.doesNotMatch(contextMenuDismissSource, /window\.addEventListener/)
  assert.doesNotMatch(contextMenuDismissSource, /window\.removeEventListener/)
})

test('resources page delegates video clip Electron API access', () => {
  assert.match(resourcesPageSource, /from '@\/features\/resources\/components\/ResourcesPageVideoClipDialog'/)
  assert.doesNotMatch(resourcesPageSource, /from '@\/features\/resources\/application\/resourceVideoClipElectron'/)
  assert.match(videoClipDialogSource, /from '@\/features\/resources\/application\/resourceVideoClipElectron'/)
  assert.match(videoClipDialogSource, /clipResourceVideo\(/)
  assert.match(videoClipDialogSource, /getResourceVideoClipStatus\(/)
  assert.match(videoClipDialogSource, /resourceVideoClipApiAvailable\(\)/)
  assert.doesNotMatch(resourcesPageSource, /window\.api/)
  assert.doesNotMatch(videoClipDialogSource, /window\.api/)

  assert.match(videoClipElectronSource, /readElectronApi\(\)\?\.clipVideo/)
  assert.match(videoClipElectronSource, /readElectronApi\(\)\?\.getVideoClipStatus/)
  assert.doesNotMatch(videoClipElectronSource, /window\.api/)
  assert.match(videoClipElectronSource, /export function resourceVideoClipApiAvailable/)
})

test('resources page delegates dialog implementations', () => {
  assert.match(resourcesPageSource, /from '@\/features\/resources\/components\/ResourcesPageDialogs'/)
  assert.match(resourcesPageDialogsSource, /export function MoveDialog/)
  assert.match(resourcesPageDialogsSource, /export function RenameResourceDialog/)
  assert.match(resourcesPageDialogsSource, /export function ShareToProjectDialog/)
  assert.doesNotMatch(resourcesPageSource, /function MoveDialog/)
  assert.doesNotMatch(resourcesPageSource, /function RenameResourceDialog/)
  assert.doesNotMatch(resourcesPageSource, /function ShareToProjectDialog/)
  assert.doesNotMatch(resourcesPageSource, /ResourceDialogContent/)
})

test('resource cache reads are delegated to application helpers', () => {
  assert.match(genResultCardSource, /from '@\/features\/resources\/application\/resourceQueryCache'/)
  assert.match(genResultCardSource, /readCachedResourceById\(qc, id\)/)
  assert.doesNotMatch(genResultCardSource, /qc\.getQueryData/)
  assert.match(resourceQueryCacheSource, /export function readCachedResourceById/)
  assert.match(resourceQueryCacheSource, /resourceKeys\.all/)
  assert.match(resourceQueryCacheSource, /queryClient\.getQueryData<RawResource\[]>/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const resourcesPageSource = readSource('apps/frontend/src/features/resources/components/ResourcesPage.tsx')
const resourcesPageDialogsSource = readSource('apps/frontend/src/features/resources/components/ResourcesPageDialogs.tsx')
const resourcesPageItemsSource = readSource('apps/frontend/src/features/resources/components/ResourcesPageItems.tsx')
const resourcePageUiSource = readSource('apps/frontend/src/features/resources/components/ResourcePageUi.tsx')
const resourcePageDialogUiSource = readSource('apps/frontend/src/features/resources/components/ResourcePageDialogUi.tsx')
const contextMenuDismissSource = readSource('apps/frontend/src/features/resources/application/useResourceContextMenuDismiss.ts')
const videoClipElectronSource = readSource('apps/frontend/src/features/resources/application/resourceVideoClipElectron.ts')
const videoClipSourceHookSource = readSource('apps/frontend/src/features/resources/application/useResourceVideoClipSource.ts')
const videoClipStatusHookSource = readSource('apps/frontend/src/features/resources/application/useResourceVideoClipStatus.ts')
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

test('resources page delegates resource trim Electron mediaPipeline access', () => {
  assert.match(resourcesPageSource, /from '@\/features\/resources\/components\/ResourcesPageVideoClipDialog'/)
  assert.doesNotMatch(resourcesPageSource, /from '@\/features\/resources\/application\/resourceVideoClipElectron'/)
  assert.match(videoClipDialogSource, /from '@\/features\/resources\/application\/resourceVideoClipElectron'/)
  assert.match(videoClipDialogSource, /trimResourceVideoSegment\(/)
  assert.match(videoClipDialogSource, /from '@\/features\/resources\/application\/useResourceVideoClipStatus'/)
  assert.match(videoClipDialogSource, /useResourceVideoClipStatus\(\)/)
  assert.doesNotMatch(videoClipDialogSource, /getResourceVideoClipStatus\(/)
  assert.doesNotMatch(videoClipDialogSource, /resourceVideoClipApiAvailable\(\)/)
  assert.doesNotMatch(resourcesPageSource, /window\.api/)
  assert.doesNotMatch(videoClipDialogSource, /window\.api/)

  assert.match(videoClipStatusHookSource, /getResourceMediaPipelineTrimStatus\(\)/)
  assert.match(videoClipStatusHookSource, /resourceMediaPipelineTrimApiAvailable\(\)/)
  assert.match(videoClipElectronSource, /renderMediaPipelineSingleClip/)
  assert.match(videoClipElectronSource, /getMediaPipelineFFmpegStatus/)
  assert.doesNotMatch(videoClipElectronSource, /api\?\.clipVideo/)
  assert.doesNotMatch(videoClipElectronSource, /api\?\.getVideoClipStatus/)
  assert.doesNotMatch(videoClipElectronSource, /\?\?/)
  assert.doesNotMatch(videoClipElectronSource, /window\.api/)
  assert.match(videoClipElectronSource, /export function resourceMediaPipelineTrimApiAvailable/)
})

test('resources video clip dialog delegates source blob loading lifecycle', () => {
  assert.match(videoClipDialogSource, /from '@\/features\/resources\/application\/useResourceVideoClipSource'/)
  assert.match(videoClipDialogSource, /useResourceVideoClipSource\(resource\)/)
  assert.doesNotMatch(videoClipDialogSource, /loadResourceBlob/)
  assert.doesNotMatch(videoClipDialogSource, /createObjectUrl/)
  assert.doesNotMatch(videoClipDialogSource, /revokeObjectUrl/)
  assert.doesNotMatch(videoClipDialogSource, /sourceLoadAttempt/)

  assert.match(videoClipSourceHookSource, /export function useResourceVideoClipSource/)
  assert.match(videoClipSourceHookSource, /loadResourceBlob\(resource/)
  assert.match(videoClipSourceHookSource, /createObjectUrl\(blob\)/)
  assert.match(videoClipSourceHookSource, /revokeObjectUrl\(objectUrl\)/)
  assert.match(videoClipSourceHookSource, /retrySourceLoad: \(\) => setSourceLoadAttempt/)
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

test('resource page dialog, clip, and permission primitives are split from the wrapper barrel', () => {
  assert.match(resourcePageUiSource, /export \* from '@\/features\/resources\/components\/ResourcePageDialogUi'/)
  assert.doesNotMatch(resourcePageUiSource, /export function ResourceDialogContent/)
  assert.doesNotMatch(resourcePageUiSource, /export function ResourceClipLayout/)
  assert.doesNotMatch(resourcePageUiSource, /export function ResourcePermissionSection/)

  assert.match(resourcePageDialogUiSource, /export function ResourceDialogContent/)
  assert.match(resourcePageDialogUiSource, /export function ResourceClipLayout/)
  assert.match(resourcePageDialogUiSource, /export function ResourcePermissionSection/)
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

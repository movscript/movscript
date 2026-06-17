import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryPage.tsx')
const pageSectionsSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryPageSections.tsx')
const browserChromeSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryBrowserChrome.tsx')
const importDialogSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryImportDialog.tsx')
const importDialogSectionsSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryImportDialogSections.tsx')
const referenceDetailSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryReferenceDetail.tsx')
const referenceCardSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryReferenceCard.tsx')
const workspaceFieldsSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryWorkspaceFields.tsx')
const videoPreviewSource = readSource('apps/frontend/src/features/shot-library/components/shotLibraryVideoPreview.ts')
const importPreparationSource = readSource('apps/frontend/src/features/shot-library/components/shotLibraryImportPreparation.ts')
const shotCutElectronSource = readSource('apps/frontend/src/features/shot-library/application/shotCutElectron.ts')
const shotLibraryQueryKeysSource = readSource('apps/frontend/src/features/shot-library/application/shotLibraryQueryKeys.ts')
const shotLibraryMutationSource = readSource('apps/frontend/src/features/shot-library/application/shotLibraryMutationInvalidation.ts')
const shotLibraryWorkspaceModelSource = readSource('apps/frontend/src/features/shot-library/domain/shotLibraryWorkspaceModel.ts')

test('shot library page delegates shot cut Electron API access', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/components\/shotLibraryImportPreparation'/)
  assert.doesNotMatch(pageSource, /from '@\/features\/shot-library\/application\/shotCutElectron'/)
  assert.doesNotMatch(pageSource, /await analyzeShotCuts\(/)
  assert.doesNotMatch(pageSource, /window\.api/)

  assert.match(importPreparationSource, /from '@\/features\/shot-library\/application\/shotCutElectron'/)
  assert.match(importPreparationSource, /await analyzeShotCuts\(/)
  assert.doesNotMatch(importPreparationSource, /window\.api/)
  assert.match(shotCutElectronSource, /export async function analyzeShotCuts/)
  assert.match(shotCutElectronSource, /analyzeMediaPipelineShotCuts/)
  assert.doesNotMatch(shotCutElectronSource, /api\?\.analyzeShotCuts/)
  assert.doesNotMatch(shotCutElectronSource, /\?\?/)
  assert.doesNotMatch(shotCutElectronSource, /window\.api/)
})

test('shot library page delegates query keys and invalidation', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/application\/shotLibraryQueryKeys'/)
  assert.match(pageSource, /shotLibraryKeys\.referenceList\(\{ sources: enabledSources, query, language: i18n\.language \}\)/)
  assert.match(pageSource, /invalidateShotLibraryMutationResult\(queryClient, shotReferencesChangedResult/)
  assert.doesNotMatch(pageSource, /queryKey: \['shot-references'/)
  assert.doesNotMatch(pageSource, /invalidateQueries\(\{ queryKey: \['shot-references'\]/)
  assert.doesNotMatch(pageSource, /invalidateShotReferences/)

  assert.match(shotLibraryQueryKeysSource, /export const shotLibraryKeys/)
  assert.match(shotLibraryQueryKeysSource, /references: \['shot-references'\] as const/)
  assert.doesNotMatch(shotLibraryQueryKeysSource, /export function invalidateShotReferences/)
  assert.match(shotLibraryMutationSource, /export interface ShotLibraryMutationEvent/)
  assert.match(shotLibraryMutationSource, /type: 'ShotReferencesChanged'/)
  assert.match(shotLibraryMutationSource, /export function shotReferencesChangedResult/)
  assert.match(shotLibraryMutationSource, /export function invalidateShotLibraryMutationResult/)
})

test('shot library page delegates workspace conversion model', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/domain\/shotLibraryWorkspaceModel'/)
  assert.doesNotMatch(pageSource, /function detailWorkspaceFromEntry\(/)
  assert.doesNotMatch(pageSource, /function buildImportWorkspaces\(/)
  assert.doesNotMatch(pageSource, /function importWorkspaceToManualUpdate\(/)
  assert.doesNotMatch(pageSource, /function buildShotFacetOptions\(/)

  assert.match(shotLibraryWorkspaceModelSource, /export function detailWorkspaceFromEntry/)
  assert.match(shotLibraryWorkspaceModelSource, /export function buildImportWorkspaces/)
  assert.match(shotLibraryWorkspaceModelSource, /export function importWorkspaceToManualUpdate/)
  assert.match(shotLibraryWorkspaceModelSource, /export function buildShotFacetOptions/)
  assert.doesNotMatch(shotLibraryWorkspaceModelSource, /window\.api/)
  assert.doesNotMatch(shotLibraryWorkspaceModelSource, /window\.addEventListener/)
})

test('shot library page delegates browser chrome components', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryPageSections'/)
  assert.doesNotMatch(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryBrowserChrome'/)
  assert.match(pageSectionsSource, /from '@\/features\/shot-library\/components\/ShotLibraryBrowserChrome'/)
  assert.doesNotMatch(pageSource, /function ShotLibraryMetric\(/)
  assert.doesNotMatch(pageSource, /function ShotLibrarySourceBar\(/)
  assert.doesNotMatch(pageSource, /function ShotFacetFilters\(/)
  assert.doesNotMatch(pageSource, /function setFacetValue\(/)
  assert.doesNotMatch(pageSectionsSource, /function setFacetValue\(/)

  assert.match(browserChromeSource, /export function ShotLibraryMetric/)
  assert.match(browserChromeSource, /export function ShotLibrarySourceBar/)
  assert.match(browserChromeSource, /export function ShotFacetFilters/)
  assert.match(browserChromeSource, /localizeShotFacetValue/)
})

test('shot library page delegates reference cards and video preview helpers', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryPageSections'/)
  assert.doesNotMatch(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryReferenceCard'/)
  assert.match(pageSectionsSource, /from '@\/features\/shot-library\/components\/ShotLibraryReferenceCard'/)
  assert.doesNotMatch(pageSource, /from '@\/features\/shot-library\/components\/shotLibraryVideoPreview'/)
  assert.doesNotMatch(pageSource, /function ShotReferenceCard\(/)
  assert.doesNotMatch(pageSource, /function ShotReferenceThumbnail\(/)
  assert.doesNotMatch(pageSource, /function parseAspectRatio\(/)
  assert.doesNotMatch(pageSource, /function parseResolutionAspectRatio\(/)

  assert.match(referenceCardSource, /export function ShotReferenceCard/)
  assert.match(referenceCardSource, /function ShotReferenceThumbnail/)
  assert.match(referenceCardSource, /from '@\/features\/shot-library\/components\/shotLibraryVideoPreview'/)
  assert.match(referenceDetailSource, /from '@\/features\/shot-library\/components\/shotLibraryVideoPreview'/)
  assert.match(videoPreviewSource, /export function shotReferenceAspectRatio/)
  assert.match(videoPreviewSource, /export function normalizedCssAspectRatio/)
  assert.match(videoPreviewSource, /export function seekVideoToTime/)
})

test('shot library page delegates workspace form fields', () => {
  assert.doesNotMatch(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryWorkspaceFields'/)
  assert.doesNotMatch(pageSource, /function ManualField\(/)
  assert.doesNotMatch(pageSource, /function TagInputField\(/)
  assert.doesNotMatch(pageSource, /function StructuredShotEditor\(/)
  assert.doesNotMatch(pageSource, /function TextWorkspaceField\(/)

  assert.match(importDialogSource, /from '@\/features\/shot-library\/components\/ShotLibraryImportDialogSections'/)
  assert.doesNotMatch(importDialogSource, /from '@\/features\/shot-library\/components\/ShotLibraryWorkspaceFields'/)
  assert.match(importDialogSectionsSource, /from '@\/features\/shot-library\/components\/ShotLibraryWorkspaceFields'/)
  assert.match(referenceDetailSource, /from '@\/features\/shot-library\/components\/ShotLibraryWorkspaceFields'/)
  assert.match(workspaceFieldsSource, /export function ManualField/)
  assert.match(workspaceFieldsSource, /export function TagInputField/)
  assert.match(workspaceFieldsSource, /export function StructuredShotEditor/)
  assert.match(workspaceFieldsSource, /function TextWorkspaceField/)
  assert.match(workspaceFieldsSource, /appendTagValue/)
  assert.match(workspaceFieldsSource, /localizeShotSemanticValue/)
})

test('shot library page delegates import dialog components', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryImportDialog'/)
  assert.doesNotMatch(pageSource, /function ShotImportDialog\(/)
  assert.doesNotMatch(pageSource, /function ShotImportResourceGrid\(/)
  assert.doesNotMatch(pageSource, /function ShotWorkspaceClipPlayer\(/)
  assert.doesNotMatch(pageSource, /function ShotImportWorkspaceEditor\(/)
  assert.doesNotMatch(pageSource, /function useShotWorkspaceGridMetrics\(/)

  assert.match(importDialogSource, /export function ShotImportDialog/)
  assert.match(importDialogSource, /export function ShotWorkspaceClipPlayer/)
  assert.match(importDialogSource, /subscribeShotLibraryMeasuredBox/)
  assert.match(importDialogSource, /calculateShotWorkspaceGridMetrics/)
  assert.doesNotMatch(importDialogSource, /function ShotImportResourceGrid/)
  assert.doesNotMatch(importDialogSource, /function ShotImportWorkspaceEditor/)
  assert.match(importDialogSectionsSource, /export function ShotImportResourceGrid/)
  assert.match(importDialogSectionsSource, /export function ShotImportWorkspaceEditor/)
})

test('shot library page delegates reference detail components', () => {
  assert.match(pageSource, /from '@\/features\/shot-library\/components\/ShotLibraryReferenceDetail'/)
  assert.doesNotMatch(pageSource, /function ShotReferenceDetail\(/)
  assert.doesNotMatch(pageSource, /function SearchMatchPanel\(/)
  assert.doesNotMatch(pageSource, /function DetailGroup\(/)
  assert.doesNotMatch(pageSource, /function TagRow\(/)
  assert.doesNotMatch(pageSource, /function visualAnalysisDetails\(/)
  assert.doesNotMatch(pageSource, /function searchIndexDetails\(/)

  assert.match(referenceDetailSource, /export function ShotReferenceDetail/)
  assert.match(referenceDetailSource, /function SearchMatchPanel/)
  assert.match(referenceDetailSource, /function DetailGroup/)
  assert.match(referenceDetailSource, /function TagRow/)
  assert.match(referenceDetailSource, /function visualAnalysisDetails/)
  assert.match(referenceDetailSource, /function searchIndexDetails/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

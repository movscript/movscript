import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const jobsPageSource = readSource('apps/frontend/src/features/jobs/components/JobsPage.tsx')
const jobsPartsSource = readSource('apps/frontend/src/features/jobs/components/JobsPageParts.tsx')
const jobsCardsSource = readSource('apps/frontend/src/features/jobs/components/JobsPageCards.tsx')
const jobsDetailCardSource = readSource('apps/frontend/src/features/jobs/components/JobDetailCard.tsx')
const jobsCollectionCardsSource = readSource('apps/frontend/src/features/jobs/components/JobCollectionCards.tsx')
const jobsCardModelSource = readSource('apps/frontend/src/features/jobs/components/JobsPageCardModel.tsx')

test('jobs page cards are isolated from filtering and category composition', () => {
  assert.match(jobsPageSource, /from '@\/features\/jobs\/components\/JobsPageParts'/)
  assert.match(jobsPartsSource, /from '@\/features\/jobs\/components\/JobsPageCards'/)
  assert.match(jobsPartsSource, /export \{ JobDetailCard, JobGridThumb, JobListCard \} from '@\/features\/jobs\/components\/JobsPageCards'/)
  assert.doesNotMatch(jobsPartsSource, /function JobDetailCard/)
  assert.doesNotMatch(jobsPartsSource, /function JobListCard/)
  assert.doesNotMatch(jobsPartsSource, /function JobGridThumb/)
  assert.doesNotMatch(jobsPartsSource, /jobStatusRecipe/)
  assert.doesNotMatch(jobsPartsSource, /MediaViewer/)

  assert.match(jobsCardsSource, /export \{ JobDetailCard \} from '\.\/JobDetailCard'/)
  assert.match(jobsCardsSource, /export \{ JobGridThumb, JobListCard \} from '\.\/JobCollectionCards'/)
  assert.match(jobsDetailCardSource, /export function JobDetailCard/)
  assert.match(jobsCollectionCardsSource, /export function JobListCard/)
  assert.match(jobsCollectionCardsSource, /export function JobGridThumb/)
  assert.match(jobsCardModelSource, /jobStatusRecipe\(status\)/)
  assert.match(jobsCollectionCardsSource, /MediaViewer/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

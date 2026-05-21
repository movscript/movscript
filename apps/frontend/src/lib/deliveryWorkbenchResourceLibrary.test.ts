import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDeliveryResourceLibraryParams,
  buildDeliveryResourceLibraryQueryKey,
  deliveryResourceLibraryTypeParam,
  initialDeliveryResourceLibraryState,
  setDeliveryResourceLibraryPage,
  setDeliveryResourceLibrarySearch,
  setDeliveryResourceLibraryType,
} from './deliveryWorkbenchResourceLibrary'

test('delivery resource library controller normalizes query state', () => {
  assert.equal(deliveryResourceLibraryTypeParam('all'), 'image,video,audio,text,file')
  assert.equal(deliveryResourceLibraryTypeParam('video'), 'video')
  assert.deepEqual(buildDeliveryResourceLibraryQueryKey(10, {
    search: 'final',
    type: 'video',
    page: 2,
  }), ['resources', 'semantic-final-library', 10, 'video', 'final', 2])
  assert.deepEqual(buildDeliveryResourceLibraryParams({
    search: '  final cut  ',
    type: 'all',
    page: 3,
  }), {
    page: 3,
    page_size: 6,
    type: 'image,video,audio,text,file',
    q: 'final cut',
  })
  assert.deepEqual(buildDeliveryResourceLibraryParams({
    search: '  ',
    type: 'audio',
    page: 1,
  }), {
    page: 1,
    page_size: 6,
    type: 'audio',
    q: undefined,
  })
})

test('delivery resource library controller transitions search, type, and page', () => {
  const paged = { ...initialDeliveryResourceLibraryState, page: 4 }

  assert.deepEqual(setDeliveryResourceLibrarySearch(paged, 'mix'), {
    ...initialDeliveryResourceLibraryState,
    search: 'mix',
    page: 1,
  })
  assert.deepEqual(setDeliveryResourceLibraryType(paged, 'audio'), {
    ...initialDeliveryResourceLibraryState,
    type: 'audio',
    page: 1,
  })
  assert.equal(setDeliveryResourceLibraryPage(initialDeliveryResourceLibraryState, -8).page, 1)
  assert.equal(setDeliveryResourceLibraryPage(initialDeliveryResourceLibraryState, 2.6).page, 3)
})

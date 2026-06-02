export { ReferenceManager } from './manager/referenceManager.js'
export {
  AGENT_REFERENCE_DIR_ENV,
  loadAgentReferenceStore,
  loadBuiltinReferenceStore,
  loadReferenceStore,
  mergeReferenceStores,
  resolveBuiltinReferenceDir,
} from './loading/referenceLoader.js'
export { EMPTY_REFERENCE_STORE, InMemoryReferenceStore } from './store/referenceStore.js'
export { searchReferenceChunks } from './search/referenceSearch.js'
export type { LocalReferenceChunk, LocalReferenceSet, LocalReferenceSearchResult } from './shared/types.js'

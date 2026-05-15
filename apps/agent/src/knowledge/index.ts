export { KnowledgeManager } from './knowledgeManager.js'
export {
  AGENT_KNOWLEDGE_DIR_ENV,
  loadAgentKnowledgeStore,
  loadBuiltinKnowledgeStore,
  loadKnowledgeStore,
  mergeKnowledgeStores,
  resolveBuiltinKnowledgeDir,
} from './knowledgeLoader.js'
export { EMPTY_KNOWLEDGE_STORE, InMemoryKnowledgeStore } from './knowledgeStore.js'
export { searchKnowledgeChunks } from './knowledgeSearch.js'
export type { KnowledgeChunk, KnowledgeCollection, KnowledgeSearchResult } from './types.js'

export type ScriptDocumentFileKind = 'docx' | 'legacy_doc' | 'text'

export const SCRIPT_DOCUMENT_ACCEPT = '.txt,.md,.text,.csv,.json,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword'

export function scriptDocumentFileKindFromName(fileName: string): ScriptDocumentFileKind {
  const name = fileName.trim().toLowerCase()
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'legacy_doc'
  return 'text'
}

export function scriptDocumentBaseTitleFromName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

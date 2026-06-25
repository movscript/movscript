import {
  SCRIPT_DOCUMENT_ACCEPT,
  scriptDocumentBaseTitleFromName,
  scriptDocumentFileKindFromName,
} from '@movscript/resources'

export { SCRIPT_DOCUMENT_ACCEPT, scriptDocumentFileKindFromName }

export function scriptDocumentTitleFromName(fileName: string) {
  const baseName = scriptDocumentBaseTitleFromName(fileName)
  return baseName || '未命名手记'
}

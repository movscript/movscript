import { scriptDocumentFileKindFromName } from '../domain/scriptDocuments'

export async function readScriptDocument(file: File) {
  const kind = scriptDocumentFileKindFromName(file.name)
  if (kind === 'docx') {
    return readDocx(file)
  }
  if (kind === 'legacy_doc') {
    throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传')
  }
  return file.text()
}

async function readDocx(file: File) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('无法读取 docx 正文')

  const xml = await doc.async('string')
  const parser = new DOMParser()
  const documentXml = parser.parseFromString(xml, 'application/xml')
  const paragraphs = Array.from(documentXml.getElementsByTagName('w:p'))
  const lines = paragraphs
    .map((paragraph) => Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent ?? '').join(''))
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.join('\n')
}

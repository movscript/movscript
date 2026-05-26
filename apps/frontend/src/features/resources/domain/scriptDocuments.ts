export const SCRIPT_DOCUMENT_ACCEPT = '.txt,.md,.text,.csv,.json,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword'

export function scriptDocumentTitleFromName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim()
  return baseName || '未命名剧本'
}

export async function readScriptDocument(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    return readDocx(file)
  }
  if (name.endsWith('.doc')) {
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

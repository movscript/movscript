import { useRef, useState } from 'react'
import type { Script } from '@/types'
import { Save, Upload } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

interface ScriptFormProps {
  script: Script
  projectId?: number
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
}

export function ScriptForm({ draft, onChange, onSave, isSaving }: ScriptFormProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')

  function updateRawSource(value: string) {
    onChange({ ...draft, raw_source: value, content: value })
  }

  async function handleFile(file?: File) {
    if (!file) return
    setFileError('')
    try {
      const text = await readScriptDocument(file)
      setFileName(file.name)
      updateRawSource(text)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '读取文档失败')
    }
  }

  return (
    <section className="bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Upload size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">文件与正文</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">上传文档或直接编辑剧本正文。</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onSave(draft)} disabled={isSaving} className="gap-1.5">
            <Save size={13} />
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-h-[430px] flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.text,.csv,.json,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
              <Upload size={13} />
              选择文档
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            {fileError && <span className="text-xs text-destructive">{fileError}</span>}
          </div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('details.scriptBody')}</Label>
          <Textarea
            className="min-h-[380px] flex-1 resize-y font-mono leading-relaxed"
            placeholder={t('details.scriptBodyPlaceholder')}
            value={draft.raw_source ?? draft.content ?? ''}
            onChange={(event) => updateRawSource(event.target.value)}
          />
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <Label className="text-xs font-semibold text-foreground">分类</Label>
            <Input
              className="mt-2"
              placeholder="未分类"
              value={draft.script_type === 'uncategorized' ? '' : draft.script_type ?? ''}
              onChange={(event) => onChange({ ...draft, script_type: event.target.value })}
            />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">分类是自由标签，例如：第一集、广告脚本、拍摄版。</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold text-foreground">文件说明</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              支持粘贴正文，或上传 txt、md、json、csv、docx 文档。保存后会更新当前剧本正文。
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

async function readScriptDocument(file: File) {
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

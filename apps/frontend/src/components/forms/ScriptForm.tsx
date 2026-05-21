import { useRef, useState } from 'react'
import type { Script } from '@/types'
import { GitBranch, Save, Upload } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { SCRIPT_DOCUMENT_ACCEPT, readScriptDocument } from '@/lib/scriptDocuments'

interface ScriptFormProps {
  script: Script
  projectId?: number
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
  onCreateVersion?: () => void
  isCreatingVersion?: boolean
  canCreateVersion?: boolean
  versionStateLabel?: string
  latestVersionLabel?: string
}

export function ScriptForm({
  draft,
  onChange,
  onSave,
  isSaving,
  onCreateVersion,
  isCreatingVersion,
  canCreateVersion = true,
  versionStateLabel,
  latestVersionLabel,
}: ScriptFormProps) {
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
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={SCRIPT_DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
            <Upload size={14} />
            导入文档
          </Button>
          {fileName && <span className="type-label text-muted-foreground">{fileName}</span>}
          {fileError && <span className="type-label text-destructive">{fileError}</span>}
        </div>
        <div className="flex items-center gap-2">
          {versionStateLabel && (
            <div className="hidden text-right sm:block">
              <p className="type-caption font-medium text-foreground">{versionStateLabel}</p>
              {latestVersionLabel && <p className="type-tiny text-muted-foreground">{latestVersionLabel}</p>}
            </div>
          )}
          {onCreateVersion && (
            <Button size="sm" variant="outline" onClick={onCreateVersion} disabled={isCreatingVersion || !canCreateVersion} className="gap-1.5">
              <GitBranch size={14} />
              {isCreatingVersion ? '创建中…' : '保存为版本'}
            </Button>
          )}
          <Button size="sm" onClick={() => onSave(draft)} disabled={isSaving} className="gap-1.5">
            <Save size={14} />
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-h-0 flex-col">
          <Label className="mb-1.5 type-label font-medium text-muted-foreground">{t('details.scriptBody')}</Label>
          <Textarea
            className="min-h-[400px] flex-1 resize-none font-mono type-body leading-relaxed"
            placeholder={t('details.scriptBodyPlaceholder')}
            value={draft.raw_source ?? draft.content ?? ''}
            onChange={(event) => updateRawSource(event.target.value)}
          />
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <Label className="type-label font-semibold text-foreground">分类标签</Label>
            <Input
              className="mt-2"
              placeholder="未分类"
              value={draft.script_type === 'uncategorized' ? '' : draft.script_type ?? ''}
              onChange={(event) => onChange({ ...draft, script_type: event.target.value })}
            />
            <p className="mt-2 type-label leading-relaxed text-muted-foreground">自由标签，如：第一集、广告脚本、拍摄版。</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <Label className="type-label font-semibold text-foreground">摘要</Label>
            <Textarea
              className="mt-2 min-h-[80px] resize-none type-label"
              placeholder="剧本简介或备注…"
              value={draft.summary ?? ''}
              onChange={(event) => onChange({ ...draft, summary: event.target.value })}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="type-label leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">保存</strong> — 更新剧本正文草稿。<br />
              <strong className="font-medium text-foreground">保存为版本</strong> — 基于当前正文创建锁定快照，可直接用于制作。
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

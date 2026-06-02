import { useRef, useState } from 'react'
import type { Script } from '@/types'
import { Save, Upload } from 'lucide-react'
import {
  ScriptEditorActionButton,
  ScriptEditorBodyGrid,
  ScriptEditorBodyTextarea,
  ScriptEditorErrorText,
  ScriptEditorFieldLabel,
  ScriptEditorFormShell,
  ScriptEditorHelperText,
  ScriptEditorHiddenFileInput,
  ScriptEditorInlineMeta,
  ScriptEditorInput,
  ScriptEditorMainField,
  ScriptEditorToolbar,
  ScriptEditorToolbarGroup,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { SCRIPT_DOCUMENT_ACCEPT, readScriptDocument } from '@/features/resources/domain/scriptDocuments'

interface ScriptFormProps {
  script: Script
  projectId?: number
  workspace: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
}

export function ScriptForm({
  workspace,
  onChange,
  onSave,
  isSaving,
}: ScriptFormProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')

  function updateRawSource(value: string) {
    onChange({ ...workspace, raw_source: value, content: value })
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

  const bodyText = workspace.raw_source ?? workspace.content ?? ''

  return (
    <ScriptEditorFormShell>
      <ScriptEditorToolbar>
        <ScriptEditorToolbarGroup>
          <ScriptEditorHiddenFileInput
            ref={fileInputRef}
            type="file"
            accept={SCRIPT_DOCUMENT_ACCEPT}
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <ScriptEditorActionButton type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            导入文档
          </ScriptEditorActionButton>
          {fileName && <ScriptEditorInlineMeta>{fileName}</ScriptEditorInlineMeta>}
          {fileError && <ScriptEditorErrorText>{fileError}</ScriptEditorErrorText>}
        </ScriptEditorToolbarGroup>
        <ScriptEditorToolbarGroup>
          <ScriptEditorActionButton size="sm" onClick={() => onSave(workspace)} disabled={isSaving}>
            <Save size={14} />
            {isSaving ? t('common.saving') : t('common.save')}
          </ScriptEditorActionButton>
        </ScriptEditorToolbarGroup>
      </ScriptEditorToolbar>

      <ScriptEditorBodyGrid>
        <ScriptEditorMainField>
          <ScriptEditorFieldLabel htmlFor="script-title">标题</ScriptEditorFieldLabel>
          <ScriptEditorInput
            id="script-title"
            value={workspace.title ?? ''}
            onChange={(event) => onChange({ ...workspace, title: event.target.value })}
          />
          <ScriptEditorFieldLabel>{t('details.scriptBody')}</ScriptEditorFieldLabel>
          <ScriptEditorHelperText>可直接编辑正文，也可以导入 txt、md 或 docx 文档。</ScriptEditorHelperText>
          <ScriptEditorBodyTextarea
            placeholder={t('details.scriptBodyPlaceholder')}
            value={bodyText}
            onChange={(event) => updateRawSource(event.target.value)}
          />
        </ScriptEditorMainField>
      </ScriptEditorBodyGrid>
    </ScriptEditorFormShell>
  )
}

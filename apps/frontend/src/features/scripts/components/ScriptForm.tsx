import { useRef, useState } from 'react'
import type { Script } from '@/types'
import { GitBranch, Save, Upload } from 'lucide-react'
import {
  ScriptEditorActionButton,
  ScriptEditorBodyGrid,
  ScriptEditorBodyTextarea,
  ScriptEditorErrorText,
  ScriptEditorFieldLabel,
  ScriptEditorFormShell,
  ScriptEditorHiddenFileInput,
  ScriptEditorInlineMeta,
  ScriptEditorMainField,
  ScriptEditorToolbar,
  ScriptEditorToolbarGroup,
  ScriptEditorVersionState,
  ScriptEditorVersionSubtitle,
  ScriptEditorVersionTitle,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { SCRIPT_DOCUMENT_ACCEPT, readScriptDocument } from '@/features/resources/domain/scriptDocuments'

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
          {versionStateLabel && (
            <ScriptEditorVersionState>
              <ScriptEditorVersionTitle>{versionStateLabel}</ScriptEditorVersionTitle>
              {latestVersionLabel && <ScriptEditorVersionSubtitle>{latestVersionLabel}</ScriptEditorVersionSubtitle>}
            </ScriptEditorVersionState>
          )}
          {onCreateVersion && (
            <ScriptEditorActionButton size="sm" variant="outline" onClick={onCreateVersion} disabled={isCreatingVersion || !canCreateVersion}>
              <GitBranch size={14} />
              {isCreatingVersion ? '创建中…' : '保存为版本'}
            </ScriptEditorActionButton>
          )}
          <ScriptEditorActionButton size="sm" onClick={() => onSave(draft)} disabled={isSaving}>
            <Save size={14} />
            {isSaving ? t('common.saving') : t('common.save')}
          </ScriptEditorActionButton>
        </ScriptEditorToolbarGroup>
      </ScriptEditorToolbar>

      <ScriptEditorBodyGrid>
        <ScriptEditorMainField>
          <ScriptEditorFieldLabel>{t('details.scriptBody')}</ScriptEditorFieldLabel>
          <ScriptEditorBodyTextarea
            placeholder={t('details.scriptBodyPlaceholder')}
            value={draft.raw_source ?? draft.content ?? ''}
            onChange={(event) => updateRawSource(event.target.value)}
          />
        </ScriptEditorMainField>
      </ScriptEditorBodyGrid>
    </ScriptEditorFormShell>
  )
}

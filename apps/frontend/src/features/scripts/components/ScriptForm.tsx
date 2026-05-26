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
  ScriptEditorHelperText,
  ScriptEditorHiddenFileInput,
  ScriptEditorInlineMeta,
  ScriptEditorInput,
  ScriptEditorMainField,
  ScriptEditorSidePanel,
  ScriptEditorSideRail,
  ScriptEditorStrongText,
  ScriptEditorSummaryTextarea,
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

        <ScriptEditorSideRail>
          <ScriptEditorSidePanel>
            <ScriptEditorFieldLabel>分类标签</ScriptEditorFieldLabel>
            <ScriptEditorInput
              placeholder="未分类"
              value={draft.script_type === 'uncategorized' ? '' : draft.script_type ?? ''}
              onChange={(event) => onChange({ ...draft, script_type: event.target.value })}
            />
            <ScriptEditorHelperText>自由标签，如：第一集、广告脚本、拍摄版。</ScriptEditorHelperText>
          </ScriptEditorSidePanel>

          <ScriptEditorSidePanel>
            <ScriptEditorFieldLabel>摘要</ScriptEditorFieldLabel>
            <ScriptEditorSummaryTextarea
              placeholder="剧本简介或备注…"
              value={draft.summary ?? ''}
              onChange={(event) => onChange({ ...draft, summary: event.target.value })}
            />
          </ScriptEditorSidePanel>

          <ScriptEditorSidePanel variant="muted">
            <ScriptEditorHelperText>
              <ScriptEditorStrongText>保存</ScriptEditorStrongText> — 更新剧本正文草稿。<br />
              <ScriptEditorStrongText>保存为版本</ScriptEditorStrongText> — 基于当前正文创建锁定快照，可直接用于制作。
            </ScriptEditorHelperText>
          </ScriptEditorSidePanel>
        </ScriptEditorSideRail>
      </ScriptEditorBodyGrid>
    </ScriptEditorFormShell>
  )
}

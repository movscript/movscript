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
  ScriptEditorOutlineItem,
  ScriptEditorOutlineList,
  ScriptEditorOutlinePanel,
  ScriptEditorSidePanel,
  ScriptEditorSideRail,
  ScriptEditorStrongText,
  ScriptEditorSummaryTextarea,
  ScriptEditorToolbar,
  ScriptEditorToolbarGroup,
  ScriptEditorVersionState,
  ScriptEditorVersionSubtitle,
  ScriptEditorVersionTitle,
} from '@/features/scripts/components/ScriptsPageUi'
import { useTranslation } from 'react-i18next'
import { readScriptDocument } from '@/features/resources/application/scriptDocumentReader'
import { SCRIPT_DOCUMENT_ACCEPT } from '@/features/resources/domain/scriptDocuments'

interface ScriptFormProps {
  script: Script
  projectId?: number
  workspace: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  onCreateVersion?: () => void
  isSaving?: boolean
  isCreatingVersion?: boolean
  isCurrentVersionSaved?: boolean
  versionCount?: number
}

export function ScriptForm({
  workspace,
  onChange,
  onSave,
  onCreateVersion,
  isSaving,
  isCreatingVersion,
  isCurrentVersionSaved,
  versionCount = 0,
}: ScriptFormProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)
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
  const outline = buildMarkdownOutline(bodyText)

  function focusOutlineItem(item: ScriptOutlineItem) {
    const textarea = bodyTextareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(item.startChar, item.endChar)
    const lineRatio = item.line / Math.max(1, bodyText.split(/\r?\n/).length)
    textarea.scrollTop = Math.max(0, (textarea.scrollHeight - textarea.clientHeight) * lineRatio)
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
          <ScriptEditorActionButton size="sm" onClick={() => onSave(workspace)} disabled={isSaving}>
            <Save size={14} />
            {isSaving ? t('common.saving') : t('common.save')}
          </ScriptEditorActionButton>
        </ScriptEditorToolbarGroup>
      </ScriptEditorToolbar>

      <ScriptEditorBodyGrid>
        <ScriptEditorSideRail>
          <ScriptEditorOutlinePanel>
            <ScriptEditorStrongText>Markdown 大纲</ScriptEditorStrongText>
            <ScriptEditorHelperText>从 #、##、### 标题自动生成，不另存一份结构。</ScriptEditorHelperText>
            <ScriptEditorOutlineList>
              {outline.length > 0 ? outline.map((item) => (
                <ScriptEditorOutlineItem
                  key={`${item.line}-${item.title}`}
                  level={item.level}
                  line={item.line}
                  onClick={() => focusOutlineItem(item)}
                >
                  {item.title}
                </ScriptEditorOutlineItem>
              )) : (
                <ScriptEditorHelperText>用 Markdown 标题组织集数、场次和段落。</ScriptEditorHelperText>
              )}
            </ScriptEditorOutlineList>
          </ScriptEditorOutlinePanel>
        </ScriptEditorSideRail>
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
            ref={bodyTextareaRef}
            placeholder={t('details.scriptBodyPlaceholder')}
            value={bodyText}
            onChange={(event) => updateRawSource(event.target.value)}
          />
        </ScriptEditorMainField>
        <ScriptEditorSideRail>
          <ScriptEditorSidePanel variant="muted">
            <ScriptEditorVersionState>
              <ScriptEditorVersionTitle>保存为版本</ScriptEditorVersionTitle>
              <ScriptEditorVersionSubtitle>{versionCount} 个版本 · {bodyText.trim().length} 字</ScriptEditorVersionSubtitle>
            </ScriptEditorVersionState>
            <ScriptEditorStrongText>摘要</ScriptEditorStrongText>
            <ScriptEditorHelperText>用于记录这一版正文的创作意图或交付说明。</ScriptEditorHelperText>
            <ScriptEditorSummaryTextarea
              value={workspace.summary ?? ''}
              placeholder="补充摘要"
              onChange={(event) => onChange({ ...workspace, summary: event.target.value })}
            />
            <ScriptEditorActionButton
              type="button"
              size="sm"
              variant="outline"
              disabled={!onCreateVersion || isCreatingVersion || !bodyText.trim() || isCurrentVersionSaved}
              onClick={onCreateVersion}
            >
              {isCreatingVersion ? '保存中' : isCurrentVersionSaved ? '当前已同步' : '保存为版本'}
            </ScriptEditorActionButton>
          </ScriptEditorSidePanel>
        </ScriptEditorSideRail>
      </ScriptEditorBodyGrid>
    </ScriptEditorFormShell>
  )
}

type ScriptOutlineItem = {
  level: number
  title: string
  line: number
  startChar: number
  endChar: number
}

function buildMarkdownOutline(source: string): ScriptOutlineItem[] {
  let cursor = 0
  return source
    .split(/\r?\n/)
    .map((line, index) => {
      const startChar = cursor
      cursor += line.length + 1
      const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
      if (!match) return null
      return {
        level: match[1].length,
        title: match[2].replace(/^#+\s*/, '').trim(),
        line: index + 1,
        startChar,
        endChar: startChar + line.length,
      }
    })
    .filter((item): item is ScriptOutlineItem => Boolean(item?.title))
}

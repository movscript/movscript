import { useRef } from 'react'
import type { Script } from './types.js'
import {
  ScriptEditorActionButton,
  ScriptEditorBodyGrid,
  ScriptEditorBodyTextarea,
  ScriptEditorFieldLabel,
  ScriptEditorFormShell,
  ScriptEditorHelperText,
  ScriptEditorInput,
  ScriptEditorMainField,
  ScriptEditorOutlineItem,
  ScriptEditorOutlineList,
  ScriptEditorOutlinePanel,
  ScriptEditorSidePanel,
  ScriptEditorSideRail,
  ScriptEditorStrongText,
  ScriptEditorSummaryTextarea,
  ScriptEditorVersionState,
  ScriptEditorVersionSubtitle,
  ScriptEditorVersionTitle,
} from './ScriptsPageUi.js'
import { useTranslation } from 'react-i18next'

interface ScriptFormProps {
  script: Script
  projectId?: number
  workspace: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onCreateVersion?: () => void
  isCreatingVersion?: boolean
  isCurrentVersionSaved?: boolean
  versionCount?: number
}

export function ScriptForm({
  workspace,
  onChange,
  onCreateVersion,
  isCreatingVersion,
  isCurrentVersionSaved,
  versionCount = 0,
}: ScriptFormProps) {
  const { t } = useTranslation()
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)

  function updateRawSource(value: string) {
    onChange({ ...workspace, raw_source: value, content: value })
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
      const levelMarker = match[1] ?? ''
      const title = match[2] ?? ''
      return {
        level: levelMarker.length,
        title: title.replace(/^#+\s*/, '').trim(),
        line: index + 1,
        startChar,
        endChar: startChar + line.length,
      }
    })
    .filter((item): item is ScriptOutlineItem => Boolean(item?.title))
}

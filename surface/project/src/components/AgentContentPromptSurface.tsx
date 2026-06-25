import { useEffect, useState } from 'react'
import type { AgentSurfaceSnapshot } from '../data.js'
import { recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export type AgentContentPromptSaveInput = {
  targetPath?: string
  editPrompt: {
    text: string
    negative_text: string
    notes: string
  }
}

export function AgentContentPromptSurface({
  ready,
  params,
  projectId,
  contentUnitId,
  mode = 'edit',
  snapshot,
  isLoading,
  error,
  savePending = false,
  saveError,
  saveSuccess = false,
  onSave,
}: {
  ready: boolean
  params: URLSearchParams
  projectId?: string
  contentUnitId?: string
  mode?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: unknown
  savePending?: boolean
  saveError?: unknown
  saveSuccess?: boolean
  onSave?: (input: AgentContentPromptSaveInput) => void
}) {
  const prompt = recordValue(snapshot?.data?.prompt)
  const backendPrompt = recordValue(snapshot?.data?.backend_prompt)
  const runtimePanel = recordValue(snapshot?.data?.runtime_panel)
  const dependencyReport = recordValue(snapshot?.data?.dependency_report)
  const selectionValidity = recordValue(snapshot?.data?.selection_validity)
  const backendCompiledPrompt = recordValue(backendPrompt?.prompt ?? backendPrompt?.compiled_prompt)
  const sourcePrompt = sourceEditPrompt(prompt, runtimePanel, backendPrompt)
  const targetPath = targetPathForPrompt(contentUnitId, prompt, runtimePanel, backendPrompt, dependencyReport)
  const [text, setText] = useState('')
  const [negativeText, setNegativeText] = useState('')
  const [notes, setNotes] = useState('')
  const [initializedKey, setInitializedKey] = useState('')
  const sourceKey = `${contentUnitId ?? ''}:${snapshot?.generated_at ?? ''}`

  useEffect(() => {
    if (!snapshot || initializedKey === sourceKey) return
    setText(stringValue(sourcePrompt?.text) ?? '')
    setNegativeText(stringValue(sourcePrompt?.negative_text ?? sourcePrompt?.negativeText) ?? '')
    setNotes(stringValue(sourcePrompt?.notes) ?? '')
    setInitializedKey(sourceKey)
  }, [initializedKey, snapshot, sourceKey, sourcePrompt])

  const sourceText = stringValue(sourcePrompt?.text) ?? ''
  const sourceNegativeText = stringValue(sourcePrompt?.negative_text ?? sourcePrompt?.negativeText) ?? ''
  const sourceNotes = stringValue(sourcePrompt?.notes) ?? ''
  const dirty = text !== sourceText || negativeText !== sourceNegativeText || notes !== sourceNotes

  return (
    <AgentSurfaceShell
      title={contentUnitId ? `Prompt workbench: ${contentUnitId}` : 'Prompt workbench'}
      description="Inspect semantic references, blockers, compiled prompt text, provider prompt text, and generation inputs."
      chips={[
        ...(projectId ? [`project: ${projectId}`] : []),
        ...(contentUnitId ? [`content unit: ${contentUnitId}`] : []),
        `mode: ${mode}`,
      ]}
      ready={ready}
      preparingLabel="Preparing prompt workbench..."
    >
      {!contentUnitId ? (
        <div className="agent-surface-status">Missing contentUnitId.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading prompt snapshot...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load prompt snapshot.'}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Target">
            <AgentSurfaceKeyValues items={[
              ['Project', projectId ?? ''],
              ['Content unit', contentUnitId ?? ''],
              ['Source path', targetPath ?? ''],
              ['Mode', mode],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Prompt Summary">
            <AgentSurfaceKeyValues items={[
              ['Status', stringValue(prompt?.status ?? backendPrompt?.status) ?? snapshot?.status ?? ''],
              ['Output kind', stringValue(prompt?.output_kind ?? backendPrompt?.output_kind ?? backendCompiledPrompt?.output_kind) ?? ''],
              ['Ready', stringValue(backendPrompt?.ok) ?? ''],
              ['Blockers', stringValue(recordValue(backendPrompt)?.blockers ? JSON.stringify(recordValue(backendPrompt)?.blockers) : undefined) ?? ''],
              ['Dirty', dirty ? 'true' : 'false'],
            ]} />
            <div className="agent-surface-actions">
              <AgentSurfaceLink href={agentImpactHref(contentUnitId, params)}>Open impact review</AgentSurfaceLink>
              <AgentSurfaceLink href={agentCandidatesHref(contentUnitId, params)}>Open candidate review</AgentSurfaceLink>
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Edit Prompt" description="Keep semantic refs such as {{asset::id}} here; compilation resolves them into stable selected resources.">
            <div className="agent-surface-form">
              <label className="agent-surface-field">
                <span>Text</span>
                <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} />
              </label>
              <label className="agent-surface-field">
                <span>Negative</span>
                <textarea value={negativeText} onChange={(event) => setNegativeText(event.target.value)} rows={4} />
              </label>
              <label className="agent-surface-field">
                <span>Notes</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
              </label>
              <div className="agent-surface-actions">
                <button
                  type="button"
                  className="agent-surface-button"
                  disabled={!targetPath || !dirty || savePending || !onSave}
                  onClick={() => onSave?.({
                    targetPath,
                    editPrompt: {
                      text,
                      negative_text: negativeText,
                      notes,
                    },
                  })}
                >
                  {savePending ? 'Saving...' : 'Save prompt'}
                </button>
                <button
                  type="button"
                  className="agent-surface-button"
                  disabled={!dirty || savePending}
                  onClick={() => {
                    setText(sourceText)
                    setNegativeText(sourceNegativeText)
                    setNotes(sourceNotes)
                  }}
                >
                  Reset
                </button>
              </div>
              {!targetPath ? <p className="agent-surface-callout agent-surface-callout--danger">Cannot save until this content unit source path is available.</p> : null}
              {saveError ? <p className="agent-surface-callout agent-surface-callout--danger">{saveError instanceof Error ? saveError.message : 'Prompt save failed.'}</p> : null}
              {saveSuccess ? <p className="agent-surface-callout">Prompt saved. Re-open impact review after inspect/interpret refreshes downstream state.</p> : null}
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Compiled And Provider Prompt">
            <AgentSurfaceJson value={{
              source_edit_prompt: sourcePrompt,
              compiled_prompt: prompt,
              backend_prompt: backendPrompt,
            }} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Runtime And Dependencies">
            <AgentSurfaceJson value={{
              runtime_panel: runtimePanel,
              dependency_report: dependencyReport,
              selection_validity: selectionValidity,
            }} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

function sourceEditPrompt(...records: Array<Record<string, unknown> | undefined>): Record<string, unknown> | undefined {
  for (const record of records) {
    const direct = recordValue(record?.edit_prompt ?? record?.editPrompt)
    if (direct) return direct
    const source = recordValue(record?.source)
    const sourcePrompt = recordValue(source?.edit_prompt ?? source?.editPrompt)
    if (sourcePrompt) return sourcePrompt
    const contentUnit = recordValue(record?.content_unit ?? record?.contentUnit)
    const contentUnitPrompt = recordValue(contentUnit?.edit_prompt ?? contentUnit?.editPrompt)
    if (contentUnitPrompt) return contentUnitPrompt
  }
  return undefined
}

function targetPathForPrompt(
  contentUnitId: string | undefined,
  ...records: Array<Record<string, unknown> | undefined>
): string | undefined {
  for (const record of records) {
    const direct = stringValue(record?.targetPath ?? record?.target_path ?? record?.path)
    if (direct) return direct.endsWith('/content_unit.json') ? direct : direct
    const source = recordValue(record?.source)
    const sourcePath = stringValue(source?.targetPath ?? source?.target_path ?? source?.path)
    if (sourcePath) return sourcePath
    const contentUnit = recordValue(record?.content_unit ?? record?.contentUnit)
    const contentUnitPath = stringValue(contentUnit?.targetPath ?? contentUnit?.target_path ?? contentUnit?.path)
    if (contentUnitPath) return contentUnitPath
  }
  return contentUnitId ? `content_units/${contentUnitId}/content_unit.json` : undefined
}

function agentImpactHref(contentUnitId: string, params: URLSearchParams): string {
  return withAgentParams('/agent/impact', params, { target: contentUnitId, source: 'domain_update_content_unit_prompt' })
}

function agentCandidatesHref(contentUnitId: string, params: URLSearchParams): string {
  return withAgentParams('/agent/content/candidates', params, { contentUnitId })
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

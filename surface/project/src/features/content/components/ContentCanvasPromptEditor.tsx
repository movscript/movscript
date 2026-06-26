import { useEffect, useState } from 'react'
import { Plus, TextCursorInput, Trash2 } from 'lucide-react'

import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { PromptReferenceInlineEditor, PromptReferenceStrip } from './ContentCanvasPromptReferences'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export function ContentCanvasPromptEditor({
  ariaLabel,
  candidateSelections,
  mentionNodes,
  nodes,
  onBlur,
  onChange,
  onSelectNode,
  onStructuredCommit,
  ownerNode,
  structured,
  value,
}: {
  ariaLabel: string
  candidateSelections: CandidateSelections
  mentionNodes?: ContentCanvasNode[]
  nodes: ContentCanvasNode[]
  onBlur: (prompt: string) => void
  onChange: (prompt: string) => void
  onStructuredCommit?: (structured: Record<string, unknown>) => void
  onSelectNode: (node: ContentCanvasNode) => void
  ownerNode: ContentCanvasNode | undefined
  structured?: Record<string, unknown>
  value: string
}) {
  const canEditShotPlan = isSceneMomentVideoContentUnit(ownerNode) && onStructuredCommit
  const [shotPlanDraft, setShotPlanDraft] = useState<ShotPlanItem[]>(() => shotPlanFromStructured(structured))
  useEffect(() => {
    setShotPlanDraft(shotPlanFromStructured(structured))
  }, [structured])
  const commitShotPlan = (nextPlan: ShotPlanItem[]) => {
    if (!onStructuredCommit) return
    onStructuredCommit({
      ...(structured ?? {}),
      shot_plan: normalizeShotPlanForSave(nextPlan),
    })
  }
  const updateShot = (index: number, patch: Partial<ShotPlanItem>) => {
    setShotPlanDraft((current) => current.map((shot, itemIndex) => (
      itemIndex === index ? { ...shot, ...patch } : shot
    )))
  }
  const removeShot = (index: number) => {
    setShotPlanDraft((current) => {
      const next = current.filter((_shot, itemIndex) => itemIndex !== index)
      commitShotPlan(next)
      return next
    })
  }
  const addShot = () => {
    setShotPlanDraft((current) => {
      const next = [
        ...current,
        {
          order: current.length + 1,
          title: `Shot ${current.length + 1}`,
          duration_sec: 4,
          action: '',
          shot_size: '',
          camera_angle: '',
          camera_motion: '',
        },
      ]
      commitShotPlan(next)
      return next
    })
  }

  return (
    <div className="content-canvas-prompt-editor">
      <span className="content-canvas-prompt-editor__label">
        <TextCursorInput size={13} aria-hidden="true" />
        Prompt
      </span>
      <PromptReferenceInlineEditor
        className="nodrag"
        prompt={value}
        nodes={nodes}
        mentionNodes={mentionNodes}
        ownerNode={ownerNode}
        candidateSelections={candidateSelections}
        ariaLabel={ariaLabel}
        onChange={onChange}
        onBlur={onBlur}
        onSelectNode={onSelectNode}
      />
      {canEditShotPlan ? (
        <div className="content-canvas-shot-plan-editor nodrag">
          <div className="content-canvas-shot-plan-editor__header">
            <span>Shot plan</span>
            <button type="button" onClick={addShot} aria-label="添加镜头段" title="添加镜头段">
              <Plus size={13} aria-hidden="true" />
            </button>
          </div>
          {shotPlanDraft.length ? shotPlanDraft.map((shot, index) => (
            <div className="content-canvas-shot-plan-row" key={`${index}:${shot.order ?? ''}`}>
              <div className="content-canvas-shot-plan-row__top">
                <input
                  aria-label={`镜头 ${index + 1} 标题`}
                  value={shot.title ?? ''}
                  placeholder={`Shot ${index + 1}`}
                  onChange={(event) => updateShot(index, { title: event.target.value })}
                  onBlur={() => commitShotPlan(shotPlanDraft)}
                />
                <input
                  aria-label={`镜头 ${index + 1} 时长`}
                  inputMode="decimal"
                  value={shot.duration_sec ?? ''}
                  placeholder="sec"
                  onChange={(event) => updateShot(index, { duration_sec: numericDraft(event.target.value) })}
                  onBlur={() => commitShotPlan(shotPlanDraft)}
                />
                <button type="button" onClick={() => removeShot(index)} aria-label={`删除镜头 ${index + 1}`} title="删除镜头">
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
              <textarea
                aria-label={`镜头 ${index + 1} 动作`}
                value={shot.action ?? ''}
                placeholder="action"
                rows={2}
                onChange={(event) => updateShot(index, { action: event.target.value })}
                onBlur={() => commitShotPlan(shotPlanDraft)}
              />
              <div className="content-canvas-shot-plan-row__grid">
                <input aria-label={`镜头 ${index + 1} 景别`} value={shot.shot_size ?? ''} placeholder="shot size" onChange={(event) => updateShot(index, { shot_size: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 机位`} value={shot.camera_angle ?? ''} placeholder="angle" onChange={(event) => updateShot(index, { camera_angle: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 运镜`} value={shot.camera_motion ?? ''} placeholder="motion" onChange={(event) => updateShot(index, { camera_motion: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 灯光`} value={shot.lighting ?? ''} placeholder="lighting" onChange={(event) => updateShot(index, { lighting: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 景深`} value={shot.depth_of_field ?? ''} placeholder="depth" onChange={(event) => updateShot(index, { depth_of_field: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 构图`} value={shot.composition ?? ''} placeholder="composition" onChange={(event) => updateShot(index, { composition: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <input aria-label={`镜头 ${index + 1} 转场`} value={shot.transition ?? ''} placeholder="transition" onChange={(event) => updateShot(index, { transition: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
              </div>
              <div className="content-canvas-shot-plan-row__grid">
                <textarea aria-label={`镜头 ${index + 1} 结果`} value={shot.result ?? ''} placeholder="result" rows={2} onChange={(event) => updateShot(index, { result: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <textarea aria-label={`镜头 ${index + 1} 对白`} value={shot.dialogue ?? ''} placeholder="dialogue" rows={2} onChange={(event) => updateShot(index, { dialogue: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <textarea aria-label={`镜头 ${index + 1} 旁白`} value={shot.narration ?? ''} placeholder="narration" rows={2} onChange={(event) => updateShot(index, { narration: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
                <textarea aria-label={`镜头 ${index + 1} 备注`} value={shot.notes ?? ''} placeholder="notes" rows={2} onChange={(event) => updateShot(index, { notes: event.target.value })} onBlur={() => commitShotPlan(shotPlanDraft)} />
              </div>
            </div>
          )) : null}
        </div>
      ) : null}
      <PromptReferenceStrip
        prompt={value}
        nodes={nodes}
        ownerNode={ownerNode}
        candidateSelections={candidateSelections}
        onSelectNode={onSelectNode}
      />
    </div>
  )
}

type ShotPlanItem = {
  order?: number
  title?: string
  duration_sec?: number
  action?: string
  result?: string
  dialogue?: string
  narration?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  lighting?: string
  depth_of_field?: string
  composition?: string
  transition?: string
  notes?: string
}

function isSceneMomentVideoContentUnit(node: ContentCanvasNode | undefined): boolean {
  if (node?.kind !== 'content_unit') return false
  const type = String(node.record.content_unit_type ?? node.record.contentUnitType ?? '').toLowerCase()
  const outputKind = String(node.record.output_kind ?? node.record.outputKind ?? node.subtitle ?? '').toLowerCase()
  return outputKind.includes('video') && (type === 'scene_moment_ref' || type === 'scence_moment_ref')
}

function shotPlanFromStructured(structured: Record<string, unknown> | undefined): ShotPlanItem[] {
  const raw = structured?.shot_plan ?? structured?.shotPlan ?? structured?.shots
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item, index): ShotPlanItem[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    return [{
      order: numericDraft(record.order) ?? index + 1,
      title: stringDraft(record.title),
      duration_sec: numericDraft(record.duration_sec ?? record.durationSec ?? record.duration),
      action: stringDraft(record.action ?? record.description ?? record.intent),
      result: stringDraft(record.result ?? record.end_state ?? record.endState),
      dialogue: stringDraft(record.dialogue),
      narration: stringDraft(record.narration),
      shot_size: stringDraft(record.shot_size ?? record.shotSize ?? record.shot_type ?? record.shotType),
      camera_angle: stringDraft(record.camera_angle ?? record.cameraAngle ?? record.angle),
      camera_motion: stringDraft(record.camera_motion ?? record.cameraMotion ?? record.movement),
      lighting: stringDraft(record.lighting ?? record.lighting_style ?? record.lightingStyle),
      depth_of_field: stringDraft(record.depth_of_field ?? record.depthOfField ?? record.dof),
      composition: stringDraft(record.composition),
      transition: stringDraft(record.transition),
      notes: stringDraft(record.notes ?? record.note),
    }]
  })
}

function normalizeShotPlanForSave(plan: ShotPlanItem[]): ShotPlanItem[] {
  return plan.map((shot, index) => ({
    order: index + 1,
    ...(shot.title?.trim() ? { title: shot.title.trim() } : {}),
    ...(shot.duration_sec ? { duration_sec: shot.duration_sec } : {}),
    ...(shot.action?.trim() ? { action: shot.action.trim() } : {}),
    ...(shot.result?.trim() ? { result: shot.result.trim() } : {}),
    ...(shot.dialogue?.trim() ? { dialogue: shot.dialogue.trim() } : {}),
    ...(shot.narration?.trim() ? { narration: shot.narration.trim() } : {}),
    ...(shot.shot_size?.trim() ? { shot_size: shot.shot_size.trim() } : {}),
    ...(shot.camera_angle?.trim() ? { camera_angle: shot.camera_angle.trim() } : {}),
    ...(shot.camera_motion?.trim() ? { camera_motion: shot.camera_motion.trim() } : {}),
    ...(shot.lighting?.trim() ? { lighting: shot.lighting.trim() } : {}),
    ...(shot.depth_of_field?.trim() ? { depth_of_field: shot.depth_of_field.trim() } : {}),
    ...(shot.composition?.trim() ? { composition: shot.composition.trim() } : {}),
    ...(shot.transition?.trim() ? { transition: shot.transition.trim() } : {}),
    ...(shot.notes?.trim() ? { notes: shot.notes.trim() } : {}),
  })).filter((shot) => Object.keys(shot).length > 1)
}

function stringDraft(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function numericDraft(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

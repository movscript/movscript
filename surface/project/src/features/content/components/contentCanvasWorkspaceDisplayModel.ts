import {
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  type ContentCanvasExpressionUnitKind,
} from '../application/contentCanvasCommands'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'

const SETTING_KIND_LABELS: Record<string, string> = {
  character: '角色',
  location: '场景',
  prop: '道具',
  world_rule: '世界规则',
  style: '风格',
  visual_style: '视觉风格',
  sound_motif: '声音母题',
  costume: '服装',
  relationship: '关系',
  other: '其他',
}

export function settingTypeValue(node: ContentCanvasNode): string {
  return stringField(node.domainKind)
    ?? stringField(node.record.namespace_kind)
    ?? stringField(node.record.namespaceKind)
    ?? stringField(node.record.setting_namespace_kind)
    ?? stringField(node.record.settingNamespaceKind)
    ?? stringField(node.record.setting_kind)
    ?? stringField(node.record.settingKind)
    ?? stringField(node.record.type)
    ?? stringField(node.record.kind)
    ?? node.subtitle
}

export function settingTypeLabel(node: ContentCanvasNode): string {
  const value = settingTypeValue(node)
  return SETTING_KIND_LABELS[value] ? `${SETTING_KIND_LABELS[value]} (${value})` : value
}

export function expressionUnitKindValue(node: ContentCanvasNode): string {
  return stringField(
    node.record.slot_kind
      ?? node.record.slotKind
      ?? node.record.expression_kind
      ?? node.record.expressionKind
      ?? node.record.kind
      ?? node.record.type,
  ) ?? 'visual'
}

export function expressionUnitKindLabel(value: string): string {
  const normalized = normalizeExpressionUnitKindValue(value)
  const option = CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.find((item) => item.value === (normalized as ContentCanvasExpressionUnitKind))
  return option ? `${option.label} (${value})` : value
}

export function expressionUnitKindShortLabel(value: string): string {
  const normalized = normalizeExpressionUnitKindValue(value)
  const option = CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.find((item) => item.value === (normalized as ContentCanvasExpressionUnitKind))
  return option?.label ?? value
}

function normalizeExpressionUnitKindValue(value: string): string {
  const text = value.trim().toLowerCase()
  if (text === 'dialogue' || text === 'narration' || text === 'voiceover' || text === 'verbal') return 'voice'
  if (text === 'caption' || text === 'text') return 'subtitle'
  if (text === 'sound' || text === 'sound_effect' || text === 'sfx' || text === 'music' || text === 'ambience' || text === 'foley') return 'audio'
  if (text === 'shot' || text === 'action' || text === 'visual_note' || text === 'image' || text === 'video') return 'visual'
  return text
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

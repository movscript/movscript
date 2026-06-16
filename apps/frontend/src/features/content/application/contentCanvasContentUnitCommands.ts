import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export async function ensureContentUnitForRef(
  gateway: ContentCanvasWorkspaceGateway,
  input: {
    id: string
    refKind: 'asset' | 'keyframe' | 'storyboard' | 'shot' | 'scene_moment'
    ref: string
    contentUnitType: string
    outputKind: string
    title: string
    description: string
    prompt: string
    modelIntent?: Record<string, unknown>
  },
) {
  const existing = (await gateway.service.queryEntities({ entityKind: 'content_unit' }))
    .find((entity) => {
      const record = entity.record
      if (String(record.content_unit_type ?? '') !== input.contentUnitType) return false
      return compactStrings(record[`${input.refKind}_ref`], record[`${input.refKind}_refs`])
        .some((ref) => sameEntityRef(ref, input.ref))
    })
  if (existing) return { path: existing.path, record: existing.record }

  return gateway.service.upsertContentUnit({
    unit: {
      id: input.id,
      title: input.title,
      content_unit_type: input.contentUnitType,
      output_kind: input.outputKind,
      description: input.description,
      [`${input.refKind}_ref`]: input.ref,
      edit_prompt: {
        text: input.prompt,
      },
      model_intent: {
        source: 'content_canvas',
        ...(input.modelIntent ?? {}),
      },
    },
  })
}

function sameEntityRef(left: string, right: string): boolean {
  const rightAliases = refAliases(right)
  return [...refAliases(left)].some((alias) => rightAliases.has(alias))
}

function pathTail(value: string): string {
  return value.split('/').filter(Boolean).at(-1) ?? value
}

function refAliases(value: string): Set<string> {
  const parts = value.split('/').filter(Boolean)
  const aliases = new Set<string>([value, pathTail(value)])
  const tail = parts.at(-1)
  const entityDir = tail?.endsWith('.json') ? parts.at(-2) : undefined
  if (entityDir) aliases.add(entityDir)
  return aliases
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

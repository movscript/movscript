import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export async function ensureContentUnitForRef(
  gateway: ContentCanvasWorkspaceGateway,
  input: {
    id: string
    refKind: 'asset' | 'scene_moment' | 'expression_unit' | 'keyframe' | 'storyboard'
    ref: string
    contentUnitType: string
    outputKind: string
    title: string
    description: string
    prompt: string
    modelIntent?: Record<string, unknown>
  },
) {
  const result = await gateway.ensureContentUnitForEntity({
    targetKind: input.refKind,
    targetRef: input.ref,
    id: input.id,
    title: input.title,
    contentUnitType: input.contentUnitType,
    outputKind: input.outputKind,
    description: input.description,
    prompt: input.prompt,
    modelIntent: {
      source: 'content_canvas',
      ...(input.modelIntent ?? {}),
    },
  })
  return { path: result.path ?? result.contentUnitPath, record: result.record }
}

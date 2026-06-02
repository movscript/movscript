import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { RuntimeModelContentPart } from '../../../../model/config/modelConfig.js'
import { runtimeModelTextContent } from '../../../../messages/model/modelMessage.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import {
  publicCoreImageInspectionResult,
  publicCoreImageProcessingResult,
  type CoreImageOutputFormat,
  type CoreImagePreset,
  type CoreImageProcessingPort,
  type CoreImageProcessingResult,
} from '../../../../ports/media/imageProcessingPort.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { isValidAgentEntityId } from '../../../../context/runtime/runtimeContext.js'

export function createCoreImageToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['core_image_inspect', 'core_image_preprocess', 'core_image_crop', 'core_image_tile'],
    async execute({ call, args, run, imageProcessingPort, signal }) {
      if (!imageProcessingPort) throw new Error(`${call.name} requires image preprocessing support`)
      if (call.name === 'core_image_inspect') {
        return {
          result: publicCoreImageInspectionResult(await imageProcessingPort.inspect(buildRequest(args, run, signal))),
        }
      }
      if (call.name === 'core_image_tile') return tileImage(args, run, imageProcessingPort, signal)
      const processed = await imageProcessingPort.process(buildRequest(args, run, signal, call.name === 'core_image_crop'))
      return {
        result: publicCoreImageProcessingResult(processed) as unknown as JSONValue,
        supplementalMessages: imageSupplementalMessages(processed, call.name),
      }
    },
  }
}

async function tileImage(
  args: Record<string, JSONValue>,
  run: AgentRun,
  imageProcessingPort: CoreImageProcessingPort,
  signal: AbortSignal | undefined,
): Promise<{ result: JSONValue; supplementalMessages: RuntimeModelChatMessage[] }> {
  const request = buildRequest(args, run, signal)
  const inspection = await imageProcessingPort.inspect(request)
  const width = inspection.image.width
  const height = inspection.image.height
  if (width === undefined || height === undefined) throw new Error('core_image_tile requires readable source image width and height')
  const layout = tileLayout(args, width, height)
  const tiles = await Promise.all(layout.rects.map(async (tile) => {
    const processed = await imageProcessingPort.process({
      ...request,
      preset: request.preset ?? 'vision_detail',
      crop: tile.crop,
    })
    return {
      index: tile.index,
      row: tile.row,
      column: tile.column,
      crop: tile.crop,
      result: processed,
    }
  }))
  return {
    result: {
      status: 'tiled',
      source: inspection.source,
      image: inspection.image,
      tile_count: tiles.length,
      omitted_count: layout.omittedCount,
      max_tiles: layout.maxTiles,
      tiles: tiles.map((tile) => ({
        index: tile.index,
        row: tile.row,
        column: tile.column,
        crop: tile.crop,
        output: publicCoreImageProcessingResult(tile.result).output,
      })),
    } as unknown as JSONValue,
    supplementalMessages: tileSupplementalMessages(tiles.map((tile) => tile.result), layout.omittedCount),
  }
}

function buildRequest(
  args: Record<string, JSONValue>,
  run: AgentRun,
  signal: AbortSignal | undefined,
  requireCrop = false,
): Parameters<CoreImageProcessingPort['process']>[0] {
  const resourceId = entityIdField(args.resourceId) ?? entityIdField(args.resource_id)
  const dataUrl = stringField(args.dataUrl ?? args.data_url)
  if (resourceId === undefined && !dataUrl) throw new Error('image tool requires resourceId or dataUrl')
  const crop = cropField(args)
  if (requireCrop && !crop) throw new Error('core_image_crop requires left, top, width, and height')
  return {
    run,
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    ...(stringField(args.name) ? { name: stringField(args.name) } : {}),
    ...(stringField(args.mimeType ?? args.mime_type) ? { mimeType: stringField(args.mimeType ?? args.mime_type) } : {}),
    ...(presetField(args.preset) ? { preset: presetField(args.preset) } : {}),
    ...(numberField(args.maxDimension ?? args.max_dimension) !== undefined ? { maxDimension: numberField(args.maxDimension ?? args.max_dimension) } : {}),
    ...(formatField(args.format) ? { format: formatField(args.format) } : {}),
    ...(numberField(args.quality) !== undefined ? { quality: numberField(args.quality) } : {}),
    ...(crop ? { crop } : {}),
    signal,
  }
}

function imageSupplementalMessages(result: CoreImageProcessingResult, toolName: string): RuntimeModelChatMessage[] {
  return [{
    role: 'user',
    content: [
      ...runtimeModelTextContent([
        `${toolName} prepared image evidence.`,
        result.source.resourceId !== undefined ? `resource_id=${result.source.resourceId}` : 'source=data_url',
        `preset=${result.preset}; output=${result.output.width}x${result.output.height} ${result.output.mimeType}; original=${result.original.width ?? 'unknown'}x${result.original.height ?? 'unknown'}.`,
        'Inspect the following optimized/cropped image. The original resource was not sent unless explicitly requested by another tool.',
      ].join('\n')),
      { type: 'image', source: { type: 'data_url', dataUrl: result.output.dataUrl }, detail: 'auto' },
    ],
  }]
}

function tileSupplementalMessages(results: CoreImageProcessingResult[], omittedCount: number): RuntimeModelChatMessage[] {
  const content: RuntimeModelContentPart[] = runtimeModelTextContent([
    'core_image_tile prepared tiled image evidence.',
    `${results.length} tile(s) are attached in row-major order.${omittedCount > 0 ? ` ${omittedCount} additional tile(s) were omitted by maxTiles.` : ''}`,
    'Inspect these optimized tile images for broad coverage of the source. The original resource was not sent.',
  ].join('\n'))
  for (const result of results) {
    content.push(
      ...runtimeModelTextContent(`Tile ${results.indexOf(result) + 1}: crop=${JSON.stringify(result.output.crop ?? null)}; output=${result.output.width}x${result.output.height} ${result.output.mimeType}.`),
      { type: 'image', source: { type: 'data_url', dataUrl: result.output.dataUrl }, detail: 'auto' },
    )
  }
  return [{ role: 'user', content }]
}

function tileLayout(args: Record<string, JSONValue>, width: number, height: number): {
  rects: Array<{ index: number; row: number; column: number; crop: { left: number; top: number; width: number; height: number } }>
  maxTiles: number
  omittedCount: number
} {
  const maxTiles = clampInteger(numberField(args.maxTiles ?? args.max_tiles) ?? 8, 1, 16)
  const columnsInput = numberField(args.columns)
  const rowsInput = numberField(args.rows)
  const requestedColumns = columnsInput === undefined ? undefined : clampInteger(columnsInput, 1, 8)
  const requestedRows = rowsInput === undefined ? undefined : clampInteger(rowsInput, 1, 8)
  const tileSize = clampInteger(numberField(args.tileSize ?? args.tile_size) ?? 1024, 128, 4096)
  const columns = requestedColumns ?? Math.max(1, Math.ceil(width / tileSize))
  const rows = requestedRows ?? Math.max(1, Math.ceil(height / tileSize))
  const tileWidth = Math.ceil(width / columns)
  const tileHeight = Math.ceil(height / rows)
  const all: Array<{ index: number; row: number; column: number; crop: { left: number; top: number; width: number; height: number } }> = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = Math.min(width - 1, column * tileWidth)
      const top = Math.min(height - 1, row * tileHeight)
      all.push({
        index: all.length,
        row,
        column,
        crop: {
          left,
          top,
          width: Math.max(1, Math.min(tileWidth, width - left)),
          height: Math.max(1, Math.min(tileHeight, height - top)),
        },
      })
    }
  }
  return {
    rects: all.slice(0, maxTiles),
    maxTiles,
    omittedCount: Math.max(0, all.length - maxTiles),
  }
}

function cropField(args: Record<string, JSONValue>): { left: number; top: number; width: number; height: number } | undefined {
  const source = isRecord(args.crop) ? args.crop : args
  const left = numberField(source.left)
  const top = numberField(source.top)
  const width = numberField(source.width)
  const height = numberField(source.height)
  if (left === undefined || top === undefined || width === undefined || height === undefined) return undefined
  return { left, top, width, height }
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function presetField(value: JSONValue | undefined): CoreImagePreset | undefined {
  return value === 'vision_default' || value === 'vision_detail' || value === 'ui_screenshot' || value === 'thumbnail'
    ? value
    : undefined
}

function formatField(value: JSONValue | undefined): CoreImageOutputFormat | undefined {
  return value === 'jpeg' || value === 'png' || value === 'webp' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

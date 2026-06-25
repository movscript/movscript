import type { NodeType, ParamDef, PublicModel } from '@movscript/shared'
import {
  canvasDefaultParamValues,
  canvasGenerationParamDefs as coreCanvasGenerationParamDefs,
  canvasParamValue,
  canvasParamValues,
  updateCanvasParam,
} from '@movscript/core/generation'

type GenerationOutputType = 'image' | 'video' | 'text'

export {
  canvasDefaultParamValues,
  canvasParamValue,
  canvasParamValues,
  updateCanvasParam,
} from '@movscript/core/generation'

export function canvasGenerationParamDefs(
  nodeType: NodeType | string,
  outputType?: GenerationOutputType,
  model?: PublicModel | null,
): ParamDef[] {
  return coreCanvasGenerationParamDefs(nodeType, outputType, model) as ParamDef[]
}

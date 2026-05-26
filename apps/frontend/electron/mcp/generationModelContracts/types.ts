export interface GenerationModelParamContract {
  supportedParamKeys: Set<string>
  supportedParams: Map<string, GenerationModelParam>
  rules: GenerationModelParamRules
  inputRequirements: GenerationInputRequirements
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
}

export type GenerationInputKind = 'image' | 'video'

export interface GenerationInputRequirement {
  min: number
  max: number
}

export interface GenerationInputRequirements {
  image: GenerationInputRequirement
  video: GenerationInputRequirement
}

export interface GenerationModelParam {
  key: string
  type?: string
  options?: string[]
  enum?: Array<string | number | boolean>
  min?: number
  max?: number
  step?: number
}

export interface GenerationModelParamRules {
  conflicts: Array<{ key: string, other: string }>
  conditionalEnums: Array<{ key: string, whenParam: string, whenValue: string | number | boolean, options: string[] }>
  conditionalConsts: Array<{ key: string, whenParam: string, whenValue: string | number | boolean, value: string | number | boolean }>
  requiresValues: Array<{ key: string, param: string, value: string | number | boolean }>
}

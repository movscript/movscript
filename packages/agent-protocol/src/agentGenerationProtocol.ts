export interface AgentGenerationJob {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  status: string
  stage?: string
  progress?: number
  terminal: boolean
  outputResourceId?: number
  outputResourceIds?: number[]
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface AgentGenerationParamAudit {
  stepId?: string
  jobId?: number
  auditVersion?: number
  modelContractLoaded: boolean
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
  supportedParams: string[]
  providedExtraParams: string[]
  submittedExtraParams: string[]
  droppedExtraParams: string[]
  droppedTopLevelParams: string[]
  dropReasons?: Record<string, string>
  renamedExtraParams?: Record<string, string>
  extraParamsParseError?: string
  preflightErrors?: AgentGenerationParamPreflightError[]
  inputRequirements?: AgentGenerationInputRequirements
  submittedInputs?: AgentGenerationSubmittedInputs
  inputPreflightErrors?: AgentGenerationInputPreflightError[]
  repairNote?: string
}

export interface AgentGenerationInputRequirement {
  min: number
  max: number
}

export interface AgentGenerationInputRequirements {
  image: AgentGenerationInputRequirement
  video: AgentGenerationInputRequirement
}

export interface AgentGenerationSubmittedInputs {
  image: number
  video: number
}

export interface AgentGenerationParamPreflightError {
  code: string
  field: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
}

export interface AgentGenerationInputPreflightError {
  code: string
  field: 'image' | 'video'
  message: string
  requiredMin: number
  allowedMax: number
  actualCount: number
}

export interface AgentGenerationValidationError {
  stepId?: string
  code: string
  field?: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
  requiredMin?: number
  allowedMax?: number
  actualCount?: number
}

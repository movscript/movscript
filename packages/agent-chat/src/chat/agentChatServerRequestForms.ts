import type { AgentChatServerRequest } from './agentChatProtocol.js'
import { isModelReachableRemoteUrl } from '../attachmentInputs.js'

export type AgentChatInputRequestFormModel =
  | {
    kind: 'question-form'
    questions: Array<{
      id: string
      header: string
      question: string
      isSecret: boolean
      required: boolean
      options: Array<{ value: string; label: string; description?: string }>
    }>
  }
  | {
    kind: 'input-form'
    id: string
    title: string
    question: string
    inputType: string
    allowCustomAnswer: boolean
    choices: Array<{ id: string; label: string; description?: string; responseText?: string }>
  }

export type AgentChatInputAnswerDraft = string | string[]

export type AgentChatElicitationValue = string | number | boolean | string[] | undefined

export type AgentChatToolResultDraft = {
  text: string
  imageUrl: string
  audioUrl: string
  audioMimeType: string
  videoUrl: string
  videoMimeType: string
  resourceName: string
  resourceUri: string
  resourceUrl: string
  resourceMimeType: string
}

export type AgentChatElicitationField = {
  name: string
  title: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'single-select' | 'multi-select'
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  options: Array<{ value: string; label: string }>
  defaultValue: AgentChatElicitationValue
}

export type AgentChatElicitationFormModel = {
  message: string
  meta: unknown
  fields: AgentChatElicitationField[]
}

export function agentChatInputRequestFormModel(request: AgentChatServerRequest): AgentChatInputRequestFormModel {
  const params = isRecord(request.params) ? request.params : {}
  const questions = Array.isArray(params.questions) ? params.questions : []
  if (questions.length > 0) {
    return {
      kind: 'question-form',
      questions: questions.map((question, index) => {
        const item = isRecord(question) ? question : {}
        const id = stringField(item.id) ?? `question_${index + 1}`
        const options = Array.isArray(item.options) ? item.options : []
        return {
          id,
          header: stringField(item.header) ?? '',
          question: stringField(item.question) ?? '',
          isSecret: item.isSecret === true,
          required: item.isOther !== true,
          options: options.flatMap((option) => {
            if (!isRecord(option)) return []
            const label = stringField(option.label)
            if (!label) return []
            return [{
              value: label,
              label,
              ...(stringField(option.description) ? { description: stringField(option.description) } : {}),
            }]
          }),
        }
      }),
    }
  }
  const choices = Array.isArray(params.choices) ? params.choices : []
  return {
    kind: 'input-form',
    id: stringField(params.id) ?? request.id,
    title: stringField(params.title) ?? 'Input required',
    question: stringField(params.question) ?? '',
    inputType: stringField(params.inputType) ?? 'text',
    allowCustomAnswer: params.allowCustomAnswer === true,
    choices: agentChatInputChoicesForForm({
      inputType: stringField(params.inputType) ?? 'text',
      choices: choices.flatMap((choice) => {
        if (!isRecord(choice)) return []
        const id = stringField(choice.id)
        const label = stringField(choice.label)
        if (!id || !label) return []
        return [{
          id,
          label,
          ...(stringField(choice.description) ? { description: stringField(choice.description) } : {}),
        }]
      }),
    }),
  }
}

export function agentChatInputRequestAnswerPayload(
  model: AgentChatInputRequestFormModel,
  answers: Record<string, AgentChatInputAnswerDraft>,
  text: string,
): { answers?: Record<string, unknown>; choiceIds?: string[]; text?: string } {
  if (model.kind === 'question-form') {
    return {
      answers: Object.fromEntries(model.questions.map((question) => [
        question.id,
        { answers: agentChatInputAnswerValues(answers[question.id]).map((value) => value.trim()).filter(Boolean) },
      ])),
    }
  }
  const selectedChoice = agentChatInputAnswerText(answers[model.id]).trim()
  const fallbackChoice = model.choices.find((choice) => choice.id === selectedChoice && choice.responseText)
  return {
    ...(selectedChoice && !fallbackChoice ? { choiceIds: [selectedChoice] } : {}),
    ...(fallbackChoice?.responseText ? { text: fallbackChoice.responseText } : {}),
    ...(text.trim() ? { text: text.trim() } : {}),
  }
}

export function agentChatToolResultContentItems(input: AgentChatToolResultDraft): unknown[] {
  const resource = agentChatToolResultResourceContent(input)
  const imageUrl = input.imageUrl.trim()
  const imageResource = agentChatToolResultImageResourceContent(imageUrl)
  return [
    ...(input.text.trim() ? [{ type: 'inputText', text: input.text.trim() }] : []),
    ...(imageUrl && agentChatToolResultImageUrlIsApiReady(imageUrl) ? [{ type: 'inputImage', imageUrl }] : []),
    ...(input.audioUrl.trim() ? [{
      type: 'inputAudio',
      audioUrl: input.audioUrl.trim(),
      ...(input.audioMimeType.trim() ? { mimeType: input.audioMimeType.trim() } : {}),
    }] : []),
    ...(input.videoUrl.trim() ? [{
      type: 'inputVideo',
      videoUrl: input.videoUrl.trim(),
      ...(input.videoMimeType.trim() ? { mimeType: input.videoMimeType.trim() } : {}),
    }] : []),
    ...(imageResource ? [{ type: 'resource', resource: imageResource }] : []),
    ...(resource ? [{ type: 'resource', resource }] : []),
  ]
}

function agentChatToolResultImageUrlIsApiReady(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/i.test(value) || isModelReachableRemoteUrl(value)
}

function agentChatToolResultImageResourceContent(imageUrl: string): Record<string, string> | null {
  if (!imageUrl || agentChatToolResultImageUrlIsApiReady(imageUrl)) return null
  const resourceId = agentChatResourceIdFromUrl(imageUrl)
  if (resourceId === undefined) return { uri: imageUrl, mimeType: 'image/*' }
  return {
    uri: `resource:${resourceId}`,
    url: imageUrl,
    mimeType: 'image/*',
  }
}

function agentChatToolResultResourceContent(input: AgentChatToolResultDraft): Record<string, string> | null {
  const resource = {
    ...(input.resourceUri.trim() ? { uri: input.resourceUri.trim() } : {}),
    ...(input.resourceUrl.trim() ? { url: input.resourceUrl.trim() } : {}),
    ...(input.resourceName.trim() ? { name: input.resourceName.trim() } : {}),
    ...(input.resourceMimeType.trim() ? { mimeType: input.resourceMimeType.trim() } : {}),
  }
  return Object.keys(resource).length > 0 ? resource : null
}

function agentChatResourceIdFromUrl(value: string): number | undefined {
  const match = /^resource:(\d+)$/.exec(value.trim()) ?? /\/api\/v1\/resources\/(\d+)(?:\/file)?(?:[?#].*)?$/.exec(value.trim())
  if (!match?.[1]) return undefined
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : undefined
}

export function agentChatInputRequestFormCanSubmit(
  model: AgentChatInputRequestFormModel,
  answers: Record<string, AgentChatInputAnswerDraft>,
  text: string,
): boolean {
  if (model.kind === 'question-form') {
    return model.questions.every((question) => (
      !question.required || agentChatInputAnswerValues(answers[question.id]).some((value) => value.trim())
    ))
  }
  if (model.inputType === 'text') return Boolean(text.trim())

  const selectedChoice = agentChatInputAnswerText(answers[model.id]).trim()
  const selectedFallbackChoice = model.choices.find((choice) => choice.responseText && selectedChoice === choice.id)
  const selectedChoiceIds = model.choices
    .filter((choice) => !choice.responseText && selectedChoice === choice.id)
    .map((choice) => choice.id)
  return selectedChoiceIds.length > 0 || Boolean(selectedFallbackChoice) || (model.allowCustomAnswer && Boolean(text.trim()))
}

export function agentChatInputAnswerText(value: AgentChatInputAnswerDraft | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
}

export function agentChatInputAnswerValues(value: AgentChatInputAnswerDraft | undefined): string[] {
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? [value] : []
}

export function nextAgentChatInputAnswerValues(
  current: AgentChatInputAnswerDraft | undefined,
  value: string,
  checked: boolean,
): string[] {
  const values = agentChatInputAnswerValues(current)
  if (checked) return values.includes(value) ? values : [...values, value]
  return values.filter((item) => item !== value)
}

export function agentChatElicitationFormModel(request: AgentChatServerRequest): AgentChatElicitationFormModel {
  const params = isRecord(request.params) ? request.params : {}
  const schema = isRecord(params.requestedSchema) ? params.requestedSchema : {}
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [])
  return {
    message: stringField(params.message) ?? '',
    meta: params._meta ?? null,
    fields: Object.entries(properties).flatMap(([name, property]) => {
      if (!isRecord(property)) return []
      return [agentChatElicitationFieldFromSchema(name, property, required.has(name))]
    }),
  }
}

export function agentChatElicitationInputType(field: AgentChatElicitationField): 'date' | 'datetime-local' | 'email' | 'number' | 'text' | 'url' {
  if (field.kind === 'number' || field.kind === 'integer') return 'number'
  if (field.format === 'date') return 'date'
  if (field.format === 'date-time') return 'datetime-local'
  if (field.format === 'email') return 'email'
  if (field.format === 'uri') return 'url'
  return 'text'
}

export function agentChatElicitationFieldValueIsValid(field: AgentChatElicitationField, value: AgentChatElicitationValue): boolean {
  const present = agentChatElicitationValueIsPresent(value)
  if (!present) return !field.required
  if (field.kind === 'multi-select') {
    const count = Array.isArray(value) ? value.length : 0
    if (typeof field.minItems === 'number' && count < field.minItems) return false
    if (typeof field.maxItems === 'number' && count > field.maxItems) return false
    return true
  }
  if (field.kind === 'number' || field.kind === 'integer') {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return false
    if (field.kind === 'integer' && !Number.isInteger(parsed)) return false
    if (typeof field.minimum === 'number' && parsed < field.minimum) return false
    if (typeof field.maximum === 'number' && parsed > field.maximum) return false
    return true
  }
  if (typeof value === 'string') {
    if (typeof field.minLength === 'number' && value.length < field.minLength) return false
    if (typeof field.maxLength === 'number' && value.length > field.maxLength) return false
  }
  return true
}

export function agentChatElicitationContent(
  model: AgentChatElicitationFormModel,
  values: Record<string, AgentChatElicitationValue>,
): Record<string, unknown> {
  return Object.fromEntries(model.fields.flatMap((field) => {
    const value = values[field.name]
    if (!agentChatElicitationValueIsPresent(value)) return []
    if (field.kind === 'number') {
      const parsed = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(parsed) ? [[field.name, parsed]] : []
    }
    if (field.kind === 'integer') {
      const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
      return Number.isFinite(parsed) ? [[field.name, parsed]] : []
    }
    return [[field.name, value]]
  }))
}

function agentChatInputChoicesForForm(input: {
  inputType: string
  choices: Array<{ id: string; label: string; description?: string }>
}): Array<{ id: string; label: string; description?: string; responseText?: string }> {
  if (input.choices.length > 0) return input.choices
  if (input.inputType === 'confirmation') {
    return [{ id: '__confirm', label: 'Confirm', responseText: 'Confirmed.' }]
  }
  return []
}

function agentChatElicitationFieldFromSchema(name: string, schema: Record<string, unknown>, required: boolean): AgentChatElicitationField {
  const title = stringField(schema.title) ?? name
  const description = stringField(schema.description) ?? ''
  const type = stringField(schema.type)
  const singleOptions = agentChatSingleSelectOptionsFromSchema(schema)
  if (singleOptions.length > 0) {
    return {
      name,
      title,
      description,
      required,
      kind: 'single-select',
      options: singleOptions,
      defaultValue: stringField(schema.default) ?? singleOptions[0]?.value,
    }
  }
  const multiOptions = agentChatMultiSelectOptionsFromSchema(schema)
  if (multiOptions.length > 0) {
    return {
      name,
      title,
      description,
      required,
      kind: 'multi-select',
      options: multiOptions,
      minItems: integerField(schema.minItems),
      maxItems: integerField(schema.maxItems),
      defaultValue: arrayStringField(schema.default),
    }
  }
  if (type === 'boolean') {
    return {
      name,
      title,
      description,
      required,
      kind: 'boolean',
      options: [],
      defaultValue: typeof schema.default === 'boolean' ? schema.default : false,
    }
  }
  if (type === 'number' || type === 'integer') {
    return {
      name,
      title,
      description,
      required,
      kind: type,
      minimum: numberField(schema.minimum),
      maximum: numberField(schema.maximum),
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : undefined,
    }
  }
  return {
    name,
    title,
    description,
    required,
    kind: 'string',
    format: stringField(schema.format),
    minLength: integerField(schema.minLength),
    maxLength: integerField(schema.maxLength),
    options: [],
    defaultValue: stringField(schema.default) ?? '',
  }
}

function agentChatSingleSelectOptionsFromSchema(schema: Record<string, unknown>): Array<{ value: string; label: string }> {
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.flatMap((option) => {
      if (!isRecord(option)) return []
      const value = stringField(option.const)
      if (!value) return []
      return [{ value, label: stringField(option.title) ?? value }]
    })
  }
  if (Array.isArray(schema.enum)) {
    const enumNames = Array.isArray(schema.enumNames) ? schema.enumNames : []
    return schema.enum.flatMap((value, index) => {
      if (typeof value !== 'string') return []
      const label = typeof enumNames[index] === 'string' && enumNames[index].trim() ? enumNames[index].trim() : value
      return [{ value, label }]
    })
  }
  return []
}

function agentChatMultiSelectOptionsFromSchema(schema: Record<string, unknown>): Array<{ value: string; label: string }> {
  if (schema.type !== 'array' || !isRecord(schema.items)) return []
  const items = schema.items
  if (Array.isArray(items.anyOf)) {
    return items.anyOf.flatMap((option) => {
      if (!isRecord(option)) return []
      const value = stringField(option.const)
      if (!value) return []
      return [{ value, label: stringField(option.title) ?? value }]
    })
  }
  if (Array.isArray(items.enum)) {
    return items.enum.flatMap((value) => typeof value === 'string' ? [{ value, label: value }] : [])
  }
  return []
}

function agentChatElicitationValueIsPresent(value: AgentChatElicitationValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && value.trim().length > 0
}

function arrayStringField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function integerField(value: unknown): number | undefined {
  if (typeof value === 'bigint') {
    const numberValue = Number(value)
    return Number.isSafeInteger(numberValue) ? numberValue : undefined
  }
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

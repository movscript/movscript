import { api } from '@/shared/infrastructure/api'
import {
  buildStyleReferenceRule,
  extractResourceIds,
  projectPromptRulePayload,
  type ProjectPromptRule,
} from '@/features/project-standards/application/projectStandardsModel'
import type { RawResource } from '@/types'

export interface ProjectStandardsStyleReferencePatchInput {
  customRules: ProjectPromptRule[]
  styleReferenceRule?: ProjectPromptRule
  uploadedResources: RawResource[]
}

export function buildProjectStandardsStyleReferencePatch(input: ProjectStandardsStyleReferencePatchInput) {
  const { customRules, styleReferenceRule, uploadedResources } = input
  const existingIds = extractResourceIds(styleReferenceRule?.value ?? '')
  const nextRule = buildStyleReferenceRule([
    ...existingIds,
    ...uploadedResources.map((resource) => resource.ID),
  ], styleReferenceRule)
  const nextRules = styleReferenceRule
    ? customRules.map((rule) => rule.id === styleReferenceRule.id ? nextRule : rule)
    : [nextRule, ...customRules]

  return {
    nextRules,
    patch: { custom_rules: projectPromptRulePayload(nextRules) },
  }
}

export function buildProjectStandardsStyleReferenceRemovalPatch(input: {
  customRules: ProjectPromptRule[]
  styleReferenceRule: ProjectPromptRule
  resourceId: number
}) {
  const { customRules, styleReferenceRule, resourceId } = input
  const nextIds = extractResourceIds(styleReferenceRule.value).filter((id) => id !== resourceId)
  const nextRules = nextIds.length > 0
    ? customRules.map((rule) => rule.id === styleReferenceRule.id ? buildStyleReferenceRule(nextIds, styleReferenceRule) : rule)
    : customRules.filter((rule) => rule.id !== styleReferenceRule.id)

  return {
    nextRules,
    patch: { custom_rules: projectPromptRulePayload(nextRules) },
  }
}

export async function uploadProjectStandardsStyleReferenceResources(files: File[]) {
  const uploaded: RawResource[] = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    const resource = await api.post('/resources/upload', formData).then((response) => response.data as RawResource)
    uploaded.push(resource)
  }
  return uploaded
}

export async function uploadProjectStandardsStyleReferenceImages(input: {
  files: File[]
  customRules: ProjectPromptRule[]
  styleReferenceRule?: ProjectPromptRule
}) {
  const uploaded = await uploadProjectStandardsStyleReferenceResources(input.files)
  return {
    uploaded,
    ...buildProjectStandardsStyleReferencePatch({
      customRules: input.customRules,
      styleReferenceRule: input.styleReferenceRule,
      uploadedResources: uploaded,
    }),
  }
}

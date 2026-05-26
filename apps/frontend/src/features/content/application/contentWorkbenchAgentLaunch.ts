import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { openAgentPanelDraft, type AgentPanelDraftPayload } from '@/features/agent/application/agentPanelBridge'
import {
  buildContentWorkbenchAiSuggestPrompt,
  buildContentWorkbenchVisualPlanPrompt,
  type ContentWorkbenchAiPromptUnit,
} from '@/features/content/domain/contentWorkbenchAiPrompt'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import { firstText, titleOfRecord } from '@/features/content/domain/contentWorkbenchRecordUtils'
import { buildContentWorkbenchRouteSearch } from '@/features/content/domain/contentWorkbenchRoute'
import {
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
} from '@/features/content/domain/contentUnitPlanningMetadata'
import { ROUTES } from '@/routes/projectRoutes'

export interface ContentWorkbenchAiSuggestLaunchInput {
  requestId: string
  projectId: number
  productionId?: number
  sceneMomentId: number
  momentTitle: string
  momentScope?: string
  existingUnits: ContentWorkbenchAiPromptUnit[]
}

export interface ContentWorkbenchVisualPlanLaunchInput extends ContentWorkbenchAiSuggestLaunchInput {
  selectedUnitId: number
  selectedUnitTitle: string
}

export function buildContentWorkbenchAiSuggestLaunchInput({
  projectId,
  row,
  productions = [],
  now = Date.now,
}: {
  projectId?: number
  row: ContentGenerationMomentRow | null
  productions?: ContentWorkbenchRecord[]
  now?: () => number
}): ContentWorkbenchAiSuggestLaunchInput | null {
  if (!projectId || !row) return null
  const targetProduction = row.productionIds[0]
    ? productions.find((production) => production.ID === row.productionIds[0])
    : undefined
  return {
    requestId: `content_unit_suggest_${row.moment.ID}_${now().toString(36)}`,
    projectId,
    productionId: targetProduction?.ID,
    sceneMomentId: row.moment.ID,
    momentTitle: row.title,
    momentScope: row.scope,
    existingUnits: row.units.map((unit) => ({
      title: titleOfRecord(unit),
      kind: unit.kind,
      status: unit.status,
      prompt: unit.prompt,
      description: unit.description,
    })),
  }
}

export function buildContentWorkbenchVisualPlanLaunchInput({
  projectId,
  row,
  unit,
  productions = [],
  now = Date.now,
}: {
  projectId?: number
  row: ContentGenerationMomentRow | null
  unit: ContentWorkbenchRecord | null
  productions?: ContentWorkbenchRecord[]
  now?: () => number
}): ContentWorkbenchVisualPlanLaunchInput | null {
  if (!projectId || !row || !unit) return null
  const targetProduction = row.productionIds[0]
    ? productions.find((production) => production.ID === row.productionIds[0])
    : undefined
  return {
    requestId: `content_unit_visual_task_graph_${unit.ID}_${now().toString(36)}`,
    projectId,
    productionId: targetProduction?.ID,
    sceneMomentId: row.moment.ID,
    momentTitle: row.title,
    momentScope: row.scope,
    selectedUnitId: unit.ID,
    selectedUnitTitle: titleOfRecord(unit),
    existingUnits: row.units.map((item) => ({
      id: item.ID,
      unit_code: firstText(item.unit_code),
      title: titleOfRecord(item),
      kind: item.kind,
      status: item.status,
      prompt: item.prompt,
      description: item.description,
      visualTaskGraph: contentUnitVisualPlanPromptText(item),
      storyboardBrief: contentUnitStoryboardBriefPromptText(item),
    })),
  }
}

export function buildContentWorkbenchAiSuggestAgentPanelDraftPayload(input: ContentWorkbenchAiSuggestLaunchInput): AgentPanelDraftPayload {
  const prompt = buildContentWorkbenchAiSuggestPrompt({
    momentTitle: input.momentTitle,
    sceneMomentId: input.sceneMomentId,
    momentScope: input.momentScope,
    existingUnits: input.existingUnits,
  })
  return {
    requestId: input.requestId,
    taskType: 'content_unit_suggest',
    message: prompt,
    title: `制作项 AI 建议: ${input.momentTitle}`,
    newConversation: true,
    autoSend: false,
    projectId: input.projectId,
    clientInput: buildContentWorkbenchClientInput({
      prompt,
      labels: ['workbench', 'content-unit-suggest'],
      projectId: input.projectId,
      productionId: input.productionId,
      sceneMomentId: input.sceneMomentId,
      selection: {
        entityType: 'scene_moment',
        entityId: input.sceneMomentId,
        label: input.momentTitle,
      },
    }),
    timeoutMs: 90_000,
  }
}

export function buildContentWorkbenchVisualPlanAgentPanelDraftPayload(input: ContentWorkbenchVisualPlanLaunchInput): AgentPanelDraftPayload {
  const prompt = buildContentWorkbenchVisualPlanPrompt({
    momentTitle: input.momentTitle,
    sceneMomentId: input.sceneMomentId,
    momentScope: input.momentScope,
    selectedUnitId: input.selectedUnitId,
    selectedUnitTitle: input.selectedUnitTitle,
    existingUnits: input.existingUnits,
  })
  return {
    requestId: input.requestId,
    taskType: 'content_unit_visual_task_graph_proposal',
    message: prompt,
    title: `视觉计划 AI 草案: ${input.selectedUnitTitle}`,
    newConversation: true,
    autoSend: false,
    projectId: input.projectId,
    clientInput: buildContentWorkbenchClientInput({
      prompt,
      labels: ['workbench', 'content-unit-visual-taskGraph'],
      projectId: input.projectId,
      productionId: input.productionId,
      sceneMomentId: input.sceneMomentId,
      contentUnitId: input.selectedUnitId,
      selection: {
        entityType: 'content_unit',
        entityId: input.selectedUnitId,
        label: input.selectedUnitTitle,
      },
    }),
    timeoutMs: 90_000,
  }
}

export function launchContentWorkbenchAiSuggestAgent(input: ContentWorkbenchAiSuggestLaunchInput): void {
  openAgentPanelDraft(buildContentWorkbenchAiSuggestAgentPanelDraftPayload(input))
}

export function launchContentWorkbenchVisualPlanAgent(input: ContentWorkbenchVisualPlanLaunchInput): void {
  openAgentPanelDraft(buildContentWorkbenchVisualPlanAgentPanelDraftPayload(input))
}

function buildContentWorkbenchClientInput(input: {
  prompt: string
  labels: string[]
  projectId: number
  productionId?: number
  sceneMomentId: number
  contentUnitId?: number
  selection: { entityType: string; entityId: number; label: string }
}) {
  return buildCommandFirstClientInput({
    message: input.prompt,
    labels: input.labels,
    hints: {
      projectId: input.projectId,
      productionId: input.productionId,
      route: {
        pathname: ROUTES.project.contentUnitWorkbench,
        search: buildContentWorkbenchRouteSearch({
          sceneMomentId: input.sceneMomentId,
          contentUnitId: input.contentUnitId,
        }),
      },
      selection: input.selection,
    },
  })
}

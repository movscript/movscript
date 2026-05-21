import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, type AgentPanelDraftPayload } from '@/lib/agentPanelBridge'
import {
  buildContentWorkbenchAiSuggestPrompt,
  buildContentWorkbenchVisualPlanPrompt,
  type ContentWorkbenchAiPromptUnit,
} from '@/lib/contentWorkbenchAiPrompt'
import { buildContentWorkbenchRouteSearch } from '@/lib/contentWorkbenchRoute'
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
    taskType: 'content_unit_visual_plan_proposal',
    message: prompt,
    title: `视觉计划 AI 草案: ${input.selectedUnitTitle}`,
    newConversation: true,
    autoSend: false,
    projectId: input.projectId,
    clientInput: buildContentWorkbenchClientInput({
      prompt,
      labels: ['workbench', 'content-unit-visual-plan'],
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

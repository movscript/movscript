import {
  buildContentSourceWorkspaceCandidateCreatePlan,
  buildContentSourceWorkspaceAudioCuePatch,
  buildContentSourceWorkspaceEditPromptPatch,
  buildContentSourceWorkspaceExpressionUnitPatch,
  buildContentSourceWorkspaceHierarchyNodeRecord,
  buildContentSourceWorkspaceSelectionPatch,
  buildContentSourceWorkspaceStoryboardTimelinePatch,
  buildContentSourceWorkspaceTransitionPatch,
  createdContentSourceCandidateFromRecord,
  type ContentCandidateRecord,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceRuntimePort,
  type CreatedContentSourceCandidate,
  type HierarchyNode,
  type HierarchyNodeType,
  type HierarchyTransition,
  type StoryboardTimeline,
} from '@movscript/core/content'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

type ContentWorkspaceOwnerContext = {
  userId?: number | string
  orgId?: number | string
}

const uncheckedWorkspaceVersions: Record<string, string | null> = {}

export function createContentSourceWorkspaceRuntimePort(
  ownerContext: () => ContentWorkspaceOwnerContext = () => ({}),
): ContentSourceWorkspaceRuntimePort {
  const projectInput = (projectId: number) => ({
    ...ownerContext(),
    projectId,
  })

  return {
    async loadSnapshot(projectId) {
      return requireContentWorkspaceEngineAPI('loadMovScriptEngineContentWorkspaceSnapshot')(projectInput(projectId))
    },
    async selectContentUnitCandidate(input) {
	      await requireContentWorkspaceEngineAPI('selectMovScriptEngineContentUnitCandidate')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: {},
	        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        reason: input.reason,
      })
    },
    async createContentCandidate(input) {
	      const result = await requireContentWorkspaceEngineAPI('createMovScriptEngineContentCandidate')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: {},
	        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        source: input.source,
        status: input.status,
        producer: input.producer,
        outputs: input.outputs,
        promptSnapshot: input.promptSnapshot,
        createdAt: input.createdAt,
      })
      return result as ContentCandidateRecord
    },
    async updateContentUnitEditPrompt(input) {
	      await requireContentWorkspaceEngineAPI('updateMovScriptEngineContentUnitEditPrompt')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	        targetPath: input.targetPath,
        editPrompt: input.editPrompt,
      })
    },
    async updateExpressionUnit(input) {
	      await requireContentWorkspaceEngineAPI('updateMovScriptEngineExpressionUnit')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	        targetPath: input.targetPath,
        patch: input.patch,
      })
    },
    async updateAudioCue(input) {
	      await requireContentWorkspaceEngineAPI('updateMovScriptEngineAudioCue')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	        targetPath: input.targetPath,
        patch: input.patch,
      })
    },
    async updateEntityTransition(input) {
	      await requireContentWorkspaceEngineAPI('updateMovScriptEngineTransition')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	        targetPath: input.targetPath,
        transition: input.transition,
      })
    },
    async updateStoryboardTimeline(input) {
	      await requireContentWorkspaceEngineAPI('updateMovScriptEngineStoryboardTimeline')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	        targetPath: input.targetPath,
        timeline: input.timeline,
      })
    },
    async writeHierarchyNode(input) {
	      await requireContentWorkspaceEngineAPI('writeMovScriptEngineHierarchyNode')({
	        ...projectInput(input.projectId),
	        expectedWorkspaceVersions: { [input.targetPath]: null },
	        targetPath: input.targetPath,
        record: input.record,
      })
    },
    async interpretWorkspace(projectId) {
      await requireContentWorkspaceEngineAPI('syncMovScriptEngineContentWorkspace')(projectInput(projectId))
    },
  }
}

export async function loadContentSourceWorkspaceData(
  projectId: number,
  ownerContext: ContentWorkspaceOwnerContext = {},
): Promise<ContentSourceWorkspaceData> {
  return requireContentWorkspaceEngineAPI('loadMovScriptEngineContentWorkspace')({ ...ownerContext, projectId })
}

export async function selectContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: number
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('selectMovScriptEngineContentUnitCandidate')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: {},
	    ...buildContentSourceWorkspaceSelectionPatch(input),
  })
}

export async function createContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard'
  promptText?: string
  resourceId?: number
  resourceName?: string
  resourceType?: 'image' | 'video' | 'audio' | 'text' | 'file'
  resourceMimeType?: string
}): Promise<CreatedContentSourceCandidate> {
  const plan = buildContentSourceWorkspaceCandidateCreatePlan(input)
	  const record = await requireContentWorkspaceEngineAPI('createMovScriptEngineContentCandidate')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: {},
	    ...plan,
  })
  return createdContentSourceCandidateFromRecord(record as ContentCandidateRecord, {
    candidateId: plan.candidateId,
    contentUnitId: plan.contentUnitId,
  })
}

export async function updateContentSourceWorkspaceEditPrompt(input: {
  projectId: number
  targetPath: string
  text: string
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('updateMovScriptEngineContentUnitEditPrompt')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	    ...buildContentSourceWorkspaceEditPromptPatch(input),
  })
}

export async function updateContentSourceWorkspaceExpressionUnit(input: {
  projectId: number
  targetPath: string
  title: string
  kind: string
  text: string
  summary: string
  speaker?: string
  note?: string
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('updateMovScriptEngineExpressionUnit')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	    ...buildContentSourceWorkspaceExpressionUnitPatch(input),
  })
}

export async function updateContentSourceWorkspaceAudioCue(input: {
  projectId: number
  targetPath: string
  title: string
  cueKind: string
  promptHint: string
  expressionUnitRef?: string
  storyboardRef?: string
  timing: Record<string, unknown>
  assetRefs: string[]
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('updateMovScriptEngineAudioCue')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	    ...buildContentSourceWorkspaceAudioCuePatch(input),
  })
}

export async function updateContentSourceWorkspaceTransition(input: {
  projectId: number
  targetPath: string
  transition: HierarchyTransition
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('updateMovScriptEngineTransition')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	    ...buildContentSourceWorkspaceTransitionPatch(input),
  })
}

export async function updateContentSourceWorkspaceStoryboardTimeline(input: {
  projectId: number
  targetPath: string
  timeline: StoryboardTimeline
}): Promise<void> {
	  await requireContentWorkspaceEngineAPI('updateMovScriptEngineStoryboardTimeline')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: uncheckedWorkspaceVersions,
	    ...buildContentSourceWorkspaceStoryboardTimelinePatch(input),
  })
}

export async function createContentSourceWorkspaceHierarchyNode(input: {
  projectId: number
  type: HierarchyNodeType
  id: string
  title: string
  targetPath: string
  parentNode: HierarchyNode
}): Promise<void> {
  const record = buildContentSourceWorkspaceHierarchyNodeRecord(input)
	  await requireContentWorkspaceEngineAPI('writeMovScriptEngineHierarchyNode')({
	    projectId: input.projectId,
	    expectedWorkspaceVersions: { [input.targetPath]: null },
	    targetPath: input.targetPath,
    record,
  })
}

export async function syncContentSourceWorkspace(input: {
  projectId: number
}): Promise<void> {
  await requireContentWorkspaceEngineAPI('syncMovScriptEngineContentWorkspace')({ projectId: input.projectId })
}

function requireContentWorkspaceEngineAPI<K extends keyof Required<Pick<
  NonNullable<Window['api']>,
  | 'loadMovScriptEngineContentWorkspaceSnapshot'
  | 'loadMovScriptEngineContentWorkspace'
  | 'createMovScriptEngineContentCandidate'
  | 'selectMovScriptEngineContentUnitCandidate'
  | 'updateMovScriptEngineContentUnitEditPrompt'
  | 'updateMovScriptEngineExpressionUnit'
  | 'updateMovScriptEngineAudioCue'
  | 'updateMovScriptEngineTransition'
  | 'updateMovScriptEngineStoryboardTimeline'
  | 'writeMovScriptEngineHierarchyNode'
  | 'syncMovScriptEngineContentWorkspace'
>>>(key: K): Required<Pick<NonNullable<Window['api']>, K>>[K] {
  const fn = readElectronApi()?.[key]
  if (!fn) throw new Error(`MovScript engine API is unavailable: ${String(key)}`)
  return fn as Required<Pick<NonNullable<Window['api']>, K>>[K]
}

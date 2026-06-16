import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { currentWorkspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { loadContentSourceWorkspaceData } from './contentSourceWorkspaceElectron'
import type {
  ContentCanvasContentCandidateCreateInput,
  ContentCanvasContentCandidateSelectInput,
  ContentCanvasHierarchyNodeWriteInput,
  ContentCanvasWorkspaceGateway,
} from '../application/contentCanvasWorkspaceGateway'

export function createElectronContentCanvasWorkspaceGateway(projectId: number): ContentCanvasWorkspaceGateway {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  return {
    service,
    loadContentSourceWorkspaceData: (inputProjectId) => loadContentSourceWorkspaceData(inputProjectId, currentWorkspaceOwnerContext()),
    createProduction: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.id,
        snapshot: {
          production: { title: input.title },
          segments: [],
        },
      })
    },
    createSegment: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.id,
            title: input.title,
            kind: 'emotional_function',
            summary: `从制作「${input.productionTitle}」创建。`,
          }],
        },
      })
    },
    createSceneMoment: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.segmentId,
            scene_moments: [{
              id: input.id,
              title: input.title,
              action_text: `从情绪段「${input.segmentTitle}」创建。`,
            }],
          }],
        },
      })
    },
    createShot: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.segmentId,
            scene_moments: [{
              id: input.sceneMomentId,
              shots: [{
                id: input.id,
                title: input.title,
                kind: 'shot',
              }],
            }],
          }],
        },
      })
    },
    createExpressionUnit: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.segmentId,
            scene_moments: [{
              id: input.sceneMomentId,
              expression_units: [{
                id: input.id,
                kind: input.kind,
                text: input.text,
                title: input.title,
                intent: `从情节「${input.sceneMomentTitle}」创建。`,
              }],
            }],
          }],
        },
      })
    },
    createKeyframe: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.segmentId,
            scene_moments: [{
              id: input.sceneMomentId,
              shots: [{
                id: input.shotId,
                keyframes: [{
                  id: input.id,
                  title: input.title,
                  role: 'visual_anchor',
                  visual_intent: `从镜头「${input.shotTitle}」创建。`,
                }],
              }],
            }],
          }],
        },
      })
    },
    createStoryboard: async (input) => {
      await service.saveProductionSnapshot({
        productionId: input.productionId,
        snapshot: {
          segments: [{
            id: input.segmentId,
            scene_moments: [{
              id: input.sceneMomentId,
              shots: [{
                id: input.shotId,
                storyboards: [{
                  id: input.id,
                  title: input.title,
                  slot: input.id,
                  asset_kind: 'image',
                }],
              }],
            }],
          }],
        },
      })
    },
    createContentUnitCandidate: async (input: ContentCanvasContentCandidateCreateInput) => {
      const createCandidate = readElectronApi()?.createMovScriptEngineContentCandidate
      if (!createCandidate) throw new Error('当前窗口没有内容单元候选创建能力')
	      return createCandidate({
	        ...currentWorkspaceOwnerContext(),
	        projectId: input.projectId,
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
    },
    selectContentUnitCandidate: async (input: ContentCanvasContentCandidateSelectInput) => {
      const selectCandidate = readElectronApi()?.selectMovScriptEngineContentUnitCandidate
      if (!selectCandidate) throw new Error('当前窗口没有内容单元候选选择能力')
	      await selectCandidate({
	        ...currentWorkspaceOwnerContext(),
	        projectId: input.projectId,
	        expectedWorkspaceVersions: {},
	        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        resourceId: input.resourceId,
        reason: input.reason,
      })
    },
    writeHierarchyNode: async (input: ContentCanvasHierarchyNodeWriteInput) => {
      const writeNode = readElectronApi()?.writeMovScriptEngineHierarchyNode
      if (!writeNode) throw new Error('当前窗口没有 MovScript hierarchy 写入能力')
	      await writeNode({
	        ...currentWorkspaceOwnerContext(),
	        ...input,
	        expectedWorkspaceVersions: { [input.targetPath]: null },
	      })
    },
  }
}

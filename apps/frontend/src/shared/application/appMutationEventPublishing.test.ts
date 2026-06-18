import test from 'node:test'
import assert from 'node:assert/strict'

import { agentSessionOutputContentWorkspaceChangedResult, invalidateAgentSessionOutputMutationResult } from '@/features/agent/application/agentSessionOutputMutationInvalidation'
import { invalidateMovScriptWorkspaceMutationResult, workspaceFileChangedResult } from '@/features/agent/application/movScriptWorkspaceMutationInvalidation'
import { canvasDocumentChangedResult, invalidateCanvasMutationResult } from '@/features/canvas/application/canvasMutationInvalidation'
import { contentCanvasProjectChangedResult, invalidateContentCanvasMutationResult } from '@/features/content/application/contentCanvasMutationInvalidation'
import { invalidateJobMutationResult, toolJobsChangedResult } from '@/features/jobs/application/jobMutationInvalidation'
import { invalidateOrganizationMutationResult, organizationMembersChangedResult } from '@/features/organization/application/organizationMutationInvalidation'
import { invalidateProjectMutationResult, projectListChangedResult } from '@/features/project/application/projectMutationInvalidation'
import { assetCandidateSelectedResult, invalidateResourceMutationResult } from '@/features/resources/application/resourceMutationInvalidation'
import { invalidateScriptMutationResult, scriptCreatedResult } from '@/features/scripts/application/scriptMutationInvalidation'
import { invalidateShotLibraryMutationResult, shotReferencesChangedResult } from '@/features/shot-library/application/shotLibraryMutationInvalidation'
import { invalidateSemanticEntityMutationResult, semanticEntityChangedResult } from '@/shared/application/semanticEntityMutationInvalidation'
import { recentAppEventSnapshots, resetAppEventDedupeForTests } from './appEvents'

test('mutation invalidation helpers publish app events before local query invalidation', async () => {
  resetAppEventDedupeForTests()
  const queryClient = {
    invalidateQueries: () => undefined,
  }

  invalidateResourceMutationResult(queryClient, assetCandidateSelectedResult({ projectId: 1 }))
  invalidateProjectMutationResult(queryClient, projectListChangedResult({ orgId: 2 }))
  invalidateContentCanvasMutationResult(queryClient, contentCanvasProjectChangedResult({ projectId: 1 }))
  invalidateScriptMutationResult(queryClient, scriptCreatedResult({ projectId: 1 }))
  invalidateCanvasMutationResult(queryClient, canvasDocumentChangedResult({ canvasId: 3 }))
  invalidateJobMutationResult(queryClient, toolJobsChangedResult({ nodeType: 'image' }))
  invalidateOrganizationMutationResult(queryClient, organizationMembersChangedResult({ orgId: 2 }))
  invalidateShotLibraryMutationResult(queryClient, shotReferencesChangedResult())
  await invalidateAgentSessionOutputMutationResult(queryClient, agentSessionOutputContentWorkspaceChangedResult({ projectId: 1 }))
  invalidateMovScriptWorkspaceMutationResult(queryClient, workspaceFileChangedResult({ path: 'project.json' }))
  invalidateSemanticEntityMutationResult(queryClient, semanticEntityChangedResult({ projectId: 1, kind: 'production', recordId: 4 }))

  assert.deepEqual(recentAppEventSnapshots().map((event) => event.topic), [
    'resource.mutation',
    'project.mutation',
    'content-canvas.mutation',
    'script.mutation',
    'canvas.mutation',
    'job.mutation',
    'organization.mutation',
    'shot-library.mutation',
    'agent-output.mutation',
    'workspace-files.mutation',
    'semantic-entity.mutation',
  ])
  assert.ok(recentAppEventSnapshots().every((event) => event.source === 'query-invalidation'))
})

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AgentContentPromptSurface, type AgentContentPromptSaveInput } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceParams, fetchAgentSurfaceSnapshot, invalidateAgentSurfaceQueries, postAgentSurfaceAction } from './agentSurfaceData'

export default function AgentContentPromptPage() {
  const proxy = useAgentMcpApiProxy()
  const queryClient = useQueryClient()
  const projectId = proxy.params.get('projectId') ?? undefined
  const contentUnitId = proxy.params.get('contentUnitId') ?? undefined
  const mode = proxy.params.get('mode') ?? 'edit'
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, contentUnitId, mode }), [proxy.params, projectId, contentUnitId, mode])
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['agent-surface', 'content-prompt', queryParams],
    queryFn: () => fetchAgentSurfaceSnapshot('content-prompt', queryParams),
    enabled: proxy.ready && Boolean(contentUnitId),
  })
  const save = useMutation({
    mutationFn: (input: AgentContentPromptSaveInput) => postAgentSurfaceAction('content-prompt', 'save', queryParams, {
      projectId,
      contentUnitId,
      targetPath: input.targetPath,
      editPrompt: input.editPrompt,
      metadata: {
        surface: 'agent_content_prompt',
        intent: 'edit_prompt',
      },
    }),
    onSuccess: () => {
      invalidateAgentSurfaceQueries(queryClient, [
        'content-prompt',
        'content-candidates',
        'impact',
        'project-status',
        'preview-timeline',
      ])
    },
  })

  return (
    <AgentContentPromptSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      contentUnitId={contentUnitId}
      mode={mode}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      savePending={save.isPending}
      saveError={save.error}
      saveSuccess={save.isSuccess}
      onSave={(input) => save.mutate(input)}
    />
  )
}

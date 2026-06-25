import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  Clapperboard,
  FilePlus2,
  FileText,
  Home,
  LayoutTemplate,
  PackageSearch,
  PenLine,
} from 'lucide-react'

import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { agentBrowserKeys } from '@/features/agent/application/agentQueryKeys'
import {
  agentBrowserProjectFirstText,
  agentBrowserProjectRecordField,
  agentBrowserProjectRecordRouteId,
  agentBrowserProjectRecordStableId,
  agentBrowserProjectRecordTitle,
  agentBrowserProjectStringField,
  visibleAgentBrowserProjectRecords,
} from '@/features/agent/application/agentBrowserProjectHomeModel'
import {
  AgentBrowserContentToolButton,
} from '@/features/agent/components/AgentBrowserInternalPageUi'
import type {
  AgentBrowserProjectHomeViewModel,
  ProjectNavigationGroup,
} from '@/features/agent/components/AgentBrowserProjectHomePageParts'
import { createWorkspaceScript, listWorkspaceScripts, scriptKeys } from '@movscript/project-surface/data'
import type { Project, Script } from '@/types'
import { toast } from '@movscript/ui/toast'

interface UseAgentBrowserProjectHomeControllerInput {
  onOpenCanvasList: () => void
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  project: Project
}

export function useAgentBrowserProjectHomeController({
  onOpenCanvasList,
  onOpenProjectStandards,
  onOpenResourceLibrary,
  project,
}: UseAgentBrowserProjectHomeControllerInput): AgentBrowserProjectHomeViewModel {
  const projectId = project.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )
  const scriptsQuery = useQuery<Script[]>({ queryKey: agentBrowserKeys.navigationScripts(projectId, workspaceContext.userId, workspaceContext.orgId), queryFn: () => listWorkspaceScripts(projectId, workspaceContext) })
  const referencesQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'settings'), queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('settings')) })
  const assetSlotsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'assetSlots'), queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('assetSlots')) })
  const productionsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'productions'), queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('productions')) })
  const sceneMomentsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'sceneMoments'), queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')) })
  const contentUnitsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'contentUnits'), queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('contentUnits')) })
  const createScript = useMutation({
    mutationFn: () => {
      const scriptNumber = (scriptsQuery.data?.length ?? 0) + 1
      return createWorkspaceScript(projectId, {
        title: `新手记 ${scriptNumber}`,
        script_type: 'uncategorized',
        content: '',
        raw_source: '',
        summary: '',
      }, workspaceContext)
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: agentBrowserKeys.navigationScripts(projectId, workspaceContext.userId, workspaceContext.orgId),
      })
      void queryClient.invalidateQueries({ queryKey: scriptKeys.projectScriptScope(projectId) })
      toast.success('手记已创建')
      navigate(withRouteParams(ROUTES.project.scripts, { script_id: created.ID }))
    },
    onError: () => toast.error('创建手记失败，请重试'),
  })

  const groups: ProjectNavigationGroup[] = [
    {
      key: 'standards',
      title: '项目规范',
      description: '项目级画幅、视觉风格、镜头语言、节奏和负面约束。',
      icon: Home,
      tone: 'plan',
      loading: false,
      items: [{
        id: String(project.ID),
        title: '项目规范',
        description: agentBrowserProjectFirstText(
          agentBrowserProjectRecordField(project, 'visual_style'),
          agentBrowserProjectRecordField(project, 'project_style'),
          project.description,
          '查看和维护会话项目规范',
        ),
        status: agentBrowserProjectFirstText(agentBrowserProjectRecordField(project, 'aspect_ratio'), '规范'),
        onClick: onOpenProjectStandards,
      }],
    },
    {
      key: 'scripts',
      title: '手记列表',
      description: '手记文本、分块和后续编排引用。',
      icon: FileText,
      tone: 'script',
      loading: scriptsQuery.isLoading,
      action: (
        <AgentBrowserContentToolButton
          icon={<FilePlus2 size={13} />}
          disabled={createScript.isPending}
          onClick={() => createScript.mutate()}
        >
          {createScript.isPending ? '创建中' : '新建手记'}
        </AgentBrowserContentToolButton>
      ),
      items: (scriptsQuery.data ?? [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID)
        .map((script) => ({
          id: String(script.ID),
          title: script.title || `手记 #${script.ID}`,
          description: agentBrowserProjectFirstText(script.summary, script.description, script.script_type, '暂无摘要'),
          status: script.script_type,
          to: withRouteParams(ROUTES.project.scripts, { script_id: script.ID }),
        })),
    },
    {
      key: 'references',
      title: '设定列表',
      description: '角色、世界观、风格和可复用创作约束。',
      icon: PenLine,
      tone: 'plan',
      loading: referencesQuery.isLoading,
      items: visibleAgentBrowserProjectRecords(referencesQuery.data).map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'reference', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '设定'),
        description: agentBrowserProjectFirstText(record.description, record.content, record.kind, '暂无描述'),
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        to: ROUTES.project.scripts,
      })),
    },
    {
      key: 'assets',
      title: '素材列表',
      description: '素材需求、候选资源和锁定状态。',
      icon: PackageSearch,
      tone: 'asset',
      loading: assetSlotsQuery.isLoading,
      items: visibleAgentBrowserProjectRecords(assetSlotsQuery.data).map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'asset', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '素材'),
        description: agentBrowserProjectFirstText(record.description, record.prompt_hint, record.kind, '暂无描述'),
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        onClick: onOpenResourceLibrary,
      })),
    },
    {
      key: 'productions',
      title: '制作列表',
      description: '制作方案、制作任务和整体进度。',
      icon: Clapperboard,
      tone: 'production',
      loading: productionsQuery.isLoading,
      items: visibleAgentBrowserProjectRecords(productionsQuery.data).map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'production', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '制作'),
        description: agentBrowserProjectFirstText(record.description, record.summary, record.kind, '暂无描述'),
        status: agentBrowserProjectStringField(record.status),
        to: withRouteParams(ROUTES.project.scripts, { productionId: agentBrowserProjectRecordRouteId(record) }),
      })),
    },
    {
      key: 'moments',
      title: '情节列表',
      description: '编排段、情节点和上下游引用关系。',
      icon: Boxes,
      tone: 'production',
      loading: sceneMomentsQuery.isLoading,
      items: visibleAgentBrowserProjectRecords(sceneMomentsQuery.data).map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'moment', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '情节'),
        description: agentBrowserProjectFirstText(record.description, record.action_text, record.location_text, record.mood, '暂无描述'),
        status: agentBrowserProjectStringField(record.status),
        onClick: onOpenCanvasList,
      })),
    },
    {
      key: 'content',
      title: '内容列表',
      description: '创作片段、关键帧、生成上下文和预览挂载。',
      icon: LayoutTemplate,
      tone: 'content',
      loading: contentUnitsQuery.isLoading,
      items: visibleAgentBrowserProjectRecords(contentUnitsQuery.data).map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'content', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '内容'),
        description: agentBrowserProjectFirstText(record.description, record.prompt, record.visual_intent, record.kind, '暂无描述'),
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        onClick: onOpenCanvasList,
      })),
    },
  ]

  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0)
  const loadingGroups = groups.filter((group) => group.loading).length
  const rows = groups.map((group): [string, string | number] => [
    group.title.replace('列表', ''),
    group.loading ? '...' : group.items.length,
  ])

  return {
    groups,
    loadingGroups,
    projectName: project.name,
    rows,
    totalItems,
  }
}

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
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import {
  loadProjectHomeReadModel,
  projectHomeScriptsFromReadModel,
  type ProjectHomeReadModelRecord,
} from '@/shared/infrastructure/api/projectHomeReadModel'
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
import { createWorkspaceScript, scriptKeys } from '@movscript/project-surface/data'
import type { Project } from '@/types'
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
    () => {
      const ownerContext = workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
      return {
        ...ownerContext,
        ...(project.workspace_path ? { projectDir: project.workspace_path } : project.project_path ? { projectDir: project.project_path } : {}),
        ...(project.project_uid ? { projectUid: project.project_uid } : {}),
      }
    },
    [currentOrgID, currentUser?.ID, orgMemberships, project.project_path, project.project_uid, project.workspace_path],
  )
  const projectHomeQuery = useQuery({
    queryKey: agentBrowserKeys.navigationProject(projectId),
    queryFn: () => loadProjectHomeReadModel(project, workspaceContext),
    staleTime: 2_000,
    placeholderData: (previousData) => previousData,
  })
  const createScript = useMutation({
    mutationFn: () => {
      const scriptNumber = (projectHomeQuery.data?.scripts.length ?? 0) + 1
      return createWorkspaceScript(projectId, {
        title: `新手记 ${scriptNumber}`,
        script_type: 'uncategorized',
        content: '',
        raw_source: '',
        summary: '',
      }, workspaceContext)
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: agentBrowserKeys.navigationProject(projectId) })
      void queryClient.invalidateQueries({
        queryKey: agentBrowserKeys.navigationScripts(projectId, workspaceContext.userId, workspaceContext.orgId),
      })
      void queryClient.invalidateQueries({ queryKey: scriptKeys.projectScriptScope(projectId) })
      toast.success('手记已创建')
      navigate(withRouteParams(ROUTES.project.scripts, { script_id: created.ID }))
    },
    onError: () => toast.error('创建手记失败，请重试'),
  })

  const scripts = projectHomeScriptsFromReadModel(projectHomeQuery.data, projectId)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID)
  const references = visibleAgentBrowserProjectRecords(projectHomeRecords(projectHomeQuery.data?.settings))
  const assetSlots = visibleAgentBrowserProjectRecords(projectHomeRecords(projectHomeQuery.data?.assets))
  const productions = visibleAgentBrowserProjectRecords(projectHomeRecords(projectHomeQuery.data?.productions))
  const sceneMoments = visibleAgentBrowserProjectRecords(projectHomeRecords(projectHomeQuery.data?.sceneMoments))
  const contentUnits = visibleAgentBrowserProjectRecords(projectHomeRecords(projectHomeQuery.data?.contentUnits))

  const projectAspectRatio = agentBrowserProjectFirstText(
    agentBrowserProjectRecordField(project, 'aspect_ratio'),
    agentBrowserProjectRecordField(project, 'aspectRatio'),
    '未设置',
  )
  const projectStyle = agentBrowserProjectFirstText(
    agentBrowserProjectRecordField(project, 'visual_style'),
    agentBrowserProjectRecordField(project, 'project_style'),
    project.description,
    '未设置',
  )
  const projectRhythm = agentBrowserProjectFirstText(
    agentBrowserProjectRecordField(project, 'rhythm'),
    agentBrowserProjectRecordField(project, 'pacing'),
    agentBrowserProjectRecordField(project, 'edit_rhythm'),
    '未设置',
  )

  const groups: ProjectNavigationGroup[] = [
    {
      key: 'standards',
      title: '项目规范',
      description: '项目级画幅、视觉风格、镜头语言、节奏和负面约束。',
      icon: Home,
      variant: 'hero',
      tone: 'plan',
      roleLabel: '基准',
      countLabel: projectAspectRatio === '未设置' ? '规范' : projectAspectRatio,
      loading: false,
      facts: [
        { label: '画幅', value: projectAspectRatio },
        { label: '风格', value: projectStyle },
        { label: '节奏', value: projectRhythm },
      ],
      items: [{
        id: String(project.ID),
        title: '项目规范',
        description: projectStyle === '未设置' ? '查看和维护会话项目规范' : projectStyle,
        detail: projectRhythm === '未设置' ? undefined : `节奏：${projectRhythm}`,
        status: projectAspectRatio === '未设置' ? '规范' : projectAspectRatio,
        onClick: onOpenProjectStandards,
      }],
    },
    {
      key: 'scripts',
      title: '手记列表',
      description: '手记文本、分块和后续编排引用。',
      icon: FileText,
      variant: 'library',
      tone: 'script',
      roleLabel: '文本',
      loading: projectHomeQuery.isLoading,
      countLabel: `${scripts.length} 篇`,
      emptyState: '还没有手记。先记录一段文本，后续才能拆分和编排。',
      action: (
        <AgentBrowserContentToolButton
          icon={<FilePlus2 size={13} />}
          disabled={createScript.isPending}
          onClick={() => createScript.mutate()}
        >
          {createScript.isPending ? '创建中' : '新建手记'}
        </AgentBrowserContentToolButton>
      ),
      items: scripts.map((script) => ({
        id: String(script.ID),
        title: script.title || `手记 #${script.ID}`,
        description: agentBrowserProjectFirstText(script.summary, script.description, script.script_type, '暂无摘要'),
        detail: '可作为分块、编排和后续生成的文本来源',
        status: script.script_type,
        to: withRouteParams(ROUTES.project.scripts, { script_id: script.ID }),
      })),
    },
    {
      key: 'references',
      title: '设定列表',
      description: '角色、世界观、风格和可复用创作约束。',
      icon: PenLine,
      variant: 'library',
      tone: 'plan',
      roleLabel: '设定',
      loading: projectHomeQuery.isLoading,
      countLabel: `${references.length} 条`,
      emptyState: '还没有设定条目。角色、世界观和风格约束会出现在这里。',
      items: references.map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'reference', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '设定'),
        description: agentBrowserProjectFirstText(record.description, record.content, record.kind, '暂无描述'),
        detail: '沉淀为跨手记复用的创作约束',
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        to: ROUTES.project.scripts,
      })),
    },
    {
      key: 'assets',
      title: '素材列表',
      description: '素材需求、候选资源和锁定状态。',
      icon: PackageSearch,
      variant: 'library',
      tone: 'asset',
      roleLabel: '素材',
      loading: projectHomeQuery.isLoading,
      countLabel: `${assetSlots.length} 项`,
      emptyState: '还没有素材槽位。资源需求建立后会在这里汇总。',
      items: assetSlots.map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'asset', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '素材'),
        description: agentBrowserProjectFirstText(record.description, record.prompt_hint, record.kind, '暂无描述'),
        detail: '可连接候选资源、参考图和锁定素材',
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        onClick: onOpenResourceLibrary,
      })),
    },
    {
      key: 'productions',
      title: '制作列表',
      description: '制作方案、制作任务和整体进度。',
      icon: Clapperboard,
      variant: 'pipeline',
      tone: 'production',
      roleLabel: '制作',
      loading: projectHomeQuery.isLoading,
      countLabel: `${productions.length} 个`,
      emptyState: '尚未建立制作方案。制作计划会成为情节和内容单元的上游。',
      items: productions.map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'production', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '制作'),
        description: agentBrowserProjectFirstText(record.description, record.summary, record.kind, '暂无描述'),
        detail: '承接项目规范并组织制作任务',
        status: agentBrowserProjectStringField(record.status),
        to: withRouteParams(ROUTES.project.scripts, { productionId: agentBrowserProjectRecordRouteId(record) }),
      })),
    },
    {
      key: 'moments',
      title: '情节列表',
      description: '编排段、情节点和上下游引用关系。',
      icon: Boxes,
      variant: 'pipeline',
      tone: 'production',
      roleLabel: '情节',
      loading: projectHomeQuery.isLoading,
      countLabel: `${sceneMoments.length} 段`,
      emptyState: '还没有情节点。镜头段落和上下游引用建立后会出现在这里。',
      items: sceneMoments.map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'moment', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '情节'),
        description: agentBrowserProjectFirstText(record.description, record.action_text, record.location_text, record.mood, '暂无描述'),
        detail: '连接文本、资产与可生成内容单元',
        status: agentBrowserProjectStringField(record.status),
        onClick: onOpenCanvasList,
      })),
    },
    {
      key: 'content',
      title: '内容列表',
      description: '创作片段、关键帧、生成上下文和预览挂载。',
      icon: LayoutTemplate,
      variant: 'pipeline',
      tone: 'content',
      roleLabel: '内容',
      loading: projectHomeQuery.isLoading,
      countLabel: `${contentUnits.length} 个`,
      emptyState: '还没有内容单元。生成上下文、关键帧和预览挂载会在这里聚合。',
      items: contentUnits.map((record, recordIndex) => ({
        id: agentBrowserProjectRecordStableId(record, 'content', recordIndex),
        title: agentBrowserProjectRecordTitle(record, '内容'),
        description: agentBrowserProjectFirstText(record.description, record.prompt, record.visual_intent, record.kind, '暂无描述'),
        detail: '聚合提示词、候选结果和预览挂载状态',
        status: agentBrowserProjectStringField(record.status ?? record.kind),
        onClick: onOpenCanvasList,
      })),
    },
  ]

  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0)
  const loadingGroups = groups.filter((group) => group.loading).length
  const libraryCount = scripts.length + references.length + assetSlots.length
  const pipelineCount = productions.length + sceneMoments.length + contentUnits.length
  const rows: Array<[string, string | number]> = [
    ['资料库', projectHomeCountValue(projectHomeQuery.isLoading, libraryCount)],
    ['生产链路', projectHomeCountValue(projectHomeQuery.isLoading, pipelineCount)],
    ['手记', projectHomeCountValue(projectHomeQuery.isLoading, scripts.length)],
    ['素材', projectHomeCountValue(projectHomeQuery.isLoading, assetSlots.length)],
  ]
  const summaryHint = loadingGroups > 0
    ? `正在同步 ${loadingGroups} 类数据`
    : pipelineCount > 0
      ? '制作链路已建立'
      : libraryCount > 0
        ? '资料库已建立'
        : '等待项目内容'

  return {
    groups,
    loadingGroups,
    projectName: project.name,
    rows,
    summaryHint,
    totalItems,
  }
}

function projectHomeCountValue(loading: boolean, count: number): string | number {
  return loading ? '...' : count
}

function projectHomeRecords(records: ProjectHomeReadModelRecord[] | undefined): SemanticEntityRecord[] {
  return (records ?? []).map((record, index) => ({
    ID: typeof record.ID === 'number' ? record.ID : index + 1,
    ...record,
  })) as SemanticEntityRecord[]
}

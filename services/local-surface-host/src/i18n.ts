import i18n from 'i18next'
import { canvasSurfaceI18nResources } from '@movscript/canvas-surface/i18n'
import { jobsSurfaceI18nResources } from '@movscript/jobs-surface/i18n'
import { projectSurfaceI18nResources } from '@movscript/project-surface/i18n'
import { resourceSurfaceI18nResources } from '@movscript/resource-surface/i18n'
import { shotLibrarySurfaceI18nResources } from '@movscript/shot-library-surface/i18n'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_STORAGE_KEY = 'movscript.language'
const LEGACY_LANGUAGE_STORAGE_KEY = 'movscript.localSurfaceHost.language'
const localSurfaceHostI18nResources = {
  'zh-CN': {
    translation: {
      common: {
        loadingShort: '加载中',
        retry: '重试',
      },
      localSurfaceHost: {
        chrome: {
          localSurface: 'Local Surface',
          title: '本地 Surface Host',
          projectHomeTitle: '项目 Home',
          routeNotFoundTitle: '路由未挂载',
          homeDescription: 'MovScript surfaces running in a local browser host.',
          loadingSurface: '正在加载 surface...',
          loadingAdmin: '正在加载 admin...',
          localWorkspace: '本地工作区',
          routeErrorTitle: 'Surface 渲染失败',
        },
        home: {
          title: 'App Home',
          description: '继续本地项目，或进入工具、工作流画布、剪辑和资源工作区。',
          primaryAction: '打开 Tool Home',
          secondaryAction: '查看项目',
          workspaceTitle: '继续创作',
          workspaceDescription: '从最近项目开始，或者进入工具入口准备素材、工作流画布和剪辑。',
          mcpReady: 'MCP 代理已就绪',
          localDirect: '本地直连',
          resources: '资源库',
          projectOverview: '项目概览',
          continueWorkspace: '继续当前本地工作区',
          noProjectDir: '还没有通过 projectDir 或 projectPath 绑定项目目录。',
          openProjectHome: '打开项目 Home',
        },
        preferences: {
          theme: '主题',
          language: '语言',
          light: '浅色',
          dark: '深色',
          switchToLight: '切换到浅色主题',
          switchToDark: '切换到深色主题',
          switchLanguage: '切换语言',
        },
        tabs: {
          primary: '一级工作模式',
          app: 'App',
          tool: '工具',
          project: '项目',
          edit: '剪辑',
          canvas: '工作流画布',
        },
        recent: {
          title: '最近项目',
          description: '从最近触达的本地目录继续进入项目工作区。',
          continueProject: '继续最近项目',
          empty: '还没有最近本地项目。',
        },
        homes: {
          label: '工作入口',
          primaryTitle: '一级工作模式',
          primaryDescription: '顶部 Tab 只表达工作模式；进入 Tool 后再展开工具箱。',
          toolTitle: 'Tool Home',
          toolDescription: '集中打开资源、剪辑、工作流画布和 agent 相关工具。',
          toolAction: '进入工具',
          projectsTitle: 'Projects',
          projectsDescription: '查看本地项目列表，或从最近项目继续。',
          edit: {
            title: 'Edit Home',
            description: '创建和重新打开剪辑项目、时间线、字幕与导出任务。',
          },
          resource: {
            title: 'Resources',
            description: '浏览本地媒体、外部结果、生成素材和资源详情。',
          },
          shotLibrary: {
            title: '镜头库',
            description: '管理镜头参考、语义标签、分镜片段和可复用的视觉语言。',
          },
          canvas: {
            title: '工作流画布 Home',
            description: '管理可执行的工作流画布、视觉规划和项目灵感板。',
          },
          external: {
            title: 'External Resources',
            description: '从外部素材源检索可用于项目的参考。',
          },
          agentResources: {
            title: 'Agent Resources',
            description: '打开 agent 结果和上下文中的资源库视图。',
          },
          jobs: {
            title: '生成记录',
            description: '查看本地图片、视频、音频和工作流画布生成任务的状态与输出。',
          },
          system: {
            title: 'Admin Overview',
            description: '作为辅助入口查看本地服务和管理页面。',
          },
        },
        toolHome: {
          title: 'Tool Home',
          description: '一个本地创作工具入口：准备素材、进入剪辑、打开工作流画布，或查看 agent 资源。',
          featuredTitle: '选择下一件事',
          featuredDescription: 'Tool Home 只负责进入工具；具体创作仍在各自的 surface 中完成。',
          recentWork: '最近工作',
          utilities: '辅助入口',
          continue: '继续',
          navigation: '工具导航',
          sidebarDescription: '工具箱',
          toolRouteTitle: '这个工具入口已保留',
          toolRouteDescription: '生成工具正在从 Desktop feature 迁移为可共享 surface；当前入口已按 /tools/* 路由接入，后续可以直接替换为真实工具页面。',
          groups: {
            shots: '镜头与素材',
            generation: '生成工具',
            workspaces: '制作工作区',
          },
        },
        tools: {
          refImageGen: {
            title: '参考生图',
            description: '基于图片参考生成或改写图像资产。',
          },
          refVideoGen: {
            title: '参考生视频',
            description: '用图片或视频参考生成运动镜头。',
          },
          audioGen: {
            title: '语音生成',
            description: '将文字合成为旁白、台词或声音草稿。',
          },
          audioTranscribe: {
            title: '语音转写',
            description: '将音频转写为文本，便于字幕、台词和素材整理。',
          },
          audioTranslate: {
            title: '音频翻译',
            description: '将音频翻译为目标语言文本，便于跨语种字幕和整理。',
          },
          musicGen: {
            title: '音乐生成',
            description: '用提示词生成配乐、氛围音乐或音乐草稿。',
          },
          audioSfx: {
            title: '音效生成',
            description: '生成 Foley、环境声、转场声和短音效素材。',
          },
          voiceClone: {
            title: '声音克隆',
            description: '用样本音频创建可复用的角色声音或旁白声音。',
          },
          voiceDesign: {
            title: '声音设计',
            description: '用文字描述生成新的声音人设和可用 voice profile。',
          },
          motionImitation: {
            title: '动作模仿',
            description: '从参考视频迁移动作与运动节奏。',
          },
          styleTransfer: {
            title: '风格迁移',
            description: '把视觉风格应用到目标素材或镜头。',
          },
          multiAngle: {
            title: '多角度',
            description: '围绕同一主体探索多个镜头角度。',
          },
        },
        jobs: {
          title: '生成记录',
          description: '查看本地生成任务、输出资源和失败原因；需要时可以取消或重试。',
          summary: '生成记录摘要',
          total: '总记录',
          active: '进行中',
          page: '页码',
          records: '任务列表',
          recordsDescription: '按状态和类型筛选最近的生成任务。',
          statusFilter: '状态筛选',
          categoryFilter: '类型筛选',
          empty: '还没有生成记录',
          emptyHint: '从生成工具、工作流画布或 agent 提交任务后会出现在这里。',
          noPrompt: '（无提示词）',
          retry: '重试',
          cancel: '取消',
          previous: '上一页',
          next: '下一页',
          pageStatus: '第 {{page}} / {{pageCount}} 页',
          filters: {
            allStatuses: '全部状态',
          },
          categories: {
            all: '全部类型',
            image: '文生图',
            imageEdit: '参考生图',
            video: '文生视频',
            videoI2V: '参考生视频',
            videoV2V: '视频迁移',
            audio: '音频/字幕',
            canvas: '工作流画布',
          },
          status: {
            pending: '排队中',
            running: '生成中',
            succeeded: '完成',
            failed: '失败',
            cancelled: '已取消',
          },
          fields: {
            type: '类型',
            model: '模型',
            feature: '功能',
            created: '创建',
            updated: '更新',
            output: '输出资源',
            error: '失败原因',
            prompt: '提示词',
          },
        },
        project: {
          homeTitle: '项目 Home',
          homeDescription: '这个项目入口会保留当前 URL 参数，并把 Project Surface 的核心路由集中到同一个工作台里。',
          projectDirConfigured: '项目目录已配置',
          projectDirMissing: '缺少项目目录',
          overview: '概览',
          routeLabels: {
            overview: '概览',
            progress: '进度',
            dailies: '样片间',
            liveRoom: 'Live Room',
            editDesk: '剪辑台',
            impact: '影响分析',
            timeline: '时间线',
            resources: '资源',
            scripts: '脚本',
            standards: '标准',
            content: '内容',
            settings: '设置',
          },
        },
        cards: {
          projectStudio: {
            title: '项目 Studio',
            description: '项目概览、进度、样片间、影响分析、脚本、标准和内容工作台。',
            action: '打开概览',
          },
          resources: {
            title: '资源库',
            description: '查看本地资源库、外部检索结果，以及 agent 打开的资源详情。',
            action: '打开资源库',
            external: '外部资源',
            agentSurface: 'Agent surface',
          },
          editing: {
            title: '剪辑',
            description: '剪辑项目 surface，连接 Editing Service 和 Media Pipeline。',
            action: '打开剪辑',
            serviceConfigured: 'Editing Service 已配置',
            serviceMissing: '缺少 Editing Service',
            pipelineConfigured: 'Media Pipeline 已配置',
            pipelineMissing: '缺少 Media Pipeline',
          },
          canvas: {
            title: '工作流画布',
            description: '管理可独立运行、复用或嵌套引用的工作流画布。',
            action: '打开工作流画布',
            list: '工作流画布列表',
          },
        },
        sidebar: {
          local: 'Local',
          sections: {
            home: 'Home',
            work: '工作区',
            system: '系统',
          },
          appHome: 'App Home',
          toolHome: 'Tool Home',
          projectHome: '项目 Home',
          projectStudio: '项目 Studio',
          resources: '资源库',
          external: '外部资源',
          canvas: '工作流画布',
          editing: '剪辑',
          agentResources: 'Agent 资源',
          jobs: '生成记录',
          admin: 'Admin',
        },
        runtime: {
          title: '运行时',
          description: '当前 Surface Host 接收到的路由和能力参数。',
          path: 'Path',
          projectId: '项目 ID',
          projectDir: '项目目录',
          mcpApiBaseURL: 'MCP API 地址',
          projectService: 'Project Gateway',
          editingService: 'Editing Capability',
          mediaPipeline: 'Media Capability',
          source: '来源',
          notConfigured: '未配置',
          localHostProxy: 'Surface Host 代理',
        },
        routes: {
          mounted: '已挂载路由',
          home: 'Home',
          projectOverview: '项目概览',
          resources: '资源库',
          externalResources: '外部资源',
          canvases: '工作流画布',
          editing: '剪辑',
          agentResources: 'Agent 资源',
          jobs: '生成记录',
          adminOverview: 'Admin 概览',
        },
        notFound: {
          title: '这个 surface route 还没有挂载',
          backHome: '返回首页',
          openProjectOverview: '打开项目概览',
        },
      },
    },
  },
  'en-US': {
    translation: {
      common: {
        loadingShort: 'Loading',
        retry: 'Retry',
      },
      localSurfaceHost: {
        chrome: {
          localSurface: 'Local Surface',
          title: 'Local Surface Host',
          projectHomeTitle: 'Project Home',
          routeNotFoundTitle: 'Route not found',
          homeDescription: 'MovScript surfaces running in a local browser host.',
          loadingSurface: 'Loading surface...',
          loadingAdmin: 'Loading admin...',
          localWorkspace: 'Local Workspace',
          routeErrorTitle: 'Surface failed to render',
        },
        home: {
          title: 'App Home',
          description: 'Continue a local project, or enter tool, canvas, editing, and resource workspaces.',
          primaryAction: 'Open Tool Home',
          secondaryAction: 'View projects',
          workspaceTitle: 'Continue creating',
          workspaceDescription: 'Start from a recent project, or enter the tool launcher to prepare assets, workflow canvases, and edits.',
          mcpReady: 'MCP proxy ready',
          localDirect: 'Local direct',
          resources: 'Resources',
          projectOverview: 'Project overview',
          continueWorkspace: 'Continue the current local workspace',
          noProjectDir: 'No project directory is bound through projectDir or projectPath yet.',
          openProjectHome: 'Open project home',
        },
        preferences: {
          theme: 'Theme',
          language: 'Language',
          light: 'Light',
          dark: 'Dark',
          switchToLight: 'Switch to light theme',
          switchToDark: 'Switch to dark theme',
          switchLanguage: 'Switch language',
        },
        tabs: {
          primary: 'Primary work modes',
          app: 'App',
          tool: 'Tools',
          project: 'Projects',
          edit: 'Editing',
          canvas: 'Workflow Canvas',
        },
        recent: {
          title: 'Recent Projects',
          description: 'Continue local project workspaces from directories you touched recently.',
          continueProject: 'Continue latest project',
          empty: 'No recent local projects yet.',
        },
        homes: {
          label: 'Work entries',
          primaryTitle: 'Primary Work Modes',
          primaryDescription: 'The top tabs express work modes; Tool expands into the toolbox inside.',
          toolTitle: 'Tool Home',
          toolDescription: 'Open resources, editing, workflow canvases, and agent-facing tools from one place.',
          toolAction: 'Open tools',
          projectsTitle: 'Projects',
          projectsDescription: 'Browse local projects or continue from recent work.',
          edit: {
            title: 'Edit Home',
            description: 'Create and reopen editing projects, timelines, subtitles, and export tasks.',
          },
          resource: {
            title: 'Resources',
            description: 'Browse local media, external results, generated assets, and resource details.',
          },
          shotLibrary: {
            title: 'Shot Library',
            description: 'Manage shot references, semantic tags, storyboard clips, and reusable visual language.',
          },
          canvas: {
            title: 'Workflow Canvas Home',
            description: 'Manage executable workflow canvases, visual planning, and project inspiration boards.',
          },
          external: {
            title: 'External Resources',
            description: 'Search external source material that can support a project.',
          },
          agentResources: {
            title: 'Agent Resources',
            description: 'Open resource-library views created from agent context and results.',
          },
          jobs: {
            title: 'Generation Records',
            description: 'Review local image, video, audio, and canvas generation task status and outputs.',
          },
          system: {
            title: 'Admin Overview',
            description: 'Secondary access to local service and admin surfaces.',
          },
        },
        toolHome: {
          title: 'Tool Home',
          description: 'A local creative tool launcher for preparing assets, entering edits, opening workflow canvases, and reviewing agent resources.',
          featuredTitle: 'Choose the next move',
          featuredDescription: 'Tool Home launches tools; the detailed creative work stays inside each surface.',
          recentWork: 'Recent Work',
          utilities: 'Utilities',
          continue: 'Continue',
          navigation: 'Tool navigation',
          sidebarDescription: 'Toolbox',
          toolRouteTitle: 'This tool entry is reserved',
          toolRouteDescription: 'Generation tools are being moved from Desktop features into shared surfaces. This /tools/* route is now wired so a real tool page can replace it directly.',
          groups: {
            shots: 'Shots and assets',
            generation: 'Generation tools',
            workspaces: 'Production workspaces',
          },
        },
        tools: {
          refImageGen: {
            title: 'Reference Image',
            description: 'Generate or revise image assets from visual references.',
          },
          refVideoGen: {
            title: 'Reference Video',
            description: 'Generate motion shots from image or video references.',
          },
          audioGen: {
            title: 'Text to Speech',
            description: 'Synthesize text into voiceover, dialogue, or spoken drafts.',
          },
          audioTranscribe: {
            title: 'Transcription',
            description: 'Transcribe audio into text for subtitles, dialogue, and asset review.',
          },
          audioTranslate: {
            title: 'Audio Translation',
            description: 'Translate audio into target-language text for multilingual subtitles and review.',
          },
          musicGen: {
            title: 'Music Generation',
            description: 'Generate scores, ambient beds, or music drafts from prompts.',
          },
          audioSfx: {
            title: 'Sound Effects',
            description: 'Generate Foley, ambience, transitions, and short sound effect assets.',
          },
          voiceClone: {
            title: 'Voice Clone',
            description: 'Create reusable character or narrator voices from audio samples.',
          },
          voiceDesign: {
            title: 'Voice Design',
            description: 'Generate a new voice profile from a text description.',
          },
          motionImitation: {
            title: 'Motion Imitation',
            description: 'Transfer action and movement rhythm from reference footage.',
          },
          styleTransfer: {
            title: 'Style Transfer',
            description: 'Apply a visual style to target media or shots.',
          },
          multiAngle: {
            title: 'Multi Angle',
            description: 'Explore multiple shot angles around the same subject.',
          },
        },
        jobs: {
          title: 'Generation Records',
          description: 'Review local generation jobs, output resources, and failure details; cancel or retry when needed.',
          summary: 'Generation records summary',
          total: 'Total',
          active: 'Active',
          page: 'Page',
          records: 'Job list',
          recordsDescription: 'Filter recent generation jobs by status and type.',
          statusFilter: 'Status filter',
          categoryFilter: 'Type filter',
          empty: 'No generation records yet',
          emptyHint: 'Jobs submitted from generation tools, canvas, or agents will appear here.',
          noPrompt: '(No prompt)',
          retry: 'Retry',
          cancel: 'Cancel',
          previous: 'Previous',
          next: 'Next',
          pageStatus: 'Page {{page}} / {{pageCount}}',
          filters: {
            allStatuses: 'All statuses',
          },
          categories: {
            all: 'All types',
            image: 'Text to Image',
            imageEdit: 'Reference Image',
            video: 'Text to Video',
            videoI2V: 'Reference Video',
            videoV2V: 'Video Transfer',
            audio: 'Audio/Subtitles',
            canvas: 'Workflow Canvas',
          },
          status: {
            pending: 'Queued',
            running: 'Generating',
            succeeded: 'Done',
            failed: 'Failed',
            cancelled: 'Cancelled',
          },
          fields: {
            type: 'Type',
            model: 'Model',
            feature: 'Feature',
            created: 'Created',
            updated: 'Updated',
            output: 'Output resources',
            error: 'Error',
            prompt: 'Prompt',
          },
        },
        project: {
          homeTitle: 'Project Home',
          homeDescription: 'This project entry preserves the current URL parameters and gathers the core Project Surface routes into one workbench.',
          projectDirConfigured: 'Project dir configured',
          projectDirMissing: 'Project dir missing',
          overview: 'Overview',
          routeLabels: {
            overview: 'Overview',
            progress: 'Progress',
            dailies: 'Dailies',
            liveRoom: 'Live room',
            editDesk: 'Edit desk',
            impact: 'Impact',
            timeline: 'Timeline',
            resources: 'Resources',
            scripts: 'Scripts',
            standards: 'Standards',
            content: 'Content',
            settings: 'Settings',
          },
        },
        cards: {
          projectStudio: {
            title: 'Project Studio',
            description: 'Project overview, progress, dailies, impact review, scripts, standards, and content workbench.',
            action: 'Open overview',
          },
          resources: {
            title: 'Resource Library',
            description: 'Browse local resources, external search results, and resource details opened by agents.',
            action: 'Open resources',
            external: 'External',
            agentSurface: 'Agent surface',
          },
          editing: {
            title: 'Editing',
            description: 'Editing project surface connected to Editing Service and Media Pipeline.',
            action: 'Open editing',
            serviceConfigured: 'Editing service configured',
            serviceMissing: 'Editing service missing',
            pipelineConfigured: 'Media pipeline configured',
            pipelineMissing: 'Media pipeline missing',
          },
          canvas: {
            title: 'Workflow Canvas',
            description: 'Manage standalone workflow canvases that can run, be reused, or be nested by reference.',
            action: 'Open workflow canvases',
            list: 'Workflow canvas list',
          },
        },
        sidebar: {
          local: 'Local',
          sections: {
            home: 'Home',
            work: 'Work',
            system: 'System',
          },
          appHome: 'App Home',
          toolHome: 'Tool Home',
          projectHome: 'Project Home',
          projectStudio: 'Project Studio',
          resources: 'Resources',
          external: 'External',
          canvas: 'Workflow Canvas',
          editing: 'Editing',
          agentResources: 'Agent resources',
          jobs: 'Generation Records',
          admin: 'Admin',
        },
        runtime: {
          title: 'Runtime',
          description: 'Route and capability parameters received by the Surface Host.',
          path: 'Path',
          projectId: 'Project ID',
          projectDir: 'Project Dir',
          mcpApiBaseURL: 'MCP API base URL',
          projectService: 'Project Gateway',
          editingService: 'Editing Capability',
          mediaPipeline: 'Media Capability',
          source: 'Source',
          notConfigured: 'not configured',
          localHostProxy: 'Surface Host proxy',
        },
        routes: {
          mounted: 'Mounted routes',
          home: 'Home',
          projectOverview: 'Project overview',
          resources: 'Resources',
          externalResources: 'External resources',
          canvases: 'Workflow Canvases',
          editing: 'Editing',
          agentResources: 'Agent resources',
          jobs: 'Generation records',
          adminOverview: 'Admin overview',
        },
        notFound: {
          title: 'This surface route is not mounted yet',
          backHome: 'Back home',
          openProjectOverview: 'Open project overview',
        },
      },
    },
  },
} as const

const surfaceI18nResources = mergeI18nResources(
  canvasSurfaceI18nResources,
  jobsSurfaceI18nResources,
  projectSurfaceI18nResources,
  resourceSurfaceI18nResources,
  shotLibrarySurfaceI18nResources,
  localSurfaceHostI18nResources,
)

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'zh-CN' || value === 'en-US'
}

function detectLanguage(): SupportedLanguage {
  const stored = readLocalStorageItem(LANGUAGE_STORAGE_KEY)
  if (isSupportedLanguage(stored)) return stored

  const legacyStored = readLocalStorageItem(LEGACY_LANGUAGE_STORAGE_KEY)
  if (isSupportedLanguage(legacyStored)) return legacyStored

  const preferred = typeof navigator !== 'undefined'
    ? (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase()
    : ''
  return preferred.startsWith('zh') ? 'zh-CN' : 'en-US'
}

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources: surfaceI18nResources,
      lng: detectLanguage(),
      fallbackLng: 'zh-CN',
      interpolation: {
        escapeValue: false,
      },
    })

  i18n.on('languageChanged', (language) => {
    if (isSupportedLanguage(language)) {
      writeLocalStorageItem(LANGUAGE_STORAGE_KEY, language)
    }
  })
}

function mergeI18nResources<T extends Record<string, { translation: Record<string, unknown> }>>(
  base: T,
  ...resources: Array<Record<string, { translation: Record<string, unknown> }>>
): T {
  const merged: Record<string, { translation: Record<string, unknown> }> = {}
  for (const [language, value] of Object.entries(base)) {
    merged[language] = { translation: { ...value.translation } }
  }
  for (const resource of resources) {
    for (const [language, value] of Object.entries(resource)) {
      merged[language] = {
        translation: mergeObjects(merged[language]?.translation ?? {}, value.translation),
      }
    }
  }
  return merged as T
}

function mergeObjects(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(next)) {
    const current = merged[key]
    merged[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeObjects(current, value)
      : value
  }
  return merged
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export default i18n

function readLocalStorageItem(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function writeLocalStorageItem(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Ignore storage failures; language detection falls back to navigator language.
  }
}

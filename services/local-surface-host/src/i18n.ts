import i18n from 'i18next'
import { canvasSurfaceI18nResources } from '@movscript/canvas-surface/i18n'
import { resourceSurfaceI18nResources } from '@movscript/resource-surface/i18n'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_STORAGE_KEY = 'movscript.localSurfaceHost.language'
const localSurfaceHostI18nResources = {
  'zh-CN': {
    translation: {
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
        },
        home: {
          title: 'MovScript',
          description: '选择最近项目，或打开剪辑、资源和画布工作区。',
          mcpReady: 'MCP 代理已就绪',
          localDirect: '本地直连',
          resources: '资源库',
          projectOverview: '项目概览',
          continueWorkspace: '继续当前本地工作区',
          noProjectDir: '还没有通过 projectDir 或 projectPath 绑定项目目录。',
          openProjectHome: '打开项目 Home',
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
            title: '画布',
            description: '共享画布列表和画布编辑 surface。',
            action: '打开画布',
            list: '画布列表',
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
          projectHome: '项目 Home',
          projectStudio: '项目 Studio',
          resources: '资源库',
          external: '外部资源',
          canvas: '画布',
          editing: '剪辑',
          agentResources: 'Agent 资源',
          admin: 'Admin',
        },
        runtime: {
          title: '运行时',
          description: '当前 local host 接收到的路由和服务参数。',
          path: 'Path',
          projectId: '项目 ID',
          projectDir: '项目目录',
          mcpApiBaseURL: 'MCP API 地址',
          projectService: 'Project Service',
          editingService: 'Editing Service',
          mediaPipeline: 'Media Pipeline',
          source: '来源',
          notConfigured: '未配置',
          localHostProxy: 'local host 代理',
        },
        routes: {
          mounted: '已挂载路由',
          home: 'Home',
          projectOverview: '项目概览',
          resources: '资源库',
          externalResources: '外部资源',
          canvases: '画布',
          editing: '剪辑',
          agentResources: 'Agent 资源',
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
        },
        home: {
          title: 'MovScript',
          description: 'Choose a recent project, or open an editing, resource, or canvas workspace.',
          mcpReady: 'MCP proxy ready',
          localDirect: 'Local direct',
          resources: 'Resources',
          projectOverview: 'Project overview',
          continueWorkspace: 'Continue the current local workspace',
          noProjectDir: 'No project directory is bound through projectDir or projectPath yet.',
          openProjectHome: 'Open project home',
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
            title: 'Canvas',
            description: 'Shared canvas list and canvas editor surfaces.',
            action: 'Open canvases',
            list: 'Canvas list',
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
          projectHome: 'Project Home',
          projectStudio: 'Project Studio',
          resources: 'Resources',
          external: 'External',
          canvas: 'Canvas',
          editing: 'Editing',
          agentResources: 'Agent resources',
          admin: 'Admin',
        },
        runtime: {
          title: 'Runtime',
          description: 'Route and service parameters received by the local host.',
          path: 'Path',
          projectId: 'Project ID',
          projectDir: 'Project Dir',
          mcpApiBaseURL: 'MCP API base URL',
          projectService: 'Project Service',
          editingService: 'Editing Service',
          mediaPipeline: 'Media Pipeline',
          source: 'Source',
          notConfigured: 'not configured',
          localHostProxy: 'local host proxy',
        },
        routes: {
          mounted: 'Mounted routes',
          home: 'Home',
          projectOverview: 'Project overview',
          resources: 'Resources',
          externalResources: 'External resources',
          canvases: 'Canvases',
          editing: 'Editing',
          agentResources: 'Agent resources',
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
  resourceSurfaceI18nResources,
  localSurfaceHostI18nResources,
)

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'zh-CN' || value === 'en-US'
}

function detectLanguage(): SupportedLanguage {
  const stored = readLocalStorageItem(LANGUAGE_STORAGE_KEY)
  if (isSupportedLanguage(stored)) return stored

  return 'zh-CN'
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

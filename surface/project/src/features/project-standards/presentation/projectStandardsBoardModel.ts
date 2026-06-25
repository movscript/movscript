import {
  CORE_STANDARD_DEFS,
  type CoreStandardDef,
  type ProjectPromptRule,
} from '../application/projectStandardsModel'

export type StandardWorkbenchCard =
  | { type: 'core'; def: CoreStandardDef }
  | { type: 'custom'; rule: ProjectPromptRule }

export interface StandardWorkbenchGroup {
  id: string
  title: string
  description: string
  cards: StandardWorkbenchCard[]
}

export const CORE_STANDARD_GROUPS = [
  {
    id: 'foundation',
    title: '基础规范',
    description: '决定项目默认画幅、整体质感和生成任务的基础语境。',
    coreKeys: ['aspect_ratio', 'visual_style'],
  },
  {
    id: 'camera',
    title: '镜头规范',
    description: '统一镜头尺度、运动方式、构图和视角表达。',
    coreKeys: ['shot_size_system', 'camera_language'],
  },
  {
    id: 'look',
    title: '画风规范',
    description: '控制灯光、色彩、画面观感和视觉连续性。',
    coreKeys: ['lighting_style', 'color_palette'],
  },
  {
    id: 'constraints',
    title: '节奏与约束',
    description: '约束剪辑节奏、禁止项和必须遵守的项目规则。',
    coreKeys: ['pacing_rules', 'negative_rules'],
  },
] as const

export function coreCards(keys: readonly string[]): StandardWorkbenchCard[] {
  return keys.flatMap((key) => {
    const def = CORE_STANDARD_DEFS.find((item) => item.key === key)
    return def ? [{ type: 'core' as const, def }] : []
  })
}

import type { ScriptVersion } from '@/api/scriptVersions'

export interface ProductionOverviewRecord {
  ID: number
  [key: string]: unknown
}

export interface ProductionCurrentOverview {
  position: string[]
  sourceLabel: string
  source: string[]
  relations: string[]
  nextStep: string[]
}

export function buildProductionCurrentOverview(input: {
  production?: (ProductionOverviewRecord & { name?: string; status?: string }) | null
  scriptVersion?: ScriptVersion | null
  segments: ProductionOverviewRecord[]
  sceneMoments: ProductionOverviewRecord[]
  creativeReferences: ProductionOverviewRecord[]
  assetSlots: ProductionOverviewRecord[]
  contentUnits: ProductionOverviewRecord[]
}): ProductionCurrentOverview {
  const latestSegment = input.segments.at(-1) ?? null
  const latestMoment = input.sceneMoments.at(-1) ?? null
  const nextStep = !input.scriptVersion
    ? ['先选择一份剧本正文，再继续写情节。']
    : input.segments.length === 0
      ? ['当前还没有编排段，先添加一个节奏容器。']
      : ['继续确认每个情节里的对白、动作、旁白和镜头描述。']

  return {
    position: [
      `制作：${overviewTitleOfRecord(input.production)}`,
      input.production?.status ? `状态：${String(input.production.status)}` : '状态：未设置',
      input.scriptVersion ? `剧本：${input.scriptVersion.title}` : '剧本：未绑定',
    ],
    sourceLabel: input.scriptVersion?.title ?? '当前现状',
    source: [
      `编排段 ${input.segments.length}`,
      `情节 ${input.sceneMoments.length}`,
      `设定资料 ${input.creativeReferences.length}`,
      `素材需求 ${input.assetSlots.length}`,
    ],
    relations: [
      latestSegment ? `最新编排段：${overviewTitleOfRecord(latestSegment)}` : '暂无编排段',
      latestMoment ? `最新情节：${overviewTitleOfRecord(latestMoment)}` : '暂无情节',
      input.assetSlots.length > 0 ? '素材需求已覆盖部分当前制作上下文' : '当前还没有素材需求',
    ],
    nextStep,
  }
}

function overviewTitleOfRecord(record: ProductionOverviewRecord | null | undefined) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.scene_code ?? record.unit_code ?? record.kind ?? `#${record.ID}`)
}

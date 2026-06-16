import type {
  OpenCutAudioTrack,
  OpenCutCommand,
  OpenCutComposeInput,
  OpenCutEffectTrack,
  OpenCutScene,
  OpenCutStickerTrack,
  OpenCutTextTrack,
  OpenCutTimelineDocument,
  OpenCutTimelineElement,
  OpenCutTimelineTrack,
  OpenCutTrackType,
  OpenCutVideoTrack,
} from './opencut-protocol.js'

export interface OpenCutEditingServiceOptions {
  idFactory?: (prefix: string) => string
}

export class OpenCutEditingService {
  private document: OpenCutTimelineDocument
  private generatedId = 0
  private readonly idFactory?: (prefix: string) => string

  constructor(document: OpenCutTimelineDocument, options: OpenCutEditingServiceOptions = {}) {
    this.document = cloneDocument(document)
    this.idFactory = options.idFactory
  }

  loadDocument(document: OpenCutTimelineDocument): void {
    this.document = cloneDocument(document)
  }

  getDocument(): OpenCutTimelineDocument {
    return cloneDocument(this.document)
  }

  applyCommand(command: OpenCutCommand): OpenCutTimelineDocument {
    const scene = sceneForCommand(this.document, command.sceneId)
    switch (command.type) {
      case 'insert_element':
        insertElement(scene, command.trackId, command.element)
        break
      case 'update_element_trim':
        updateElement(scene, command.elementId, (element) => ({
          ...element,
          trimStart: command.trimStart,
          trimEnd: command.trimEnd,
          startTime: command.startTime ?? element.startTime,
          duration: command.duration ?? element.duration,
        }))
        break
      case 'update_element_duration':
        updateElement(scene, command.elementId, (element) => ({
          ...element,
          duration: command.duration,
        }))
        break
      case 'update_element_start_time':
        updateElement(scene, command.elementId, (element) => ({
          ...element,
          startTime: command.startTime,
        }))
        break
      case 'move_element':
        moveElement(scene, command.sourceTrackId, command.targetTrackId, command.elementId, command.startTime)
        break
      case 'split_elements':
        this.splitElements(scene, command.elements, command.splitTime, command.retainSide ?? 'both')
        break
      case 'delete_elements':
        deleteElements(scene, command.elements)
        break
      default:
        assertNever(command)
    }
    refreshProjectDuration(this.document)
    return this.getDocument()
  }

  buildComposeInputs(sceneId?: string): OpenCutComposeInput[] {
    return buildOpenCutComposeInputs(this.document, { sceneId })
  }

  private splitElements(
    scene: OpenCutScene,
    targets: Array<{ trackId: string; elementId: string }>,
    splitTime: number,
    retainSide: 'both' | 'left' | 'right',
  ): void {
    const targetKeys = new Set(targets.map((target) => elementTargetKey(target.trackId, target.elementId)))
    for (const track of scene.tracks) {
      const nextElements: OpenCutTimelineElement[] = []
      for (const element of track.elements) {
        if (!targetKeys.has(elementTargetKey(track.id, element.id))) {
          nextElements.push(element)
          continue
        }

        const elementEnd = element.startTime + element.duration
        if (splitTime <= element.startTime || splitTime >= elementEnd) {
          nextElements.push(element)
          continue
        }

        const leftDuration = splitTime - element.startTime
        const rightDuration = element.duration - leftDuration
        const left = {
          ...element,
          duration: leftDuration,
          trimEnd: element.trimEnd + rightDuration,
          name: `${element.name} (left)`,
        } satisfies OpenCutTimelineElement
        const right = {
          ...element,
          id: this.makeId(`${element.id}_right`),
          startTime: splitTime,
          duration: rightDuration,
          trimStart: element.trimStart + leftDuration,
          name: `${element.name} (right)`,
        } satisfies OpenCutTimelineElement

        if (retainSide === 'left') {
          nextElements.push(left)
        } else if (retainSide === 'right') {
          nextElements.push(right)
        } else {
          nextElements.push(left, right)
        }
      }
      setTrackElements(track, nextElements)
    }
  }

  private makeId(prefix: string): string {
    if (this.idFactory) return this.idFactory(prefix)
    this.generatedId += 1
    return `${prefix}_${this.generatedId}`
  }
}

export function createOpenCutEditingService(
  document: OpenCutTimelineDocument,
  options?: OpenCutEditingServiceOptions,
): OpenCutEditingService {
  return new OpenCutEditingService(document, options)
}

export function buildOpenCutComposeInputs(
  document: OpenCutTimelineDocument,
  options: { sceneId?: string } = {},
): OpenCutComposeInput[] {
  const scene = sceneForCommand(document, options.sceneId)
  return scene.tracks
    .filter((track): track is OpenCutVideoTrack => track.type === 'video' && track.hidden !== true)
    .flatMap((track) => track.elements.map((element) => ({ track, element })))
    .filter(({ element }) => element.type === 'video' && element.hidden !== true)
    .map(({ track, element }) => {
      const resourceId = element.metadata?.movscript?.resourceId
      if (resourceId === undefined) return undefined
      return {
        trackId: track.id,
        elementId: element.id,
        resource_id: resourceId,
        start_sec: element.trimStart,
        end_sec: element.sourceDuration !== undefined ? element.sourceDuration - element.trimEnd : undefined,
        duration_sec: element.duration,
        trim_start_sec: element.trimStart,
        trim_end_sec: element.trimEnd,
        timeline_start_sec: element.startTime,
        timeline_duration_sec: element.duration,
        content_unit_id: element.metadata?.movscript?.contentUnitId,
      } satisfies OpenCutComposeInput
    })
    .filter(isDefined)
    .sort((left, right) => {
      if (left.timeline_start_sec !== right.timeline_start_sec) return left.timeline_start_sec - right.timeline_start_sec
      return left.elementId.localeCompare(right.elementId)
    })
}

function sceneForCommand(document: OpenCutTimelineDocument, sceneId?: string): OpenCutScene {
  const id = sceneId ?? document.project.currentSceneId
  const scene = document.project.scenes.find((candidate) => candidate.id === id)
  if (!scene) throw new Error(`OpenCut scene not found: ${id}`)
  return scene
}

function insertElement(scene: OpenCutScene, trackId: string, element: OpenCutTimelineElement): void {
  const track = trackById(scene, trackId)
  assertElementFitsTrack(track, element)
  setTrackElements(track, [...track.elements, clone(element)].sort(compareElements))
}

function moveElement(
  scene: OpenCutScene,
  sourceTrackId: string,
  targetTrackId: string,
  elementId: string,
  startTime: number,
): void {
  const sourceTrack = trackById(scene, sourceTrackId)
  const targetTrack = trackById(scene, targetTrackId)
  const element = sourceTrack.elements.find((candidate) => candidate.id === elementId)
  if (!element) throw new Error(`OpenCut element not found: ${elementId}`)

  const movedElement = { ...element, startTime } satisfies OpenCutTimelineElement
  assertElementFitsTrack(targetTrack, movedElement)
  setTrackElements(sourceTrack, sourceTrack.elements.filter((candidate) => candidate.id !== elementId))
  setTrackElements(targetTrack, [...targetTrack.elements, movedElement].sort(compareElements))
}

function deleteElements(scene: OpenCutScene, elements: Array<{ trackId: string; elementId: string }>): void {
  const targetsByTrack = new Map<string, Set<string>>()
  for (const target of elements) {
    targetsByTrack.set(target.trackId, new Set([...(targetsByTrack.get(target.trackId) ?? []), target.elementId]))
  }
  for (const track of scene.tracks) {
    const targetIds = targetsByTrack.get(track.id)
    if (!targetIds) continue
    setTrackElements(track, track.elements.filter((element) => !targetIds.has(element.id)))
  }
}

function updateElement(
  scene: OpenCutScene,
  elementId: string,
  updater: (element: OpenCutTimelineElement) => OpenCutTimelineElement,
): void {
  let didUpdate = false
  for (const track of scene.tracks) {
    const nextElements = track.elements.map((element) => {
      if (element.id !== elementId) return element
      const next = updater(element)
      assertElementFitsTrack(track, next)
      didUpdate = true
      return next
    })
    setTrackElements(track, nextElements.sort(compareElements))
  }
  if (!didUpdate) throw new Error(`OpenCut element not found: ${elementId}`)
}

function trackById(scene: OpenCutScene, trackId: string): OpenCutTimelineTrack {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  if (!track) throw new Error(`OpenCut track not found: ${trackId}`)
  return track
}

function assertElementFitsTrack(track: OpenCutTimelineTrack, element: OpenCutTimelineElement): void {
  if (track.type === 'video' && (element.type === 'video' || element.type === 'image')) return
  if (track.type === 'audio' && element.type === 'audio') return
  if (track.type === 'text' && element.type === 'text') return
  if (track.type === 'sticker' && element.type === 'sticker') return
  if (track.type === 'effect' && element.type === 'effect') return
  throw new Error(`OpenCut element type ${element.type} cannot be placed on ${track.type} track ${track.id}`)
}

function setTrackElements(track: OpenCutTimelineTrack, elements: OpenCutTimelineElement[]): void {
  switch (track.type) {
    case 'video':
      track.elements = elements.filter((element): element is OpenCutVideoTrack['elements'][number] => element.type === 'video' || element.type === 'image')
      break
    case 'audio':
      track.elements = elements.filter((element): element is OpenCutAudioTrack['elements'][number] => element.type === 'audio')
      break
    case 'text':
      track.elements = elements.filter((element): element is OpenCutTextTrack['elements'][number] => element.type === 'text')
      break
    case 'sticker':
      track.elements = elements.filter((element): element is OpenCutStickerTrack['elements'][number] => element.type === 'sticker')
      break
    case 'effect':
      track.elements = elements.filter((element): element is OpenCutEffectTrack['elements'][number] => element.type === 'effect')
      break
    default:
      assertNever(track)
  }
}

function compareElements(left: OpenCutTimelineElement, right: OpenCutTimelineElement): number {
  if (left.startTime !== right.startTime) return left.startTime - right.startTime
  return left.id.localeCompare(right.id)
}

function refreshProjectDuration(document: OpenCutTimelineDocument): void {
  const duration = Math.max(
    0,
    ...document.project.scenes.flatMap((scene) =>
      scene.tracks.flatMap((track) => track.elements.map((element) => element.startTime + element.duration)),
    ),
  )
  document.project.metadata.duration = duration
  document.project.metadata.updatedAt = new Date().toISOString()
}

function elementTargetKey(trackId: string, elementId: string): string {
  return `${trackId}:${elementId}`
}

function cloneDocument(document: OpenCutTimelineDocument): OpenCutTimelineDocument {
  return clone(document)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function assertNever(value: never): never {
  throw new Error(`Unexpected OpenCut editing value: ${JSON.stringify(value)}`)
}

export function openCutTrackTypeForElement(element: OpenCutTimelineElement): OpenCutTrackType {
  if (element.type === 'image') return 'video'
  return element.type
}

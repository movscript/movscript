import {
  childSettingNamespaceKind,
  childTimelineNamespaceKind,
  namespaceVocabularyWithFallbacks,
  rootSettingNamespaceKind,
  rootTimelineNamespaceKind,
} from '@movscript/domain'
import type { MovScriptNamespaceVocabulary } from '@movscript/domain'

import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { ContentCanvasNode, ContentCanvasProjectData } from '../domain/contentCanvasTypes'
import { contentCanvasTimelineProfileChildKind } from '../domain/contentCanvasTimelineProfiles'

export type ContentCanvasNamespaceVocabularyOptions = MovScriptNamespaceVocabulary

export function contentCanvasNamespaceVocabularyOptions(
  projectData: Pick<ContentCanvasProjectData, 'domainGraph'> | undefined,
): ContentCanvasNamespaceVocabularyOptions {
  const vocabulary = projectData?.domainGraph?.namespaceVocabulary
  return namespaceVocabularyWithFallbacks(vocabulary)
}

export function contentCanvasRootTimelineNamespaceKind(
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string {
  return rootTimelineNamespaceKind(vocabulary)
}

export function contentCanvasRootSettingNamespaceKind(
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string {
  return rootSettingNamespaceKind(vocabulary)
}

export function contentCanvasChildTimelineNamespaceKind(
  parentNode: ContentCanvasNode,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string {
  return contentCanvasNextTimelineNamespaceKind(parentNode, vocabulary)
    ?? childTimelineNamespaceKind(contentCanvasNamespaceKindForNode(parentNode), vocabulary)
}

export function contentCanvasNextTimelineNamespaceKind(
  parentNode: ContentCanvasNode,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string | undefined {
  const parentNamespaces = contentCanvasTimelineNamespacesForNode(parentNode)
  const parentKind = contentCanvasNamespaceKindForNode(parentNode)
  if (parentNamespaces.length) {
    if (parentKind === 'production') return parentNamespaces[0]
    const parentIndex = parentKind ? parentNamespaces.indexOf(parentKind) : -1
    if (parentIndex >= 0) return parentNamespaces[parentIndex + 1]
  }
  const profile = contentCanvasTimelineProfileForNode(parentNode)
  if (profile) {
    return contentCanvasTimelineProfileChildKind(profile, parentKind)
  }
  const namespaces = vocabulary.timelineNamespaces ?? []
  const parentIndex = parentKind ? namespaces.indexOf(parentKind) : -1
  if (parentIndex >= 0) return namespaces[parentIndex + 1]
  return undefined
}

export function contentCanvasChildSettingNamespaceKind(
  parentNode: ContentCanvasNode,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string {
  return childSettingNamespaceKind(contentCanvasNamespaceKindForNode(parentNode), vocabulary)
}

export function contentCanvasTimelineChildInput(
  parentNode: ContentCanvasNode,
  childKind: 'segment' | 'scene_moment',
  input: ContentCanvasCreateNodeInput | undefined,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): ContentCanvasCreateNodeInput | undefined {
  if (parentNode.domainCategory === 'timeline_namespace') {
    if (childKind !== 'segment') return input
    return {
      ...(input ?? { id: '', title: '' }),
      timelineProfile: input?.timelineProfile?.trim()
        || contentCanvasTimelineProfileForNode(parentNode),
      timelineNamespaces: input?.timelineNamespaces?.length
        ? input.timelineNamespaces
        : contentCanvasTimelineNamespacesForNode(parentNode),
      timelineNamespaceKind: input?.timelineNamespaceKind?.trim()
        || contentCanvasChildTimelineNamespaceKind(parentNode, vocabulary),
    }
  }
  return {
    ...(input ?? { id: '', title: '' }),
    legacyTimelineMount: true,
  }
}

export function contentCanvasSettingChildInput(
  parentNode: ContentCanvasNode,
  input: ContentCanvasCreateNodeInput | undefined,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): ContentCanvasCreateNodeInput | undefined {
  return {
    ...(input ?? { id: '', title: '' }),
    settingNamespaceKind: input?.settingNamespaceKind?.trim()
      || contentCanvasChildSettingNamespaceKind(parentNode, vocabulary),
  }
}

function contentCanvasNamespaceKindForNode(node: ContentCanvasNode): string | undefined {
  return stringValue(node.domainKind)
    ?? stringValue(node.record.namespace_kind)
    ?? stringValue(node.record.namespaceKind)
    ?? stringValue(node.record.timeline_namespace_kind)
    ?? stringValue(node.record.timelineNamespaceKind)
    ?? stringValue(node.record.setting_namespace_kind)
    ?? stringValue(node.record.settingNamespaceKind)
}

function contentCanvasTimelineProfileForNode(node: ContentCanvasNode): string | undefined {
  return stringValue(node.record.production_type)
    ?? stringValue(node.record.productionType)
    ?? stringValue(node.record.timeline_profile)
    ?? stringValue(node.record.timelineProfile)
    ?? stringValue(node.record.namespace_profile)
    ?? stringValue(node.record.namespaceProfile)
}

function contentCanvasTimelineNamespacesForNode(node: ContentCanvasNode): string[] {
  return stringArray(node.record.timeline_namespaces ?? node.record.timelineNamespaces)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

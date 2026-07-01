import type { SurfaceModelCapability } from '@movscript/shared'
import type { InputSlotDef, ToolInputType } from '@/shared/ui/GenInputCard'

export type ToolOutputKind = 'image' | 'video' | 'audio' | 'text'

export type ToolOperationId =
  | 'text_to_image'
  | 'reference_to_image'
  | 'edit_image'
  | 'prompt_to_video'
  | 'image_to_video'
  | 'first_frame_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'
  | 'edit_video'
  | 'text_to_speech'
  | 'music_generation'
  | 'sound_effect_generation'
  | 'speech_to_speech'
  | 'speech_to_text'
  | 'speech_translate'
  | 'voice_clone'
  | 'voice_design'

export interface ToolOperationDef {
  id: ToolOperationId
  outputKind: ToolOutputKind
  sourceKey: string
  capability: SurfaceModelCapability
  modelOperation: string
  jobType?: string
  titleKey: string
  titleDefault: string
  descriptionKey: string
  descriptionDefault: string
  promptPlaceholderKey: string
  promptPlaceholderDefault: string
  inputType: ToolInputType
  outputType: 'image' | 'video' | 'audio' | 'text'
  promptRequired?: boolean
  submitPromptFallbackKey?: string
  submitPromptFallbackDefault?: string
  modelQueryCapabilities?: SurfaceModelCapability[]
  layout?: 'default' | 'reference-workbench'
  useResourceWorkbench?: boolean
  showHistory?: boolean
  inputSlots: ToolOperationSlotDef[]
}

export type ToolOperationSlotDef = Omit<InputSlotDef, 'label'> & {
  labelKey: string
  labelDefault: string
}

export const toolOutputKinds: readonly ToolOutputKind[] = ['image', 'video', 'audio', 'text']

export const toolOutputKindDefaults: Record<ToolOutputKind, ToolOperationId> = {
  image: 'reference_to_image',
  video: 'reference_to_video',
  audio: 'text_to_speech',
  text: 'speech_to_text',
}

export const toolOperations: readonly ToolOperationDef[] = [
  {
    id: 'text_to_image',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image_generation',
    modelOperation: 'text_to_image',
    titleKey: 'tools.operations.promptToImage.name',
    titleDefault: '文生图',
    descriptionKey: 'tools.operations.promptToImage.description',
    descriptionDefault: '按提示词生成图片',
    promptPlaceholderKey: 'tools.operations.promptToImage.promptPlaceholder',
    promptPlaceholderDefault: '描述画面主体、风格、构图和细节',
    inputType: 'none',
    outputType: 'image',
    inputSlots: [],
  },
  {
    id: 'reference_to_image',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image_generation',
    modelOperation: 'reference_to_image',
    titleKey: 'tools.operations.referenceToImage.name',
    titleDefault: '参考生图',
    descriptionKey: 'tools.operations.referenceToImage.description',
    descriptionDefault: '基于参考图片生成新图',
    promptPlaceholderKey: 'tools.operations.referenceToImage.promptPlaceholder',
    promptPlaceholderDefault: '描述要保留的特征和新的画面变化',
    inputType: 'image',
    outputType: 'image',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'reference_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: true, maxCount: 0 },
    ],
  },
  {
    id: 'edit_image',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image_generation',
    modelOperation: 'edit_image',
    titleKey: 'tools.operations.editImage.name',
    titleDefault: '图片编辑',
    descriptionKey: 'tools.operations.editImage.description',
    descriptionDefault: '按指令编辑输入图片',
    promptPlaceholderKey: 'tools.operations.editImage.promptPlaceholder',
    promptPlaceholderDefault: '描述要修改、替换或增强的区域',
    inputType: 'image',
    outputType: 'image',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'source_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: true, maxCount: 0 },
    ],
  },
  {
    id: 'prompt_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelOperation: 'prompt_to_video',
    titleKey: 'tools.operations.promptToVideo.name',
    titleDefault: '文生视频',
    descriptionKey: 'tools.operations.promptToVideo.description',
    descriptionDefault: '按提示词生成视频',
    promptPlaceholderKey: 'tools.operations.promptToVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述镜头、动作、节奏、风格和声音',
    inputType: 'none',
    outputType: 'video',
    inputSlots: [],
  },
  {
    id: 'image_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelQueryCapabilities: ['video_generation'],
    modelOperation: 'image_to_video',
    titleKey: 'tools.operations.imageToVideo.name',
    titleDefault: '图生视频',
    descriptionKey: 'tools.operations.imageToVideo.description',
    descriptionDefault: '基于参考图片生成视频',
    promptPlaceholderKey: 'tools.operations.imageToVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述图片如何动起来',
    inputType: 'image',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'reference_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: true, maxCount: 0 },
    ],
  },
  {
    id: 'first_frame_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelQueryCapabilities: ['video_generation'],
    modelOperation: 'first_frame_to_video',
    titleKey: 'tools.operations.firstFrameToVideo.name',
    titleDefault: '首帧生视频',
    descriptionKey: 'tools.operations.firstFrameToVideo.description',
    descriptionDefault: '使用首帧约束视频开场',
    promptPlaceholderKey: 'tools.operations.firstFrameToVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述首帧之后的动作和镜头变化',
    inputType: 'image',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'first_frame', labelKey: 'tools.inputs.firstFrame', labelDefault: '首帧', type: 'image', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'first_last_frame_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelQueryCapabilities: ['video_generation'],
    modelOperation: 'first_last_frame_to_video',
    titleKey: 'tools.operations.firstLastFrameToVideo.name',
    titleDefault: '首尾帧生视频',
    descriptionKey: 'tools.operations.firstLastFrameToVideo.description',
    descriptionDefault: '使用首帧和尾帧约束视频过程',
    promptPlaceholderKey: 'tools.operations.firstLastFrameToVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述从首帧过渡到尾帧的过程',
    inputType: 'image',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'first_frame', labelKey: 'tools.inputs.firstFrame', labelDefault: '首帧', type: 'image', required: true, maxCount: 1 },
      { key: 'last_frame', labelKey: 'tools.inputs.lastFrame', labelDefault: '尾帧', type: 'image', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'reference_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelQueryCapabilities: ['video_generation'],
    modelOperation: 'reference_to_video',
    titleKey: 'tools.operations.referenceToVideo.name',
    titleDefault: '全能参考生视频',
    descriptionKey: 'tools.operations.referenceToVideo.description',
    descriptionDefault: '使用图片、视频或音频作为参考生成视频',
    promptPlaceholderKey: 'tools.operations.referenceToVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述短片内容、角色动作、镜头和声音参考',
    inputType: 'media',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'reference_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: false, maxCount: 0 },
      { key: 'reference_video', labelKey: 'tools.inputs.sourceVideo', labelDefault: '源视频', type: 'video', required: false, maxCount: 1 },
      { key: 'reference_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: false, maxCount: 1 },
    ],
  },
  {
    id: 'edit_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video_generation',
    modelQueryCapabilities: ['video_generation'],
    modelOperation: 'edit_video',
    titleKey: 'tools.operations.editVideo.name',
    titleDefault: '视频编辑',
    descriptionKey: 'tools.operations.editVideo.description',
    descriptionDefault: '按指令编辑输入视频',
    promptPlaceholderKey: 'tools.operations.editVideo.promptPlaceholder',
    promptPlaceholderDefault: '描述要修改、替换或增强的视频内容',
    inputType: 'video',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'target_video', labelKey: 'tools.inputs.targetVideo', labelDefault: '目标视频', type: 'video', required: true, maxCount: 1 },
      { key: 'reference_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: false, maxCount: 0 },
    ],
  },
  {
    id: 'text_to_speech',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_generation',
    modelOperation: 'text_to_speech',
    titleKey: 'tools.operations.textToSpeech.name',
    titleDefault: '语音生成',
    descriptionKey: 'tools.operations.textToSpeech.description',
    descriptionDefault: '把文本生成语音',
    promptPlaceholderKey: 'tools.operations.textToSpeech.promptPlaceholder',
    promptPlaceholderDefault: '输入要朗读的文本',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'music_generation',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_generation',
    modelOperation: 'music_generation',
    titleKey: 'tools.operations.musicGeneration.name',
    titleDefault: '音乐生成',
    descriptionKey: 'tools.operations.musicGeneration.description',
    descriptionDefault: '按提示词生成音乐',
    promptPlaceholderKey: 'tools.operations.musicGeneration.promptPlaceholder',
    promptPlaceholderDefault: '描述音乐风格、情绪、节奏和乐器',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'sound_effect_generation',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_generation',
    modelOperation: 'sound_effect_generation',
    titleKey: 'tools.operations.soundEffectGeneration.name',
    titleDefault: '音效生成',
    descriptionKey: 'tools.operations.soundEffectGeneration.description',
    descriptionDefault: '按提示词生成音效',
    promptPlaceholderKey: 'tools.operations.soundEffectGeneration.promptPlaceholder',
    promptPlaceholderDefault: '描述音效对象、空间、强度和持续时间',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'speech_to_speech',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_generation',
    modelOperation: 'speech_to_speech',
    titleKey: 'tools.operations.speechToSpeech.name',
    titleDefault: '语音对话',
    descriptionKey: 'tools.operations.speechToSpeech.description',
    descriptionDefault: '基于文本或音频生成对话语音',
    promptPlaceholderKey: 'tools.operations.speechToSpeech.promptPlaceholder',
    promptPlaceholderDefault: '输入对话目标或补充上下文',
    inputType: 'audio',
    outputType: 'audio',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: false, maxCount: 1 },
    ],
  },
  {
    id: 'speech_to_text',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_generation',
    modelOperation: 'speech_to_text',
    titleKey: 'tools.operations.speechToText.name',
    titleDefault: '语音转写',
    descriptionKey: 'tools.operations.speechToText.description',
    descriptionDefault: '把音频转写成文本',
    promptPlaceholderKey: 'tools.operations.speechToText.promptPlaceholder',
    promptPlaceholderDefault: '可输入转写要求',
    inputType: 'audio',
    outputType: 'text',
    promptRequired: false,
    submitPromptFallbackKey: 'tools.operations.speechToText.submitPromptFallback',
    submitPromptFallbackDefault: '语音转写',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'speech_translate',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_generation',
    modelOperation: 'speech_translate',
    titleKey: 'tools.operations.speechTranslate.name',
    titleDefault: '音频翻译',
    descriptionKey: 'tools.operations.speechTranslate.description',
    descriptionDefault: '把音频翻译成文本',
    promptPlaceholderKey: 'tools.operations.speechTranslate.promptPlaceholder',
    promptPlaceholderDefault: '可输入目标语言或翻译要求',
    inputType: 'audio',
    outputType: 'text',
    promptRequired: false,
    submitPromptFallbackKey: 'tools.operations.speechTranslate.submitPromptFallback',
    submitPromptFallbackDefault: '音频翻译',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'voice_clone',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_generation',
    modelOperation: 'voice_clone',
    titleKey: 'tools.operations.voiceClone.name',
    titleDefault: '声音克隆',
    descriptionKey: 'tools.operations.voiceClone.description',
    descriptionDefault: '基于音频生成声音档案',
    promptPlaceholderKey: 'tools.operations.voiceClone.promptPlaceholder',
    promptPlaceholderDefault: '输入声音档案说明',
    inputType: 'audio',
    outputType: 'text',
    submitPromptFallbackKey: 'tools.operations.voiceClone.submitPromptFallback',
    submitPromptFallbackDefault: '声音克隆',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 0 },
    ],
  },
  {
    id: 'voice_design',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_generation',
    modelOperation: 'voice_design',
    titleKey: 'tools.operations.voiceDesign.name',
    titleDefault: '声音设计',
    descriptionKey: 'tools.operations.voiceDesign.description',
    descriptionDefault: '按描述生成声音档案',
    promptPlaceholderKey: 'tools.operations.voiceDesign.promptPlaceholder',
    promptPlaceholderDefault: '描述声音性别、年龄、情绪、口音和质感',
    inputType: 'none',
    outputType: 'text',
    submitPromptFallbackKey: 'tools.operations.voiceDesign.submitPromptFallback',
    submitPromptFallbackDefault: '声音设计',
    inputSlots: [],
  },
] as const

export function toolOperationsForOutputKind(outputKind: ToolOutputKind): readonly ToolOperationDef[] {
  return toolOperations.filter((operation) => operation.outputKind === outputKind)
}

export function toolOperationById(id: ToolOperationId): ToolOperationDef {
  const operation = toolOperations.find((item) => item.id === id)
  if (!operation) throw new Error(`Unknown tool operation: ${id}`)
  return operation
}

export function toolOutputKindForOperation(id: ToolOperationId): ToolOutputKind {
  return toolOperationById(id).outputKind
}

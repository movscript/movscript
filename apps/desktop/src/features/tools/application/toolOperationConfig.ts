import type { SurfaceModelCapability } from '@movscript/shared'
import type { InputSlotDef, ToolInputType } from '@/shared/ui/GenInputCard'

export type ToolOutputKind = 'image' | 'video' | 'audio' | 'text'

export type ToolOperationId =
  | 'prompt_to_image'
  | 'image_to_image'
  | 'image_edit'
  | 'prompt_to_video'
  | 'image_to_video'
  | 'first_frame_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'
  | 'video_to_video'
  | 'tts'
  | 'music'
  | 'sfx'
  | 'audio_chat'
  | 'stt'
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
  image: 'image_to_image',
  video: 'reference_to_video',
  audio: 'tts',
  text: 'stt',
}

export const toolOperations: readonly ToolOperationDef[] = [
  {
    id: 'prompt_to_image',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image',
    modelOperation: 'prompt_to_image',
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
    id: 'image_to_image',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image',
    modelOperation: 'image_to_image',
    titleKey: 'tools.defs.refImageGen.name',
    titleDefault: '参考生图',
    descriptionKey: 'tools.defs.refImageGen.description',
    descriptionDefault: '基于参考图片生成新图',
    promptPlaceholderKey: 'tools.defs.refImageGen.promptPlaceholder',
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
    id: 'image_edit',
    outputKind: 'image',
    sourceKey: 'tool.image',
    capability: 'image',
    modelOperation: 'image_edit',
    titleKey: 'tools.operations.imageEdit.name',
    titleDefault: '图片编辑',
    descriptionKey: 'tools.operations.imageEdit.description',
    descriptionDefault: '按指令编辑输入图片',
    promptPlaceholderKey: 'tools.operations.imageEdit.promptPlaceholder',
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
    capability: 'video',
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
    capability: 'video',
    modelQueryCapabilities: ['video_i2v', 'video', 'video_v2v'],
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
    capability: 'video',
    modelQueryCapabilities: ['video_i2v', 'video', 'video_v2v'],
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
    capability: 'video',
    modelQueryCapabilities: ['video_i2v', 'video', 'video_v2v'],
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
    capability: 'video',
    modelQueryCapabilities: ['video_i2v', 'video', 'video_v2v'],
    modelOperation: 'reference_to_video',
    titleKey: 'tools.defs.refVideoGen.name',
    titleDefault: '全能参考生视频',
    descriptionKey: 'tools.defs.refVideoGen.description',
    descriptionDefault: '使用图片、视频或音频作为参考生成视频',
    promptPlaceholderKey: 'tools.defs.refVideoGen.promptPlaceholder',
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
    id: 'video_to_video',
    outputKind: 'video',
    sourceKey: 'tool.video',
    capability: 'video',
    modelQueryCapabilities: ['video_v2v', 'video_i2v', 'video'],
    modelOperation: 'video_to_video',
    titleKey: 'tools.defs.motionImitation.name',
    titleDefault: '视频迁移',
    descriptionKey: 'tools.defs.motionImitation.description',
    descriptionDefault: '基于源视频生成新视频',
    promptPlaceholderKey: 'tools.defs.motionImitation.promptPlaceholder',
    promptPlaceholderDefault: '描述要迁移或重绘的视频效果',
    inputType: 'image+video',
    outputType: 'video',
    layout: 'reference-workbench',
    useResourceWorkbench: true,
    showHistory: false,
    inputSlots: [
      { key: 'source_video', labelKey: 'tools.inputs.sourceVideo', labelDefault: '源视频', type: 'video', required: true, maxCount: 1 },
      { key: 'reference_images', labelKey: 'tools.inputs.referenceImages', labelDefault: '参考图片', type: 'image', required: false, maxCount: 0 },
    ],
  },
  {
    id: 'tts',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_tts',
    jobType: 'audio_tts',
    modelOperation: 'tts',
    titleKey: 'tools.defs.audioGen.name',
    titleDefault: '语音生成',
    descriptionKey: 'tools.defs.audioGen.description',
    descriptionDefault: '把文本生成语音',
    promptPlaceholderKey: 'tools.defs.audioGen.promptPlaceholder',
    promptPlaceholderDefault: '输入要朗读的文本',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'music',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_music',
    jobType: 'audio_music',
    modelOperation: 'music',
    titleKey: 'tools.defs.musicGen.name',
    titleDefault: '音乐生成',
    descriptionKey: 'tools.defs.musicGen.description',
    descriptionDefault: '按提示词生成音乐',
    promptPlaceholderKey: 'tools.defs.musicGen.promptPlaceholder',
    promptPlaceholderDefault: '描述音乐风格、情绪、节奏和乐器',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'sfx',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_sfx',
    jobType: 'audio_sfx',
    modelOperation: 'sfx',
    titleKey: 'tools.defs.audioSfx.name',
    titleDefault: '音效生成',
    descriptionKey: 'tools.defs.audioSfx.description',
    descriptionDefault: '按提示词生成音效',
    promptPlaceholderKey: 'tools.defs.audioSfx.promptPlaceholder',
    promptPlaceholderDefault: '描述音效对象、空间、强度和持续时间',
    inputType: 'none',
    outputType: 'audio',
    inputSlots: [],
  },
  {
    id: 'audio_chat',
    outputKind: 'audio',
    sourceKey: 'tool.audio',
    capability: 'audio_chat',
    jobType: 'audio_chat',
    modelOperation: 'audio_chat',
    titleKey: 'tools.defs.audioChat.name',
    titleDefault: '语音对话',
    descriptionKey: 'tools.defs.audioChat.description',
    descriptionDefault: '基于文本或音频生成对话语音',
    promptPlaceholderKey: 'tools.defs.audioChat.promptPlaceholder',
    promptPlaceholderDefault: '输入对话目标或补充上下文',
    inputType: 'audio',
    outputType: 'audio',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: false, maxCount: 1 },
    ],
  },
  {
    id: 'stt',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_transcribe',
    jobType: 'audio_transcribe',
    modelOperation: 'stt',
    titleKey: 'tools.defs.audioTranscribe.name',
    titleDefault: '语音转写',
    descriptionKey: 'tools.defs.audioTranscribe.description',
    descriptionDefault: '把音频转写成文本',
    promptPlaceholderKey: 'tools.defs.audioTranscribe.promptPlaceholder',
    promptPlaceholderDefault: '可输入转写要求',
    inputType: 'audio',
    outputType: 'text',
    promptRequired: false,
    submitPromptFallbackKey: 'tools.defs.audioTranscribe.submitPromptFallback',
    submitPromptFallbackDefault: '语音转写',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'speech_translate',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'audio_translate',
    jobType: 'audio_translate',
    modelOperation: 'speech_translate',
    titleKey: 'tools.defs.audioTranslate.name',
    titleDefault: '音频翻译',
    descriptionKey: 'tools.defs.audioTranslate.description',
    descriptionDefault: '把音频翻译成文本',
    promptPlaceholderKey: 'tools.defs.audioTranslate.promptPlaceholder',
    promptPlaceholderDefault: '可输入目标语言或翻译要求',
    inputType: 'audio',
    outputType: 'text',
    promptRequired: false,
    submitPromptFallbackKey: 'tools.defs.audioTranslate.submitPromptFallback',
    submitPromptFallbackDefault: '音频翻译',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 1 },
    ],
  },
  {
    id: 'voice_clone',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'voice_clone',
    jobType: 'voice_clone',
    modelOperation: 'voice_clone',
    titleKey: 'tools.defs.voiceClone.name',
    titleDefault: '声音克隆',
    descriptionKey: 'tools.defs.voiceClone.description',
    descriptionDefault: '基于音频生成声音档案',
    promptPlaceholderKey: 'tools.defs.voiceClone.promptPlaceholder',
    promptPlaceholderDefault: '输入声音档案说明',
    inputType: 'audio',
    outputType: 'text',
    submitPromptFallbackKey: 'tools.defs.voiceClone.submitPromptFallback',
    submitPromptFallbackDefault: '声音克隆',
    inputSlots: [
      { key: 'source_audio', labelKey: 'tools.inputs.sourceAudio', labelDefault: '源音频', type: 'audio', required: true, maxCount: 0 },
    ],
  },
  {
    id: 'voice_design',
    outputKind: 'text',
    sourceKey: 'tool.text',
    capability: 'voice_design',
    jobType: 'voice_design',
    modelOperation: 'voice_design',
    titleKey: 'tools.defs.voiceDesign.name',
    titleDefault: '声音设计',
    descriptionKey: 'tools.defs.voiceDesign.description',
    descriptionDefault: '按描述生成声音档案',
    promptPlaceholderKey: 'tools.defs.voiceDesign.promptPlaceholder',
    promptPlaceholderDefault: '描述声音性别、年龄、情绪、口音和质感',
    inputType: 'none',
    outputType: 'text',
    submitPromptFallbackKey: 'tools.defs.voiceDesign.submitPromptFallback',
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


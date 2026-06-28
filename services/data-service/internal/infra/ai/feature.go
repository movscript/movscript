package ai

// Capability constants describe stable backend runtime contracts.
const (
	CapabilityText           = "text"
	CapabilityReasoning      = "reasoning"  // CoT-style reasoning models (DeepSeek R1, QwQ, o3, etc.)
	CapabilityImage          = "image"      // text-to-image
	CapabilityImageEdit      = "image_edit" // image-to-image (requires image input)
	CapabilityVideo          = "video"      // text-to-video
	CapabilityVideoI2V       = "video_i2v"  // image-to-video (requires image input)
	CapabilityVideoV2V       = "video_v2v"  // video-to-video (requires video input)
	CapabilityAudio          = "audio"      // legacy broad audio capability
	CapabilityAudioTTS       = "audio_tts"  // text-to-speech voiceover
	CapabilityAudioSTT       = "audio_transcribe"
	CapabilityAudioMusic     = "audio_music"
	CapabilityAudioSFX       = "audio_sfx"
	CapabilityAudioChat      = "audio_chat"      // realtime or omni speech conversation
	CapabilityVoiceClone     = "voice_clone"     // create reusable cloned voices
	CapabilityVoiceDesign    = "voice_design"    // create voices from text descriptions
	CapabilityAudioTranslate = "audio_translate" // speech translation or interpreting
	CapabilitySubAlign       = "subtitle_align"
	CapabilitySubTranslate   = "subtitle_translate"
)

const (
	CapabilityFamilyTextGeneration  = "text_generation"
	CapabilityFamilyImageGeneration = "image_generation"
	CapabilityFamilyVideoGeneration = "video_generation"
	CapabilityFamilyAudioGeneration = "audio_generation"
	CapabilityFamilyEmbedding       = "embedding"
	CapabilityFamilyRerank          = "rerank"
	CapabilityFamilyModeration      = "moderation"
)

const (
	ImageOperationPromptToImage    = "prompt_to_image"
	ImageOperationReferenceToImage = "reference_to_image"
	ImageOperationImageToImage     = "image_to_image"
	ImageOperationImageEdit        = "image_edit"
	ImageOperationImageInpaint     = "image_inpaint"
	ImageOperationImageOutpaint    = "image_outpaint"
	ImageOperationImageUpscale     = "image_upscale"
)

const (
	VideoOperationPromptToVideo         = "prompt_to_video"
	VideoOperationReferenceToVideo      = "reference_to_video"
	VideoOperationImageToVideo          = "image_to_video"
	VideoOperationFirstFrameToVideo     = "first_frame_to_video"
	VideoOperationFirstLastFrameToVideo = "first_last_frame_to_video"
	VideoOperationVideoToVideo          = "video_to_video"
	VideoOperationVideoEdit             = "video_edit"
	VideoOperationVideoExtend           = "video_extend"
	VideoOperationVideoInpaint          = "video_inpaint"
	VideoOperationObjectInsert          = "object_insert"
	VideoOperationObjectRemove          = "object_remove"
	VideoOperationMotionControl         = "motion_control"
	VideoOperationLipSync               = "lip_sync"
	VideoOperationVideoUpscale          = "video_upscale"
)

const (
	AudioOperationTTS               = "tts"
	AudioOperationSTT               = "stt"
	AudioOperationSpeechTranslate   = "speech_translate"
	AudioOperationAudioChat         = "audio_chat"
	AudioOperationVoiceClone        = "voice_clone"
	AudioOperationVoiceDesign       = "voice_design"
	AudioOperationDubbing           = "dubbing"
	AudioOperationMusic             = "music"
	AudioOperationSFX               = "sfx"
	AudioOperationSpeechEnhancement = "speech_enhancement"
)

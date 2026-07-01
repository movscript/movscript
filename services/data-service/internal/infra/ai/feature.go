package ai

const (
	CapabilityFamilyTextGeneration  = "text_generation"
	CapabilityReasoning             = "reasoning"
	CapabilityFamilyImageGeneration = "image_generation"
	CapabilityFamilyVideoGeneration = "video_generation"
	CapabilityFamilyAudioGeneration = "audio_generation"
	CapabilityFamilyEmbedding       = "embedding"
	CapabilityFamilyRerank          = "rerank"
	CapabilityFamilyModeration      = "moderation"
)

const (
	ImageOperationTextToImage      = "text_to_image"
	ImageOperationReferenceToImage = "reference_to_image"
	ImageOperationEditImage        = "edit_image"
	ImageOperationInpaint          = "inpaint"
	ImageOperationOutpaint         = "outpaint"
	ImageOperationVariation        = "variation"
	ImageOperationUpscaleImage     = "upscale_image"
)

const (
	VideoOperationPromptToVideo         = "prompt_to_video"
	VideoOperationReferenceToVideo      = "reference_to_video"
	VideoOperationImageToVideo          = "image_to_video"
	VideoOperationFirstFrameToVideo     = "first_frame_to_video"
	VideoOperationFirstLastFrameToVideo = "first_last_frame_to_video"
	VideoOperationEditVideo             = "edit_video"
	VideoOperationExtendVideo           = "extend_video"
	VideoOperationUpscaleVideo          = "upscale_video"
)

const (
	AudioOperationTextToSpeech          = "text_to_speech"
	AudioOperationSpeechToText          = "speech_to_text"
	AudioOperationSpeechTranslate       = "speech_translate"
	AudioOperationSpeechToSpeech        = "speech_to_speech"
	AudioOperationVoiceClone            = "voice_clone"
	AudioOperationVoiceDesign           = "voice_design"
	AudioOperationDubbing               = "dubbing"
	AudioOperationMusicGeneration       = "music_generation"
	AudioOperationSoundEffectGeneration = "sound_effect_generation"
	AudioOperationVoiceIsolation        = "voice_isolation"
	AudioOperationForcedAlignment       = "forced_alignment"
)

package ai

// Capability constants describe stable backend runtime contracts.
const (
	CapabilityText      = "text"
	CapabilityReasoning = "reasoning"  // CoT-style reasoning models (DeepSeek R1, QwQ, o3, etc.)
	CapabilityImage     = "image"      // text-to-image
	CapabilityImageEdit = "image_edit" // image-to-image (requires image input)
	CapabilityVideo     = "video"      // text-to-video
	CapabilityVideoI2V  = "video_i2v"  // image-to-video (requires image input)
	CapabilityVideoV2V  = "video_v2v"  // video-to-video (requires video input)
	CapabilityAudio     = "audio"      // text-to-audio
)

package ai

import "strings"

const (
	NewAPIProfileOpenAIChatCompletions  = "openai_chat_completions_json"
	NewAPIProfileOpenAIResponses        = "openai_responses_json"
	NewAPIProfileClaudeMessages         = "claude_messages_json"
	NewAPIProfileGeminiGenerateContent  = "gemini_generate_content_json"
	NewAPIProfileOpenAIImages           = "openai_images_json_multipart"
	NewAPIProfileGeminiImages           = "gemini_image_generate_content_json"
	NewAPIProfileQwenImages             = "qwen_image_json"
	NewAPIProfileOpenAIAudio            = "openai_audio_json_multipart"
	NewAPIProfileGeminiAudio            = "gemini_audio_generate_content_json"
	NewAPIProfileOpenAIEmbeddings       = "openai_embeddings_json"
	NewAPIProfileGeminiEngineEmbeddings = "gemini_engine_embeddings_json"
	NewAPIProfileOpenAIModerations      = "openai_moderations_json"
	NewAPIProfileOpenAIRealtime         = "openai_realtime_ws"
	NewAPIProfileRerank                 = "newapi_rerank_json"
	NewAPIProfileVideoGenerations       = "video_generations_json"
	NewAPIProfileSoraVideoMultipart     = "sora_video_multipart"
	NewAPIProfileJimengAction           = "jimeng_action_json"
	NewAPIProfileKlingVideo             = "kling_video_json"
)

type NewAPIProtocolProfileDef struct {
	Profile          string
	CapabilityFamily string
	Label            string
	Implemented      bool
	Endpoint         string
	InheritsDriver   string
	Operations       []string
	RecognizedParams []string
}

func NewAPIProtocolProfiles() []NewAPIProtocolProfileDef {
	return []NewAPIProtocolProfileDef{
		{
			Profile:          NewAPIProfileOpenAIChatCompletions,
			CapabilityFamily: CapabilityFamilyTextGeneration,
			Label:            "OpenAI Chat Completions",
			Implemented:      true,
			Endpoint:         "/v1/chat/completions",
			InheritsDriver:   "openai_chat_completions",
			Operations:       []string{"chat"},
			RecognizedParams: []string{"temperature", "top_p", "max_tokens", "frequency_penalty", "presence_penalty", "response_format", "tools", "tool_choice", "stream"},
		},
		{
			Profile:          NewAPIProfileOpenAIResponses,
			CapabilityFamily: CapabilityFamilyTextGeneration,
			Label:            "OpenAI Responses",
			Implemented:      true,
			Endpoint:         "/v1/responses",
			InheritsDriver:   "openai_responses",
			Operations:       []string{"responses"},
			RecognizedParams: []string{"temperature", "top_p", "max_output_tokens", "reasoning_effort", "response_format", "tools", "tool_choice", "stream"},
		},
		{
			Profile:          NewAPIProfileClaudeMessages,
			CapabilityFamily: CapabilityFamilyTextGeneration,
			Label:            "Claude Messages",
			Implemented:      true,
			Endpoint:         "/v1/messages",
			InheritsDriver:   "anthropic_messages",
			Operations:       []string{"chat"},
			RecognizedParams: []string{"max_tokens", "temperature", "top_p", "top_k", "system", "tools", "tool_choice", "stream"},
		},
		{
			Profile:          NewAPIProfileGeminiGenerateContent,
			CapabilityFamily: CapabilityFamilyTextGeneration,
			Label:            "Gemini Generate Content",
			Implemented:      true,
			Endpoint:         "/v1beta/models/{model}:generateContent",
			InheritsDriver:   "gemini_generate_content",
			Operations:       []string{"chat"},
			RecognizedParams: []string{"temperature", "top_p", "top_k", "max_output_tokens", "candidate_count", "response_mime_type", "response_schema", "stream"},
		},
		{
			Profile:          NewAPIProfileOpenAIImages,
			CapabilityFamily: CapabilityFamilyImageGeneration,
			Label:            "OpenAI Images",
			Implemented:      true,
			Endpoint:         "/v1/images/*",
			InheritsDriver:   "openai_images",
			Operations:       []string{ImageOperationTextToImage, ImageOperationReferenceToImage, ImageOperationEditImage},
			RecognizedParams: []string{"size", "quality", "style", "n", "response_format", "background", "moderation", "output_format", "output_compression"},
		},
		{
			Profile:          NewAPIProfileGeminiImages,
			CapabilityFamily: CapabilityFamilyImageGeneration,
			Label:            "Gemini Image GenerateContent",
			Implemented:      true,
			Endpoint:         "/v1beta/models/{model}:generateContent",
			InheritsDriver:   "gemini_image_generate_content",
			Operations:       []string{ImageOperationTextToImage, ImageOperationReferenceToImage, ImageOperationEditImage},
			RecognizedParams: []string{"size", "aspect_ratio", "response_modalities", "temperature", "top_p", "top_k", "candidate_count"},
		},
		{
			Profile:          NewAPIProfileQwenImages,
			CapabilityFamily: CapabilityFamilyImageGeneration,
			Label:            "Qwen Images",
			Implemented:      true,
			Endpoint:         "/v1/images/{generations|edits}",
			InheritsDriver:   "qwen_images",
			Operations:       []string{ImageOperationTextToImage, ImageOperationReferenceToImage, ImageOperationEditImage},
			RecognizedParams: []string{"size", "n", "seed", "negative_prompt", "watermark", "prompt_extend", "response_format"},
		},
		{
			Profile:          NewAPIProfileOpenAIAudio,
			CapabilityFamily: CapabilityFamilyAudioGeneration,
			Label:            "OpenAI Audio",
			Implemented:      true,
			Endpoint:         "/v1/audio/*",
			InheritsDriver:   "openai_audio",
			Operations:       []string{AudioOperationTextToSpeech, AudioOperationSpeechToText, AudioOperationSpeechTranslate, AudioOperationSpeechToSpeech},
			RecognizedParams: []string{"voice", "response_format", "speed", "language", "prompt", "temperature", "format"},
		},
		{
			Profile:          NewAPIProfileGeminiAudio,
			CapabilityFamily: CapabilityFamilyAudioGeneration,
			Label:            "Gemini Audio GenerateContent",
			Implemented:      true,
			Endpoint:         "/v1beta/models/{model}:generateContent",
			InheritsDriver:   "gemini_audio_generate_content",
			Operations:       []string{AudioOperationTextToSpeech},
			RecognizedParams: []string{"voice", "speaker_voice", "multi_speaker_voice_config", "response_modalities", "audio_format", "sample_rate"},
		},
		{
			Profile:          NewAPIProfileOpenAIEmbeddings,
			CapabilityFamily: CapabilityFamilyEmbedding,
			Label:            "OpenAI Embeddings",
			Implemented:      true,
			Endpoint:         "/v1/embeddings",
			InheritsDriver:   "openai_embeddings",
			Operations:       []string{EmbeddingOperationCreateEmbedding},
			RecognizedParams: []string{"encoding_format", "dimensions", "user"},
		},
		{
			Profile:          NewAPIProfileGeminiEngineEmbeddings,
			CapabilityFamily: CapabilityFamilyEmbedding,
			Label:            "Gemini Engine Embeddings",
			Implemented:      true,
			Endpoint:         "/v1/engines/{model}/embeddings",
			InheritsDriver:   "gemini_engine_embeddings",
			Operations:       []string{EmbeddingOperationCreateEmbedding},
			RecognizedParams: []string{"encoding_format", "dimensions", "user"},
		},
		{
			Profile:          NewAPIProfileOpenAIModerations,
			CapabilityFamily: CapabilityFamilyModeration,
			Label:            "OpenAI Moderations",
			Implemented:      true,
			Endpoint:         "/v1/moderations",
			InheritsDriver:   "openai_moderations",
			Operations:       []string{ModerationOperationCreateModeration},
			RecognizedParams: []string{"input"},
		},
		{
			Profile:          NewAPIProfileOpenAIRealtime,
			CapabilityFamily: CapabilityFamilyRealtime,
			Label:            "OpenAI Realtime",
			Implemented:      true,
			Endpoint:         "/v1/realtime",
			InheritsDriver:   "openai_realtime",
			Operations:       []string{RealtimeOperationConnectSession},
			RecognizedParams: []string{"voice", "modalities", "instructions", "input_audio_format", "output_audio_format", "turn_detection"},
		},
		{
			Profile:          NewAPIProfileRerank,
			CapabilityFamily: CapabilityFamilyRerank,
			Label:            "New API Rerank",
			Implemented:      true,
			Endpoint:         "/v1/rerank",
			InheritsDriver:   "newapi_rerank",
			Operations:       []string{RerankOperationCreateRerank},
			RecognizedParams: []string{"query", "documents", "top_n", "return_documents", "max_chunks_per_doc"},
		},
		{
			Profile:          NewAPIProfileVideoGenerations,
			CapabilityFamily: CapabilityFamilyVideoGeneration,
			Label:            "New API Video Generations",
			Implemented:      true,
			Endpoint:         "/v1/video/generations",
			InheritsDriver:   "newapi_video_generations",
			Operations:       []string{VideoOperationPromptToVideo, VideoOperationImageToVideo},
			RecognizedParams: []string{"prompt", "duration", "aspect_ratio", "resolution", "width", "height", "size", "seed", "fps", "n", "response_format", "user", "metadata"},
		},
		{
			Profile:          NewAPIProfileSoraVideoMultipart,
			CapabilityFamily: CapabilityFamilyVideoGeneration,
			Label:            "Sora Video Multipart",
			Implemented:      true,
			Endpoint:         "/v1/videos",
			InheritsDriver:   "sora_video_multipart",
			Operations:       []string{VideoOperationPromptToVideo, VideoOperationImageToVideo},
			RecognizedParams: []string{"prompt", "duration", "aspect_ratio", "resolution", "width", "height", "seed", "fps", "n", "response_format", "user", "metadata"},
		},
		{
			Profile:          NewAPIProfileJimengAction,
			CapabilityFamily: CapabilityFamilyVideoGeneration,
			Label:            "Jimeng Action",
			Implemented:      true,
			Endpoint:         "/jimeng/?Action=...",
			InheritsDriver:   "jimeng_action",
			Operations: []string{
				VideoOperationPromptToVideo,
				VideoOperationImageToVideo,
				VideoOperationFirstFrameToVideo,
				VideoOperationFirstLastFrameToVideo,
				VideoOperationReferenceToVideo,
				VideoOperationEditVideo,
				VideoOperationExtendVideo,
				VideoOperationUpscaleVideo,
			},
			RecognizedParams: []string{"req_key", "prompt", "image_urls", "binary_data_base64", "seed", "aspect_ratio", "frames", "duration", "resolution", "metadata"},
		},
		{
			Profile:          NewAPIProfileKlingVideo,
			CapabilityFamily: CapabilityFamilyVideoGeneration,
			Label:            "Kling Video",
			Implemented:      true,
			Endpoint:         "/kling/v1/videos/{text2video|image2video}",
			InheritsDriver:   "kling_video",
			Operations:       []string{VideoOperationPromptToVideo, VideoOperationImageToVideo},
			RecognizedParams: []string{"prompt", "duration", "aspect_ratio", "resolution", "negative_prompt", "cfg_scale", "mode", "camera_control", "metadata"},
		},
	}
}

func NewAPIProtocolProfile(profile string) (NewAPIProtocolProfileDef, bool) {
	profile = strings.TrimSpace(profile)
	for _, def := range NewAPIProtocolProfiles() {
		if def.Profile == profile {
			return def, true
		}
	}
	return NewAPIProtocolProfileDef{}, false
}

func NewAPIAdapterProtocolProfiles() []AdapterProtocolProfile {
	defs := NewAPIProtocolProfiles()
	out := make([]AdapterProtocolProfile, 0, len(defs))
	for _, def := range defs {
		out = append(out, AdapterProtocolProfile{
			Profile:          def.Profile,
			CapabilityFamily: def.CapabilityFamily,
			Label:            def.Label,
			Implemented:      def.Implemented,
			Endpoint:         def.Endpoint,
			InheritsDriver:   def.InheritsDriver,
			Operations:       append([]string(nil), def.Operations...),
			RecognizedParams: append([]string(nil), def.RecognizedParams...),
		})
	}
	return out
}

func NewAPIProtocolProfileOperations(capability string) []string {
	capability = strings.TrimSpace(capability)
	out := make([]string, 0)
	for _, def := range NewAPIProtocolProfiles() {
		if !def.Implemented || strings.TrimSpace(def.CapabilityFamily) != capability {
			continue
		}
		out = appendUniqueTrimmed(out, def.Operations...)
	}
	return out
}

func NewAPIProtocolProfileSupportsOperation(profile, capability, operation string) bool {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	profile = ResolveNewAPIProtocolProfile(capability, profile)
	if profile == "" {
		return true
	}
	def, ok := NewAPIProtocolProfile(profile)
	if !ok || !def.Implemented {
		return false
	}
	if def.CapabilityFamily != "" && capability != "" && strings.TrimSpace(def.CapabilityFamily) != capability {
		return false
	}
	if operation == "" || len(def.Operations) == 0 {
		return true
	}
	return containsTrimmed(def.Operations, operation)
}

func DefaultNewAPIProtocolProfile(capability string) string {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyTextGeneration:
		return NewAPIProfileOpenAIChatCompletions
	case CapabilityFamilyImageGeneration:
		return NewAPIProfileOpenAIImages
	case CapabilityFamilyAudioGeneration:
		return NewAPIProfileOpenAIAudio
	case CapabilityFamilyEmbedding:
		return NewAPIProfileOpenAIEmbeddings
	case CapabilityFamilyModeration:
		return NewAPIProfileOpenAIModerations
	case CapabilityFamilyRealtime:
		return NewAPIProfileOpenAIRealtime
	case CapabilityFamilyRerank:
		return NewAPIProfileRerank
	case CapabilityFamilyVideoGeneration:
		return NewAPIProfileVideoGenerations
	default:
		return ""
	}
}

func ResolveNewAPIProtocolProfile(capability, profile string) string {
	if profile = strings.TrimSpace(profile); profile != "" {
		return profile
	}
	return DefaultNewAPIProtocolProfile(capability)
}

func InferNewAPIProtocolProfile(modelID string, capabilities []string) string {
	if containsTrimmed(capabilities, CapabilityFamilyVideoGeneration) {
		id := normalizeNewAPIModelID(modelID)
		switch {
		case strings.Contains(id, "kling"):
			return NewAPIProfileKlingVideo
		case strings.Contains(id, "jimeng") || strings.Contains(id, "ji-meng") || strings.Contains(id, "seedance"):
			return NewAPIProfileJimengAction
		case strings.Contains(id, "sora"):
			return NewAPIProfileSoraVideoMultipart
		default:
			return DefaultNewAPIProtocolProfile(CapabilityFamilyVideoGeneration)
		}
	}
	if containsTrimmed(capabilities, CapabilityFamilyImageGeneration) {
		id := normalizeNewAPIModelID(modelID)
		if strings.Contains(id, "gemini") {
			return NewAPIProfileGeminiImages
		}
		if strings.Contains(id, "qwen-image") || strings.Contains(id, "wan") || strings.Contains(id, "z-image") {
			return NewAPIProfileQwenImages
		}
		return NewAPIProfileOpenAIImages
	}
	if containsTrimmed(capabilities, CapabilityFamilyAudioGeneration) {
		id := normalizeNewAPIModelID(modelID)
		if strings.Contains(id, "gemini") {
			return NewAPIProfileGeminiAudio
		}
		return NewAPIProfileOpenAIAudio
	}
	if containsTrimmed(capabilities, CapabilityFamilyEmbedding) {
		id := normalizeNewAPIModelID(modelID)
		if strings.Contains(id, "gemini") {
			return NewAPIProfileGeminiEngineEmbeddings
		}
		return NewAPIProfileOpenAIEmbeddings
	}
	if containsTrimmed(capabilities, CapabilityFamilyRerank) {
		return NewAPIProfileRerank
	}
	if containsTrimmed(capabilities, CapabilityFamilyModeration) {
		return NewAPIProfileOpenAIModerations
	}
	if containsTrimmed(capabilities, CapabilityFamilyRealtime) {
		return NewAPIProfileOpenAIRealtime
	}
	if containsTrimmed(capabilities, CapabilityFamilyTextGeneration) || containsTrimmed(capabilities, CapabilityReasoning) {
		id := normalizeNewAPIModelID(modelID)
		if strings.Contains(id, "claude") {
			return NewAPIProfileClaudeMessages
		}
		if strings.Contains(id, "gemini") {
			return NewAPIProfileGeminiGenerateContent
		}
		return NewAPIProfileOpenAIChatCompletions
	}
	return NewAPIProfileOpenAIChatCompletions
}

func normalizeNewAPIModelID(modelID string) string {
	modelID = strings.ToLower(strings.TrimSpace(modelID))
	replacer := strings.NewReplacer("_", "-", ".", "-", "/", "-", ":", "-")
	return replacer.Replace(modelID)
}

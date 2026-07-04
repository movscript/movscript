package media

import "context"

const (
	CapabilityAudioGeneration = "audio_generation"
)

type TimingSource string

const (
	TimingSourceSpeechTiming    TimingSource = "speech_timing"
	TimingSourceForcedAlignment TimingSource = "forced_alignment"
	TimingSourceSpeechToText    TimingSource = "speech_to_text"
	TimingSourceManual          TimingSource = "manual"
)

type TimedTextUnit struct {
	ID         string   `json:"id"`
	StartMs    int      `json:"start_ms"`
	EndMs      int      `json:"end_ms"`
	Text       string   `json:"text"`
	Confidence *float64 `json:"confidence,omitempty"`
	Speaker    string   `json:"speaker,omitempty"`
}

type TimingMetadata struct {
	Source     TimingSource    `json:"source"`
	Provider   string          `json:"provider,omitempty"`
	Language   string          `json:"language,omitempty"`
	DurationMs int             `json:"duration_ms"`
	Segments   []TimedTextUnit `json:"segments"`
	Words      []TimedTextUnit `json:"words,omitempty"`
	Characters []TimedTextUnit `json:"characters,omitempty"`
}

type VoiceoverArtifact struct {
	ResourceID   uint         `json:"resource_id"`
	Text         string       `json:"text"`
	Voice        string       `json:"voice"`
	Language     string       `json:"language"`
	DurationMs   int          `json:"duration_ms"`
	Provider     string       `json:"provider"`
	Model        string       `json:"model,omitempty"`
	AudioFormat  string       `json:"audio_format,omitempty"`
	TimingSource TimingSource `json:"timing_source,omitempty"`
}

type SubtitleArtifact struct {
	ResourceID             uint         `json:"resource_id"`
	Format                 string       `json:"format"`
	Source                 TimingSource `json:"source"`
	Language               string       `json:"language"`
	RelatedAudioResourceID uint         `json:"related_audio_resource_id"`
	Confidence             *float64     `json:"confidence,omitempty"`
	StyleID                string       `json:"style_id,omitempty"`
}

type TTSRequest struct {
	Text            string         `json:"text"`
	Voice           string         `json:"voice"`
	Language        string         `json:"language"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	AudioFormat     string         `json:"audio_format,omitempty"`
	ReturnTiming    bool           `json:"return_timing"`
	SSML            bool           `json:"ssml"`
	Params          map[string]any `json:"params,omitempty"`
}

type TTSResponse struct {
	Audio       []byte          `json:"-"`
	MimeType    string          `json:"mime_type"`
	DurationMs  int             `json:"duration_ms"`
	Timing      *TimingMetadata `json:"timing,omitempty"`
	ProviderRef string          `json:"provider_ref,omitempty"`
}

type AudioGenerationKind string

const (
	AudioGenerationKindMusic       AudioGenerationKind = "music_generation"
	AudioGenerationKindSoundEffect AudioGenerationKind = "sound_effect_generation"
)

type AudioGenerationRequest struct {
	Kind            AudioGenerationKind `json:"kind"`
	Prompt          string              `json:"prompt"`
	NegativePrompt  string              `json:"negative_prompt,omitempty"`
	Language        string              `json:"language,omitempty"`
	Model           string              `json:"model,omitempty"`
	ProtocolProfile string              `json:"protocol_profile,omitempty"`
	AudioFormat     string              `json:"audio_format,omitempty"`
	DurationSec     int                 `json:"duration_sec,omitempty"`
	Params          map[string]any      `json:"params,omitempty"`
}

type AudioGenerationResponse struct {
	Audio       []byte `json:"-"`
	MimeType    string `json:"mime_type"`
	DurationMs  int    `json:"duration_ms"`
	ProviderRef string `json:"provider_ref,omitempty"`
}

type SpeechToSpeechRequest struct {
	Prompt          string         `json:"prompt,omitempty"`
	AudioResourceID uint           `json:"audio_resource_id,omitempty"`
	Audio           []byte         `json:"-"`
	MimeType        string         `json:"mime_type,omitempty"`
	Language        string         `json:"language,omitempty"`
	Voice           string         `json:"voice,omitempty"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	AudioFormat     string         `json:"audio_format,omitempty"`
	Params          map[string]any `json:"params,omitempty"`
}

type SpeechToSpeechResponse struct {
	Audio       []byte          `json:"-"`
	Text        string          `json:"text,omitempty"`
	MimeType    string          `json:"mime_type"`
	DurationMs  int             `json:"duration_ms,omitempty"`
	Timing      *TimingMetadata `json:"timing,omitempty"`
	ProviderRef string          `json:"provider_ref,omitempty"`
}

type TranscribeRequest struct {
	AudioResourceID uint           `json:"audio_resource_id,omitempty"`
	Audio           []byte         `json:"-"`
	MimeType        string         `json:"mime_type,omitempty"`
	Language        string         `json:"language,omitempty"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	Params          map[string]any `json:"params,omitempty"`
}

type SpeechTranslateRequest struct {
	AudioResourceID uint           `json:"audio_resource_id,omitempty"`
	Audio           []byte         `json:"-"`
	MimeType        string         `json:"mime_type,omitempty"`
	SourceLanguage  string         `json:"source_language,omitempty"`
	TargetLanguage  string         `json:"target_language,omitempty"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	Params          map[string]any `json:"params,omitempty"`
}

type VoiceCloneSample struct {
	AudioResourceID uint   `json:"audio_resource_id,omitempty"`
	Audio           []byte `json:"-"`
	MimeType        string `json:"mime_type,omitempty"`
}

type VoiceCloneRequest struct {
	Name            string             `json:"name"`
	Description     string             `json:"description,omitempty"`
	Samples         []VoiceCloneSample `json:"samples"`
	Model           string             `json:"model,omitempty"`
	ProtocolProfile string             `json:"protocol_profile,omitempty"`
	Params          map[string]any     `json:"params,omitempty"`
}

type VoiceDesignRequest struct {
	Name            string         `json:"name"`
	Description     string         `json:"description"`
	PreviewText     string         `json:"preview_text,omitempty"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	Params          map[string]any `json:"params,omitempty"`
}

type VoiceProfileResponse struct {
	VoiceID              string         `json:"voice_id"`
	Name                 string         `json:"name,omitempty"`
	Description          string         `json:"description,omitempty"`
	PreviewURL           string         `json:"preview_url,omitempty"`
	GeneratedVoiceID     string         `json:"generated_voice_id,omitempty"`
	RequiresVerification bool           `json:"requires_verification,omitempty"`
	ProviderRef          string         `json:"provider_ref,omitempty"`
	Metadata             map[string]any `json:"metadata,omitempty"`
}

type AlignRequest struct {
	AudioResourceID uint           `json:"audio_resource_id,omitempty"`
	Audio           []byte         `json:"-"`
	MimeType        string         `json:"mime_type,omitempty"`
	Script          string         `json:"script"`
	Language        string         `json:"language,omitempty"`
	Model           string         `json:"model,omitempty"`
	ProtocolProfile string         `json:"protocol_profile,omitempty"`
	Params          map[string]any `json:"params,omitempty"`
}

type DubbingRequest struct {
	SubtitleResourceID uint           `json:"subtitle_resource_id,omitempty"`
	Subtitle           []byte         `json:"-"`
	MimeType           string         `json:"mime_type,omitempty"`
	SourceLanguage     string         `json:"source_language,omitempty"`
	TargetLanguage     string         `json:"target_language"`
	Model              string         `json:"model,omitempty"`
	ProtocolProfile    string         `json:"protocol_profile,omitempty"`
	Params             map[string]any `json:"params,omitempty"`
}

type SubtitleResponse struct {
	Timing      TimingMetadata `json:"timing"`
	Format      string         `json:"format,omitempty"`
	Content     []byte         `json:"-"`
	MimeType    string         `json:"mime_type,omitempty"`
	ProviderRef string         `json:"provider_ref,omitempty"`
}

type RenderClip struct {
	ResourceID  uint `json:"resource_id"`
	StartMs     int  `json:"start_ms"`
	EndMs       int  `json:"end_ms"`
	TrimStartMs int  `json:"trim_start_ms,omitempty"`
	TrimEndMs   int  `json:"trim_end_ms,omitempty"`
}

type SubtitleStyle struct {
	StyleID      string `json:"style_id,omitempty"`
	Font         string `json:"font,omitempty"`
	Position     string `json:"position,omitempty"`
	SafeMarginPx int    `json:"safe_margin_px,omitempty"`
	BurnIn       bool   `json:"burn_in"`
}

type RenderRecipe struct {
	AspectRatio         string         `json:"aspect_ratio"`
	Resolution          string         `json:"resolution"`
	Clips               []RenderClip   `json:"clips"`
	VoiceoverResourceID uint           `json:"voiceover_resource_id"`
	SubtitleResourceID  uint           `json:"subtitle_resource_id,omitempty"`
	BGMResourceID       uint           `json:"bgm_resource_id,omitempty"`
	SubtitleStyle       *SubtitleStyle `json:"subtitle_style,omitempty"`
	OutputFormat        string         `json:"output_format"`
}

type RenderRequest struct {
	Recipe RenderRecipe   `json:"recipe"`
	Params map[string]any `json:"params,omitempty"`
}

type RenderResponse struct {
	Video    []byte `json:"-"`
	MimeType string `json:"mime_type"`
}

type TTSProvider interface {
	Synthesize(ctx context.Context, req TTSRequest) (TTSResponse, error)
}

type AudioGenerationProvider interface {
	GenerateAudio(ctx context.Context, req AudioGenerationRequest) (AudioGenerationResponse, error)
}

type SpeechToSpeechProvider interface {
	GenerateSpeechToSpeech(ctx context.Context, req SpeechToSpeechRequest) (SpeechToSpeechResponse, error)
}

type SubtitleProvider interface {
	Transcribe(ctx context.Context, req TranscribeRequest) (SubtitleResponse, error)
	Align(ctx context.Context, req AlignRequest) (SubtitleResponse, error)
}

type SpeechTranslateProvider interface {
	TranslateSpeech(ctx context.Context, req SpeechTranslateRequest) (SubtitleResponse, error)
}

type VoiceProfileProvider interface {
	CloneVoice(ctx context.Context, req VoiceCloneRequest) (VoiceProfileResponse, error)
	DesignVoice(ctx context.Context, req VoiceDesignRequest) (VoiceProfileResponse, error)
}

type DubbingProvider interface {
	GenerateDubbing(ctx context.Context, req DubbingRequest) (SubtitleResponse, error)
}

type Renderer interface {
	Render(ctx context.Context, req RenderRequest) (RenderResponse, error)
}

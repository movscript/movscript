package ai

import (
	"context"
	"fmt"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCallAlignUsesSubtitleAlignCapabilityWithCurrentUserContext(t *testing.T) {
	testCallAlignUsesCapability(t, CapabilityFamilyAudioGeneration)
}

func TestCallAlignFallsBackToAudioTranscribeCapability(t *testing.T) {
	testCallAlignUsesCapability(t, CapabilityFamilyAudioGeneration)
}

func TestCallAudioGenerateUsesCapabilityWithCurrentUserContext(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-audio-output.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterLocal,
		DisplayName: "Local audio",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	createAudioCatalogRoute(t, db, cred.ID, "logical-music", "provider-music", AudioOperationMusicGeneration)

	provider := &audioGenerateProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-music", Capability: CapabilityFamilyAudioGeneration, Operation: AudioOperationMusicGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallAudioGenerateWithRouteUsage(context.Background(), 42, route, CapabilityFamilyAudioGeneration, media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "quiet piano",
		DurationSec: 3,
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallAudioGenerateWithRouteUsage() error = %v", err)
	}
	if provider.generateCalls != 1 {
		t.Fatalf("generate calls = %d, want 1", provider.generateCalls)
	}
	if provider.userID != 42 {
		t.Fatalf("provider user id = %d, want current user id", provider.userID)
	}
	if provider.model != "provider-music" {
		t.Fatalf("audio model = %q, want provider model override", provider.model)
	}
	if provider.kind != media.AudioGenerationKindMusic {
		t.Fatalf("audio kind = %q, want music", provider.kind)
	}
	if string(resp.Audio) != "audio" || resp.MimeType != "audio/wav" {
		t.Fatalf("response = %#v", resp)
	}
}

func TestCallDubbingUsesDubbingCapabilityWithCurrentUserContext(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-subtitle-translate.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterLocal,
		DisplayName: "Local subtitle translator",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	createAudioCatalogRoute(t, db, cred.ID, "logical-subtitle-translate", "provider-subtitle-translate", AudioOperationDubbing)

	provider := &dubbingProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-subtitle-translate", Capability: CapabilityFamilyAudioGeneration, Operation: AudioOperationDubbing})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallDubbingWithRouteUsage(context.Background(), 42, route, media.DubbingRequest{
		Subtitle:       []byte("1\n00:00:00,000 --> 00:00:01,000\nhello\n"),
		TargetLanguage: "zh-CN",
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallDubbingWithRouteUsage() error = %v", err)
	}
	if provider.translateCalls != 1 {
		t.Fatalf("translate calls = %d, want 1", provider.translateCalls)
	}
	if provider.userID != 42 {
		t.Fatalf("provider user id = %d, want current user id", provider.userID)
	}
	if provider.model != "provider-subtitle-translate" {
		t.Fatalf("dubbing model = %q, want provider model override", provider.model)
	}
	if provider.targetLanguage != "zh-CN" {
		t.Fatalf("target language = %q, want zh-CN", provider.targetLanguage)
	}
	if string(resp.Content) != "translated" {
		t.Fatalf("content = %q, want translated response", string(resp.Content))
	}
}

func TestCallSpeechTranslateUsesSpeechTranslateOperationWithCurrentUserContext(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-speech-translate.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterLocal,
		DisplayName: "Local audio translator",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	createAudioCatalogRoute(t, db, cred.ID, "logical-speech-translate", "provider-speech-translate", AudioOperationSpeechTranslate)

	provider := &speechTranslateProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-speech-translate", Capability: CapabilityFamilyAudioGeneration, Operation: AudioOperationSpeechTranslate})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallSpeechTranslateWithRouteUsage(context.Background(), 42, route, media.SpeechTranslateRequest{
		Audio:          []byte("wav"),
		MimeType:       "audio/wav",
		TargetLanguage: "en",
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallSpeechTranslateWithRouteUsage() error = %v", err)
	}
	if provider.translateCalls != 1 {
		t.Fatalf("translate calls = %d, want 1", provider.translateCalls)
	}
	if provider.userID != 42 {
		t.Fatalf("provider user id = %d, want current user id", provider.userID)
	}
	if provider.model != "provider-speech-translate" {
		t.Fatalf("speech translate model = %q, want provider model override", provider.model)
	}
	if provider.targetLanguage != "en" {
		t.Fatalf("target language = %q, want en", provider.targetLanguage)
	}
	if string(resp.Content) != "translated audio" {
		t.Fatalf("content = %q, want translated audio response", string(resp.Content))
	}
}

func TestCallVoiceProfileUsesVoiceCapabilitiesWithCurrentUserContext(t *testing.T) {
	for _, tc := range []struct {
		name      string
		operation string
	}{
		{name: "clone", operation: AudioOperationVoiceClone},
		{name: "design", operation: AudioOperationVoiceDesign},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.OpenSQLite(t, "ai-call-voice-"+tc.name+".db",
				&persistencemodel.AICredential{},
				&persistencemodel.AIModelCatalogEntry{},
				&persistencemodel.AIModelRouteBinding{},
				&persistencemodel.UsageReservation{},
				&persistencemodel.UsageLog{},
			)
			cred := persistencemodel.AICredential{
				AdapterType: AdapterLocal,
				DisplayName: "Local voice",
				IsEnabled:   true,
			}
			if err := db.Create(&cred).Error; err != nil {
				t.Fatalf("create credential: %v", err)
			}
			createAudioCatalogRoute(t, db, cred.ID, "logical-"+tc.name, "provider-"+tc.name, tc.operation)

			provider := &voiceProfileProbeProvider{}
			registry := NewRegistry(db, nil)
			registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
				return provider, nil
			}
			service := NewAIService(db, registry)
			route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-" + tc.name, Capability: CapabilityFamilyAudioGeneration, Operation: tc.operation})
			if err != nil {
				t.Fatalf("ResolveModelRoute() error = %v", err)
			}
			if tc.operation == AudioOperationVoiceClone {
				_, err = service.CallVoiceCloneWithRouteUsage(context.Background(), 42, route, media.VoiceCloneRequest{
					Name:    "Clone",
					Samples: []media.VoiceCloneSample{{Audio: []byte("wav"), MimeType: "audio/wav"}},
				}, UsageContext{})
			} else {
				_, err = service.CallVoiceDesignWithRouteUsage(context.Background(), 42, route, media.VoiceDesignRequest{
					Name:        "Design",
					Description: "Warm calm voice",
				}, UsageContext{})
			}
			if err != nil {
				t.Fatalf("voice call error = %v", err)
			}
			if provider.userID != 42 {
				t.Fatalf("provider user id = %d, want 42", provider.userID)
			}
			if provider.model != "provider-"+tc.name {
				t.Fatalf("model = %q, want provider model id", provider.model)
			}
			if tc.operation == AudioOperationVoiceClone && provider.cloneCalls != 1 {
				t.Fatalf("clone calls = %d, want 1", provider.cloneCalls)
			}
			if tc.operation == AudioOperationVoiceDesign && provider.designCalls != 1 {
				t.Fatalf("design calls = %d, want 1", provider.designCalls)
			}
		})
	}
}

func testCallAlignUsesCapability(t *testing.T, capability string) {
	t.Helper()
	db := testutil.OpenSQLite(t, "ai-call-align-"+capability+".db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "OpenAI subtitle",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	createAudioCatalogRoute(t, db, cred.ID, "logical-align", "provider-align", AudioOperationForcedAlignment)

	provider := &alignProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-align", Capability: capability, Operation: AudioOperationForcedAlignment})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallAlignWithRouteUsage(context.Background(), 42, route, media.AlignRequest{
		Audio:    []byte("wav"),
		MimeType: "audio/wav",
		Script:   "hello world",
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallAlignWithRouteUsage() error = %v", err)
	}
	if provider.alignCalls != 1 {
		t.Fatalf("align calls = %d, want 1", provider.alignCalls)
	}
	if provider.userID != 42 {
		t.Fatalf("provider user id = %d, want current user id", provider.userID)
	}
	if provider.model != "provider-align" {
		t.Fatalf("align model = %q, want provider model override", provider.model)
	}
	if string(resp.Content) != "aligned" {
		t.Fatalf("content = %q, want aligned response", string(resp.Content))
	}
}

func createAudioCatalogRoute(t *testing.T, db *gorm.DB, credentialID uint, publicModelID, providerModelID, operation string) {
	t.Helper()
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("audio route test unexpectedly created legacy ai_model_configs table")
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         publicModelID,
		DisplayName:           publicModelID,
		Capabilities:          CapabilityFamilyAudioGeneration,
		IsEnabled:             true,
		ModelCapabilitiesJSON: testStructuredAudioCapabilityJSON(operation),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		AdapterType:     AdapterLocal,
		ProviderModelID: providerModelID,
		CredentialID:    &credentialID,
		CapacityWeight:  1,
		IsEnabled:       true}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
}

func testStructuredAudioCapabilityJSON(operation string) string {
	return fmt.Sprintf(`{"audio_generation":{"operations":[%q]}}`, operation)
}

type alignProbeProvider struct {
	alignCalls int
	userID     uint
	model      string
}

func (p *alignProbeProvider) Ping(context.Context) error { return nil }

func (p *alignProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *alignProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *alignProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *alignProbeProvider) Synthesize(context.Context, media.TTSRequest) (media.TTSResponse, error) {
	return media.TTSResponse{}, fmt.Errorf("tts should not be called")
}

func (p *alignProbeProvider) Transcribe(context.Context, media.TranscribeRequest) (media.SubtitleResponse, error) {
	return media.SubtitleResponse{}, fmt.Errorf("transcribe should not be called")
}

func (p *alignProbeProvider) Align(ctx context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	p.alignCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	return media.SubtitleResponse{
		Timing:  media.TimingMetadata{Source: media.TimingSourceForcedAlignment},
		Format:  "json",
		Content: []byte("aligned"),
	}, nil
}

type audioGenerateProbeProvider struct {
	generateCalls int
	userID        uint
	model         string
	kind          media.AudioGenerationKind
}

func (p *audioGenerateProbeProvider) Ping(context.Context) error { return nil }

func (p *audioGenerateProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *audioGenerateProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *audioGenerateProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *audioGenerateProbeProvider) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	p.generateCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	p.kind = req.Kind
	return media.AudioGenerationResponse{Audio: []byte("audio"), MimeType: "audio/wav", DurationMs: req.DurationSec * 1000}, nil
}

type dubbingProbeProvider struct {
	translateCalls int
	userID         uint
	model          string
	targetLanguage string
}

func (p *dubbingProbeProvider) Ping(context.Context) error { return nil }

func (p *dubbingProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *dubbingProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *dubbingProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *dubbingProbeProvider) GenerateDubbing(ctx context.Context, req media.DubbingRequest) (media.SubtitleResponse, error) {
	p.translateCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	p.targetLanguage = req.TargetLanguage
	return media.SubtitleResponse{Content: []byte("translated"), MimeType: "text/plain", Format: "txt"}, nil
}

type speechTranslateProbeProvider struct {
	translateCalls int
	userID         uint
	model          string
	targetLanguage string
}

func (p *speechTranslateProbeProvider) Ping(context.Context) error { return nil }

func (p *speechTranslateProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *speechTranslateProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *speechTranslateProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *speechTranslateProbeProvider) TranslateSpeech(ctx context.Context, req media.SpeechTranslateRequest) (media.SubtitleResponse, error) {
	p.translateCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	p.targetLanguage = req.TargetLanguage
	return media.SubtitleResponse{Content: []byte("translated audio"), MimeType: "text/plain", Format: "txt"}, nil
}

type voiceProfileProbeProvider struct {
	cloneCalls  int
	designCalls int
	userID      uint
	model       string
}

func (p *voiceProfileProbeProvider) Ping(context.Context) error { return nil }

func (p *voiceProfileProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *voiceProfileProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *voiceProfileProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *voiceProfileProbeProvider) CloneVoice(ctx context.Context, req media.VoiceCloneRequest) (media.VoiceProfileResponse, error) {
	p.cloneCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	return media.VoiceProfileResponse{VoiceID: "voice_clone_1", Name: req.Name}, nil
}

func (p *voiceProfileProbeProvider) DesignVoice(ctx context.Context, req media.VoiceDesignRequest) (media.VoiceProfileResponse, error) {
	p.designCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	return media.VoiceProfileResponse{VoiceID: "voice_design_1", Name: req.Name}, nil
}

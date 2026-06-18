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
	testCallAlignUsesCapability(t, CapabilitySubAlign)
}

func TestCallAlignFallsBackToAudioTranscribeCapability(t *testing.T) {
	testCallAlignUsesCapability(t, CapabilityAudioSTT)
}

func TestCallAudioGenerateUsesCapabilityWithCurrentUserContext(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-audio-generate.db",
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
	createAudioCatalogRoute(t, db, cred.ID, "logical-music", "provider-music", CapabilityAudioMusic)

	provider := &audioGenerateProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-music", Capability: CapabilityAudioMusic})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallAudioGenerateWithRouteUsage(context.Background(), 42, route, CapabilityAudioMusic, media.AudioGenerationRequest{
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

func TestCallSubtitleTranslateUsesSubtitleTranslateCapabilityWithCurrentUserContext(t *testing.T) {
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
	createAudioCatalogRoute(t, db, cred.ID, "logical-subtitle-translate", "provider-subtitle-translate", CapabilitySubTranslate)

	provider := &subtitleTranslateProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-subtitle-translate", Capability: CapabilitySubTranslate})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallSubtitleTranslateWithRouteUsage(context.Background(), 42, route, media.TranslateSubtitleRequest{
		Subtitle:       []byte("1\n00:00:00,000 --> 00:00:01,000\nhello\n"),
		TargetLanguage: "zh-CN",
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallSubtitleTranslateWithRouteUsage() error = %v", err)
	}
	if provider.translateCalls != 1 {
		t.Fatalf("translate calls = %d, want 1", provider.translateCalls)
	}
	if provider.userID != 42 {
		t.Fatalf("provider user id = %d, want current user id", provider.userID)
	}
	if provider.model != "provider-subtitle-translate" {
		t.Fatalf("subtitle translate model = %q, want provider model override", provider.model)
	}
	if provider.targetLanguage != "zh-CN" {
		t.Fatalf("target language = %q, want zh-CN", provider.targetLanguage)
	}
	if string(resp.Content) != "translated" {
		t.Fatalf("content = %q, want translated response", string(resp.Content))
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
	createAudioCatalogRoute(t, db, cred.ID, "logical-align", "provider-align", capability)

	provider := &alignProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}
	service := NewAIService(db, registry)
	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "logical-align", Capability: capability})
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

func createAudioCatalogRoute(t *testing.T, db *gorm.DB, credentialID uint, publicModelID, providerModelID, capability string) {
	t.Helper()
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("audio route test unexpectedly created legacy ai_model_configs table")
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: publicModelID,
		DisplayName:   publicModelID,
		Capabilities:  capability,
		PricingMode:   string(PricingPerCall),
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderModelID: providerModelID,
		CredentialID:    &credentialID,
		CapacityWeight:  1,
		IsEnabled:       true,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
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
		Timing:  media.TimingMetadata{Source: media.TimingSourceForcedAlign},
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

type subtitleTranslateProbeProvider struct {
	translateCalls int
	userID         uint
	model          string
	targetLanguage string
}

func (p *subtitleTranslateProbeProvider) Ping(context.Context) error { return nil }

func (p *subtitleTranslateProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *subtitleTranslateProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *subtitleTranslateProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *subtitleTranslateProbeProvider) TranslateSubtitle(ctx context.Context, req media.TranslateSubtitleRequest) (media.SubtitleResponse, error) {
	p.translateCalls++
	p.userID = providerUserIDFromContext(ctx)
	p.model = req.Model
	p.targetLanguage = req.TargetLanguage
	return media.SubtitleResponse{Content: []byte("translated"), MimeType: "text/plain", Format: "txt"}, nil
}

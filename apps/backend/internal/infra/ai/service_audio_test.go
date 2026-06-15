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

func testCallAlignUsesCapability(t *testing.T, capability string) {
	t.Helper()
	db := testutil.OpenSQLite(t, "ai-call-align.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: AdapterOpenAICompat,
		DisplayName: "OpenAI subtitle",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:              gorm.Model{ID: 11},
		CredentialID:       cred.ID,
		ModelDefID:         "logical-align",
		ModelIDOverride:    "provider-align",
		CustomCapabilities: capability,
		IsEnabled:          true,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}

	provider := &alignProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return provider, nil
	}

	resp, err := NewAIService(db, registry).CallAlign(context.Background(), 42, cfg.ID, media.AlignRequest{
		Audio:    []byte("wav"),
		MimeType: "audio/wav",
		Script:   "hello world",
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallAlign() error = %v", err)
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

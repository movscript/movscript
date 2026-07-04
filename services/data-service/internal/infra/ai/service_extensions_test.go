package ai

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

type extensionRouteProbeProvider struct {
	embeddingModel    string
	embeddingProfile  string
	rerankModel       string
	rerankProfile     string
	moderationModel   string
	moderationProfile string
	realtimeModel     string
	realtimeProfile   string
	realtimeSession   RealtimeSession
}

func (p *extensionRouteProbeProvider) Ping(context.Context) error { return nil }

func (p *extensionRouteProbeProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("text should not be called")
}

func (p *extensionRouteProbeProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("image should not be called")
}

func (p *extensionRouteProbeProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("video should not be called")
}

func (p *extensionRouteProbeProvider) Synthesize(context.Context, media.TTSRequest) (media.TTSResponse, error) {
	return media.TTSResponse{}, fmt.Errorf("tts should not be called")
}

func (p *extensionRouteProbeProvider) CreateEmbeddings(_ context.Context, req EmbeddingRequest) (EmbeddingResponse, error) {
	p.embeddingModel = req.Model
	p.embeddingProfile = req.ProtocolProfile
	return EmbeddingResponse{
		Model: req.Model,
		Data:  []EmbeddingVector{{Index: 0, Embedding: []float32{0.1, 0.2}}},
		Usage: TokenUsage{InputTokens: 3},
	}, nil
}

func (p *extensionRouteProbeProvider) Rerank(_ context.Context, req RerankRequest) (RerankResponse, error) {
	p.rerankModel = req.Model
	p.rerankProfile = req.ProtocolProfile
	return RerankResponse{ID: "rerank-1", Results: []RerankResult{{Index: 0, RelevanceScore: 0.9}}}, nil
}

func (p *extensionRouteProbeProvider) Moderate(_ context.Context, req ModerationRequest) (ModerationResponse, error) {
	p.moderationModel = req.Model
	p.moderationProfile = req.ProtocolProfile
	return ModerationResponse{ID: "mod-1", Model: req.Model, Results: []ModerationResult{{Flagged: false}}}, nil
}

func (p *extensionRouteProbeProvider) ConnectRealtime(_ context.Context, req RealtimeSessionRequest) (RealtimeSession, error) {
	p.realtimeModel = req.Model
	p.realtimeProfile = req.ProtocolProfile
	if p.realtimeSession != nil {
		return p.realtimeSession, nil
	}
	return noopRealtimeSession{}, nil
}

func TestAIServiceExtensionRoutesUseProviderModelID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-service-extension-routes.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	probe := &extensionRouteProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return probe, nil
	}
	service := NewAIService(db, registry)

	embeddingRoute := createExtensionRoute(t, db, "embed-public", "embed-provider-v2", CapabilityFamilyEmbedding, NewAPIProfileOpenAIEmbeddings)
	embeddingResp, err := service.CallEmbeddingWithRouteUsage(context.Background(), 1, embeddingRoute, EmbeddingRequest{Inputs: []string{"hello"}}, UsageContext{})
	if err != nil {
		t.Fatalf("CallEmbeddingWithRouteUsage() error = %v", err)
	}
	if probe.embeddingModel != "embed-provider-v2" || probe.embeddingProfile != NewAPIProfileOpenAIEmbeddings || embeddingResp.Model != "embed-provider-v2" {
		t.Fatalf("embedding model/profile = %q/%q response=%#v, want provider model id and profile", probe.embeddingModel, probe.embeddingProfile, embeddingResp)
	}

	rerankRoute := createExtensionRoute(t, db, "rerank-public", "rerank-provider-v2", CapabilityFamilyRerank, NewAPIProfileRerank)
	rerankResp, err := service.CallRerankWithRouteUsage(context.Background(), 1, rerankRoute, RerankRequest{
		Query:     "query",
		Documents: []RerankDocument{{Text: "doc"}},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallRerankWithRouteUsage() error = %v", err)
	}
	if probe.rerankModel != "rerank-provider-v2" || probe.rerankProfile != NewAPIProfileRerank || rerankResp.ID != "rerank-1" {
		t.Fatalf("rerank model/profile = %q/%q response=%#v, want provider model id and profile", probe.rerankModel, probe.rerankProfile, rerankResp)
	}

	moderationRoute := createExtensionRoute(t, db, "mod-public", "mod-provider-v2", CapabilityFamilyModeration, NewAPIProfileOpenAIModerations)
	moderationResp, err := service.CallModerationWithRouteUsage(context.Background(), 1, moderationRoute, ModerationRequest{
		Inputs: []string{"check"},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallModerationWithRouteUsage() error = %v", err)
	}
	if probe.moderationModel != "mod-provider-v2" || probe.moderationProfile != NewAPIProfileOpenAIModerations || moderationResp.Model != "mod-provider-v2" {
		t.Fatalf("moderation model/profile = %q/%q response=%#v, want provider model id and profile", probe.moderationModel, probe.moderationProfile, moderationResp)
	}

	realtimeRoute := createExtensionRoute(t, db, "rt-public", "rt-provider-v2", CapabilityFamilyRealtime, NewAPIProfileOpenAIRealtime)
	session, err := service.ConnectRealtimeWithRoute(context.Background(), 1, realtimeRoute, RealtimeSessionRequest{})
	if err != nil {
		t.Fatalf("ConnectRealtimeWithRoute() error = %v", err)
	}
	_ = session.Close()
	if probe.realtimeModel != "rt-provider-v2" || probe.realtimeProfile != NewAPIProfileOpenAIRealtime {
		t.Fatalf("realtime model/profile = %q/%q, want provider model id and profile", probe.realtimeModel, probe.realtimeProfile)
	}
}

func TestAIServiceRealtimeExchangeAggregatesEventsClosesAndSettlesUsage(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-service-realtime-exchange.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
		&persistencemodel.LLMCallLog{},
		&persistencemodel.AdminSetting{},
	)
	session := &scriptedRealtimeSession{
		events: []RealtimeEvent{
			{"type": "response.text.delta", "delta": "hel"},
			{"type": "response.audio_transcript.delta", "delta": "lo"},
			{"type": "response.audio.delta", "delta": base64.StdEncoding.EncodeToString([]byte("ok")), "audio_mime_type": "audio/pcm"},
			{"type": "response.done", "response": map[string]any{"usage": map[string]any{"input_tokens": 7, "output_tokens": 3}}},
		},
	}
	probe := &extensionRouteProbeProvider{realtimeSession: session}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return probe, nil
	}
	service := NewAIService(db, registry)
	route := createExtensionRoute(t, db, "rt-public", "rt-provider-v2", CapabilityFamilyRealtime)

	resp, err := service.RunRealtimeExchangeWithRouteUsage(context.Background(), 1, route, RealtimeExchangeRequest{
		InitialEvents: []RealtimeEvent{{"type": "response.create", "response": map[string]any{"modalities": []any{"text", "audio"}}}},
		CaptureEvents: true,
		MaxEvents:     10,
		MaxAudioBytes: 8,
	}, UsageContext{})
	if err != nil {
		t.Fatalf("RunRealtimeExchangeWithRouteUsage() error = %v", err)
	}
	if probe.realtimeModel != "rt-provider-v2" {
		t.Fatalf("realtime model = %q, want provider model id", probe.realtimeModel)
	}
	if len(session.sent) != 1 || session.sent[0]["type"] != "response.create" {
		t.Fatalf("sent events = %#v, want initial response.create", session.sent)
	}
	if !session.closed {
		t.Fatalf("realtime session was not closed")
	}
	if resp.Text != "hello" || string(resp.AudioBytes) != "ok" || resp.AudioMimeType != "audio/pcm" {
		t.Fatalf("response content = text %q audio %q mime %q", resp.Text, string(resp.AudioBytes), resp.AudioMimeType)
	}
	if resp.EventCount != 4 || resp.StopEventType != "response.done" || len(resp.Events) != 4 {
		t.Fatalf("event summary = count %d stop %q captured %d", resp.EventCount, resp.StopEventType, len(resp.Events))
	}
	if resp.Usage.InputTokens != 7 || resp.Usage.OutputTokens != 3 {
		t.Fatalf("usage = %#v, want upstream realtime usage", resp.Usage)
	}
	var usageLog persistencemodel.UsageLog
	if err := db.First(&usageLog).Error; err != nil {
		t.Fatalf("read usage log: %v", err)
	}
	if usageLog.OperationType != CapabilityFamilyRealtime || usageLog.InputTokens != 7 || usageLog.OutputTokens != 3 {
		t.Fatalf("usage log = %#v", usageLog)
	}
	var reservation persistencemodel.UsageReservation
	if err := db.First(&reservation).Error; err != nil {
		t.Fatalf("read reservation: %v", err)
	}
	if reservation.Status != ReservationStatusSettled {
		t.Fatalf("reservation status = %q, want settled", reservation.Status)
	}
}

func TestAIServiceRealtimeExchangeClosesAndReleasesReservationOnAudioLimit(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-service-realtime-exchange-limit.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
		&persistencemodel.LLMCallLog{},
		&persistencemodel.AdminSetting{},
	)
	session := &scriptedRealtimeSession{
		events: []RealtimeEvent{{"type": "response.audio.delta", "delta": base64.StdEncoding.EncodeToString([]byte("overflow"))}},
	}
	probe := &extensionRouteProbeProvider{realtimeSession: session}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return probe, nil
	}
	service := NewAIService(db, registry)
	route := createExtensionRoute(t, db, "rt-limit-public", "rt-provider-v2", CapabilityFamilyRealtime)

	_, err := service.RunRealtimeExchangeWithRouteUsage(context.Background(), 1, route, RealtimeExchangeRequest{
		InitialEvents: []RealtimeEvent{{"type": "response.create"}},
		MaxEvents:     4,
		MaxAudioBytes: 2,
	}, UsageContext{})
	if err == nil || !strings.Contains(err.Error(), "max_audio_bytes=2") {
		t.Fatalf("RunRealtimeExchangeWithRouteUsage() error = %v, want audio limit", err)
	}
	if !session.closed {
		t.Fatalf("realtime session was not closed after audio limit")
	}
	var reservation persistencemodel.UsageReservation
	if err := db.First(&reservation).Error; err != nil {
		t.Fatalf("read reservation: %v", err)
	}
	if reservation.Status != ReservationStatusReleased {
		t.Fatalf("reservation status = %q, want released", reservation.Status)
	}
}

func createExtensionRoute(t *testing.T, db *gorm.DB, publicModelID, providerModelID, capability string, protocolProfile ...string) ModelRoute {
	t.Helper()
	profile := ""
	if len(protocolProfile) > 0 {
		profile = strings.TrimSpace(protocolProfile[0])
	}
	cred := persistencemodel.AICredential{
		AdapterType: AdapterNewAPI,
		DisplayName: "New API extension provider",
		BaseURL:     "https://newapi.test/v1",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   publicModelID,
		DisplayName:     publicModelID,
		IsEnabled:       true,
		Capabilities:    capability,
		SupportedParams: testSupportedParamsProfile(capability),
	}
	entry.ModelCapabilitiesJSON = testStructuredCapabilitiesJSON(capability)
	if strings.TrimSpace(entry.ModelCapabilitiesJSON) == "" {
		entry.ModelCapabilitiesJSON = fmt.Sprintf(`{%q:{}}`, capability)
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     AdapterNewAPI,
		ProtocolProfile: profile,
		ProviderModelID: providerModelID,
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	return ModelRoute{
		ModelID:         publicModelID,
		RuntimeModelID:  entry.ID,
		CatalogEntryID:  entry.ID,
		RouteBindingID:  binding.ID,
		CredentialID:    cred.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      binding.ProviderID,
		AdapterType:     AdapterNewAPI,
		ProtocolProfile: profile,
		ProviderModelID: providerModelID,
		Capability:      capability,
	}
}

type scriptedRealtimeSession struct {
	events []RealtimeEvent
	sent   []RealtimeEvent
	closed bool
}

func (s *scriptedRealtimeSession) SendEvent(_ context.Context, event RealtimeEvent) error {
	s.sent = append(s.sent, event)
	return nil
}

func (s *scriptedRealtimeSession) ReceiveEvent(context.Context) (RealtimeEvent, error) {
	if len(s.events) == 0 {
		return nil, io.EOF
	}
	event := s.events[0]
	s.events = s.events[1:]
	return event, nil
}

func (s *scriptedRealtimeSession) Close() error {
	s.closed = true
	return nil
}

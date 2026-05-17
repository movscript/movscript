package ai

import (
	"context"
	"fmt"
	"slices"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRuntimeModelAttemptOrderUsesCapacityWeight(t *testing.T) {
	key := "test.capacity_weight"
	priorityRoundRobinCounters.Delete(key + ":attempts:10")
	runtimeProviderHealth.Delete(uint(101))
	runtimeProviderHealth.Delete(uint(102))
	candidates := []runtimeModelCandidate{
		{
			cfg:      persistencemodel.AIModelConfig{Model: gorm.Model{ID: 101}, ModelDefID: "gpt-5.5", Priority: 10, CapacityWeight: 2},
			priority: 10,
		},
		{
			cfg:      persistencemodel.AIModelConfig{Model: gorm.Model{ID: 102}, ModelDefID: "gpt-5.5", Priority: 10, CapacityWeight: 1},
			priority: 10,
		},
	}

	got := make([]uint, 0, 3)
	for range 3 {
		ordered := runtimeModelAttemptOrder(key, candidates)
		got = append(got, ordered[0].cfg.ID)
	}

	if !slices.Equal(got, []uint{101, 101, 102}) {
		t.Fatalf("weighted first-choice sequence = %#v, want 101/101/102", got)
	}
}

func TestRuntimeModelAttemptOrderAvoidsSaturatedProvider(t *testing.T) {
	key := "test.saturated"
	priorityRoundRobinCounters.Delete(key + ":attempts:10")
	runtimeProviderHealth.Delete(uint(201))
	runtimeProviderHealth.Delete(uint(202))
	finish := beginRuntimeProviderAttempt(201)
	defer finish(nil)
	candidates := []runtimeModelCandidate{
		{
			cfg:      persistencemodel.AIModelConfig{Model: gorm.Model{ID: 201}, ModelDefID: "gpt-5.5", Priority: 10, CapacityWeight: 10, MaxConcurrency: 1},
			priority: 10,
		},
		{
			cfg:      persistencemodel.AIModelConfig{Model: gorm.Model{ID: 202}, ModelDefID: "gpt-5.5", Priority: 10, CapacityWeight: 1},
			priority: 10,
		},
	}

	ordered := runtimeModelAttemptOrder(key, candidates)
	if len(ordered) != 2 || ordered[0].cfg.ID != 202 || ordered[1].cfg.ID != 201 {
		t.Fatalf("saturated order = %#v, want 202 before 201", ordered)
	}
}

func TestCallTextWithUsageFailsOverToNextProviderVariant(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-failover.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	createTextProviderVariant(t, db, 1, "Busy provider")
	createTextProviderVariant(t, db, 2, "Healthy provider")

	calls := map[string]int{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		return failoverTextProvider{
			name:  cred.DisplayName,
			calls: calls,
		}, nil
	}
	svc := NewAIService(db, registry)
	resp, err := svc.CallTextWithUsage(context.Background(), 1, 1, TextRequest{
		Messages: []Message{{Role: "user", Content: "hello"}},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallTextWithUsage() error = %v", err)
	}
	if resp.Content != "ok" {
		t.Fatalf("content = %q, want ok", resp.Content)
	}
	if calls["Busy provider"] != 1 || calls["Healthy provider"] != 1 {
		t.Fatalf("provider calls = busy:%d healthy:%d, want 1/1", calls["Busy provider"], calls["Healthy provider"])
	}

	resp, err = svc.CallTextWithUsage(context.Background(), 1, 1, TextRequest{
		Messages: []Message{{Role: "user", Content: "hello again"}},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("second CallTextWithUsage() error = %v", err)
	}
	if resp.Content != "ok" {
		t.Fatalf("second content = %q, want ok", resp.Content)
	}
	if calls["Busy provider"] != 1 || calls["Healthy provider"] != 2 {
		t.Fatalf("provider calls after cooldown-aware order = busy:%d healthy:%d, want 1/2", calls["Busy provider"], calls["Healthy provider"])
	}
	health, err := RuntimeProviderHealthSnapshot(db)
	if err != nil {
		t.Fatalf("RuntimeProviderHealthSnapshot() error = %v", err)
	}
	if len(health) != 2 {
		t.Fatalf("health item count = %d, want 2: %#v", len(health), health)
	}
	busy := findProviderHealth(health, 1)
	healthy := findProviderHealth(health, 2)
	if busy == nil || healthy == nil {
		t.Fatalf("missing health rows: %#v", health)
	}
	if !busy.CircuitOpen || busy.Failures != 1 || busy.ConsecutiveFailures != 1 || busy.CooldownRemainingMs <= 0 {
		t.Fatalf("busy provider health = %#v, want open circuit with one failure", busy)
	}
	if healthy.CircuitOpen || healthy.Successes != 2 || healthy.Failures != 0 {
		t.Fatalf("healthy provider health = %#v, want closed circuit with two successes", healthy)
	}

	var reservation persistencemodel.UsageReservation
	if err := db.First(&reservation).Error; err != nil {
		t.Fatalf("load reservation: %v", err)
	}
	if reservation.AIModelConfigID != 2 || reservation.Status != ReservationStatusSettled {
		t.Fatalf("reservation = model_config_id:%d status:%s, want 2/%s", reservation.AIModelConfigID, reservation.Status, ReservationStatusSettled)
	}
	var usage persistencemodel.UsageLog
	if err := db.First(&usage).Error; err != nil {
		t.Fatalf("load usage: %v", err)
	}
	if usage.AIModelConfigID != 2 || usage.InputTokens != 3 || usage.OutputTokens != 2 {
		t.Fatalf("usage = model_config_id:%d input:%d output:%d, want 2/3/2", usage.AIModelConfigID, usage.InputTokens, usage.OutputTokens)
	}
}

func TestCallTextStreamWithUsageFailsOverBeforeStreamStarts(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-stream-failover.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	createTextProviderVariant(t, db, 1, "Busy provider")
	createTextProviderVariant(t, db, 2, "Healthy provider")

	calls := map[string]int{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		return failoverTextProvider{
			name:  cred.DisplayName,
			calls: calls,
		}, nil
	}
	svc := NewAIService(db, registry)
	stream, err := svc.CallTextStreamWithUsage(context.Background(), 1, 1, TextRequest{
		Messages: []Message{{Role: "user", Content: "hello"}},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallTextStreamWithUsage() error = %v", err)
	}
	var content string
	for event := range stream {
		content += event.ContentDelta
	}
	if content != "ok" {
		t.Fatalf("stream content = %q, want ok", content)
	}
	if calls["Busy provider"] != 1 || calls["Healthy provider"] != 1 {
		t.Fatalf("provider calls = busy:%d healthy:%d, want 1/1", calls["Busy provider"], calls["Healthy provider"])
	}
}

func TestCallImageWithUsageFailsOverToNextProviderVariant(t *testing.T) {
	priorityRoundRobinCounters.Delete("service.runtime_model:image:gpt-image-1:attempts:10")
	runtimeProviderHealth.Delete(uint(1))
	runtimeProviderHealth.Delete(uint(2))
	db := testutil.OpenSQLite(t, "ai-image-failover.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	createProviderVariant(t, db, 1, "Busy provider", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "Healthy provider", "gpt-image-1", 10)

	calls := map[string]int{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		return failoverImageProvider{
			name:  cred.DisplayName,
			calls: calls,
		}, nil
	}
	svc := NewAIService(db, registry)
	resp, err := svc.CallImageWithUsage(context.Background(), 1, 1, ImageRequest{Prompt: "draw"}, UsageContext{})
	if err != nil {
		t.Fatalf("CallImageWithUsage() error = %v", err)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "mem://image.png" {
		t.Fatalf("image URLs = %#v, want mem://image.png", resp.URLs)
	}
	if calls["Busy provider"] != 1 || calls["Healthy provider"] != 1 {
		t.Fatalf("provider calls = busy:%d healthy:%d, want 1/1", calls["Busy provider"], calls["Healthy provider"])
	}
}

func findProviderHealth(items []RuntimeProviderHealth, modelConfigID uint) *RuntimeProviderHealth {
	for i := range items {
		if items[i].ModelConfigID == modelConfigID {
			return &items[i]
		}
	}
	return nil
}

func resetFailoverTestState() {
	priorityRoundRobinCounters.Delete("service.runtime_model:text:gpt-5.5:attempts:10")
	runtimeProviderHealth.Delete(uint(1))
	runtimeProviderHealth.Delete(uint(2))
}

func createTextProviderVariant(t *testing.T, db *gorm.DB, id uint, providerName string) {
	t.Helper()
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: id},
		AdapterType: AdapterOpenAICompat,
		DisplayName: providerName,
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:              gorm.Model{ID: id},
		CredentialID:       cred.ID,
		ModelDefID:         "gpt-5.5",
		IsEnabled:          true,
		Priority:           10,
		CustomDisplayName:  "GPT 5.5",
		CustomCapabilities: CapabilityText,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
}

type failoverTextProvider struct {
	name  string
	calls map[string]int
}

func (p failoverTextProvider) Ping(context.Context) error { return nil }

func (p failoverTextProvider) TextGenerate(_ context.Context, req TextRequest) (TextResponse, error) {
	p.calls[p.name]++
	if req.Model != "gpt-5.5" {
		return TextResponse{}, fmt.Errorf("model = %q, want gpt-5.5", req.Model)
	}
	if p.name == "Busy provider" {
		return TextResponse{}, fmt.Errorf("provider busy")
	}
	return TextResponse{
		Content: "ok",
		Usage:   TokenUsage{InputTokens: 3, OutputTokens: 2},
	}, nil
}

func (p failoverTextProvider) TextStream(_ context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	p.calls[p.name]++
	if req.Model != "gpt-5.5" {
		return nil, fmt.Errorf("model = %q, want gpt-5.5", req.Model)
	}
	if p.name == "Busy provider" {
		return nil, fmt.Errorf("provider busy")
	}
	ch := make(chan TextStreamEvent, 1)
	ch <- TextStreamEvent{ContentDelta: "ok", Usage: TokenUsage{InputTokens: 3, OutputTokens: 2}}
	close(ch)
	return ch, nil
}

func (p failoverTextProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("not implemented")
}

func (p failoverTextProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("not implemented")
}

type failoverImageProvider struct {
	name  string
	calls map[string]int
}

func (p failoverImageProvider) Ping(context.Context) error { return nil }

func (p failoverImageProvider) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("not implemented")
}

func (p failoverImageProvider) ImageGenerate(_ context.Context, req ImageRequest) (ImageResponse, error) {
	p.calls[p.name]++
	if req.Model != "gpt-image-1" {
		return ImageResponse{}, fmt.Errorf("model = %q, want gpt-image-1", req.Model)
	}
	if p.name == "Busy provider" {
		return ImageResponse{}, fmt.Errorf("provider busy")
	}
	return ImageResponse{URLs: []string{"mem://image.png"}}, nil
}

func (p failoverImageProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("not implemented")
}

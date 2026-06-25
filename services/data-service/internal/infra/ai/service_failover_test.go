package ai

import (
	"context"
	"fmt"
	"slices"
	"strings"
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
			id:             101,
			priority:       10,
			capacityWeight: 2,
		},
		{
			id:             102,
			priority:       10,
			capacityWeight: 1,
		},
	}

	got := make([]uint, 0, 3)
	for range 3 {
		ordered := runtimeModelAttemptOrder(key, candidates)
		got = append(got, ordered[0].id)
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
			id:             201,
			priority:       10,
			capacityWeight: 10,
			maxConcurrency: 1,
		},
		{
			id:             202,
			priority:       10,
			capacityWeight: 1,
		},
	}

	ordered := runtimeModelAttemptOrder(key, candidates)
	if len(ordered) != 2 || ordered[0].id != 202 || ordered[1].id != 201 {
		t.Fatalf("saturated order = %#v, want 202 before 201", ordered)
	}
}

func TestCallResponsesWithRouteUsageFallsBackToChatWhenProviderResponsesFails(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-responses-chat-fallback.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Chat fallback provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "gpt-5.2",
		DisplayName:   "gpt-5.2",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:     fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	calls := map[string]int{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		return responsesFallbackProvider{
			name:  cred.DisplayName,
			calls: calls,
		}, nil
	}
	svc := NewAIService(db, registry)
	route, err := svc.ResolveModelRoute(ModelRouteRequest{ModelID: "gpt-5.2", Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := svc.CallResponsesWithRouteUsage(context.Background(), 1, route, ResponsesRequest{
		Text: TextRequest{
			Messages: []Message{{Role: "user", Content: "hello"}},
		},
	}, UsageContext{})
	if err != nil {
		t.Fatalf("CallResponsesWithRouteUsage() error = %v", err)
	}
	if resp.Content != "chat fallback ok" {
		t.Fatalf("content = %q, want chat fallback ok", resp.Content)
	}
	if calls["responses"] != 1 || calls["chat"] != 1 {
		t.Fatalf("calls = %#v, want one responses attempt and one chat fallback", calls)
	}
}

func resetFailoverTestState() {
	priorityRoundRobinCounters.Delete("service.runtime_model:text:gpt-5.2:attempts:10")
	runtimeProviderHealth.Delete(uint(1))
	runtimeProviderHealth.Delete(uint(2))
}

func createTextProviderVariant(t *testing.T, db *gorm.DB, id uint, providerName string) {
	createProviderVariant(t, db, id, providerName, "gpt-5.2", 10, CapabilityText)
}

func createProviderVariant(t *testing.T, db *gorm.DB, id uint, providerName string, modelDefID string, priority int, capabilities ...string) {
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
	if db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) && db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		entry := persistencemodel.AIModelCatalogEntry{
			Model:         gorm.Model{ID: id},
			PublicModelID: modelDefID,
			DisplayName:   modelDefID,
			IsEnabled:     true,
			Capabilities:  strings.Join(capabilities, ","),
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry: %v", err)
		}
		route := persistencemodel.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
			ProviderID:     fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
			CredentialID:   &cred.ID,
			IsEnabled:      true,
			Priority:       priority,
			CapacityWeight: 1,
		}
		if err := db.Create(&route).Error; err != nil {
			t.Fatalf("create route binding: %v", err)
		}
	}
}

type responsesFallbackProvider struct {
	name  string
	calls map[string]int
}

func (p responsesFallbackProvider) Ping(context.Context) error { return nil }

func (p responsesFallbackProvider) TextGenerate(_ context.Context, req TextRequest) (TextResponse, error) {
	p.calls["chat"]++
	if req.Model != "gpt-5.2" {
		return TextResponse{}, fmt.Errorf("model = %q, want gpt-5.2", req.Model)
	}
	return TextResponse{
		Content: "chat fallback ok",
		Usage:   TokenUsage{InputTokens: 3, OutputTokens: 2},
	}, nil
}

func (p responsesFallbackProvider) ResponsesGenerate(context.Context, ResponsesRequest) (TextResponse, error) {
	p.calls["responses"]++
	return TextResponse{}, fmt.Errorf("responses endpoint unsupported")
}

func (p responsesFallbackProvider) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("not implemented")
}

func (p responsesFallbackProvider) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("not implemented")
}

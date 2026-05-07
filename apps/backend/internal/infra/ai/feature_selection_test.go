package ai

import (
	"path/filepath"
	"slices"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSelectFeatureModelPrefersDefaultModel(t *testing.T) {
	defaultID := uint(2)
	cfg, modelID, ok := selectFeatureModel("test.prefers_default", []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "high-priority", Priority: 100},
			def:      ResolveModelDef("high-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 100,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "default-model", ModelIDOverride: "override-model", Priority: 1, Model: gormModel(2)},
			def:      ResolveModelDef("default-model", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 1,
		},
	}, &defaultID)

	if !ok {
		t.Fatal("expected selected model")
	}
	if cfg.cfg.ModelDefID != "default-model" {
		t.Fatalf("selected model = %q, want default-model", cfg.cfg.ModelDefID)
	}
	if modelID != "override-model" {
		t.Fatalf("model ID = %q, want override-model", modelID)
	}
}

func gormModel(id uint) gorm.Model {
	return gorm.Model{ID: id}
}

func TestSelectFeatureModelFallsBackToPriorityWhenDefaultMissing(t *testing.T) {
	defaultID := uint(9)
	cfg, _, ok := selectFeatureModel("test.fallback_priority", []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "low-priority", Priority: 1},
			def:      ResolveModelDef("low-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 1,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "high-priority", Priority: 10},
			def:      ResolveModelDef("high-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
	}, &defaultID)

	if !ok {
		t.Fatal("expected selected model")
	}
	if cfg.cfg.ModelDefID != "high-priority" {
		t.Fatalf("selected model = %q, want high-priority", cfg.cfg.ModelDefID)
	}
}

func TestSelectFeatureModelRoundRobinsEqualPriority(t *testing.T) {
	candidates := []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "alpha", Priority: 10},
			def:      ResolveModelDef("alpha", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "beta", Priority: 10},
			def:      ResolveModelDef("beta", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
	}

	got := make([]string, 0, 4)
	for range 4 {
		cfg, _, ok := selectFeatureModel("test.round_robin", candidates, nil)
		if !ok {
			t.Fatal("expected selected model")
		}
		got = append(got, cfg.cfg.ModelDefID)
	}

	if !slices.Equal(got, []string{"alpha", "beta", "alpha", "beta"}) {
		t.Fatalf("round robin sequence = %#v, want alpha/beta alternating", got)
	}
}

func TestGetModelsByCapabilityMergesProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)
	createProviderVariant(t, db, 3, "Other", "other-image", 5)

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("logical model count = %d, want 2: %#v", len(models), models)
	}
	if models[0].LogicalModelID != "gpt-image-1" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("unexpected merged model: %#v", models[0])
	}
}

func TestGetProviderModelsByCapabilityKeepsProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetProviderModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("provider variant count = %d, want 2", len(models))
	}
	if models[0].ProviderName == "" || models[1].ProviderName == "" {
		t.Fatalf("provider variants should expose provider names: %#v", models)
	}
}

func TestResolveRuntimeModelConfigRoundRobinsLogicalProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)

	svc := NewAIService(db, NewRegistry(db, nil))
	got := make([]uint, 0, 4)
	for range 4 {
		id, err := svc.ResolveRuntimeModelConfig(1, CapabilityImage)
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
	}
	if !slices.Equal(got, []uint{1, 2, 1, 2}) {
		t.Fatalf("runtime provider sequence = %#v, want 1/2 alternating", got)
	}
}

func openAITestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "ai.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.AICredential{}, &model.AIModelConfig{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	return db
}

func createProviderVariant(t *testing.T, db *gorm.DB, id uint, providerName, modelID string, priority int) {
	t.Helper()
	cred := model.AICredential{
		Model:       gormModel(id),
		AdapterType: AdapterOpenAICompat,
		DisplayName: providerName,
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := model.AIModelConfig{
		Model:              gormModel(id),
		CredentialID:       cred.ID,
		ModelDefID:         modelID,
		IsEnabled:          true,
		Priority:           priority,
		CustomDisplayName:  modelID,
		CustomCapabilities: CapabilityImage,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
}

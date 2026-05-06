package ai

import (
	"slices"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
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

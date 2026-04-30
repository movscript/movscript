package ai

import (
	"testing"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func TestSelectFeatureModelPrefersDefaultModel(t *testing.T) {
	defaultID := uint(2)
	cfg, modelID, ok := selectFeatureModel([]featureModelCandidate{
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
	cfg, _, ok := selectFeatureModel([]featureModelCandidate{
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

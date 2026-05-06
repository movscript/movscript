package dto

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func TestProjectUpdateInputDoesNotOverwriteServerOwnedFields(t *testing.T) {
	project := model.Project{
		Model:   gorm.Model{ID: 10},
		OwnerID: 20,
		Status:  "planning",
	}

	ApplyProjectUpdate(&project, ProjectUpdateInput{
		Name:          "new name",
		Description:   "new description",
		TotalEpisodes: 12,
	})

	if project.ID != 10 {
		t.Fatalf("ID = %d, want 10", project.ID)
	}
	if project.OwnerID != 20 {
		t.Fatalf("OwnerID = %d, want 20", project.OwnerID)
	}
	if project.Status != "planning" {
		t.Fatalf("Status = %q, want planning", project.Status)
	}
}

func TestScriptPatchUpdatesWhitelistClientFields(t *testing.T) {
	updates := ScriptPatchUpdates(map[string]any{
		"id":                      float64(99),
		"project_id":              float64(88),
		"author_id":               float64(77),
		"review_status":           "approved",
		"status":                  "done",
		"deleted_at":              "2026-04-29T00:00:00Z",
		"title":                   "allowed title",
		"content":                 "allowed content",
		"assignee_id":             float64(55),
		"character_profiles":      `[{"name":"old"}]`,
		"character_relationships": `[{"source":"c1","target":"c2"}]`,
		"core_settings":           "episode rule",
		"background":              "old background",
		"scenes_desc":             `["old scene"]`,
	})

	for _, forbidden := range []string{"id", "project_id", "author_id", "review_status", "status", "deleted_at", "character_profiles", "character_relationships", "background", "scenes_desc"} {
		if _, ok := updates[forbidden]; ok {
			t.Fatalf("forbidden field %q was included in updates: %#v", forbidden, updates)
		}
	}
	if updates["title"] != "allowed title" || updates["content"] != "allowed content" || updates["assignee_id"] != float64(55) || updates["core_settings"] != "episode rule" {
		t.Fatalf("expected allowed fields to survive, got %#v", updates)
	}
}

func TestAIModelConfigInputDoesNotMoveCredential(t *testing.T) {
	cfg := model.AIModelConfig{
		Model:        gorm.Model{ID: 5},
		CredentialID: 10,
		ModelDefID:   "old-model",
		IsEnabled:    true,
	}
	enabled := false

	ApplyAIModelConfigInput(&cfg, AIModelConfigInput{
		ModelDefID:         "new-model",
		IsEnabled:          &enabled,
		CustomCapabilities: "text",
	})

	if cfg.ID != 5 {
		t.Fatalf("ID = %d, want 5", cfg.ID)
	}
	if cfg.CredentialID != 10 {
		t.Fatalf("CredentialID = %d, want 10", cfg.CredentialID)
	}
	if cfg.ModelDefID != "new-model" || cfg.IsEnabled {
		t.Fatalf("expected mutable model fields to update, got %#v", cfg)
	}
}

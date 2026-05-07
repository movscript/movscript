package dto

import "testing"

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

	for _, forbidden := range []string{"id", "project_id", "author_id", "review_status", "status", "deleted_at", "character_profiles"} {
		if _, ok := updates[forbidden]; ok {
			t.Fatalf("forbidden field %q was included in updates: %#v", forbidden, updates)
		}
	}
	if updates["title"] != "allowed title" ||
		updates["content"] != "allowed content" ||
		updates["assignee_id"] != float64(55) ||
		updates["character_relationships"] != `[{"source":"c1","target":"c2"}]` ||
		updates["core_settings"] != "episode rule" ||
		updates["background"] != "old background" ||
		updates["scenes_desc"] != `["old scene"]` {
		t.Fatalf("expected allowed fields to survive, got %#v", updates)
	}
}

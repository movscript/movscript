package feature

import "testing"

func TestEncodeDecodeUintIDs(t *testing.T) {
	raw := EncodeUintIDs([]uint{3, 7})
	got := DecodeUintIDs(raw)
	if len(got) != 2 || got[0] != 3 || got[1] != 7 {
		t.Fatalf("ids = %#v from %q", got, raw)
	}
	if got := DecodeUintIDs("not-json"); len(got) != 0 {
		t.Fatalf("invalid ids should decode empty: %#v", got)
	}
}

func TestNormalizeDefaultModelID(t *testing.T) {
	var zero uint
	if NormalizeDefaultModelID(&zero) != nil {
		t.Fatal("zero model id should clear default")
	}
	var id uint = 9
	if got := NormalizeDefaultModelID(&id); got == nil || *got != 9 {
		t.Fatalf("model id = %#v", got)
	}
}

func TestBuildResponseAppliesDefinitionDefaults(t *testing.T) {
	f := FeatureConfig{
		FeatureKey:        "brainstorm",
		DisplayName:       "Brainstorm",
		AllowedRoles:      `["owner"]`,
		MaxTokensOverride: 0,
	}
	resp := BuildResponse(f, []uint{1}, &Definition{
		IsToolFeature: true,
		SystemPrompt:  "default prompt",
		OutputSchema:  "{}",
		MaxTokens:     1024,
		InputSlots:    []InputSlot{{Key: "image"}},
	})
	if !resp.IsToolFeature || resp.MaxTokens != 1024 || resp.DefaultSystemPrompt != "default prompt" {
		t.Fatalf("unexpected response defaults: %+v", resp)
	}
	if len(resp.AllowedRoles) != 1 || resp.AllowedRoles[0] != "owner" {
		t.Fatalf("roles = %#v", resp.AllowedRoles)
	}
	if len(resp.InputSlots) != 1 || resp.InputSlots[0].Key != "image" {
		t.Fatalf("input slots = %#v", resp.InputSlots)
	}
}

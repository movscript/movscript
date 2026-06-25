package ai

import "testing"

func TestEstimateUsageRecordsTokensWithoutCost(t *testing.T) {
	profile := modelUsageProfile{}
	def := &ModelDef{}

	got := estimateUsage(profile, def, "text", 500_000, 250_000, 0, 1)

	if got.InputTokens != 500_000 || got.OutputTokens != 250_000 || got.Cost != 0 {
		t.Fatalf("usage estimate = %#v, want token counts and zero cost", got)
	}
}

func TestEstimateTextInputTokensUsesMessagesAndTools(t *testing.T) {
	req := TextRequest{
		Messages: []Message{{Role: "user", Content: "hello world"}},
		Tools:    []byte(`{"type":"function"}`),
	}

	got := estimateTextInputTokens(req)

	if got <= 1 {
		t.Fatalf("expected token estimate to include request text, got %d", got)
	}
}

func TestPositiveDurationFallsBackToModelDefault(t *testing.T) {
	got := positiveDuration(0, &ModelDef{DefaultDurSec: 6})
	if got != 6 {
		t.Fatalf("expected default duration 6, got %d", got)
	}
}

package ai

import (
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestEstimateUsageCostPerToken(t *testing.T) {
	cfg := model.AIModelConfig{
		CreditsInputPer1M:  2,
		CreditsOutputPer1M: 8,
	}
	def := &ModelDef{PricingMode: PricingPerToken}

	got := estimateUsageCost(cfg, def, "text", 500_000, 250_000, 0, 1)

	if got.Cost != 3 {
		t.Fatalf("expected 3 credits, got %.4f", got.Cost)
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

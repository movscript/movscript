//go:build !runtime_overlay

package assembly

import (
	"testing"

	"github.com/movscript/movscript/internal/infra/config"
)

func TestCommunityDoesNotOverrideAIRegistryProviderMode(t *testing.T) {
	mode, ok := editionAIRegistryProviderMode(&config.Config{AIGatewayProvider: "future"})
	if ok || mode != "" {
		t.Fatalf("editionAIRegistryProviderMode() = mode %q ok %v, want empty false", mode, ok)
	}
}

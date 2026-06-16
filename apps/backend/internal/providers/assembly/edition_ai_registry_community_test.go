//go:build !runtime_overlay

package assembly

import (
	"testing"

	"github.com/movscript/movscript/internal/infra/config"
)

func TestCommunityDoesNotOverrideAIRegistryProviderMode(t *testing.T) {
	mode, configureDefaults, ok := editionAIRegistryProviderMode(&config.Config{AIGatewayProvider: "future"})
	if ok || mode != "" || configureDefaults {
		t.Fatalf("editionAIRegistryProviderMode() = mode %q configureDefaults %v ok %v, want empty false false", mode, configureDefaults, ok)
	}
}

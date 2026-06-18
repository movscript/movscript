//go:build !runtime_overlay

package assembly

import "github.com/movscript/movscript/internal/infra/config"

func editionAIRegistryProviderMode(_ *config.Config) (string, bool) {
	return "", false
}

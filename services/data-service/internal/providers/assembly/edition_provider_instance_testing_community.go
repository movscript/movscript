//go:build !runtime_overlay

package assembly

import (
	"context"

	"github.com/movscript/movscript/internal/infra/config"
)

func editionStartupProviderInstanceTest(_ context.Context, _ *config.Config, _ config.ProviderInstance) (error, bool) {
	return nil, false
}

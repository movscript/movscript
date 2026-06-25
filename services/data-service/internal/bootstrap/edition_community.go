//go:build !runtime_overlay

package bootstrap

import (
	"context"

	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

func migrateEditionModules(_ context.Context, _ *gorm.DB, _ *config.Config) error {
	return nil
}

func seedEditionData(_ context.Context, _ *gorm.DB, _ *config.Config) error {
	return nil
}

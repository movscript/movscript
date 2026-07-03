//go:build !runtime_overlay

package bootstrap

import (
	"context"

	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

func migrateDistributionProfileModules(_ context.Context, _ *gorm.DB, _ *config.Config) error {
	return nil
}

func seedDistributionProfileData(_ context.Context, _ *gorm.DB, _ *config.Config) error {
	return nil
}

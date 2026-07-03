//go:build !runtime_overlay

package db

import "gorm.io/gorm"

func distributionProfileMigrations() []Migration {
	return nil
}

func distributionProfileBeforeMigrations(_ *gorm.DB) error {
	return nil
}

//go:build !runtime_overlay

package db

import "gorm.io/gorm"

func editionMigrations() []Migration {
	return nil
}

func editionRepairLegacyMigrationRecords(_ *gorm.DB) error {
	return nil
}

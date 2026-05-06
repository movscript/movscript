//go:build !enterprise

package db

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCommunityMigrationsDoNotCreateCommercialQuotaTables(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(allModels()...); err != nil {
		t.Fatalf("migrate all models: %v", err)
	}

	for _, table := range []string{"user_quotas", "org_quotas"} {
		if db.Migrator().HasTable(table) {
			t.Fatalf("community migration should not create %q", table)
		}
	}
}

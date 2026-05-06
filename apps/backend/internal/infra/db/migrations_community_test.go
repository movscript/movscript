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

func TestJobRunnerIndexesCreated(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	for _, index := range []string{"idx_jobs_runner_ready", "idx_jobs_runner_stale"} {
		if !db.Migrator().HasIndex("jobs", index) {
			t.Fatalf("expected jobs index %q to exist", index)
		}
	}
}

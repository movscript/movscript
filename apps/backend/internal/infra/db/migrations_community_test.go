//go:build !runtime_overlay

package db

import (
	"testing"

	"github.com/movscript/movscript/internal/testutil"
)

func TestCommunityRuntimeDoesNotContributeMigrationModels(t *testing.T) {
	if got := runtimeMigrationModels(); len(got) != 0 {
		t.Fatalf("runtimeMigrationModels() length = %d, want 0", len(got))
	}
}

func TestJobRunnerIndexesCreated(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_runner_indexes.db")
	if err := RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	for _, index := range []string{"idx_jobs_runner_ready", "idx_jobs_runner_stale"} {
		if !db.Migrator().HasIndex("jobs", index) {
			t.Fatalf("expected jobs index %q to exist", index)
		}
	}
}

func TestRenameAIModelConfigPricingModeColumn(t *testing.T) {
	db := testutil.OpenSQLite(t, "pricing_mode_column.db")
	if err := db.Exec(`CREATE TABLE ai_model_configs (id integer primary key, custom_billing_mode text, custom_pricing_mode text)`).Error; err != nil {
		t.Fatalf("create table: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_configs (id, custom_billing_mode, custom_pricing_mode) VALUES (1, 'per_image', '')`).Error; err != nil {
		t.Fatalf("insert row: %v", err)
	}

	if err := renameAIModelConfigPricingModeColumn(db); err != nil {
		t.Fatalf("renameAIModelConfigPricingModeColumn() error = %v", err)
	}

	var pricingMode string
	if err := db.Raw(`SELECT custom_pricing_mode FROM ai_model_configs WHERE id = 1`).Scan(&pricingMode).Error; err != nil {
		t.Fatalf("read pricing mode: %v", err)
	}
	if pricingMode != "per_image" {
		t.Fatalf("custom_pricing_mode = %q, want per_image", pricingMode)
	}
	if db.Migrator().HasColumn("ai_model_configs", "custom_billing_mode") {
		t.Fatal("custom_billing_mode column should be removed")
	}
}

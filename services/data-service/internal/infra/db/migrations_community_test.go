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

func TestCommunityRuntimeDoesNotContributeDistributionProfileMigrations(t *testing.T) {
	if got := distributionProfileMigrations(); len(got) != 0 {
		t.Fatalf("distributionProfileMigrations() length = %d, want 0", len(got))
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

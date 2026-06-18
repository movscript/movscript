package db

import (
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRegisteredMigrationsStartAtFormalBaseline(t *testing.T) {
	migrations := RegisteredMigrations()
	if len(migrations) == 0 {
		t.Fatal("expected registered migrations")
	}

	first := migrations[0]
	if first.Version != "000001" || first.Name != "baseline_schema" {
		t.Fatalf("first migration = %s_%s, want 000001_baseline_schema", first.Version, first.Name)
	}

	seen := map[string]bool{}
	previous := ""
	for _, migration := range migrations {
		if migration.Version == "" {
			t.Fatalf("migration has empty version: %#v", migration)
		}
		if migration.Name == "" {
			t.Fatalf("migration %s has empty name", migration.Version)
		}
		if migration.Up == nil {
			t.Fatalf("migration %s_%s has nil Up function", migration.Version, migration.Name)
		}
		if seen[migration.Version] {
			t.Fatalf("duplicate migration version %s", migration.Version)
		}
		if previous != "" && migration.Version <= previous {
			t.Fatalf("migrations must be strictly ordered: %s before %s", previous, migration.Version)
		}
		if strings.Contains(migration.Name, "legacy") || strings.Contains(migration.Name, "backfill") {
			t.Fatalf("formal baseline must not keep development migration name %q", migration.Name)
		}
		seen[migration.Version] = true
		previous = migration.Version
	}
}

func TestMigrationChecksumIsStable(t *testing.T) {
	migration := Migration{Version: "000123", Name: "example"}

	first := migrationChecksum(migration)
	second := migrationChecksum(migration)

	if first == "" {
		t.Fatal("expected checksum")
	}
	if first != second {
		t.Fatalf("expected stable checksum, got %q and %q", first, second)
	}
}

func TestRunMigrationsInitializesFormalBaselineSchema(t *testing.T) {
	db := testutil.OpenSQLite(t, "formal_baseline.db")

	pending, err := PendingMigrations(db)
	if err != nil {
		t.Fatalf("PendingMigrations() before run error = %v", err)
	}
	if len(pending) == 0 {
		t.Fatal("expected pending baseline migration before initialization")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var records []AppliedMigration
	if err := db.Order("version asc").Find(&records).Error; err != nil {
		t.Fatalf("load applied migrations: %v", err)
	}
	if len(records) != len(RegisteredMigrations()) {
		t.Fatalf("applied migration count = %d, want %d", len(records), len(RegisteredMigrations()))
	}
	if records[0].Version != "000001" || records[0].Name != "baseline_schema" {
		t.Fatalf("first applied migration = %s_%s, want 000001_baseline_schema", records[0].Version, records[0].Name)
	}

	for _, table := range []any{
		&model.User{},
		&model.Project{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.UsageLog{},
		&model.LLMCallLog{},
		&model.ResourceBlob{},
		&model.RawResource{},
		&model.MediaStreamArtifact{},
		&model.Job{},
		&model.GatewayAPIKey{},
		&model.Organization{},
	} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("expected table for %T", table)
		}
	}

	for _, index := range []string{
		"idx_jobs_runner_ready",
		"idx_jobs_runner_stale",
		rawResourcePersonalNameUniqueIndex,
		rawResourceTeamNameUniqueIndex,
		activeModelRouteBindingUniqueIndex,
		activeModelCatalogEntryUniqueIndex,
	} {
		if !hasSQLiteIndex(db, index) {
			t.Fatalf("expected baseline index %q to exist", index)
		}
	}

	for _, column := range []string{
		"credits_input_per_1m",
		"credits_output_per_1m",
	} {
		if !db.Migrator().HasColumn(&model.AIModelCatalogEntry{}, column) {
			t.Fatalf("expected baseline model catalog column %q to exist", column)
		}
	}

	pending, err = PendingMigrations(db)
	if err != nil {
		t.Fatalf("PendingMigrations() after run error = %v", err)
	}
	if len(pending) != 0 {
		t.Fatalf("pending migrations after baseline = %v", pending)
	}
}

func TestRunMigrationsRejectsDevelopmentBaselineChecksum(t *testing.T) {
	db := testutil.OpenSQLite(t, "development_checksum.db", &AppliedMigration{})
	developmentBaseline := Migration{Version: "000001", Name: "create_schema"}
	if err := db.Create(&AppliedMigration{
		Version:   developmentBaseline.Version,
		Name:      developmentBaseline.Name,
		Checksum:  migrationChecksum(developmentBaseline),
		AppliedAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatalf("insert development migration record: %v", err)
	}

	err := RunMigrations(db)
	if err == nil {
		t.Fatal("RunMigrations() succeeded for development baseline checksum, want mismatch")
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("RunMigrations() error = %v, want checksum mismatch", err)
	}
}

func TestMigrateRouteProviderModelIDBackfillsLegacySQLiteCatalogColumn(t *testing.T) {
	db := testutil.OpenSQLite(t, "legacy-provider-model-id.db")
	if err := db.AutoMigrate(&legacyModelCatalogEntryForMigration{}, &model.AIModelRouteBinding{}); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	entry := legacyModelCatalogEntryForMigration{
		PublicModelID:   "gpt-5.2",
		ProviderModelID: "gpt-5.2-upstream",
		DisplayName:     "GPT 5.2",
		IsEnabled:       true,
		Capabilities:    "text",
		SupportedParams: "",
		PricingMode:     "per_token",
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create legacy catalog entry: %v", err)
	}
	route := model.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     model.ModelRouteSourceLocalProvider,
		IsEnabled:      true,
	}
	if err := db.Create(&route).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	if err := migrateRouteProviderModelID(db); err != nil {
		t.Fatalf("migrateRouteProviderModelID() error = %v", err)
	}

	var updated model.AIModelRouteBinding
	if err := db.First(&updated, route.ID).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if updated.ProviderModelID != "gpt-5.2-upstream" {
		t.Fatalf("ProviderModelID = %q, want legacy provider model id backfilled", updated.ProviderModelID)
	}
	if !db.Migrator().HasColumn("ai_model_catalog_entries", "provider_model_id") {
		t.Fatal("expected SQLite migration to leave legacy catalog provider_model_id column in place")
	}
}

type legacyModelCatalogEntryForMigration struct {
	gorm.Model
	PublicModelID   string
	DisplayName     string
	ShortName       string
	IsEnabled       bool
	Capabilities    string
	PricingMode     string
	ProviderModelID string `gorm:"column:provider_model_id"`
	SupportedParams string
}

func (legacyModelCatalogEntryForMigration) TableName() string {
	return "ai_model_catalog_entries"
}

func hasSQLiteIndex(db *gorm.DB, name string) bool {
	var count int64
	return db.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&count).Error == nil && count > 0
}

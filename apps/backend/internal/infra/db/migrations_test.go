package db

import (
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRegisteredMigrationsAreOrderedAndUnique(t *testing.T) {
	migrations := RegisteredMigrations()
	if len(migrations) == 0 {
		t.Fatal("expected registered migrations")
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

func TestLegacyNoopMigrationChecksumCompatibility(t *testing.T) {
	legacyChecksums := map[string]string{
		"000009": "ceb24f4d054945bfdf180e7452c97df8f8db4632f4db9f8377e69032a4998d0a",
		"000010": "117f6dcc99612418640970bab33d24a3c08a183fc4b886e97e534ba061be11ad",
	}

	for _, migration := range RegisteredMigrations() {
		legacyChecksum, ok := legacyChecksums[migration.Version]
		if !ok {
			continue
		}
		wantName := "legacy_noop_" + migration.Version
		if migration.Name != wantName {
			t.Fatalf("migration %s name = %q, want %s", migration.Version, migration.Name, wantName)
		}
		if got := migrationChecksum(migration); got == legacyChecksum {
			t.Fatalf("migration %s checksum should no longer use legacy checksum %q", migration.Version, legacyChecksum)
		}
		if !acceptsLegacyMigrationChecksum(migration, legacyChecksum) {
			t.Fatalf("migration %s should accept legacy checksum %q", migration.Version, legacyChecksum)
		}
		delete(legacyChecksums, migration.Version)
	}

	if len(legacyChecksums) > 0 {
		t.Fatalf("legacy migrations are not registered: %v", legacyChecksums)
	}
}

func TestRunMigrationsAcceptsLegacyNoopChecksum(t *testing.T) {
	legacyChecksums := map[string]string{
		"000009": "ceb24f4d054945bfdf180e7452c97df8f8db4632f4db9f8377e69032a4998d0a",
		"000010": "117f6dcc99612418640970bab33d24a3c08a183fc4b886e97e534ba061be11ad",
	}

	for legacyVersion, legacyChecksum := range legacyChecksums {
		t.Run(legacyVersion, func(t *testing.T) {
			db := testutil.OpenSQLite(t, "migrations_"+legacyVersion+".db", &AppliedMigration{})
			for _, migration := range RegisteredMigrations() {
				checksum := migrationChecksum(migration)
				if migration.Version == legacyVersion {
					checksum = legacyChecksum
				}
				record := AppliedMigration{
					Version:   migration.Version,
					Name:      migration.Name,
					Checksum:  checksum,
					AppliedAt: time.Now().UTC(),
				}
				if err := db.Create(&record).Error; err != nil {
					t.Fatalf("insert migration %s: %v", migration.Version, err)
				}
				if migration.Version == legacyVersion {
					break
				}
			}

			if err := RunMigrations(db); err != nil {
				t.Fatalf("RunMigrations() error = %v", err)
			}
		})
	}
}

func TestMigration000020ResequencesAndEnforcesScriptVersionNumbers(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000020_script_version_number.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.Script{}, &model.ScriptVersion{})
	script := model.Script{ProjectID: 1, Title: "Pilot", Content: "content", RawSource: "content", AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	versions := []model.ScriptVersion{
		{ProjectID: 1, ScriptID: script.ID, VersionNumber: 1, Title: "v1", SourceType: "raw", Content: "one", Status: "active"},
		{ProjectID: 1, ScriptID: script.ID, VersionNumber: 1, Title: "duplicate v1", SourceType: "raw", Content: "two", Status: "active"},
		{ProjectID: 1, ScriptID: script.ID, VersionNumber: 7, Title: "v7", SourceType: "raw", Content: "three", Status: "active"},
	}
	for i := range versions {
		if err := db.Create(&versions[i]).Error; err != nil {
			t.Fatalf("create script version %d: %v", i, err)
		}
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000020" {
			break
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert migration %s: %v", migration.Version, err)
		}
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var persisted []model.ScriptVersion
	if err := db.Where("script_id = ?", script.ID).Order("id asc").Find(&persisted).Error; err != nil {
		t.Fatalf("list script versions: %v", err)
	}
	got := make([]int, 0, len(persisted))
	for _, version := range persisted {
		got = append(got, version.VersionNumber)
	}
	want := []int{1, 2, 3}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("version numbers = %v, want %v", got, want)
		}
	}

	duplicate := model.ScriptVersion{ProjectID: 1, ScriptID: script.ID, VersionNumber: 2, Title: "duplicate", SourceType: "raw", Content: "duplicate", Status: "active"}
	if err := db.Create(&duplicate).Error; err == nil {
		t.Fatal("create duplicate script version number succeeded, want unique constraint error")
	}
}

func TestMigration000021ResequencesAndEnforcesStoryboardVersionNumbers(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000021_storyboard_version_number.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.Script{}, &model.ScriptVersion{}, &model.StoryboardScript{}, &model.StoryboardVersion{})
	script := model.Script{ProjectID: 1, Title: "Pilot", Content: "content", RawSource: "content", AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	scriptVersion := model.ScriptVersion{ProjectID: 1, ScriptID: script.ID, VersionNumber: 1, Title: "Pilot", SourceType: "raw", Content: script.Content, RawSource: script.RawSource, Status: "active"}
	if err := db.Create(&scriptVersion).Error; err != nil {
		t.Fatalf("create script version: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "Storyboard", Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	versions := []model.StoryboardVersion{
		{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "v1", Source: "manual", Status: "active"},
		{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "duplicate v1", Source: "manual", Status: "active"},
		{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 9, Title: "v9", Source: "manual", Status: "active"},
	}
	for i := range versions {
		if err := db.Create(&versions[i]).Error; err != nil {
			t.Fatalf("create storyboard version %d: %v", i, err)
		}
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000021" {
			break
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert migration %s: %v", migration.Version, err)
		}
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var persisted []model.StoryboardVersion
	if err := db.Where("storyboard_script_id = ?", storyboardScript.ID).Order("id asc").Find(&persisted).Error; err != nil {
		t.Fatalf("list storyboard versions: %v", err)
	}
	got := make([]int, 0, len(persisted))
	for _, version := range persisted {
		got = append(got, version.VersionNumber)
	}
	want := []int{1, 2, 3}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("version numbers = %v, want %v", got, want)
		}
	}

	duplicate := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 2, Title: "duplicate", Source: "manual", Status: "active"}
	if err := db.Create(&duplicate).Error; err == nil {
		t.Fatal("create duplicate storyboard version number succeeded, want unique constraint error")
	}
}

func TestMigration000022BackfillsCurrentSchemaTables(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000022_current_schema.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000022" {
			break
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert migration %s: %v", migration.Version, err)
		}
	}
	if db.Migrator().HasTable(&model.StoryboardScript{}) {
		t.Fatal("storyboard_scripts table exists before backfill")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	for _, table := range []any{&model.StoryboardScript{}, &model.StoryboardVersion{}, &model.CloudFileConfig{}, &model.AuditLog{}} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("expected table for %T to be backfilled", table)
		}
	}
}

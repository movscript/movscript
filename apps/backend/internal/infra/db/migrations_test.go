package db

import (
	"testing"
	"time"

	"gorm.io/driver/sqlite"
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
			db, err := gorm.Open(sqlite.Open("file:migrations-"+legacyVersion+"?mode=memory&cache=shared"), &gorm.Config{})
			if err != nil {
				t.Fatalf("open sqlite: %v", err)
			}
			if err := db.AutoMigrate(&AppliedMigration{}); err != nil {
				t.Fatalf("create schema_migrations: %v", err)
			}
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

package db

import "testing"

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

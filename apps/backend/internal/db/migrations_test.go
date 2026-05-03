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

func TestMigrationAcceptsExplicitLegacyChecksum(t *testing.T) {
	migration := Migration{
		Version:         "000123",
		Name:            "renamed",
		LegacyChecksums: []string{"legacy-checksum"},
	}

	if !migrationAcceptsChecksum(migration, "legacy-checksum") {
		t.Fatal("expected legacy checksum to be accepted")
	}
	if migrationAcceptsChecksum(migration, "other-checksum") {
		t.Fatal("expected unrelated checksum to be rejected")
	}
}

func TestRegisteredMigrationAcceptsRenamedSemanticSkeletonChecksum(t *testing.T) {
	const appliedChecksum = "c8cf48991d28eab2da69743bca6348df3c4dddb81368d2a4ff0048281e67df82"

	for _, migration := range RegisteredMigrations() {
		if migration.Version != "000018" {
			continue
		}
		if !migrationAcceptsChecksum(migration, appliedChecksum) {
			t.Fatal("expected renamed semantic skeleton migration to accept applied checksum")
		}
		return
	}
	t.Fatal("migration 000018 not found")
}

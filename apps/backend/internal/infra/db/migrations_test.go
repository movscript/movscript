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

func TestMigration000026ChecksumCompatibility(t *testing.T) {
	const legacyChecksum = "e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201"

	var migration Migration
	for _, registered := range RegisteredMigrations() {
		if registered.Version == "000026" {
			migration = registered
			break
		}
	}
	if migration.Version == "" {
		t.Fatal("migration 000026 is not registered")
	}
	if migration.Name != "add_creative_reference_workspace_client_id" {
		t.Fatalf("migration 000026 name = %q, want add_creative_reference_workspace_client_id", migration.Name)
	}
	if got := migrationChecksum(migration); got != "9ef89e5d9815ae4eeb9e5c49c78db4628107ed2b28858351476bb1ab08bea628" {
		t.Fatalf("migration 000026 checksum = %q", got)
	}
	if !acceptsLegacyMigrationChecksum(migration, legacyChecksum) {
		t.Fatal("migration 000026 should accept previously published proposal_client_id checksum")
	}
}

func TestRunMigrationsAcceptsMigration000026LegacyChecksum(t *testing.T) {
	const legacyChecksum = "e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201"

	db := testutil.OpenSQLite(t, "migrations_000026_legacy_checksum.db", &AppliedMigration{})
	for _, migration := range RegisteredMigrations() {
		checksum := migrationChecksum(migration)
		if migration.Version == "000026" {
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
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
}

func TestMigration000039RepairsLegacyCreativeReferenceWorkspaceClientID(t *testing.T) {
	const legacyChecksum = "e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201"

	db := testutil.OpenSQLiteWithConfig(t, "migrations_000039_creative_reference_workspace_client_id.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`
		CREATE TABLE creative_references (
			id integer primary key autoincrement,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			project_id integer not null,
			proposal_client_id text,
			kind text not null,
			name text not null,
			alias text,
			description text,
			content text,
			importance text,
			status text,
			profile_json text,
			tags_json text
		)
	`).Error; err != nil {
		t.Fatalf("create legacy creative_references table: %v", err)
	}
	if db.Migrator().HasColumn(&model.CreativeReference{}, "workspace_client_id") {
		t.Fatal("workspace_client_id exists before repair migration")
	}

	foundRepairMigration := false
	for _, migration := range RegisteredMigrations() {
		if migration.Version == "000039" {
			foundRepairMigration = true
			continue
		}
		checksum := migrationChecksum(migration)
		if migration.Version == "000026" {
			checksum = legacyChecksum
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  checksum,
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert migration %s: %v", migration.Version, err)
		}
	}
	if !foundRepairMigration {
		t.Fatal("migration 000039 is not registered")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	if !db.Migrator().HasColumn(&model.CreativeReference{}, "workspace_client_id") {
		t.Fatal("workspace_client_id was not added by repair migration")
	}
}

func TestMigration000029ChecksumCompatibility(t *testing.T) {
	var migration Migration
	for _, registered := range RegisteredMigrations() {
		if registered.Version == "000029" {
			migration = registered
			break
		}
	}
	if migration.Version == "" {
		t.Fatal("migration 000029 is not registered")
	}
	if migration.Name != "remove_production_orchestrate_feature" {
		t.Fatalf("migration 000029 name = %q, want remove_production_orchestrate_feature", migration.Name)
	}
	if got := migrationChecksum(migration); got != "1d7580b5ac39d9da7960b0bf599dbc61e87a379b86e4ac83059ba3d2a28eeb9e" {
		t.Fatalf("migration 000029 checksum = %q", got)
	}
	if !acceptsLegacyMigrationChecksum(migration, "83ca864fb52dea985df41af68e5ffe03843c3beadeebb74a5dc04c23873f8972") {
		t.Fatal("migration 000029 should accept accidentally published drop_feature_configs checksum")
	}
}

func TestRemoveProductionOrchestrateFeatureConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "remove_production_orchestrate_feature_config.db")
	if err := db.Exec(`CREATE TABLE feature_configs (id integer primary key autoincrement, feature_key text not null, display_name text)`).Error; err != nil {
		t.Fatalf("create feature_configs: %v", err)
	}
	if err := db.Exec(
		`INSERT INTO feature_configs (feature_key, display_name) VALUES (?, ?), (?, ?)`,
		"production_orchestrate", "Production Orchestrate",
		"brainstorm", "Brainstorm",
	).Error; err != nil {
		t.Fatalf("insert feature configs: %v", err)
	}

	if err := removeProductionOrchestrateFeatureConfig(db); err != nil {
		t.Fatalf("removeProductionOrchestrateFeatureConfig() error = %v", err)
	}

	var removed int64
	if err := db.Table("feature_configs").Where("feature_key = ?", "production_orchestrate").Count(&removed).Error; err != nil {
		t.Fatalf("count removed feature: %v", err)
	}
	if removed != 0 {
		t.Fatalf("production_orchestrate rows = %d, want 0", removed)
	}

	var kept int64
	if err := db.Table("feature_configs").Where("feature_key = ?", "brainstorm").Count(&kept).Error; err != nil {
		t.Fatalf("count kept feature: %v", err)
	}
	if kept != 1 {
		t.Fatalf("brainstorm rows = %d, want 1", kept)
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
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "Storyboard", Status: "workspace"}
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

func TestMigration000032BackfillsAndEnforcesUniqueResourceFilenames(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000032_resource_filenames.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.RawResource{})
	orgID := uint(7)
	resources := []model.RawResource{
		{OwnerID: 1, Type: "image", Name: "Hero.png", FilePath: "/tmp/hero-1.png"},
		{OwnerID: 1, Type: "image", Name: "hero.PNG", FilePath: "/tmp/hero-2.png"},
		{OwnerID: 2, Type: "image", Name: "hero.png", FilePath: "/tmp/hero-other-user.png"},
		{OwnerID: 1, OrgID: &orgID, Type: "image", Name: "team.png", FilePath: "/tmp/team-1.png"},
		{OwnerID: 2, OrgID: &orgID, Type: "image", Name: "TEAM.PNG", FilePath: "/tmp/team-2.png"},
	}
	for i := range resources {
		if err := db.Create(&resources[i]).Error; err != nil {
			t.Fatalf("create resource %d: %v", i, err)
		}
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000032" {
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

	var personal []model.RawResource
	if err := db.Where("owner_id = ? AND org_id IS NULL", 1).Order("id asc").Find(&personal).Error; err != nil {
		t.Fatalf("load personal resources: %v", err)
	}
	if got := []string{personal[0].Name, personal[1].Name}; got[0] != "Hero.png" || got[1] != "hero (2).PNG" {
		t.Fatalf("personal names = %v, want [Hero.png hero (2).PNG]", got)
	}
	var team []model.RawResource
	if err := db.Where("org_id = ?", orgID).Order("id asc").Find(&team).Error; err != nil {
		t.Fatalf("load team resources: %v", err)
	}
	if got := []string{team[0].Name, team[1].Name}; got[0] != "team.png" || got[1] != "TEAM (2).PNG" {
		t.Fatalf("team names = %v, want [team.png TEAM (2).PNG]", got)
	}

	duplicatePersonal := model.RawResource{OwnerID: 1, Type: "image", Name: "HERO.png", FilePath: "/tmp/hero-3.png"}
	if err := db.Create(&duplicatePersonal).Error; err == nil {
		t.Fatal("create duplicate personal resource name succeeded, want unique constraint error")
	}
	allowedOtherUser := model.RawResource{OwnerID: 3, Type: "image", Name: "hero.png", FilePath: "/tmp/hero-user-3.png"}
	if err := db.Create(&allowedOtherUser).Error; err != nil {
		t.Fatalf("same name in a different personal library should be allowed: %v", err)
	}
	duplicateTeam := model.RawResource{OwnerID: 3, OrgID: &orgID, Type: "image", Name: "team.PNG", FilePath: "/tmp/team-3.png"}
	if err := db.Create(&duplicateTeam).Error; err == nil {
		t.Fatal("create duplicate team resource name succeeded, want unique constraint error")
	}
}

func TestMigration000034BackfillsResourceBlobs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000034_resource_blobs.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.RawResource{})
	resources := []model.RawResource{
		{OwnerID: 1, Type: "image", Name: "first.png", FilePath: "stored:shared-key", StorageBackend: "filesystem", StorageKey: "shared-key", Size: 4, MimeType: "image/png"},
		{OwnerID: 1, Type: "image", Name: "second.png", FilePath: "stored:shared-key", StorageBackend: "filesystem", StorageKey: "shared-key", Size: 4, MimeType: "image/png"},
		{OwnerID: 1, Type: "image", Name: "third.png", FilePath: "stored:shared-key", StorageBackend: "minio", StorageKey: "shared-key", Size: 4, MimeType: "image/png"},
	}
	for i := range resources {
		if err := db.Create(&resources[i]).Error; err != nil {
			t.Fatalf("create resource %d: %v", i, err)
		}
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000034" {
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

	var blobs []model.ResourceBlob
	if err := db.Find(&blobs).Error; err != nil {
		t.Fatalf("load blobs: %v", err)
	}
	if len(blobs) != 2 {
		t.Fatalf("blob count = %d, want 2: %+v", len(blobs), blobs)
	}
	blobByBackend := map[string]model.ResourceBlob{}
	for _, blob := range blobs {
		blobByBackend[blob.StorageBackend] = blob
	}
	if blobByBackend["filesystem"].RefCount != 2 {
		t.Fatalf("filesystem blob ref count = %d, want 2", blobByBackend["filesystem"].RefCount)
	}
	if blobByBackend["minio"].RefCount != 1 {
		t.Fatalf("minio blob ref count = %d, want 1", blobByBackend["minio"].RefCount)
	}
	var persisted []model.RawResource
	if err := db.Order("id asc").Find(&persisted).Error; err != nil {
		t.Fatalf("load resources: %v", err)
	}
	if persisted[0].BlobID == nil || *persisted[0].BlobID != blobByBackend["filesystem"].ID {
		t.Fatalf("first resource blob_id = %v, want %d", persisted[0].BlobID, blobByBackend["filesystem"].ID)
	}
	if persisted[1].BlobID == nil || *persisted[1].BlobID != blobByBackend["filesystem"].ID {
		t.Fatalf("second resource blob_id = %v, want %d", persisted[1].BlobID, blobByBackend["filesystem"].ID)
	}
	if persisted[2].BlobID == nil || *persisted[2].BlobID != blobByBackend["minio"].ID {
		t.Fatalf("third resource blob_id = %v, want %d", persisted[2].BlobID, blobByBackend["minio"].ID)
	}
}

func TestMigration000024BackfillsAIModelCapacityConfigColumns(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000024_ai_model_capacity_config.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE ai_model_configs (id integer primary key, credential_id integer, model_def_id text)`).Error; err != nil {
		t.Fatalf("create ai_model_configs: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_configs (id, credential_id, model_def_id) VALUES (1, 1, 'test-model')`).Error; err != nil {
		t.Fatalf("insert ai_model_config: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000024" {
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
	if db.Migrator().HasColumn(&model.AIModelConfig{}, "capacity_weight") {
		t.Fatal("capacity_weight column exists before migration")
	}
	if db.Migrator().HasColumn(&model.AIModelConfig{}, "max_concurrency") {
		t.Fatal("max_concurrency column exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if !db.Migrator().HasColumn(&model.AIModelConfig{}, "capacity_weight") {
		t.Fatal("expected capacity_weight column to be backfilled")
	}
	if !db.Migrator().HasColumn(&model.AIModelConfig{}, "max_concurrency") {
		t.Fatal("expected max_concurrency column to be backfilled")
	}
	var cfg model.AIModelConfig
	if err := db.First(&cfg, 1).Error; err != nil {
		t.Fatalf("read migrated ai model config: %v", err)
	}
	if cfg.CapacityWeight != 1 {
		t.Fatalf("capacity_weight = %d, want 1", cfg.CapacityWeight)
	}
}

func TestMigration000030BackfillsCachedInputTokenColumns(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000030_cached_input_tokens.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE usage_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null,
		input_tokens integer default 0,
		output_tokens integer default 0,
		reasoning_tokens integer default 0
	)`).Error; err != nil {
		t.Fatalf("create usage_logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE llm_call_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		credential_id integer not null,
		operation_type text not null,
		status text not null,
		input_tokens integer default 0,
		output_tokens integer default 0,
		reasoning_tokens integer default 0
	)`).Error; err != nil {
		t.Fatalf("create llm_call_logs: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000030" {
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
	if db.Migrator().HasColumn(&model.UsageLog{}, "cached_input_tokens") {
		t.Fatal("usage_logs.cached_input_tokens exists before migration")
	}
	if db.Migrator().HasColumn(&model.LLMCallLog{}, "cached_input_tokens") {
		t.Fatal("llm_call_logs.cached_input_tokens exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if !db.Migrator().HasColumn(&model.UsageLog{}, "cached_input_tokens") {
		t.Fatal("expected usage_logs.cached_input_tokens to be backfilled")
	}
	if !db.Migrator().HasColumn(&model.LLMCallLog{}, "cached_input_tokens") {
		t.Fatal("expected llm_call_logs.cached_input_tokens to be backfilled")
	}
}

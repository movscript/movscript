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
		"000026": "e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201",
		"000029": "83ca864fb52dea985df41af68e5ffe03843c3beadeebb74a5dc04c23873f8972",
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
		"000026": "e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201",
		"000029": "83ca864fb52dea985df41af68e5ffe03843c3beadeebb74a5dc04c23873f8972",
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
	if db.Migrator().HasTable(&model.CloudFileConfig{}) {
		t.Fatal("cloud_file_configs table exists before backfill")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	for _, table := range []any{&model.CloudFileConfig{}, &model.AuditLog{}} {
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
	if db.Migrator().HasColumn(&legacyAIModelConfig{}, "capacity_weight") {
		t.Fatal("capacity_weight column exists before migration")
	}
	if db.Migrator().HasColumn(&legacyAIModelConfig{}, "max_concurrency") {
		t.Fatal("max_concurrency column exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if !db.Migrator().HasColumn(&legacyAIModelConfig{}, "capacity_weight") {
		t.Fatal("expected capacity_weight column to be backfilled")
	}
	if !db.Migrator().HasColumn(&legacyAIModelConfig{}, "max_concurrency") {
		t.Fatal("expected max_concurrency column to be backfilled")
	}
	var cfg legacyAIModelConfig
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

func TestMigration000045BackfillsUsageCatalogEntryIDs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000045_usage_catalog_refs.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.AutoMigrate(&model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{}); err != nil {
		t.Fatalf("create model catalog tables: %v", err)
	}
	if err := ensureLegacyRouteBindingModelConfigColumn(db); err != nil {
		t.Fatalf("add legacy route binding column: %v", err)
	}
	if err := db.Exec(`CREATE TABLE usage_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage_logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE usage_reservations (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null,
		estimated_cost real not null default 0,
		actual_cost real not null default 0,
		status text not null default 'reserved'
	)`).Error; err != nil {
		t.Fatalf("create usage_reservations: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES (42, 'video-fast', 'kling-v2', 'Video Fast')`).Error; err != nil {
		t.Fatalf("insert catalog entry: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES (100, 'image-fast', 'provider-image-v2', 'Image Fast')`).Error; err != nil {
		t.Fatalf("insert local-provider-mapped catalog entry: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (100, 'local_provider', '', 7, 1)`).Error; err != nil {
		t.Fatalf("insert local provider route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_logs (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 42, 'video')`).Error; err != nil {
		t.Fatalf("insert usage log: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_logs (id, user_id, ai_model_config_id, operation_type) VALUES (2, 7, 7, 'image')`).Error; err != nil {
		t.Fatalf("insert local provider usage log: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_reservations (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 42, 'video')`).Error; err != nil {
		t.Fatalf("insert usage reservation: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_reservations (id, user_id, ai_model_config_id, operation_type) VALUES (2, 7, 7, 'image')`).Error; err != nil {
		t.Fatalf("insert local provider usage reservation: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000045" {
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
	if db.Migrator().HasColumn(&model.UsageLog{}, "ai_model_catalog_entry_id") {
		t.Fatal("usage_logs.ai_model_catalog_entry_id exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var usageCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM usage_logs WHERE id = 1`).Scan(&usageCatalogID).Error; err != nil {
		t.Fatalf("read usage log catalog id: %v", err)
	}
	if usageCatalogID != 42 {
		t.Fatalf("usage log catalog id = %d, want 42", usageCatalogID)
	}
	var legacyUsageCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM usage_logs WHERE id = 2`).Scan(&legacyUsageCatalogID).Error; err != nil {
		t.Fatalf("read local provider usage log catalog id: %v", err)
	}
	if legacyUsageCatalogID != 100 {
		t.Fatalf("local provider usage log catalog id = %d, want 100", legacyUsageCatalogID)
	}
	var reservationCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM usage_reservations WHERE id = 1`).Scan(&reservationCatalogID).Error; err != nil {
		t.Fatalf("read usage reservation catalog id: %v", err)
	}
	if reservationCatalogID != 42 {
		t.Fatalf("usage reservation catalog id = %d, want 42", reservationCatalogID)
	}
	var legacyReservationCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM usage_reservations WHERE id = 2`).Scan(&legacyReservationCatalogID).Error; err != nil {
		t.Fatalf("read local provider usage reservation catalog id: %v", err)
	}
	if legacyReservationCatalogID != 100 {
		t.Fatalf("local provider usage reservation catalog id = %d, want 100", legacyReservationCatalogID)
	}
}

func TestMigration000046AddsJobRouteGroup(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000046_job_route_group.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE jobs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		model_config_id integer not null,
		job_type text not null,
		status text not null default 'pending',
		prompt text
	)`).Error; err != nil {
		t.Fatalf("create jobs: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000046" {
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
	if db.Migrator().HasColumn(&model.Job{}, "route_group") {
		t.Fatal("jobs.route_group exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if !db.Migrator().HasColumn(&model.Job{}, "route_group") {
		t.Fatal("expected jobs.route_group to be added")
	}
}

func TestMigration000052BackfillsJobCatalogEntryIDs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000052_job_catalog_entry_id.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE jobs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		model_config_id integer not null,
		job_type text not null,
		status text not null default 'pending',
		prompt text
	)`).Error; err != nil {
		t.Fatalf("create jobs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_catalog_entries (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		public_model_id text,
		provider_model_id text,
		is_enabled boolean
	)`).Error; err != nil {
		t.Fatalf("create catalog entries: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		local_model_config_id integer,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, is_enabled) VALUES (100, 'video-fast', 'kling-v2', true), (42, 'image-fast', 'seedream', true)`).Error; err != nil {
		t.Fatalf("insert catalog entries: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (100, 'local_provider', '', 7, 1)`).Error; err != nil {
		t.Fatalf("insert route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO jobs (id, user_id, model_config_id, job_type, status, prompt) VALUES (1, 7, 7, 'video', 'pending', 'draw'), (2, 7, 42, 'image', 'pending', 'draw')`).Error; err != nil {
		t.Fatalf("insert jobs: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000052" {
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
	if db.Migrator().HasColumn(&model.Job{}, "ai_model_catalog_entry_id") {
		t.Fatal("jobs.ai_model_catalog_entry_id exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if !db.Migrator().HasColumn(&model.Job{}, "ai_model_catalog_entry_id") {
		t.Fatal("jobs.ai_model_catalog_entry_id missing after migration")
	}
	var legacyCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM jobs WHERE id = 1`).Scan(&legacyCatalogID).Error; err != nil {
		t.Fatalf("read legacy job catalog id: %v", err)
	}
	if legacyCatalogID != 100 {
		t.Fatalf("legacy job catalog id = %d, want 100", legacyCatalogID)
	}
	var directCatalogID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM jobs WHERE id = 2`).Scan(&directCatalogID).Error; err != nil {
		t.Fatalf("read direct job catalog id: %v", err)
	}
	if directCatalogID != 42 {
		t.Fatalf("direct job catalog id = %d, want 42", directCatalogID)
	}
}

func TestMigration000053BackfillsUsageRouteBindingRefs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000053_usage_route_binding_id.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE usage_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE usage_reservations (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage reservations: %v", err)
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
		status text not null
	)`).Error; err != nil {
		t.Fatalf("create llm call logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		local_model_config_id integer,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (321, 100, 'local_provider', '', 7, 1)`).Error; err != nil {
		t.Fatalf("insert route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_logs (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 7, 'text')`).Error; err != nil {
		t.Fatalf("insert usage log: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_reservations (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 7, 'text')`).Error; err != nil {
		t.Fatalf("insert usage reservation: %v", err)
	}
	if err := db.Exec(`INSERT INTO llm_call_logs (id, user_id, ai_model_config_id, credential_id, operation_type, status) VALUES (1, 7, 7, 9, 'text', 'success')`).Error; err != nil {
		t.Fatalf("insert llm call log: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000053" {
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
	if db.Migrator().HasColumn(&model.UsageLog{}, "route_binding_id") {
		t.Fatal("usage_logs.route_binding_id exists before migration")
	}
	if db.Migrator().HasColumn(&model.UsageReservation{}, "route_binding_id") {
		t.Fatal("usage_reservations.route_binding_id exists before migration")
	}
	if db.Migrator().HasColumn(&model.LLMCallLog{}, "route_binding_id") {
		t.Fatal("llm_call_logs.route_binding_id exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	for _, table := range []string{"usage_logs", "usage_reservations", "llm_call_logs"} {
		var routeBindingID uint
		if err := db.Raw(`SELECT route_binding_id FROM ` + table + ` WHERE id = 1`).Scan(&routeBindingID).Error; err != nil {
			t.Fatalf("read %s route binding id: %v", table, err)
		}
		if routeBindingID != 321 {
			t.Fatalf("%s route binding id = %d, want 321", table, routeBindingID)
		}
	}
}

func TestMigration000053SkipsRouteBindingBackfillWhenLegacyRouteColumnMissing(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000053_usage_route_binding_id_missing_legacy_route_column.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE usage_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE usage_reservations (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage reservations: %v", err)
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
		status text not null
	)`).Error; err != nil {
		t.Fatalf("create llm call logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings without local_model_config_id: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, capacity_weight) VALUES (321, 100, 'local_provider', '', 1)`).Error; err != nil {
		t.Fatalf("insert route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_logs (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 7, 'text')`).Error; err != nil {
		t.Fatalf("insert usage log: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_reservations (id, user_id, ai_model_config_id, operation_type) VALUES (1, 7, 7, 'text')`).Error; err != nil {
		t.Fatalf("insert usage reservation: %v", err)
	}
	if err := db.Exec(`INSERT INTO llm_call_logs (id, user_id, ai_model_config_id, credential_id, operation_type, status) VALUES (1, 7, 7, 9, 'text', 'success')`).Error; err != nil {
		t.Fatalf("insert llm call log: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000053" {
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

	for _, table := range []string{"usage_logs", "usage_reservations", "llm_call_logs"} {
		if !db.Migrator().HasColumn(table, "route_binding_id") {
			t.Fatalf("%s.route_binding_id was not added", table)
		}
		var populated int
		if err := db.Raw(`SELECT COUNT(*) FROM ` + table + ` WHERE route_binding_id IS NOT NULL`).Scan(&populated).Error; err != nil {
			t.Fatalf("count populated %s route binding ids: %v", table, err)
		}
		if populated != 0 {
			t.Fatalf("%s route_binding_id populated without local_model_config_id column", table)
		}
	}
}

func TestMigration000054BackfillsLLMCallLogCatalogEntryRefs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000054_llm_call_catalog_entry_id.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE llm_call_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		credential_id integer not null,
		operation_type text not null,
		status text not null
	)`).Error; err != nil {
		t.Fatalf("create llm call logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		local_model_config_id integer,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (321, 100, 'local_provider', '', 7, 1)`).Error; err != nil {
		t.Fatalf("insert route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO llm_call_logs (id, user_id, ai_model_config_id, credential_id, operation_type, status) VALUES (1, 7, 7, 9, 'text', 'success')`).Error; err != nil {
		t.Fatalf("insert llm call log: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000054" {
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
	if db.Migrator().HasColumn(&model.LLMCallLog{}, "ai_model_catalog_entry_id") {
		t.Fatal("llm_call_logs.ai_model_catalog_entry_id exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var catalogEntryID uint
	if err := db.Raw(`SELECT ai_model_catalog_entry_id FROM llm_call_logs WHERE id = 1`).Scan(&catalogEntryID).Error; err != nil {
		t.Fatalf("read llm call log catalog entry id: %v", err)
	}
	if catalogEntryID != 100 {
		t.Fatalf("llm call log catalog entry id = %d, want 100", catalogEntryID)
	}
}

func TestMigration000054SkipsLLMCallLogBackfillWhenLegacyRouteColumnMissing(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000054_llm_call_catalog_entry_id_missing_legacy_route_column.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE llm_call_logs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		credential_id integer not null,
		operation_type text not null,
		status text not null
	)`).Error; err != nil {
		t.Fatalf("create llm call logs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings without local_model_config_id: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, capacity_weight) VALUES (321, 100, 'local_provider', '', 1)`).Error; err != nil {
		t.Fatalf("insert route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO llm_call_logs (id, user_id, ai_model_config_id, credential_id, operation_type, status) VALUES (1, 7, 7, 9, 'text', 'success')`).Error; err != nil {
		t.Fatalf("insert llm call log: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000054" {
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
	if !db.Migrator().HasColumn("llm_call_logs", "ai_model_catalog_entry_id") {
		t.Fatal("llm_call_logs.ai_model_catalog_entry_id was not added")
	}
	var populated int
	if err := db.Raw(`SELECT COUNT(*) FROM llm_call_logs WHERE ai_model_catalog_entry_id IS NOT NULL`).Scan(&populated).Error; err != nil {
		t.Fatalf("count populated catalog entry ids: %v", err)
	}
	if populated != 0 {
		t.Fatal("llm call log catalog entry id populated without local_model_config_id column")
	}
}

func TestMigration000055AddsAndBackfillsJobRouteBindingRefs(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000055_job_route_binding_id.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE jobs (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		model_config_id integer not null,
		usage_reservation_id integer,
		job_type text not null,
		status text not null,
		prompt text
	)`).Error; err != nil {
		t.Fatalf("create jobs: %v", err)
	}
	if err := db.Exec(`CREATE TABLE usage_reservations (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		ai_model_config_id integer not null,
		route_binding_id integer,
		operation_type text not null
	)`).Error; err != nil {
		t.Fatalf("create usage reservations: %v", err)
	}
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text,
		route_group text,
		local_model_config_id integer,
		capacity_weight integer
	)`).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (321, 100, 'local_provider', '', 7, 1), (654, 200, 'local_provider', '', 9, 1)`).Error; err != nil {
		t.Fatalf("insert route bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO usage_reservations (id, user_id, ai_model_config_id, route_binding_id, operation_type) VALUES (11, 7, 7, 321, 'video')`).Error; err != nil {
		t.Fatalf("insert usage reservation: %v", err)
	}
	if err := db.Exec(`INSERT INTO jobs (id, user_id, model_config_id, usage_reservation_id, job_type, status, prompt) VALUES (1, 7, 7, 11, 'video', 'pending', 'draw'), (2, 7, 9, NULL, 'image', 'pending', 'draw')`).Error; err != nil {
		t.Fatalf("insert jobs: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000055" {
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
	if db.Migrator().HasColumn(&model.Job{}, "route_binding_id") {
		t.Fatal("jobs.route_binding_id exists before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	for _, tc := range []struct {
		id   uint
		want uint
	}{
		{id: 1, want: 321},
		{id: 2, want: 654},
	} {
		var routeBindingID uint
		if err := db.Raw(`SELECT route_binding_id FROM jobs WHERE id = ?`, tc.id).Scan(&routeBindingID).Error; err != nil {
			t.Fatalf("read job %d route binding id: %v", tc.id, err)
		}
		if routeBindingID != tc.want {
			t.Fatalf("job %d route binding id = %d, want %d", tc.id, routeBindingID, tc.want)
		}
	}
}

func TestMigration000047EnforcesUniqueActiveModelRouteBindings(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000047_model_route_binding_unique.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.AIModelCatalogEntry{})
	if err := db.Exec(`CREATE TABLE ai_model_route_bindings (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		catalog_entry_id integer not null,
		source_type text not null,
		route_group text not null default '',
		credential_id integer,
		is_enabled numeric not null default true,
		priority integer not null default 0,
		capacity_weight integer not null default 1
	)`).Error; err != nil {
		t.Fatalf("create ai_model_route_bindings: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES (1, 'video-fast', 'provider-video-fast', 'Video Fast')`).Error; err != nil {
		t.Fatalf("insert catalog entry: %v", err)
	}
	for _, id := range []int{1, 2} {
		if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, is_enabled, capacity_weight) VALUES (?, 1, 'new_api', 'priority', true, 1)`, id).Error; err != nil {
			t.Fatalf("insert duplicate binding %d: %v", id, err)
		}
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, credential_id, is_enabled, capacity_weight) VALUES
		(3, 1, 'local_provider', '', 11, true, 1),
		(4, 1, 'local_provider', '', 12, true, 1)`).Error; err != nil {
		t.Fatalf("insert distinct credential bindings: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000047" {
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

	var activeCount int64
	if err := db.Model(&model.AIModelRouteBinding{}).Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND deleted_at IS NULL", 1, "new_api", "priority").Count(&activeCount).Error; err != nil {
		t.Fatalf("count active bindings: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("active duplicate count = %d, want 1", activeCount)
	}
	var localProviderCount int64
	if err := db.Model(&model.AIModelRouteBinding{}).Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND deleted_at IS NULL", 1, "local_provider", "").Count(&localProviderCount).Error; err != nil {
		t.Fatalf("count local provider bindings: %v", err)
	}
	if localProviderCount != 2 {
		t.Fatalf("local provider active bindings = %d, want 2 distinct credentials preserved", localProviderCount)
	}
	duplicate := model.AIModelRouteBinding{CatalogEntryID: 1, SourceType: "new_api", RouteGroup: "priority", IsEnabled: true, CapacityWeight: 1}
	if err := db.Create(&duplicate).Error; err == nil {
		t.Fatal("create duplicate active route binding succeeded, want unique constraint error")
	}
	credentialID := uint(11)
	duplicateCredential := model.AIModelRouteBinding{CatalogEntryID: 1, SourceType: "local_provider", CredentialID: &credentialID, IsEnabled: true, CapacityWeight: 1}
	if err := db.Create(&duplicateCredential).Error; err == nil {
		t.Fatal("create duplicate credential route binding succeeded, want unique constraint error")
	}
	if err := db.Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND deleted_at IS NULL", 1, "new_api", "priority").Delete(&model.AIModelRouteBinding{}).Error; err != nil {
		t.Fatalf("soft delete active route binding: %v", err)
	}
	recreated := model.AIModelRouteBinding{CatalogEntryID: 1, SourceType: "new_api", RouteGroup: "priority", IsEnabled: true, CapacityWeight: 1}
	if err := db.Create(&recreated).Error; err != nil {
		t.Fatalf("recreate route binding after soft delete: %v", err)
	}
}

func TestMigration000048RenamesGatewayAPIKeyAllowlistToCatalogEntries(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000048_gateway_api_key_catalog_allowlist.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{})
	if err := ensureLegacyRouteBindingModelConfigColumn(db); err != nil {
		t.Fatalf("add legacy route binding column: %v", err)
	}
	if err := db.Exec(`CREATE TABLE gateway_api_keys (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		name text not null,
		key_prefix text not null,
		key_hash text not null,
		owner_user_id integer not null,
		allowed_model_ids text default '[]',
		allowed_scopes text default '[]',
		is_enabled numeric default true
	)`).Error; err != nil {
		t.Fatalf("create gateway_api_keys: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES (100, 'image-fast', 'provider-image-v2', 'Image Fast')`).Error; err != nil {
		t.Fatalf("insert catalog entry: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (catalog_entry_id, source_type, route_group, local_model_config_id, capacity_weight) VALUES (100, 'local_provider', '', 7, 1)`).Error; err != nil {
		t.Fatalf("insert local provider route binding: %v", err)
	}
	if err := db.Exec(`INSERT INTO gateway_api_keys (id, name, key_prefix, key_hash, owner_user_id, allowed_model_ids, allowed_scopes, is_enabled) VALUES (1, 'catalog key', 'mgw_test', 'hash', 7, '[7,12]', '["model:chat"]', true)`).Error; err != nil {
		t.Fatalf("insert gateway api key: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000048" {
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
	if !db.Migrator().HasColumn(&model.GatewayAPIKey{}, "allowed_model_ids") {
		t.Fatal("gateway_api_keys.allowed_model_ids missing before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	if db.Migrator().HasColumn(&model.GatewayAPIKey{}, "allowed_model_ids") {
		t.Fatal("gateway_api_keys.allowed_model_ids still exists after migration")
	}
	if !db.Migrator().HasColumn(&model.GatewayAPIKey{}, "allowed_catalog_entry_ids") {
		t.Fatal("gateway_api_keys.allowed_catalog_entry_ids missing after migration")
	}
	var allowlist string
	if err := db.Raw(`SELECT allowed_catalog_entry_ids FROM gateway_api_keys WHERE id = 1`).Scan(&allowlist).Error; err != nil {
		t.Fatalf("read catalog allowlist: %v", err)
	}
	if allowlist != "[100,12]" {
		t.Fatalf("allowed_catalog_entry_ids = %q, want [100,12]", allowlist)
	}
}

func TestMigration000050EnforcesUniqueActiveModelCatalogEntries(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000050_model_catalog_entry_unique.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{})
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES
		(1, 'video-fast', 'provider-video-fast', 'Video Fast'),
		(2, 'video-fast', 'provider-video-fast', 'Video Fast Duplicate')`).Error; err != nil {
		t.Fatalf("insert duplicate catalog entries: %v", err)
	}
	if err := db.Exec(`INSERT INTO ai_model_route_bindings (id, catalog_entry_id, source_type, route_group, credential_id, is_enabled, capacity_weight) VALUES
		(1, 1, 'new_api', 'priority', NULL, true, 1),
		(2, 2, 'new_api', 'economy', NULL, true, 1),
		(3, 2, 'new_api', 'priority', NULL, true, 1),
		(4, 1, 'local_provider', '', 11, true, 1),
		(5, 2, 'local_provider', '', 12, true, 1)`).Error; err != nil {
		t.Fatalf("insert duplicate catalog entry bindings: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000050" {
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

	var activeEntries int64
	if err := db.Model(&model.AIModelCatalogEntry{}).Where("public_model_id = ? AND provider_model_id = ?", "video-fast", "provider-video-fast").Count(&activeEntries).Error; err != nil {
		t.Fatalf("count active catalog entries: %v", err)
	}
	if activeEntries != 1 {
		t.Fatalf("active duplicate catalog entries = %d, want 1", activeEntries)
	}
	var movedBinding model.AIModelRouteBinding
	if err := db.First(&movedBinding, 2).Error; err != nil {
		t.Fatalf("read moved binding: %v", err)
	}
	if movedBinding.CatalogEntryID != 1 {
		t.Fatalf("moved binding catalog entry id = %d, want 1", movedBinding.CatalogEntryID)
	}
	var conflictingBinding model.AIModelRouteBinding
	if err := db.Unscoped().First(&conflictingBinding, 3).Error; err != nil {
		t.Fatalf("read conflicting binding: %v", err)
	}
	if !conflictingBinding.DeletedAt.Valid {
		t.Fatal("conflicting duplicate binding remains active, want soft-deleted")
	}
	var distinctCredentialBinding model.AIModelRouteBinding
	if err := db.First(&distinctCredentialBinding, 5).Error; err != nil {
		t.Fatalf("read distinct credential binding: %v", err)
	}
	if distinctCredentialBinding.CatalogEntryID != 1 || distinctCredentialBinding.DeletedAt.Valid {
		t.Fatalf("distinct credential binding = catalog %d deleted %v, want moved active binding on catalog 1", distinctCredentialBinding.CatalogEntryID, distinctCredentialBinding.DeletedAt.Valid)
	}
	var duplicateEntry model.AIModelCatalogEntry
	if err := db.Unscoped().First(&duplicateEntry, 2).Error; err != nil {
		t.Fatalf("read duplicate entry: %v", err)
	}
	if !duplicateEntry.DeletedAt.Valid {
		t.Fatal("duplicate catalog entry remains active, want soft-deleted")
	}
	duplicate := model.AIModelCatalogEntry{PublicModelID: "video-fast", ProviderModelID: "provider-video-fast", DisplayName: "Duplicate"}
	if err := db.Create(&duplicate).Error; err == nil {
		t.Fatal("create duplicate active catalog entry succeeded, want unique constraint error")
	}
}

func TestMigration000051ScopesRouteBindingUniquenessByCredential(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000051_route_binding_credential_scope.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{}, &model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{})
	if err := db.Exec(`INSERT INTO ai_model_catalog_entries (id, public_model_id, provider_model_id, display_name) VALUES (1, 'text-fast', 'provider-text-fast', 'Text Fast')`).Error; err != nil {
		t.Fatalf("insert catalog entry: %v", err)
	}
	credentialA := uint(11)
	if err := db.Create(&model.AIModelRouteBinding{
		CatalogEntryID: 1,
		SourceType:     model.ModelRouteSourceLocalProvider,
		CredentialID:   &credentialA,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create first binding: %v", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX uidx_ai_model_route_bindings_active_route ON ai_model_route_bindings (catalog_entry_id, source_type, route_group) WHERE deleted_at IS NULL`).Error; err != nil {
		t.Fatalf("create local provider route binding index: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000051" {
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

	credentialB := uint(12)
	if err := db.Create(&model.AIModelRouteBinding{
		CatalogEntryID: 1,
		SourceType:     model.ModelRouteSourceLocalProvider,
		CredentialID:   &credentialB,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create second credential binding after migration: %v", err)
	}
	duplicateCredential := uint(11)
	if err := db.Create(&model.AIModelRouteBinding{
		CatalogEntryID: 1,
		SourceType:     model.ModelRouteSourceLocalProvider,
		CredentialID:   &duplicateCredential,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err == nil {
		t.Fatal("create duplicate credential binding succeeded, want unique constraint error")
	}
}

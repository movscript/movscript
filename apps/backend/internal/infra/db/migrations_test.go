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

func TestMigration000046AllowsNewAPIIdentitiesPerUserGroup(t *testing.T) {
	db := testutil.OpenSQLiteWithConfig(t, "migration_000046_new_api_identity_user_group.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &AppliedMigration{})
	if err := db.Exec(`CREATE TABLE new_api_identities (
		id integer primary key,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer not null,
		new_api_user_id integer not null,
		new_api_username text not null,
		new_api_token_id integer not null default 0,
		new_api_group text not null default 'auto',
		encrypted_relay_key text,
		provisioning_status text not null default 'active'
	)`).Error; err != nil {
		t.Fatalf("create new_api_identities: %v", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX idx_new_api_identities_user_id ON new_api_identities(user_id)`).Error; err != nil {
		t.Fatalf("create legacy user unique index: %v", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX idx_new_api_identities_new_api_username ON new_api_identities(new_api_username)`).Error; err != nil {
		t.Fatalf("create legacy username unique index: %v", err)
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

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	if !db.Migrator().HasIndex(&model.NewAPIIdentity{}, "uidx_new_api_identity_user_group") {
		t.Fatal("expected new user/group unique index")
	}
	rows := []model.NewAPIIdentity{
		{UserID: 42, NewAPIUserID: 9, NewAPIUsername: "movscript-42", NewAPITokenID: 7, NewAPIGroup: "standard", EncryptedRelayKey: "enc-standard", ProvisioningStatus: "active"},
		{UserID: 42, NewAPIUserID: 9, NewAPIUsername: "movscript-42", NewAPITokenID: 8, NewAPIGroup: "premium/video", EncryptedRelayKey: "enc-premium", ProvisioningStatus: "active"},
	}
	for _, row := range rows {
		if err := db.Create(&row).Error; err != nil {
			t.Fatalf("create identity for group %q: %v", row.NewAPIGroup, err)
		}
	}
	var count int64
	if err := db.Model(&model.NewAPIIdentity{}).Where("user_id = ?", 42).Count(&count).Error; err != nil {
		t.Fatalf("count identities: %v", err)
	}
	if count != 2 {
		t.Fatalf("identity count = %d, want 2 groups for same user", count)
	}
}
